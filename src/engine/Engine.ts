import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { CONFIG } from '../config';
import type { Segment } from '../world/math2d';
import { World, type WorldStats } from '../world/World';
import { AutoWalk } from './AutoWalk';
import { InputState } from './input/InputState';
import { KeyboardInput } from './input/KeyboardInput';
import { MouseInput } from './input/MouseInput';
import { TouchInput } from './input/TouchInput';
import { Player } from './Player';

const DEG = Math.PI / 180;

export interface EngineOptions {
  seed: string;
  ambiance: AmbiancePreset;
  /** Accélère la simulation (tests automatisés uniquement). */
  timeScale?: number;
  autoWalk?: boolean;
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

  /** Appelé quand le visiteur demande le menu (Échap, perte du pointer lock). */
  onMenuRequest: (() => void) | null = null;
  /** Appelé quand l'auto-marche est coupée par une action du visiteur. */
  onAutoWalkChange: ((enabled: boolean) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    overlay: HTMLElement,
    private readonly options: EngineOptions,
  ) {
    const mobile = isTouchDevice();
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({
      antialias: dpr < 2,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(dpr, mobile ? 1.5 : 2));
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    const amb = options.ambiance;
    this.scene.background = new THREE.Color(amb.palette.background);
    this.scene.fog = new THREE.Fog(amb.fog.color, amb.fog.near, amb.fog.far);
    this.scene.add(new THREE.HemisphereLight(amb.lighting.hemiSky, amb.lighting.hemiGround, amb.lighting.hemiIntensity));

    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fovLandscape, 1, CONFIG.camera.near, amb.fog.far + 5);
    this.camera.rotation.order = 'YXZ';

    this.world = new World(options.seed, amb);
    this.scene.add(this.world.root);
    const start = this.world.init();
    this.player.position = start.position;
    this.player.yaw = start.yaw;
    // Pré-génère les environs avant la première image.
    for (let i = 0; i < 40; i++) this.world.update(this.player.position);
    this.world.markWarm();

    this.keyboard = new KeyboardInput(this.input);
    this.mouse = new MouseInput(this.renderer.domElement, this.input);
    this.mouse.onUnlock = () => this.onMenuRequest?.();
    this.touch = new TouchInput(this.renderer.domElement, this.input, overlay);
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
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
    this.lastTime = performance.now();
  };

  private readonly loop = (now: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    const realDt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

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

    this.player.applyLook(dYaw, dPitch);
    const before = { ...this.player.position };
    this.player.update(dt, move, speed, this.world.collisionWalls(this.player.position, this.walls));
    this.distanceWalked += Math.hypot(this.player.position.x - before.x, this.player.position.z - before.z);

    const shift = this.world.update(this.player.position);
    if (shift) {
      this.player.position.x += shift.x;
      this.player.position.z += shift.z;
      this.autoWalk.shift(shift.x, shift.z);
    }

    this.camera.position.set(this.player.position.x, this.player.eyeY, this.player.position.z);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
  }
}
