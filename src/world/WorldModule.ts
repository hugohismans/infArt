import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { ArtPiece, type ArtContext, type ArtOptions } from '../art/ArtPiece';
import { CONFIG } from '../config';
import { applyTransform, inverseTransform, rotate, type Segment, type Transform2, type Vec2 } from './math2d';
import type { ModuleDef } from './modules/defs';
import { buildPortalAdapter } from './modules/build';
import type { ZoneState } from '../director/Director';
import type { PresetMaterials } from './resources';
import { Rng } from './random';
import type { ResourceCache } from './resources';
import { buildDecor } from '../decor';
import type { ArtSlotDef } from './modules/defs';

/** Modèle d'un couloir qui se répète. */
export interface LoopSource {
  def: ModuleDef;
  /** Graine du module d'origine : même tirage d'œuvres et de décor. */
  seed: string;
  /** Pièces du module d'origine, dont on recopie les œuvres. */
  pieces: readonly ArtPiece[];
  remaining: number;
}

/** Fuite au plafond : une goutte tombe à intervalles irréguliers (repère du module). */
interface Drip {
  x: number;
  z: number;
  top: number;
  bottom: number;
  mesh: THREE.Mesh;
  /** Temps avant la prochaine goutte (négatif : la goutte tombe depuis -t secondes). */
  timer: number;
}

export interface Connector {
  /** Centre de l'ouverture (monde). */
  pos: Vec2;
  /** Hauteur du sol à l'ouverture (monde). */
  y: number;
  /** Normale sortante (monde). */
  normal: Vec2;
  /** Segment de l'ouverture (monde), utilisé pour la visibilité. */
  portal: Segment;
  /** Module voisin raccordé à cette ouverture (null = ouverture non générée). */
  neighbor: { module: WorldModule; connector: number } | null;
  /** Debug : module qui occupait cette ouverture avant d'être détruit. */
  detachedFrom?: string;
  /** Ouverture murée (étrangeté) : plus jamais de voisin, elle se comporte comme un mur. */
  sealed?: boolean;
}

/** Texture de briques, partagée par toutes les portes murées (créée à la première). */
let brickMaterial: THREE.MeshLambertMaterial | null = null;
function bricks(): THREE.MeshLambertMaterial {
  if (brickMaterial) return brickMaterial;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#cfc6b8';
  ctx.fillRect(0, 0, 128, 128);
  const rows = 8, bw = 32, bh = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let x = -bw; x < 128 + bw; x += bw) {
      const ox = r % 2 ? bw / 2 : 0;
      const l = 120 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgb(${l + 40},${l - 10},${l - 30})`;
      ctx.fillRect(x + ox + 1, r * bh + 1, bw - 2, bh - 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  brickMaterial = new THREE.MeshLambertMaterial({ map: tex });
  return brickMaterial;
}

/**
 * Instance d'un module dans le monde. Ne connaît que ses voisins directs :
 * il n'existe pas de plan global.
 */
export class WorldModule {
  readonly group = new THREE.Group();
  readonly footprint: Vec2[];
  readonly connectors: Connector[];
  readonly walls: Segment[];
  /** Contours des décors au sol (monde) : collisions et auto-marche, pas la visibilité. */
  decorWalls: Segment[] = [];
  private drips: Drip[] = [];
  /** Café encore chaud : une fumée qui monte (repère du module). */
  private steam: { x: number; y: number; z: number } | null = null;
  private steamPuffs: THREE.Mesh[] = [];
  private steamTime = 0;
  /** Rotonde de départ : zone imposée à chacune de ses ouvertures (une ambiance par porte). */
  exitZones: ZoneState[] | null = null;
  /** Étrangeté « porte murée » : l'entrée sera murée derrière le visiteur. */
  sealEntrance = false;
  /**
   * Étrangeté « couloir qui revient sur lui-même » : ce module se répète à l'identique
   * (même forme, mêmes œuvres, même décor) dans les `remaining` modules suivants.
   */
  loop: LoopSource | null = null;
  /** Ouverture par laquelle le visiteur est entré (pour la murer derrière lui). */
  enteredFrom = -1;
  private seals: THREE.Mesh[] = [];

  /** Mure l'ouverture `index` (mur de briques, côté intérieur). */
  addSeal(index: number): void {
    const c = this.def.connectors[index];
    if (!c) return;
    const { width, top } = this.opening(index);
    const geo = new THREE.PlaneGeometry(width + 0.12, top + 0.05);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (width + 0.12), uv.getY(i) * (top + 0.05));
    const mesh = new THREE.Mesh(geo, bricks());
    // Un peu en deçà de l'ouverture, face à l'intérieur du module.
    mesh.position.set(c.pos.x - c.normal.x * 0.012, c.y + (top + 0.05) / 2, c.pos.z - c.normal.z * 0.012);
    mesh.rotation.y = Math.atan2(-c.normal.x, -c.normal.z);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.group.updateMatrixWorld(true);
    this.seals.push(mesh);
    this.ownedGeometries.push(geo);
  }
  private ownedGeometries: THREE.BufferGeometry[] = [];
  /** Points libres pour l'itinéraire de l'auto-marche (monde). */
  readonly navPoints: Vec2[];
  /** Étendue verticale occupée [bas, haut] : deux modules peuvent se superposer s'ils ne se recoupent pas. */
  readonly yRange: [number, number];
  private arts: ArtPiece[] = [];
  private mats: PresetMaterials | null = null;
  /** Raccords d'ouverture actifs, par connecteur. */
  private adapters = new Map<number, { mesh: THREE.Mesh | null; jambs: Segment[]; portal: Segment }>();
  private disposed = false;
  /** Instant de création (ms), pour temporiser les nouvelles tentatives sur les impasses. */
  readonly createdAt = performance.now();

  /** Distance (en modules) au module du joueur, recalculée à chaque frame. */
  graphDistance = Infinity;
  /** Nombre de vérifications consécutives où le module était invisible. */
  hiddenChecks = 0;

  constructor(
    readonly id: number,
    readonly def: ModuleDef,
    readonly transform: Transform2,
    /** Hauteur du sol à l'entrée du module (étages). */
    readonly baseY: number,
    readonly preset: AmbiancePreset,
    /** Zone du Directeur à laquelle appartient le module. */
    readonly zone: ZoneState,
    readonly seed: string,
    private readonly cache: ResourceCache,
    /** Couloir répété : le module d'origine dont on reprend les œuvres. */
    private readonly loopFrom: LoopSource | null = null,
  ) {
    const t = transform;
    this.footprint = def.footprint.map((p) => applyTransform(t, p));
    this.walls = def.walls.map((w) => ({ a: applyTransform(t, w.seg.a), b: applyTransform(t, w.seg.b) }));
    this.navPoints = def.navPoints.map((p) => applyTransform(t, p));
    const H = def.ceilingHeight ?? preset.geometry.ceilingHeight * def.ceilingScale;
    this.yRange = [baseY + Math.min(0, def.rise), baseY + Math.max(0, def.rise) + H];
    this.connectors = def.connectors.map((c) => {
      const pos = applyTransform(t, c.pos);
      const normal = rotate(c.normal, t.angle);
      const tangent = { x: -normal.z, z: normal.x };
      const hw = c.width / 2;
      return {
        pos,
        y: baseY + c.y,
        normal,
        portal: {
          a: { x: pos.x - tangent.x * hw, z: pos.z - tangent.z * hw },
          b: { x: pos.x + tangent.x * hw, z: pos.z + tangent.z * hw },
        },
        neighbor: null,
      };
    });
  }

  /** Hauteur du repère du module (retourné : son plafond est au niveau du sol). */
  private get groupY(): number {
    if (!this.preset.inverted) return this.baseY;
    return this.baseY + (this.def.ceilingHeight ?? this.preset.geometry.ceilingHeight * this.def.ceilingScale);
  }

  /** Potentiellement visible lors de la dernière vérification (mis à jour par World). */
  visible = true;

  /** Hauteur du sol (monde) en un point du plan. */
  floorAt(p: Vec2): number {
    return this.baseY + this.def.floorAt(inverseTransform(this.transform, p));
  }

  /** Crée les meshes (partagés) et les œuvres (propres au module). */
  build(artCtx: ArtContext | null): void {
    const mats = this.cache.acquireMaterials(this.preset);
    const geos = this.cache.acquireGeometries(this.def, this.preset);
    this.mats = mats;
    if (geos.walls) this.group.add(new THREE.Mesh(geos.walls, mats.walls));
    if (geos.trims) this.group.add(new THREE.Mesh(geos.trims, mats.trims));
    if (geos.ceiling) this.group.add(new THREE.Mesh(geos.ceiling, mats.ceiling));
    if (geos.floor) this.group.add(new THREE.Mesh(geos.floor, mats.floor));
    if (geos.lights) this.group.add(new THREE.Mesh(geos.lights, mats.lights));

    const rng = new Rng(this.seed, 'art');
    const density = CONFIG.art.density * this.preset.art.density;
    const hung: ArtSlotDef[] = [];
    const odd = this.zone.oddity;
    // Salle vide : les œuvres sont parties, il reste les clous et les traces des cadres.
    const emptied = odd === 'salle-vide' && this.def.kind === 'room';
    // La même œuvre, trois fois de suite (ou partout : labyrinthe de miroirs).
    const mirror = !!this.preset.art.mirror;
    const triple = (odd === 'triple' && this.def.artSlots.length >= 3) || mirror ? artCtx?.library.take(this.preset.art.prefer) ?? null : null;
    let tripleLeft = triple ? (mirror ? Infinity : 3) : 0;
    const tripleTotal = tripleLeft;
    const oddIndex = rng.int(0, Math.max(0, this.def.artSlots.length - 1));
    let index = -1;
    const hang = (slotIn: ArtSlotDef, wallHeight: number) => {
      let slot = slotIn;
      index++;
      const opts: ArtOptions = { ...(this.zone.wing ? { themeId: this.zone.wing.theme.id } : {}) };
      if (odd === 'cartel-illisible') opts.scrambled = true;
      if (odd === 'oeuvre-changeante' && index === oddIndex) opts.changeling = true;
      if (odd === 'a-l-envers' && index === oddIndex) opts.upsideDown = true;
      if (odd === 'oeuvre-plafond' && index === oddIndex && !slot.hangY) {
        opts.ceiling = true;
        slot = { ...slot, hangY: 0, maxHeight: Math.min(2.2, this.preset.geometry.corridorWidth - 1) };
      }
      // Répétition d'un couloir déjà vu : la même œuvre au même endroit.
      const copied = this.loopFrom?.pieces[index]?.artwork;
      if (copied) opts.artwork = copied;
      if (triple && tripleLeft > 0 && !slot.hangY) {
        opts.ready = triple;
        // La première pièce possède la texture ; les autres l'empruntent.
        if (tripleLeft < tripleTotal) opts.borrowed = true;
        tripleLeft--;
      }
      const art = new ArtPiece(slot, rng, this.preset, mats, wallHeight, artCtx, () => this.visible, opts);
      this.arts.push(art);
      this.group.add(art.object);
    };
    for (const slot of emptied ? [] : this.def.artSlots) {
      // Une impasse (ou un bouchon) expose toujours son œuvre unique.
      const always = this.def.kind === 'cap' || this.def.kind === 'deadend';
      if (!always && !rng.chance(density)) continue;
      const wallHeight = slot.wallHeight ?? this.preset.geometry.ceilingHeight * this.def.ceilingScale;
      hung.push(slot);
      // Accrochage serré : d'autres rangs au-dessus, jusqu'au plafond.
      const rows = this.preset.art.salon && !slot.wallHeight ? CONFIG.art.salonRows.filter(([y, h]) => y + h / 2 + 0.25 < wallHeight) : [];
      hang(rows.length > 0 ? { ...slot, maxHeight: CONFIG.art.salonRows[0]![0] - CONFIG.art.salonRows[0]![1] / 2 - 0.2 } : slot, wallHeight);
      for (const [y, h] of rows) {
        const pair = slot.maxWidth > 1.7 && rng.chance(0.5);
        for (const side of pair ? [-1, 1] : [0]) {
          // (Chaque œuvre est une texture : on reste raisonnable pour les téléphones.)
          if (!rng.chance(CONFIG.art.salonFill)) continue;
          hang({ ...slot, hangY: y, maxHeight: h, maxWidth: pair ? slot.maxWidth / 2 - 0.1 : slot.maxWidth * 0.8, offset: (side * slot.maxWidth) / 4 }, wallHeight);
        }
      }
    }

    // Œuvre réservée pour « trois fois la même » mais jamais accrochée : on la libère.
    if (triple && tripleLeft === tripleTotal) triple.texture.dispose();

    // Décors (géométries propres au module : chaque module tire les siens).
    const decor = buildDecor(this.def, this.preset, new Rng(this.seed, 'decor'), hung, {
      emptied,
      forgotten: odd === 'veste-cafe',
    });
    if (decor.steam) {
      this.steam = decor.steam;
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Mesh(mats.unitSphere, mats.steam);
        puff.scale.setScalar(0.001);
        puff.matrixAutoUpdate = true;
        this.steamPuffs.push(puff);
        this.group.add(puff);
      }
    }
    // Couloir qui revient sur lui-même : les modules suivants le répéteront.
    if (this.loopFrom && this.loopFrom.remaining > 0) this.loop = { ...this.loopFrom, remaining: this.loopFrom.remaining - 1 };
    else if (odd === 'couloir-boucle' && this.def.kind === 'straight') this.loop = { def: this.def, seed: this.seed, pieces: this.arts, remaining: 2 };
    // Porte murée : l'entrée se fermera derrière le visiteur (voir World).
    // (Jamais dans une impasse : le visiteur serait enfermé.)
    this.sealEntrance = odd === 'porte-muree' && this.def.connectors.length >= 2 && this.def.kind !== 'sas';
    const own = (g: THREE.BufferGeometry | null, mat: THREE.Material, order = 0) => {
      if (!g) return;
      this.ownedGeometries.push(g);
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = order;
      this.group.add(mesh);
    };
    own(decor.solid, mats.trims);
    own(decor.glow, mats.decorGlow);
    own(decor.shafts, mats.shaft, 2);
    this.decorWalls = decor.collisions.map((w) => ({ a: applyTransform(this.transform, w.a), b: applyTransform(this.transform, w.b) }));
    const dripRng = new Rng(this.seed, 'drip');
    for (const d of decor.drips) {
      const mesh = new THREE.Mesh(mats.unitSphere, mats.water);
      mesh.scale.set(0.022, 0.034, 0.022);
      mesh.visible = false;
      this.group.add(mesh);
      this.drips.push({ ...d, mesh, timer: dripRng.range(0, CONFIG.decor.dripInterval[1]) });
    }

    this.group.position.set(this.transform.x, this.groupY, this.transform.z);
    this.group.rotation.y = this.transform.angle;
    // Monde inversé : le module est retourné autour de sa mi-hauteur ; on marche sur le
    // plafond, les bancs pendent au-dessus de nous. (Three.js gère l'inversion des faces.)
    if (this.preset.inverted) this.group.scale.y = -1;
    this.group.updateMatrixWorld(true);
    // Le module ne bouge jamais (sauf recentrage) : inutile de recalculer ses matrices à chaque frame.
    this.group.matrixAutoUpdate = false;
    this.group.traverse((o) => (o.matrixAutoUpdate = false));
    for (const d of this.drips) d.mesh.matrixAutoUpdate = true;
    for (const p of this.steamPuffs) p.matrixAutoUpdate = true;
    // Éléments animés (œuvres flottantes).
    this.group.traverse((o) => {
      if (o.userData.animated) o.matrixAutoUpdate = true;
    });
  }

  /** Décor animé : gouttes qui tombent. `onDrip` reçoit le point d'impact (monde). */
  animateDecor(dt: number, onDrip: (x: number, y: number, z: number) => void): void {
    if (this.steam) {
      // Fumée du café : des bouffées qui montent, grossissent et s'évanouissent.
      this.steamTime += dt;
      const s = this.steam;
      this.steamPuffs.forEach((p, i) => {
        const t = (this.steamTime * 0.45 + i / this.steamPuffs.length) % 1;
        const r = 0.02 + t * 0.06;
        p.scale.setScalar(r * (1 - t) * 2);
        p.position.set(s.x + Math.sin(t * 6 + i) * 0.03 * t, s.y + t * 0.4, s.z + Math.cos(t * 5 + i) * 0.03 * t);
      });
    }
    const g = 9.81;
    for (const d of this.drips) {
      d.timer -= dt;
      if (d.timer > 0) continue;
      const t = -d.timer;
      const y = d.top - 0.5 * g * t * t;
      if (y <= d.bottom) {
        d.mesh.visible = false;
        d.timer = CONFIG.decor.dripInterval[0] + Math.random() * (CONFIG.decor.dripInterval[1] - CONFIG.decor.dripInterval[0]);
        const p = applyTransform(this.transform, { x: d.x, z: d.z });
        onDrip(p.x, this.baseY + d.bottom, p.z);
      } else {
        d.mesh.visible = true;
        d.mesh.position.set(d.x, y, d.z);
      }
    }
  }

  get hasAnimatedDecor(): boolean {
    return this.drips.length > 0 || this.steam !== null;
  }

  get alive(): boolean {
    return !this.disposed;
  }

  /**
   * Sens du virage quand on traverse ce module de l'ouverture `from` vers `to`
   * (+1 gauche, -1 droite, 0 tout droit).
   */
  turnSign(from: number, to: number): number {
    const a = this.def.connectors[from], b = this.def.connectors[to];
    if (!a || !b || from === to) return 0;
    // Direction d'arrivée = opposée de la normale sortante de l'entrée.
    const c = -a.normal.x * b.normal.z + a.normal.z * b.normal.x;
    return c < -0.5 ? 1 : c > 0.5 ? -1 : 0;
  }

  get artPieces(): readonly ArtPiece[] {
    return this.arts;
  }

  get artCount(): number {
    return this.arts.length;
  }

  /** Déplace tout le module (recentrage de l'origine flottante). */
  shift(dx: number, dz: number): void {
    const mv = (p: Vec2) => {
      p.x += dx;
      p.z += dz;
    };
    this.transform.x += dx;
    this.transform.z += dz;
    this.footprint.forEach(mv);
    this.navPoints.forEach(mv);
    for (const w of [...this.walls, ...this.decorWalls]) {
      mv(w.a);
      mv(w.b);
    }
    for (const c of this.connectors) {
      mv(c.pos);
      mv(c.portal.a);
      mv(c.portal.b);
    }
    // Portails d'origine mémorisés par les raccords (les jambages sont déjà dans `walls`).
    for (const ad of this.adapters.values()) {
      mv(ad.portal.a);
      mv(ad.portal.b);
    }
    this.group.position.set(this.transform.x, this.groupY, this.transform.z);
    this.group.updateMatrix();
    this.group.updateMatrixWorld(true);
  }

  /** Libère explicitement tout ce que le module possède, puis rend les ressources partagées. */
  /** Dimensions de l'ouverture `index` (largeur, hauteur au-dessus du sol). */
  opening(index: number): { width: number; top: number } {
    const c = this.def.connectors[index]!;
    return { width: c.width, top: c.top ?? this.preset.geometry.ceilingHeight };
  }

  /**
   * Raccord avec un voisin dont l'ouverture diffère (autre ambiance, sas) : on referme
   * l'écart de notre côté (jambages, linteau) et on ajoute les jambages aux collisions.
   */
  applyAdapter(index: number, other: { width: number; top: number }): void {
    this.clearAdapter(index);
    const own = this.opening(index);
    const c = this.def.connectors[index]!;
    const conn = this.connectors[index]!;
    const originalPortal = { a: { ...conn.portal.a }, b: { ...conn.portal.b } };
    if (other.width >= own.width - 0.01 && other.top >= own.top - 0.01) return;
    const { geometry, jambs } = buildPortalAdapter(this.preset, c.pos, c.normal, c.y, own, other);
    let mesh: THREE.Mesh | null = null;
    if (geometry && this.mats) {
      mesh = new THREE.Mesh(geometry, this.mats.walls);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.group.updateMatrixWorld(true);
    }
    const worldJambs = jambs.map((s) => ({ a: applyTransform(this.transform, s.a), b: applyTransform(this.transform, s.b) }));
    this.walls.push(...worldJambs);
    // Le portail de visibilité garde sa pleine largeur : le rétrécir rendait le module
    // voisin « invisible » alors que l'ouverture vide, elle, était vue (boucle création /
    // destruction). Surestimer la visibilité est sans danger.
    this.adapters.set(index, { mesh, jambs: worldJambs, portal: originalPortal });
  }

  /** Retire le raccord d'une ouverture (le voisin a été détruit). */
  clearAdapter(index: number): void {
    const a = this.adapters.get(index);
    if (!a) return;
    if (a.mesh) {
      a.mesh.removeFromParent();
      a.mesh.geometry.dispose();
    }
    for (const j of a.jambs) {
      const i = this.walls.indexOf(j);
      if (i >= 0) this.walls.splice(i, 1);
    }
    const conn = this.connectors[index];
    if (conn) conn.portal = a.portal;
    this.adapters.delete(index);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const i of [...this.adapters.keys()]) this.clearAdapter(i);
    for (const art of this.arts) art.dispose();
    this.arts = [];
    for (const g of this.ownedGeometries) g.dispose();
    this.ownedGeometries = [];
    this.drips = [];
    this.steam = null;
    this.steamPuffs = [];
    this.seals = [];
    this.loop = null;
    this.decorWalls = [];
    this.group.removeFromParent();
    this.group.clear();
    this.cache.releaseGeometries(this.def, this.preset);
    this.cache.releaseMaterials(this.preset);
    // Détache le module du graphe.
    for (const c of this.connectors) {
      if (c.neighbor) {
        c.neighbor.module.clearAdapter(c.neighbor.connector);
        const other = c.neighbor.module.connectors[c.neighbor.connector];
        if (other) {
          other.neighbor = null;
          other.detachedFrom = `#${this.id} ${this.def.id}`;
        }
        c.neighbor = null;
      }
    }
  }
}
