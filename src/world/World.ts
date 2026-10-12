import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { CONFIG } from '../config';
import { angleOf, applyTransform, convexOverlap, pointInConvex, pointSegmentDistance, segmentsIntersect, type Segment, type Vec2 } from './math2d';
import { makeModuleDefs, type ModuleDef } from './modules/defs';
import { Rng } from './random';
import { isOpenAir, ResourceCache } from './resources';
import { signSpot } from './signs';
import type { ArtTheme } from '../../shared/themes';
import { computeVisibility, modulesContaining, type VisibilityResult } from './visibility';
import { WorldModule, type LoopSource, type RemoteArt } from './WorldModule';
import type { ArtContext } from '../art/ArtPiece';
import { AMBIANCES } from '../ambiances';
import { Director, type ZoneState } from '../director/Director';

export interface WorldStats {
  modules: number;
  created: number;
  destroyed: number;
  visible: number;
  arts: number;
  /** Textures d'œuvres réellement accrochées (distinctes). */
  artTextures: number;
  /** Cartels dont le texte est affiché (une texture chacun). */
  cartels: number;
  /** Ambiances dont les matériaux sont chargés (quelques textures chacune). */
  presets: number;
  urgentFills: number;
  /** Modules créés alors qu'ils étaient potentiellement visibles en deçà du brouillard (doit rester à 0). */
  popIns: number;
  /** Détail des dernières apparitions perceptibles (debug). */
  popInLog: string[];
  /** Nombre de recentrages de l'origine flottante. */
  originShifts: number;
  /** Modules invisibles effacés pour faire de la place. */
  evictions: number;
  /** Impasses retirées pour retenter une génération. */
  capRetries: number;
  /** Portes murées (étrangeté). */
  seals: number;
  currentModule: string;
  /** Zone courante (Directeur). */
  zone: string;
}

/**
 * Visite à deux : accès à l'atlas partagé (voir net/Session). Le monde le consulte avant
 * de générer, et le prévient de ce qu'il crée et détruit.
 */
export interface WorldNet {
  /**
   * L'ouverture est déjà raccordée dans l'atlas : la session importe le module partagé
   * (ou attend qu'il arrive) et renvoie vrai ; le monde ne génère alors rien.
   */
  linked(parent: WorldModule, connector: number): boolean;
  /** Une salle de l'atlas, non chargée ici, occupe-t-elle cet espace ? */
  blocked(poly: Vec2[], y0: number, y1: number): boolean;
  created(parent: WorldModule, connector: number, child: WorldModule): void;
  destroyed(m: WorldModule): void;
}

/** Description d'un module à instancier (reçu de l'atlas partagé). */
export interface ModuleSpec {
  uid: string;
  defId: string;
  preset: AmbiancePreset;
  /** Repère local (déjà converti depuis le repère absolu). */
  transform: { x: number; z: number; angle: number };
  baseY: number;
  zone: ZoneState;
  seed: string;
  remote: RemoteArt;
}

/**
 * Le monde : un graphe de modules généré devant le visiteur et détruit derrière lui.
 *
 * Règles :
 * - on remplit les ouvertures des modules proches (distance < generationRadius) ;
 * - on détruit les modules lointains (distance > destroyRadius) qui sont restés
 *   invisibles plusieurs vérifications de suite (visibilité à 360°) ;
 * - un nouveau module ne doit chevaucher aucun module *chargé* ; il peut en revanche
 *   occuper l'espace d'un module déjà détruit : c'est ce qui rend l'espace impossible.
 */
export class World {
  readonly root = new THREE.Group();
  readonly modules = new Set<WorldModule>();
  /** Catalogues de modules par ambiance (largeur, mobilier). */
  private readonly defsByPreset = new Map<string, Record<string, ModuleDef>>();
  readonly director: Director;
  readonly cache = new ResourceCache();
  private nextId = 0;
  /** Préfixe des identifiants globaux de modules (unique pour ce visiteur). */
  readonly uidPrefix = Math.random().toString(36).slice(2, 8);
  /** Modules chargés, par identifiant global. */
  private readonly byUidMap = new Map<string, WorldModule>();
  /** Décalage cumulé de l'origine flottante : position absolue = locale − offset. */
  readonly offset = { x: 0, z: 0 };
  /** Visite à deux (null en solo). */
  net: WorldNet | null = null;
  private current: WorldModule | null = null;
  private lastVisibility: VisibilityResult = { modules: new Set(), openConnectors: [] };
  private counters = { created: 0, destroyed: 0, urgentFills: 0, popIns: 0, originShifts: 0, evictions: 0, capRetries: 0, seals: 0 };
  private warm = false;
  private popInLog: string[] = [];

  private lodTimer = 0;
  /** Thème à flécher aux prochains carrefours qui s'y prêtent (deuxième chance de la voix off). */
  forcedSign: ArtTheme | null = null;
  /** Panneaux d'orientation aux carrefours (désactivés pour les essais). */
  signsEnabled = true;
  private sinceSign = 0;

  constructor(
    readonly seed: string,
    private readonly startPreset: AmbiancePreset,
    /** Accès aux vraies œuvres (null : œuvres factices, comme en phase 1). */
    private readonly artCtx: ArtContext | null = null,
    /** Ambiances disponibles pour le Directeur. */
    ambiances: Record<string, AmbiancePreset> = AMBIANCES,
  ) {
    this.director = new Director(seed, ambiances, startPreset);
    // Une aile thématique ne s'ouvre que si ses œuvres sont déjà chargées.
    if (artCtx) {
      this.director.claimTheme = () => artCtx.library.claimTheme();
      this.director.wingBoost = () => (artCtx.library.interestReady ? CONFIG.interest.wingBoost : 1);
    }
  }

  /** Ambiance du module où se trouve le visiteur. */
  get ambiance(): AmbiancePreset {
    return this.current?.preset ?? this.startPreset;
  }

  /** Catalogue de modules d'une ambiance (mis en cache). */
  private defsFor(preset: AmbiancePreset): Record<string, ModuleDef> {
    let defs = this.defsByPreset.get(preset.id);
    if (!defs) {
      defs = makeModuleDefs(preset.geometry.corridorWidth, preset.furniture);
      this.defsByPreset.set(preset.id, defs);
      // Borne la mémoire : les ambiances intermédiaires des transitions sont nombreuses.
      if (this.defsByPreset.size > 40) {
        const used = new Set([...this.modules].map((m) => m.preset.id));
        for (const k of this.defsByPreset.keys()) if (!used.has(k) && k !== preset.id) this.defsByPreset.delete(k);
      }
    }
    return defs;
  }

  /**
   * Crée le premier module ; renvoie la position et l'orientation de départ du joueur.
   * Avec `hub`, on part d'une rotonde dont chaque porte ouvre sur une autre ambiance.
   * Elle n'existe qu'au départ : une fois loin et hors de vue, elle est détruite comme
   * le reste, et le chemin du retour mène ailleurs.
   */
  init(hub = false, firstTheme: ArtTheme | null = null): { position: Vec2; yaw: number } {
    const zone = this.director.initial();
    if (hub) {
      const def = this.defsFor(this.startPreset)['rotonde']!;
      const rotonde = this.createModule(def, { x: 0, z: 0, angle: 0 }, 0, zone, this.startPreset, null, (m) => {
        m.exitZones = this.director.hubExits(def.connectors.length);
        // Première visite : une des portes porte un thème choisi pour le visiteur (voix off).
        if (firstTheme) {
          const exits = def.connectors.map((_, i) => i).filter((i) => i > 0 && signSpot(def, this.startPreset, i));
          const exit = new Rng(this.seed, 'premier-theme').pick(exits);
          m.exitZones[exit] = { ...m.exitZones[exit]!, wing: this.director.makeWing(firstTheme, 5) };
          m.signs = [{ connector: exit, title: firstTheme.title, themeId: firstTheme.id }];
        }
      });
      this.current = rotonde;
      // Un peu en deçà du centre, face à la porte du fond : les portes latérales sont dans le champ.
      const c = def.navPoints[0]!;
      return { position: applyTransform(rotonde.transform, { x: 0, z: c.z * 0.55 }), yaw: Math.PI };
    }
    const first = this.createModule(this.defsFor(this.startPreset)['straight-l']!, { x: 0, z: 0, angle: 0 }, 0, zone, this.startPreset);
    // Le joueur commence au milieu du premier couloir, face à +Z.
    const mid = applyTransform(first.transform, { x: 0, z: 9.9 });
    this.current = first;
    return { position: mid, yaw: Math.PI };
  }

  /**
   * Mise à jour du streaming. Renvoie un décalage si l'origine a été recentrée
   * (le joueur doit alors être déplacé du même décalage).
   */
  update(player: Vec2, playerY = 0): Vec2 | null {
    const start = performance.now();
    const cfg = CONFIG.world;

    // 1. Module courant et distances dans le graphe.
    const roots = modulesContaining(player, this.modules, playerY);
    if (roots.length > 0) this.current = roots[0]!;
    this.computeGraphDistances(roots.length > 0 ? roots : this.current ? [this.current] : []);

    // 2. Visibilité à 360° depuis le joueur et des points autour de lui.
    const eyes = this.visibilitySamples(player);
    // Brouillard le plus lointain entre l'ambiance du visiteur et celle de départ (prudence).
    const maxDistance = Math.max(this.ambiance.fog.far, this.startPreset.fog.far) + cfg.visibilityMargin;
    const vis = computeVisibility(eyes, this.modules, maxDistance, playerY);
    this.lastVisibility = vis;
    for (const m of this.modules) m.visible = vis.modules.has(m);

    // 3. Urgence : une ouverture vide visible doit être comblée immédiatement
    //    (normalement elle est au-delà du brouillard, donc invisible à l'écran).
    for (const open of vis.openConnectors) {
      const c = open.module.connectors[open.connector];
      if (!open.module.alive || !c || c.neighbor || c.sealed) continue;
      this.fill(open.module, open.connector);
      this.counters.urgentFills++;
      // Une vraie apparition à l'écran : ouverture vue depuis la position du joueur, en deçà du brouillard.
      const d = pointSegmentDistance(player, c.portal.a, c.portal.b);
      const fog = this.ambiance.fog;
      if (this.warm && open.fromFirstEye && d < fog.near + (fog.far - fog.near) * cfg.popInFogThreshold) {
        this.counters.popIns++;
        const msg = `module #${open.module.id} ${open.module.def.id}, ouverture ${open.connector} à ${d.toFixed(1)} m`;
        this.popInLog.push(msg);
        if (this.popInLog.length > 10) this.popInLog.shift();
        if (import.meta.env.DEV) {
          console.warn(`[pop-in] ${msg} ; ancien voisin : ${c.detachedFrom ?? 'aucun'} ; joueur (${player.x.toFixed(1)}, ${player.z.toFixed(1)}) dans #${this.current?.id} ; module @${open.module.transform.x.toFixed(1)},${open.module.transform.z.toFixed(1)} créé il y a ${(performance.now() - open.module.createdAt).toFixed(0)} ms`);
        }
      }
    }

    // 4. Génération en avance, dans la limite du budget de la frame.
    const toFill: Array<{ module: WorldModule; connector: number }> = [];
    for (const m of this.modules) {
      if (m.graphDistance >= cfg.generationRadius) continue;
      m.connectors.forEach((c, i) => {
        if (!c.neighbor && !c.sealed) toFill.push({ module: m, connector: i });
      });
    }
    toFill.sort((a, b) => a.module.graphDistance - b.module.graphDistance);
    for (const f of toFill) {
      if (performance.now() - start > cfg.frameBudgetMs) break;
      this.fill(f.module, f.connector);
    }

    // 5. Destruction des modules lointains et invisibles.
    const destroyRadius = Math.max(cfg.destroyRadius, cfg.generationRadius);
    const toDestroy: WorldModule[] = [];
    const now = performance.now();
    for (const m of this.modules) {
      if (vis.modules.has(m)) m.hiddenChecks = 0;
      else m.hiddenChecks++;
      if (m.hiddenChecks < cfg.hiddenChecksBeforeDestroy) continue;
      if (m.graphDistance > destroyRadius) toDestroy.push(m);
      // Une impasse invisible est retirée de temps en temps pour retenter une vraie suite :
      // la place qui manquait a pu se libérer entre-temps.
      else if (m.def.kind === 'cap' && now - m.createdAt > cfg.capRetryDelayMs) {
        toDestroy.push(m);
        this.counters.capRetries++;
      }
    }
    toDestroy.sort((a, b) => b.graphDistance - a.graphDistance);
    for (const m of toDestroy) {
      if (performance.now() - start > cfg.frameBudgetMs) break;
      if (m.alive) this.destroyModule(m);
    }

    // 6. Origine flottante.
    if (Math.hypot(player.x, player.z) > cfg.floatingOriginThreshold) {
      const shift = { x: -Math.round(player.x), z: -Math.round(player.z) };
      for (const m of this.modules) m.shift(shift.x, shift.z);
      this.offset.x += shift.x;
      this.offset.z += shift.z;
      this.counters.originShifts++;
      return shift;
    }
    return null;
  }

  /**
   * Œuvres proches du visiteur : fondus à chaque frame, niveaux de détail
   * (cartels, haute résolution) quelques fois par seconde.
   */
  /** Une goutte vient de tomber (position monde) : le moteur en fait un son. */
  onDrip: ((x: number, y: number, z: number) => void) | null = null;
  private readonly dripHandler = (x: number, y: number, z: number) => this.onDrip?.(x, y, z);

  updateArts(dt: number, player: Vec2): void {
    this.lodTimer -= dt;
    const doLod = this.lodTimer <= 0;
    if (doLod) this.lodTimer = 0.25;
    for (const m of this.modules) {
      // Au-delà de deux modules, les cartels et la HD sont forcément trop loin ou cachés.
      const near = m.graphDistance <= 2;
      if (m.hasAnimatedDecor && m.graphDistance <= 3) m.animateDecor(dt, this.dripHandler);
      for (const art of m.artPieces) {
        art.animate(dt);
        if (doLod) art.updateLod(near ? player.x : Infinity, near ? player.z : Infinity);
      }
    }
  }

  /** Objets à tester pour le clic : toiles et structures (les murs bloquent le rayon). */
  pickables(out: THREE.Object3D[] = []): THREE.Object3D[] {
    out.length = 0;
    for (const m of this.modules) {
      if (m.graphDistance > 2) continue;
      for (const child of m.group.children) {
        if (child instanceof THREE.Mesh) out.push(child);
      }
      for (const art of m.artPieces) {
        if (art.canvasMesh) out.push(art.canvasMesh);
        if (art.backMesh) out.push(art.backMesh);
      }
    }
    return out;
  }

  /** Murs à prendre en compte pour les collisions autour du joueur. */
  /** Hauteur du sol sous le visiteur (étages, escaliers) ; `y` : hauteur actuelle. */
  floorAt(p: Vec2, y: number): number {
    const roots = modulesContaining(p, this.modules, y);
    if (roots.length === 0) return y;
    // Plusieurs modules (à une ouverture) : le sol le plus proche de la hauteur actuelle.
    let best = roots[0]!.floorAt(p);
    for (const m of roots) {
      const f = m.floorAt(p);
      if (Math.abs(f - y) < Math.abs(best - y)) best = f;
    }
    return best;
  }

  collisionWalls(player: Vec2, y: number, out: Segment[] = []): Segment[] {
    out.length = 0;
    const near = new Set<WorldModule>();
    const roots = modulesContaining(player, this.modules, y);
    if (roots.length === 0 && this.current) roots.push(this.current);
    for (const r of roots) {
      near.add(r);
      for (const c of r.connectors) if (c.neighbor) near.add(c.neighbor.module);
    }
    for (const m of near) {
      out.push(...m.walls, ...m.decorWalls);
      // Une ouverture non générée se comporte comme un mur (filet de sécurité).
      for (const c of m.connectors) if (!c.neighbor) out.push(c.portal);
    }
    return out;
  }

  /** Ciel d'un module proche et visible (on aperçoit le ciel par une ouverture). */
  nearbySky(): AmbiancePreset['sky'] {
    for (const m of this.modules) if (m.preset.sky && m.visible && m.graphDistance <= 3) return m.preset.sky;
    return undefined;
  }

  /** Ambiance sans murs du module courant ou d'un voisin visible (son sol continu se voit). */
  nearbyOpenAir(): AmbiancePreset | null {
    if (this.current && isOpenAir(this.current.preset)) return this.current.preset;
    for (const m of this.modules) if (isOpenAir(m.preset) && m.visible && m.graphDistance <= 2) return m.preset;
    return null;
  }

  /**
   * Étrangeté « porte murée » : l'ouverture `index` de `m` est murée. Le module voisin,
   * désormais coupé du reste et invisible, sera détruit comme les autres.
   */
  seal(m: WorldModule, index: number): void {
    // (Pas à deux : l'autre visiteur pourrait se retrouver enfermé, ou passer à travers.)
    if (this.net) return;
    const c = m.connectors[index];
    if (!c || c.sealed) return;
    const n = c.neighbor;
    if (n) {
      m.clearAdapter(index);
      n.module.clearAdapter(n.connector);
      const other = n.module.connectors[n.connector];
      if (other) other.neighbor = null;
    }
    c.neighbor = null;
    c.sealed = true;
    m.addSeal(index);
    this.counters.seals++;
  }

  get currentModule(): WorldModule | null {
    return this.current;
  }

  stats(): WorldStats {
    let arts = 0;
    let cartels = 0;
    const held = new Set<THREE.Texture>();
    for (const m of this.modules) {
      arts += m.artCount;
      for (const a of m.artPieces) {
        a.collectTextures(held);
        if (a.hasCartelTexture) cartels++;
      }
    }
    return {
      modules: this.modules.size,
      created: this.counters.created,
      destroyed: this.counters.destroyed,
      visible: this.lastVisibility.modules.size,
      arts,
      artTextures: held.size,
      cartels,
      presets: this.cache.stats().presets,
      urgentFills: this.counters.urgentFills,
      popIns: this.counters.popIns,
      popInLog: this.popInLog.slice(),
      originShifts: this.counters.originShifts,
      evictions: this.counters.evictions,
      capRetries: this.counters.capRetries,
      seals: this.counters.seals,
      currentModule: this.current ? `#${this.current.id} ${this.current.def.id}` : '-',
      zone: this.current
        ? `${this.current.zone.zone.id} · ${this.current.preset.id} · ${this.current.zone.step + 1}/${this.current.zone.zone.length} · ${this.current.zone.zone.transition} · tension ${this.current.zone.zone.tension.toFixed(2)}${this.current.zone.wing ? ` · aile « ${this.current.zone.wing.theme.id} »` : ''}`
        : '-',
    };
  }

  /** Fin du préchargement : à partir d'ici, toute apparition visible est comptée. */
  markWarm(): void {
    this.warm = true;
  }

  dispose(): void {
    for (const m of Array.from(this.modules)) this.destroyModule(m);
  }

  /**
   * Points d'où l'on teste la visibilité : le joueur et des anneaux autour de lui,
   * pour anticiper ses prochains pas. Un point est retenu s'il est atteignable en
   * quelques pas : dans le module du joueur ou un voisin direct (utile dans les
   * virages, où le coin du mur masque la suite), ou en ligne droite sans traverser
   * de mur. Un point situé de l'autre côté d'une cloison, dans un couloir lointain
   * du graphe, est ignoré : il « verrait » des choses inaccessibles.
   */
  private visibilitySamples(player: Vec2): Vec2[] {
    const cfg = CONFIG.world;
    const near: WorldModule[] = [];
    const walls: Segment[] = [];
    for (const m of this.modules) {
      if (m.graphDistance <= 1) near.push(m);
      if (m.graphDistance <= cfg.generationRadius + 3) walls.push(...m.walls);
    }
    const eyes: Vec2[] = [player];
    cfg.visibilitySampleRings.forEach((radius, ring) => {
      for (let i = 0; i < cfg.visibilitySampleCount; i++) {
        // Les anneaux sont décalés d'un demi-pas angulaire pour mieux couvrir l'espace.
        const a = ((i + ring * 0.5) / cfg.visibilitySampleCount) * Math.PI * 2;
        const p = { x: player.x + Math.cos(a) * radius, z: player.z + Math.sin(a) * radius };
        const inNear = near.some((m) => pointInConvex(p, m.footprint));
        if (inNear || !walls.some((w) => segmentsIntersect(player, p, w.a, w.b))) eyes.push(p);
      }
    });
    return eyes;
  }

  private computeGraphDistances(roots: WorldModule[]): void {
    for (const m of this.modules) m.graphDistance = Infinity;
    const queue: WorldModule[] = [];
    for (const r of roots) {
      r.graphDistance = 0;
      queue.push(r);
    }
    for (let i = 0; i < queue.length; i++) {
      const m = queue[i]!;
      for (const c of m.connectors) {
        const n = c.neighbor?.module;
        if (n && n.graphDistance === Infinity) {
          n.graphDistance = m.graphDistance + 1;
          queue.push(n);
        }
      }
    }
  }

  /**
   * Sens des deux derniers virages de la chaîne qui mène à l'ouverture `connector` de `parent`
   * (le parent, puis son prédécesseur).
   */
  private recentTurns(parent: WorldModule, connector: number): [number, number] {
    if (parent.connectors.length < 2) return [0, 0];
    // On suppose que la chaîne arrive par l'entrée (0), ou par la sortie 1 si l'on repart à rebours.
    const from = connector === 0 ? 1 : 0;
    const t1 = parent.turnSign(from, connector);
    const prev = parent.connectors[from]?.neighbor;
    if (!prev || prev.module.connectors.length < 2) return [t1, 0];
    const t2 = prev.module.turnSign(prev.connector === 0 ? 1 : 0, prev.connector);
    return [t1, t2];
  }

  /** Sens du virage d'un type de module à deux ouvertures (0 pour les autres). */
  private defTurn(def: ModuleDef): number {
    if (def.connectors.length !== 2) return 0;
    const a = def.connectors[0]!.normal, b = def.connectors[1]!.normal;
    const c = -a.x * b.z + a.z * b.x;
    return c < -0.5 ? 1 : c > 0.5 ? -1 : 0;
  }

  /**
   * Raccorde un nouveau module à l'ouverture `connector` de `parent`.
   *
   * 1. Tirage pondéré du type (en évitant les spirales de virages).
   * 2. Si le module chevauche des modules chargés mais invisibles, on les détruit :
   *    l'ancien chemin s'efface pour laisser place au nouveau (espace impossible).
   * 3. Si l'obstacle est visible, on essaie un autre type ; en dernier recours, impasse.
   */
  private fill(parent: WorldModule, connector: number): void {
    if (!parent.alive) return;
    const c = parent.connectors[connector]!;
    if (c.neighbor || c.sealed) return;
    // Visite à deux : ce passage existe peut-être déjà dans l'atlas partagé.
    if (this.net?.linked(parent, connector)) return;
    const place = (child: WorldModule) => {
      this.link(parent, connector, child, 0);
      this.net?.created(parent, connector, child);
    };
    const transform = { x: c.pos.x, z: c.pos.z, angle: angleOf(c.normal) };
    const baseY = c.y;
    const rng = new Rng(this.seed, 'pick', this.nextId);

    // Le Directeur décide de la zone (et donc de l'ambiance) du nouveau module.
    const branch = parent.connectors.length >= 3 && connector >= 2;
    const zone = parent.exitZones?.[connector] ?? this.director.next(parent.zone, `${parent.id}:${connector}`, branch);
    const preset = this.director.presetFor(zone);
    const defs = this.defsFor(preset);

    const weights: Record<string, number> = {};
    for (const [id, w] of Object.entries(CONFIG.world.moduleWeights)) weights[id] = w * (preset.modules?.[id] ?? 1);
    const [t1, t2] = this.recentTurns(parent, connector);
    for (const id of Object.keys(weights)) {
      const def = defs[id];
      const turn = def ? this.defTurn(def) : 0;
      // Deux virages de suite dans le même sens = demi-tour sur 9 m : le couloir se mord la queue.
      if (turn !== 0 && turn === t1) weights[id] = 0;
      else if (turn !== 0 && turn === t2) weights[id]! *= 0.35;
    }

    // Transition « seuil » : la zone commence par un sas.
    const forceSas = zone.step === 0 && zone.zone.transition === 'seuil';

    // Couloir qui revient sur lui-même : on prolonge par une copie conforme, si elle tient.
    const loop = parent.loop;
    if (loop && loop.remaining > 0 && !forceSas && parent.def.connectors.length === 2 && connector === 1) {
      const def = this.defsFor(parent.preset)[loop.def.id];
      if (def && this.overlapping(def, parent.preset, transform, baseY, parent).length === 0) {
        place(this.createModule(def, transform, baseY, { ...parent.zone, oddity: undefined }, parent.preset, loop));
        return;
      }
    }

    let fallback: { def: ModuleDef; obstacles: WorldModule[] } | null = null;
    for (let attempt = 0; attempt < 7; attempt++) {
      let id: string;
      if (attempt === 0 && forceSas) id = 'sas';
      else {
        const ids = Object.keys(weights).filter((k) => (weights[k] ?? 0) > 0 && defs[k]);
        if (ids.length === 0) break;
        id = rng.weighted(Object.fromEntries(ids.map((k) => [k, weights[k]!])));
      }
      const def = defs[id]!;
      weights[id] = 0;
      const obstacles = this.overlapping(def, preset, transform, baseY, parent);
      if (obstacles.length === 0) {
        place(this.createModule(def, transform, baseY, zone, preset, null, (m) => this.planSigns(m)));
        return;
      }
      if (!fallback && obstacles.every((m) => this.canEvict(m, parent))) fallback = { def, obstacles };
    }
    if (fallback) {
      for (const m of fallback.obstacles) this.destroyModule(m);
      this.counters.evictions += fallback.obstacles.length;
      if (!parent.alive) return;
      place(this.createModule(fallback.def, transform, baseY, zone, preset, null, (m) => this.planSigns(m)));
      return;
    }
    // Rien ne rentre sans toucher à ce que le visiteur voit : bouchon (toujours placé),
    // aux dimensions du parent pour fermer exactement son ouverture.
    const capPreset = parent.preset;
    place(this.createModule(this.defsFor(capPreset)['cap']!, transform, baseY, parent.zone, capPreset));
  }

  /**
   * Modules chargés que chevaucherait `def` placé en `transform` à la hauteur `baseY`.
   * Deux modules superposés sans se recouper verticalement (étages) ne se gênent pas.
   */
  private overlapping(def: ModuleDef, preset: AmbiancePreset, transform: { x: number; z: number; angle: number }, baseY: number, parent: WorldModule): WorldModule[] {
    const poly = def.footprint.map((p) => applyTransform(transform, p));
    // Aucune interpénétration, sinon le dos d'un cadre accroché de l'autre côté
    // dépasse à travers le mur. Les voisins du parent peuvent toucher le nouveau
    // module (bords, coins) ; les autres doivent rester à distance.
    const near = new Set(parent.connectors.map((c) => c.neighbor?.module));
    const H = def.ceilingHeight ?? preset.geometry.ceilingHeight * def.ceilingScale;
    const y0 = baseY + Math.min(0, def.rise), y1 = baseY + Math.max(0, def.rise) + H;
    const out: WorldModule[] = [];
    // Visite à deux : une salle de l'atlas non chargée ici est un obstacle indélogeable
    // (le parent, qu'on ne peut pas effacer, sert de marqueur).
    if (this.net?.blocked(poly, y0 + 0.3, y1 - 0.3)) return [parent];
    for (const m of this.modules) {
      if (m === parent) continue;
      // Marge verticale : l'épaisseur du plancher entre deux étages.
      if (y1 <= m.yRange[0] + 0.3 || y0 >= m.yRange[1] - 0.3) continue;
      if (convexOverlap(poly, m.footprint, near.has(m) ? -0.003 : CONFIG.world.moduleClearance)) out.push(m);
    }
    return out;
  }

  /** Un module peut être effacé pour faire de la place s'il est invisible depuis un moment. */
  private canEvict(m: WorldModule, parent: WorldModule): boolean {
    return (
      m !== parent &&
      m !== this.current &&
      m.graphDistance > 0 &&
      !this.lastVisibility.modules.has(m) &&
      m.hiddenChecks >= CONFIG.world.hiddenChecksBeforeDestroy
    );
  }

  private link(parent: WorldModule, connector: number, child: WorldModule, entry: number): void {
    parent.connectors[connector]!.neighbor = { module: child, connector: entry };
    child.connectors[entry]!.neighbor = { module: parent, connector };
    child.graphDistance = Math.min(child.graphDistance, parent.graphDistance + 1);
    // Ouvertures de tailles différentes (autre ambiance, sas) : chacun referme l'écart de son côté.
    const a = parent.opening(connector), b = child.opening(entry);
    parent.applyAdapter(connector, b);
    child.applyAdapter(entry, a);
  }

  // --- Visite à deux -----------------------------------------------------------------

  /** Module chargé d'après son identifiant global. */
  byUid(uid: string): WorldModule | undefined {
    return this.byUidMap.get(uid);
  }

  /** Catalogue de modules d'une ambiance (pour reconstruire un module reçu). */
  defById(preset: AmbiancePreset, id: string): ModuleDef | undefined {
    return this.defsFor(preset)[id];
  }

  /** Instancie un module reçu de l'atlas ; s'il a un parent chargé, le raccorde. */
  instantiate(spec: ModuleSpec, parent?: { module: WorldModule; connector: number; entry: number }): WorldModule | null {
    const existing = this.byUidMap.get(spec.uid);
    if (existing) {
      if (parent) this.linkModules(parent.module, parent.connector, existing, parent.entry);
      return existing;
    }
    const def = this.defsFor(spec.preset)[spec.defId];
    if (!def) return null;
    const m = new WorldModule(this.nextId++, def, { ...spec.transform }, spec.baseY, spec.preset, spec.zone, spec.seed, this.cache);
    m.uid = spec.uid;
    m.remote = spec.remote;
    m.build(this.artCtx);
    this.root.add(m.group);
    this.modules.add(m);
    this.byUidMap.set(m.uid, m);
    this.counters.created++;
    if (parent) this.link(parent.module, parent.connector, m, parent.entry);
    return m;
  }

  /** Cette ouverture vide était-elle visible lors de la dernière vérification ? */
  isOpenConnectorVisible(m: WorldModule, connector: number): boolean {
    return this.lastVisibility.openConnectors.some((o) => o.module === m && o.connector === connector);
  }

  /** Raccorde deux modules chargés (lien de l'atlas entre deux modules déjà présents). */
  linkModules(a: WorldModule, ca: number, b: WorldModule, cb: number): void {
    if (a.connectors[ca]?.neighbor || b.connectors[cb]?.neighbor) return;
    this.link(a, ca, b, cb);
  }

  /** Retire un module chargé (remplacé par la version de l'atlas, ou plus nécessaire). */
  remove(m: WorldModule): void {
    this.destroyModule(m);
  }

  /** Déplace tout le monde d'un bloc (raccordement à un autre visiteur) ; le joueur suit (Engine). */
  reframe(t: { x: number; z: number; angle: number }, dy: number): void {
    for (const m of this.modules) m.reframe(t, dy);
  }

  /**
   * Carrefour (trois ouvertures ou plus) : de temps en temps, une sortie est fléchée vers
   * un thème prêt, qui l'attend derrière (aile thématique). Les autres sorties gardent
   * leur tirage habituel, décidé dès maintenant.
   */
  private planSigns(m: WorldModule): void {
    this.sinceSign++;
    if (!this.signsEnabled || this.net || m.def.connectors.length < 3 || m.preset.inverted || m.zone.wing) return;
    if (m.zone.zone.ambiance.art.density < CONFIG.director.wingMinDensity) return;
    const exits = m.def.connectors.map((_, i) => i).filter((i) => i > 0 && signSpot(m.def, m.preset, i));
    if (exits.length === 0) return;
    const rng = new Rng(m.seed, 'panneau');
    // Un thème imposé est fléché à chaque carrefour jusqu'à ce que le visiteur en croise un
    // (c'est la voix off qui le retire) : on ne sait pas quelle branche il prendra.
    let theme = this.forcedSign;
    if (!theme) {
      if (this.sinceSign < CONFIG.signs.gap || !rng.chance(CONFIG.signs.chance)) return;
      theme = this.director.claimTheme?.() ?? null;
      if (!theme) return;
    }
    this.sinceSign = 0;
    const exit = rng.pick(exits);
    m.exitZones = m.def.connectors.map((_, i) => (i === 0 ? m.zone : this.director.next(m.zone, `${m.id}:${i}`, i >= 2)));
    const [a, b] = CONFIG.signs.wingLength;
    m.exitZones[exit] = { ...m.exitZones[exit]!, wing: this.director.makeWing(theme, rng.int(a, b)) };
    m.signs = [{ connector: exit, title: theme.title, themeId: theme.id }];
  }

  private createModule(def: ModuleDef, transform: { x: number; z: number; angle: number }, baseY: number, zone: ZoneState, preset: AmbiancePreset, loop: LoopSource | null = null, prepare?: (m: WorldModule) => void): WorldModule {
    const id = this.nextId++;
    // Une copie de couloir reprend la graine de l'original : même tirage, même décor.
    const m = new WorldModule(id, def, { ...transform }, baseY, preset, zone, loop ? loop.seed : `${this.seed}:${id}`, this.cache, loop);
    m.uid = `${this.uidPrefix}${id}`;
    prepare?.(m);
    m.build(this.artCtx);
    this.root.add(m.group);
    this.modules.add(m);
    this.byUidMap.set(m.uid, m);
    this.counters.created++;
    return m;
  }

  private destroyModule(m: WorldModule): void {
    if (m === this.current || !m.alive) return;
    m.dispose();
    this.modules.delete(m);
    this.byUidMap.delete(m.uid);
    this.counters.destroyed++;
    this.net?.destroyed(m);
  }
}
