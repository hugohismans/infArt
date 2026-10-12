import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { CONFIG } from '../config';
import { pointSegmentDistance, type Segment } from '../world/math2d';
import type { WorldModule } from '../world/WorldModule';
import { World, type WorldStats } from '../world/World';
import { AutoWalk } from './AutoWalk';
import { InputState } from './input/InputState';
import { KeyboardInput } from './input/KeyboardInput';
import { MouseInput } from './input/MouseInput';
import { TouchInput } from './input/TouchInput';
import { Player } from './Player';
import { Rng } from '../world/random';
import type { Artwork } from '../../shared/artwork';
import type { ArtContext, ArtPiece } from '../art/ArtPiece';
import type { LibraryStats } from '../art/ArtLibrary';
import type { AudioEngine } from '../audio/AudioEngine';
import { ParticleSystem } from '../decor/dust';
import { Sky } from './Sky';
import { Ground } from './Ground';

const DEG = Math.PI / 180;

export interface EngineOptions {
  seed: string;
  ambiance: AmbiancePreset;
  /** Départ dans une rotonde aux portes ouvrant sur plusieurs ambiances. */
  startHub?: boolean;
  /** Accélère la simulation (tests automatisés uniquement). */
  timeScale?: number;
  autoWalk?: boolean;
  /** Vraies œuvres (sinon œuvres factices). */
  art?: ArtContext;
  /** Son (partagé entre les visites ; démarré au premier geste du visiteur). */
  audio?: AudioEngine;
}

export interface EngineStats {
  fps: number;
  frameMs: number;
  geometries: number;
  textures: number;
  calls: number;
  triangles: number;
  heapMB: number | null;
  seed: string;
  ambiance: string;
  position: string;
  world: WorldStats;
  elapsed: number;
  distanceWalked: number;
  art: (LibraryStats & { gpuMB: number; liveTextures: number; highRes: number }) | null;
}

export const isTouchDevice = (): boolean => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

/**
 * Le moteur : rendu Three.js, boucle de jeu, entrées, monde.
 * L'interface Svelte le pilote via quelques méthodes publiques.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly world: World;
  readonly player = new Player();
  readonly input = new InputState();
  private readonly keyboard: KeyboardInput;
  private readonly mouse: MouseInput;
  private readonly touch: TouchInput;
  private readonly autoWalk: AutoWalk;
  private readonly walls: Segment[] = [];
  private readonly timeScale: number;
  private rafId = 0;
  private lastTime = 0;
  /** Taille d'affichage pour laquelle la caméra a été réglée. */
  private viewW = 0;
  private viewH = 0;
  private running = false;
  private paused = false;
  private autoWalkEnabled: boolean;
  private elapsed = 0;
  private distanceWalked = 0;
  // Mesure des fps sur des fenêtres de 0,5 s.
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private frameMs = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickList: THREE.Object3D[] = [];
  private aimTimer = 0;
  private aimed: Artwork | null = null;
  private pumpTimer = 0;
  private readonly background: THREE.Color;
  private readonly fog: THREE.Fog;
  private readonly hemi: THREE.HemisphereLight;
  /** Zones déjà annoncées (nom affiché) et dernière zone traversée. */
  private readonly announced = new Set<number>();
  private lastWingId = -1;
  private lastZoneId = -1;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly particles: ParticleSystem;
  private readonly sky = new Sky();
  private readonly ground: Ground;
  /** Lampe torche (ambiances plongées dans le noir) : toujours présente, éteinte par défaut. */
  private readonly flashlight = new THREE.SpotLight('#fff1d6', 0, 22, 0.52, 0.55, 1.2);
  /** Module précédent (pour savoir par où le visiteur est entré). */
  private previousModule: WorldModule | null = null;
  private readonly portalPoint = new THREE.Vector3();
  private eyeScale = 1;
  /** Dernier pas sonorisé (demi-foulées parcourues). */
  private lastStep = 0;
  private readonly forward = new THREE.Vector3();

  /** Appelé quand le visiteur demande le menu (Échap, perte du pointer lock). */
  onMenuRequest: (() => void) | null = null;
  /** Appelé quand l'auto-marche est coupée par une action du visiteur. */
  onAutoWalkChange: ((enabled: boolean) => void) | null = null;
  /** Le visiteur a cliqué / touché une œuvre. */
  onArtworkOpen: ((artwork: Artwork) => void) | null = null;
  /** L'œuvre visée au centre de l'écran change (PC, souris capturée). */
  onAimChange: ((artwork: Artwork | null) => void) | null = null;
  /** Titre d'une aile thématique (chaîne vide : on l'efface). */
  onThemeTitle: ((title: string) => void) | null = null;
  /** Transition « rupture » : fondu au noir ou faux glitch. */
  onRupture: ((style: 'noir' | 'glitch') => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    overlay: HTMLElement,
    private readonly options: EngineOptions,
  ) {
    const mobile = isTouchDevice();
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({
      // Lissage des bords (MSAA) partout, y compris sur les écrans haute densité.
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(dpr, CONFIG.quality.maxPixelRatio[mobile ? 'mobile' : 'desktop']));
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    const amb = options.ambiance;
    this.background = new THREE.Color(amb.palette.background);
    this.scene.background = this.background;
    this.fog = new THREE.Fog(amb.fog.color, amb.fog.near, amb.fog.far);
    this.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(amb.lighting.hemiSky, amb.lighting.hemiGround, amb.lighting.hemiIntensity);
    this.scene.add(this.hemi);

    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fovLandscape, 1, CONFIG.camera.near, amb.fog.far + 5);
    this.camera.rotation.order = 'YXZ';

    if (options.art) options.art.viewer = this;
    this.world = new World(options.seed, amb, options.art ?? null);
    this.scene.add(this.world.root);
    this.world.onDrip = (x, y, z) => options.audio?.drip(x, y, z);
    this.particles = new ParticleSystem(CONFIG.decor.dustCount[mobile ? 'mobile' : 'desktop']);
    for (const f of this.particles.fields) this.scene.add(f.points);
    this.scene.add(this.sky.group);
    this.ground = new Ground(this.world.cache);
    this.scene.add(this.ground.mesh);
    // La lampe suit la caméra ; sa cible est placée devant à chaque image.
    this.scene.add(this.flashlight, this.flashlight.target);
    const start = this.world.init(options.startHub ?? false);
    this.player.position = start.position;
    this.player.yaw = start.yaw;
    // Pré-génère les environs avant la première image.
    for (let i = 0; i < 40; i++) this.world.update(this.player.position);
    this.world.markWarm();

    this.keyboard = new KeyboardInput(this.input);
    this.mouse = new MouseInput(this.renderer.domElement, this.input);
    this.mouse.onUnlock = () => this.onMenuRequest?.();
    this.mouse.onLockedClick = () => this.openAt(0, 0);
    this.touch = new TouchInput(this.renderer.domElement, this.input, overlay);
    this.touch.onTap = (x, y) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      this.openAt(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    };
    this.autoWalk = new AutoWalk(this.world, options.seed);
    this.autoWalkEnabled = options.autoWalk ?? false;
    this.timeScale = options.timeScale ?? 1;

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onResize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  /** Met le jeu en pause (menu ouvert) : plus de mouvement, plus d'entrées. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.keyboard.enabled = !paused;
    this.mouse.enabled = !paused;
    this.touch.enabled = !paused;
    this.keyboard.reset();
    this.touch.reset();
    if (paused) this.mouse.unlock();
    this.lastTime = performance.now();
  }

  /** Demande le pointer lock (doit être appelé dans un geste utilisateur). */
  requestPointerLock(): void {
    if (!isTouchDevice()) this.mouse.lock();
  }

  /** Œuvre sous un point de l'écran (coordonnées normalisées -1..1), si assez proche et non masquée. */
  pick(ndcX: number, ndcY: number): Artwork | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    this.raycaster.far = CONFIG.art.pickDistance;
    const hits = this.raycaster.intersectObjects(this.world.pickables(this.pickList), false);
    const piece = hits[0]?.object.userData.artPiece as ArtPiece | undefined;
    return piece?.artwork ?? null;
  }

  /**
   * Le visiteur peut-il voir cet objet en ce moment ? (dans le champ de la caméra et
   * assez près pour qu'un changement se remarque malgré le brouillard)
   */
  watching(object: THREE.Object3D): boolean {
    const e = object.matrixWorld.elements;
    this.sphere.center.set(e[12]!, 1.6, e[14]!);
    this.sphere.radius = 1.8;
    if (this.sphere.center.distanceTo(this.camera.position) > 18) return false;
    return this.frustum.intersectsSphere(this.sphere);
  }

  /**
   * L'environnement global (fond, brouillard, lumière) suit l'ambiance du module où se
   * trouve le visiteur : interpolé en douceur, ou basculé d'un coup lors d'une rupture.
   * Annonce aussi le nom des ailes.
   */
  private updateEnvironment(dt: number): void {
    const m = this.world.currentModule;
    if (!m) return;
    const zone = m.zone.zone;
    let snap = false;
    if (zone.id !== this.lastZoneId) {
      this.lastZoneId = zone.id;
      if (zone.transition === 'rupture' && m.zone.step === 0 && !this.announced.has(-zone.id - 1)) {
        this.announced.add(-zone.id - 1);
        snap = true;
        this.onRupture?.(new Rng(this.options.seed, 'rupture', zone.id).chance(0.5) ? 'noir' : 'glitch');
      }
    }
    // Aile thématique : son titre s'affiche à l'entrée et s'efface à la sortie.
    const wing = m.zone.wing;
    const wingId = wing?.id ?? -1;
    if (wingId !== this.lastWingId) {
      if (this.lastWingId >= 0) this.onThemeTitle?.('');
      this.lastWingId = wingId;
      if (wing && !this.announced.has(wing.id)) {
        this.announced.add(wing.id);
        this.onThemeTitle?.(wing.theme.title);
      }
    }
    const p = m.preset;
    const k = snap ? 1 : 1 - Math.exp(-dt * CONFIG.director.envLerpRate);
    this.background.lerp(this.tmpColor.set(p.palette.background), k);
    this.fog.color.lerp(this.tmpColor.set(p.fog.color), k);
    this.fog.near += (p.fog.near - this.fog.near) * k;
    this.fog.far += (p.fog.far - this.fog.far) * k;
    this.hemi.color.lerp(this.tmpColor.set(p.lighting.hemiSky), k);
    this.hemi.groundColor.lerp(this.tmpColor.set(p.lighting.hemiGround), k);
    this.hemi.intensity += (p.lighting.hemiIntensity - this.hemi.intensity) * k;
    // Le musée qui respire : la lumière enfle et retombe, lentement.
    if (p.lighting.breath) this.hemi.intensity = p.lighting.hemiIntensity * (1 + p.lighting.breath * Math.sin(this.elapsed * 0.9));
    const far = this.fog.far + 5;
    if (Math.abs(this.camera.far - far) > 0.5) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  private readonly tmpColor = new THREE.Color();

  /**
   * Étrangeté « porte murée » : une fois le visiteur avancé dans le module et l'entrée
   * hors de sa vue, elle est murée derrière lui.
   */
  private updateSeal(): void {
    const m = this.world.currentModule;
    if (!m) return;
    if (m !== this.previousModule) {
      if (m.enteredFrom < 0 && this.previousModule) m.enteredFrom = m.connectors.findIndex((c) => c.neighbor?.module === this.previousModule);
      this.previousModule = m;
    }
    if (!m.sealEntrance || m.enteredFrom < 0) return;
    const c = m.connectors[m.enteredFrom];
    if (!c || c.sealed || !c.neighbor) return;
    const p = this.player.position;
    if (pointSegmentDistance(p, c.portal.a, c.portal.b) < CONFIG.director.sealDistance) return;
    // Aucun point de l'ouverture ne doit être à l'écran.
    for (const end of [c.portal.a, c.portal.b, c.pos]) {
      for (const h of [0.3, 1.6, 2.6]) {
        this.portalPoint.set(end.x, c.y + h, end.z);
        if (this.frustum.containsPoint(this.portalPoint)) return;
      }
    }
    this.world.seal(m, m.enteredFrom);
  }

  /** Poussière, sons d'ambiance et pas du visiteur, selon l'ambiance du module courant. */
  private updateAmbience(dt: number): void {
    const m = this.world.currentModule;
    if (!m) return;
    const p = m.preset;
    this.particles.update(dt, this.camera.position, this.player.floorY, p.decor.particles ?? 'poussiere', p.decor.dust);
    const k = 1 - Math.exp(-dt * CONFIG.director.envLerpRate);
    this.sky.update(this.camera.position, this.camera.far * 0.92, p.sky ?? this.world.nearbySky(), this.background, k);
    this.ground.update(this.world.nearbyOpenAir(), this.camera.position, this.player.floorY, this.camera.far * 2.2);
    this.camera.getWorldDirection(this.forward);
    const torch = p.lighting.flashlight ?? 0;
    this.flashlight.intensity += (torch * CONFIG.lighting.flashlight - this.flashlight.intensity) * Math.min(1, dt * 3);
    this.flashlight.visible = this.flashlight.intensity > 0.01;
    if (this.flashlight.visible) {
      this.flashlight.position.copy(this.camera.position);
      this.flashlight.position.y -= 0.15;
      this.flashlight.target.position.copy(this.camera.position).addScaledVector(this.forward, 5);
      this.flashlight.target.updateMatrixWorld();
    }
    const audio = this.options.audio;
    if (!audio?.started) return;
    audio.setListener(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.forward.x, this.forward.z);
    audio.update(dt, p.sound, p.lighting.flicker, this.camera.position);
    // Un pas toutes les demi-foulées, tant que le visiteur avance vraiment.
    const step = this.player.steps;
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (this.player.speed > 0.4) audio.footstep(p.surfaces.floor, this.player.speed > CONFIG.player.walkSpeed * 1.2);
    }
  }

  private openAt(ndcX: number, ndcY: number): void {
    if (this.paused) return;
    const art = this.pick(ndcX, ndcY);
    if (art) this.onArtworkOpen?.(art);
  }

  /** Distance parcourue depuis l'entrée (m). */
  get walked(): number {
    return this.distanceWalked;
  }

  get autoWalkActive(): boolean {
    return this.autoWalkEnabled;
  }

  setAutoWalk(enabled: boolean): void {
    this.autoWalkEnabled = enabled;
    this.autoWalk.reset();
  }

  setReduceMotion(enabled: boolean): void {
    this.player.reduceMotion = enabled;
  }

  stats(): EngineStats {
    const info = this.renderer.info;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const p = this.player.position;
    return {
      fps: this.fps,
      frameMs: this.frameMs,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      calls: info.render.calls,
      triangles: info.render.triangles,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
      seed: this.options.seed,
      ambiance: this.world.ambiance.name ?? this.world.ambiance.id,
      position: `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`,
      world: this.world.stats(),
      elapsed: this.elapsed,
      distanceWalked: this.distanceWalked,
      art: this.options.art
        ? {
            ...this.options.art.library.stats(),
            gpuMB: this.options.art.loader.liveBytes / 1048576,
            liveTextures: this.options.art.loader.liveTextures,
            highRes: this.options.art.budget.highRes,
          }
        : null,
    };
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.keyboard.dispose();
    this.mouse.dispose();
    this.touch.dispose();
    this.world.dispose();
    this.particles.dispose();
    this.sky.dispose();
    this.ground.dispose();
    if (this.options.art?.viewer === this) this.options.art.viewer = null;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /**
   * La taille réellement affichée du canvas a-t-elle changé ? Vérifié à chaque image :
   * sur iOS, l'événement `resize` d'une rotation arrive avant la mise à jour de la mise
   * en page, et l'image restait étirée aux proportions de l'ancienne orientation.
   */
  private checkViewSize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || this.container.clientWidth;
    const h = canvas.clientHeight || this.container.clientHeight;
    if (w > 0 && h > 0 && (w !== this.viewW || h !== this.viewH)) this.onResize();
  }

  private readonly onResize = () => {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || this.container.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || this.container.clientHeight || window.innerHeight;
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // En portrait, on élargit le champ vertical pour garder un champ horizontal confortable.
    const hMin = CONFIG.camera.minHorizontalFov * DEG;
    const vForH = (2 * Math.atan(Math.tan(hMin / 2) / aspect)) / DEG;
    this.camera.fov = Math.min(CONFIG.camera.maxVerticalFov, Math.max(CONFIG.camera.fovLandscape, vForH));
    this.camera.updateProjectionMatrix();
  };

  private readonly onVisibility = () => {
    if (document.hidden && !this.paused) this.onMenuRequest?.();
    this.options.audio?.suspend(document.hidden);
    this.lastTime = performance.now();
  };

  private readonly loop = (now: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    // L'horodatage de requestAnimationFrame peut précéder un performance.now() relevé
    // juste avant (démarrage, sortie du menu) : sans ce plancher, dt devient négatif et le
    // lissage de la vitesse s'emballe (le visiteur finissait par traverser les murs).
    const realDt = Math.max(0, Math.min(0.1, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.checkViewSize();
    const t0 = performance.now();
    if (!this.paused) {
      // Sous-pas de simulation : évite les grands sauts quand la frame est longue
      // ou que le temps est accéléré (tests).
      const total = realDt * this.timeScale;
      const steps = Math.max(1, Math.ceil(total / 0.05));
      for (let i = 0; i < steps; i++) this.tick(total / steps);
    }
    this.renderer.render(this.scene, this.camera);
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.1;

    this.fpsFrames++;
    this.fpsTime += realDt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  };

  private tick(dt: number): void {
    this.elapsed += dt;
    const look = this.input.consumeLook();
    let dYaw = look.yaw - this.input.turn * 1.8 * dt;
    let dPitch = look.pitch;
    let move = { strafe: this.input.strafe, forward: this.input.forward };
    let speed: number = this.input.run ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;

    if (this.autoWalkEnabled) {
      if (this.input.hasMoveIntent) {
        // Le visiteur reprend la main.
        this.setAutoWalk(false);
        this.onAutoWalkChange?.(false);
      } else {
        const cmd = this.autoWalk.step(this.player, dt);
        dYaw += cmd.dYaw;
        // On laisse le visiteur regarder librement pendant l'auto-marche.
        if (Math.abs(look.pitch) < 1e-6) dPitch += cmd.dPitch;
        move = { strafe: 0, forward: cmd.forward };
        speed = CONFIG.player.autoWalkSpeed;
      }
    }

    speed *= this.world.currentModule?.preset.visitor?.speed ?? 1;
    this.player.applyLook(dYaw, dPitch);
    const before = { ...this.player.position };
    this.player.update(dt, move, speed, this.world.collisionWalls(this.player.position, this.player.floorY, this.walls));
    this.distanceWalked += Math.hypot(this.player.position.x - before.x, this.player.position.z - before.z);
    // Hauteur du sol (escaliers) : suivie rapidement mais sans à-coup.
    const floor = this.world.floorAt(this.player.position, this.player.floorY);
    this.player.floorY += (floor - this.player.floorY) * Math.min(1, dt * 14);

    const shift = this.world.update(this.player.position, this.player.floorY);
    if (shift) {
      this.player.position.x += shift.x;
      this.player.position.z += shift.z;
      this.autoWalk.shift(shift.x, shift.z);
    }

    this.updateEnvironment(dt);
    this.world.cache.animate(dt);
    // Le visiteur grandit ou rapetisse avec l'ambiance (échelle déréglée), en douceur.
    const v = this.world.currentModule?.preset.visitor;
    this.eyeScale += ((v?.eyeScale ?? 1) - this.eyeScale) * Math.min(1, dt * 1.2);
    this.camera.position.set(this.player.position.x, this.player.floorY + this.player.eyeY * this.eyeScale, this.player.position.z);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
    this.camera.updateMatrixWorld();
    this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);

    this.world.updateArts(dt, this.player.position);
    this.updateAmbience(dt);
    this.updateSeal();
    this.pumpTimer -= dt;
    if (this.pumpTimer <= 0) {
      this.pumpTimer = 0.25;
      this.options.art?.library.pump();
    }
    // Viseur : quelle œuvre est au centre de l'écran ?
    this.aimTimer -= dt;
    if (this.aimTimer <= 0) {
      this.aimTimer = 0.15;
      const aimed = this.mouse.locked ? this.pick(0, 0) : null;
      if (aimed !== this.aimed) {
        this.aimed = aimed;
        this.onAimChange?.(aimed);
      }
    }
  }
}
