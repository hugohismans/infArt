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
import { buildSign, signSlot, signSpot, slotHitsSign, type SignLook, type SignSpot } from './signs';

/** Panneau d'orientation d'une ouverture : le thème qui attend derrière, ou un texte (histoires). */
export interface ModuleSign extends SignLook {
  connector: number;
  themeId?: string;
  /** Marque de la voix off (« sortie », « atelier »…) pour reconnaître ses panneaux. */
  tag?: string;
}
import type { ArtSlotDef } from './modules/defs';
import type { Artwork } from '../../shared/artwork';
import type { SpecialRoom } from './World';
import { buildDoorFrame, buildEasel } from './specialProps';

/**
 * Œuvres d'un module venu d'un autre visiteur (visite à deux) : celles qu'il a accrochées,
 * par emplacement, et ses sculptures sur socle. Un emplacement encore inconnu attend.
 */
export interface RemoteArt {
  walls: Map<number, Artwork>;
  pedestals: Array<{ p: number; art: Artwork }>;
}

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
  /** Panneaux d'orientation (à fixer avant `build`) : l'ouverture et le thème qui l'attend. */
  signs: ModuleSign[] = [];
  /** Salles mises en scène derrière certaines ouvertures (voix off). */
  exitSpecial: Record<number, SpecialRoom> | null = null;
  /** Ce module est une salle mise en scène (à fixer avant `build`). */
  special: 'atelier' | 'sortie' | 'favoris' | null = null;
  /** Salle des favoris : les œuvres à accrocher, dans l'ordre des emplacements. */
  forcedArt: Artwork[] | null = null;
  /** Point d'intérêt de la salle mise en scène (toile, encadrement), repère du module. */
  private specialLocal: Vec2 | null = null;

  /** Point d'intérêt de la salle mise en scène, repère du monde (suit l'origine flottante). */
  get specialPoint(): Vec2 | null {
    return this.specialLocal ? applyTransform(this.transform, this.specialLocal) : null;
  }

  /**
   * Le point `p` (monde) est-il au niveau de l'objet mis en scène, ou au-delà en venant de
   * l'entrée ? (Un visiteur pressé franchit l'encadrement de la sortie entre deux contrôles.)
   */
  reachedSpecial(p: Vec2): boolean {
    if (!this.specialLocal) return false;
    const l = inverseTransform(this.transform, p);
    return l.z >= this.specialLocal.z - 0.2 && Math.abs(l.x - this.specialLocal.x) < 1.5;
  }
  private signParts: Array<{ dispose(): void }> = [];
  /** Panneaux construits (pour pouvoir les décrocher). */
  private signObjects: Array<{ object: THREE.Object3D; dispose(): void }> = [];

  /**
   * Décroche des panneaux (la voix off en a posé sur plusieurs carrefours d'avance : une
   * fois le bon trouvé, les autres disparaissent). Ce qui attend derrière ne change pas.
   */
  clearSigns(keep: (s: ModuleSign) => boolean): void {
    if (this.signs.every(keep)) return;
    for (const o of this.signObjects) {
      o.object.removeFromParent();
      o.dispose();
    }
    this.signObjects = [];
    this.signs = this.signs.filter(keep);
    for (const sign of this.signs) {
      const spot = signSpot(this.def, this.preset, sign.connector);
      if (!spot) continue;
      const built = buildSign(spot, sign, this.preset);
      this.group.add(built.object);
      this.signObjects.push(built);
    }
  }
  /** Étrangeté « porte murée » : l'entrée sera murée derrière le visiteur. */
  sealEntrance = false;
  /**
   * Étrangeté « couloir qui revient sur lui-même » : ce module se répète à l'identique
   * (même forme, mêmes œuvres, même décor) dans les `remaining` modules suivants.
   */
  loop: LoopSource | null = null;
  /** Identifiant global (visite à deux) : unique d'un visiteur à l'autre. */
  uid = '';
  /** Module reçu d'un autre visiteur : ses œuvres (sinon on pioche dans sa propre réserve). */
  remote: RemoteArt | null = null;
  /** Œuvres murales, dans l'ordre des emplacements accrochés (index publié). */
  readonly wallPieces: ArtPiece[] = [];
  /** Sculptures, avec l'index de leur socle. */
  readonly pedestalPieces: Array<{ p: number; piece: ArtPiece }> = [];
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
    public baseY: number,
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
    if (geos.walls) {
      const walls = new THREE.Mesh(geos.walls, mats.walls);
      // Murs invisibles (ciel ouvert) : dessinés avant tout le reste, pour qu'ils masquent
      // bien ce qui est derrière eux (sinon une salle voisine se voit « de l'extérieur »).
      if (!mats.walls.colorWrite) walls.renderOrder = -2;
      this.group.add(walls);
    }
    if (geos.trims) this.group.add(new THREE.Mesh(geos.trims, mats.trims));
    if (geos.ceiling) this.group.add(new THREE.Mesh(geos.ceiling, mats.ceiling));
    if (geos.floor) this.group.add(new THREE.Mesh(geos.floor, mats.floor));
    if (geos.lights) this.group.add(new THREE.Mesh(geos.lights, mats.lights));

    const rng = new Rng(this.seed, 'art');
    const density = CONFIG.art.density * this.preset.art.density;
    const hung: ArtSlotDef[] = [];
    // Panneaux d'orientation : posés d'abord, les œuvres et le décor leur laissent la place.
    const spots: SignSpot[] = [];
    for (const sign of this.signs) {
      const spot = signSpot(this.def, this.preset, sign.connector);
      if (!spot) continue;
      spots.push(spot);
      const built = buildSign(spot, sign, this.preset);
      this.group.add(built.object);
      this.signObjects.push(built);
    }
    // Salles mises en scène : le chevalet de l'atelier, l'encadrement au bout de la sortie.
    if (this.special === 'atelier' || this.special === 'sortie') {
      const far = this.def.navPoints[0]?.z ?? 3;
      const at = this.special === 'atelier' ? { x: 0, z: far + 0.6 } : { x: 0, z: far * 0.75 };
      const prop = this.special === 'atelier' ? buildEasel(at.x, at.z) : buildDoorFrame(at.x, at.z);
      this.group.add(prop.object);
      this.signParts.push(prop);
      this.specialLocal = at;
    }
    const odd = this.zone.oddity;
    // Salle vide : les œuvres sont parties, il reste les clous et les traces des cadres.
    const emptied = odd === 'salle-vide' && this.def.kind === 'room';
    // La même œuvre, trois fois de suite (ou partout : labyrinthe de miroirs).
    const mirror = !!this.preset.art.mirror;
    const remote = this.remote;
    const triple = !remote && ((odd === 'triple' && this.def.artSlots.length >= 3) || mirror) ? artCtx?.library.take(this.preset.art.prefer) ?? null : null;
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
      // (Module d'un autre visiteur : son œuvre, ou on attend qu'il la publie.)
      // Salle des favoris : les œuvres de la collection du visiteur, une par emplacement.
      const copied = remote ? remote.walls.get(index) : (this.forcedArt?.shift() ?? this.loopFrom?.pieces[index]?.artwork);
      if (copied) opts.artwork = copied;
      else if (remote) opts.awaitRemote = true;
      if (triple && tripleLeft > 0 && !slot.hangY) {
        opts.ready = triple;
        // La première pièce possède la texture ; les autres l'empruntent.
        if (tripleLeft < tripleTotal) opts.borrowed = true;
        tripleLeft--;
      }
      // Chaque œuvre tire au sort avec sa propre graine : le choix des emplacements reste
      // identique d'un visiteur à l'autre, quelles que soient les œuvres.
      const art = new ArtPiece(slot, new Rng(this.seed, 'piece', index), this.preset, mats, wallHeight, artCtx, () => this.visible, opts);
      this.arts.push(art);
      this.wallPieces.push(art);
      this.group.add(art.object);
    };
    // L'atelier et le bout de la sortie n'ont pas d'œuvre au mur : leur objet suffit.
    const bare = emptied || this.special === 'atelier' || this.special === 'sortie';
    for (const slot of bare ? [] : this.def.artSlots.filter((sl) => !spots.some((sp) => slotHitsSign(sl, sp)))) {
      // Une impasse (ou un bouchon) expose toujours son œuvre unique.
      const always = this.def.kind === 'cap' || this.def.kind === 'deadend';
      if (!always && !this.forcedArt?.length && !rng.chance(density)) continue;
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

    // Sculptures sur socle : seulement si une sculpture est prête (jamais de socle vide).
    const pedestalWalls: Segment[] = [];
    const placed: Array<{ p: number; opts: ArtOptions }> = [];
    if (remote) {
      for (const r of remote.pedestals) placed.push({ p: r.p, opts: { artwork: r.art, pedestal: true } });
    } else if (artCtx && !emptied && !this.loopFrom) {
      const prng = new Rng(this.seed, 'socles');
      for (let i = 0; i < this.def.pedestals.length; i++) {
        if (!prng.chance(CONFIG.art.pedestalChance)) continue;
        const ready = artCtx.library.takeSculpture();
        if (!ready) break;
        placed.push({ p: i, opts: { ready, pedestal: true } });
      }
    }
    for (const { p: index, opts } of placed) {
      const p = this.def.pedestals[index];
      if (!p) continue;
      {
        const slot: ArtSlotDef = { pos: p.pos, y: this.def.floorAt(p.pos), normal: p.normal, maxWidth: 1.6, maxHeight: 1.5 };
        const art = new ArtPiece(slot, new Rng(this.seed, 'socle', index), this.preset, mats, 6, artCtx, () => this.visible, opts);
        this.arts.push(art);
        this.pedestalPieces.push({ p: index, piece: art });
        this.group.add(art.object);
        // Collision : le socle, un peu élargi.
        const h = 0.45;
        const c = [
          { x: p.pos.x - h, z: p.pos.z - h },
          { x: p.pos.x + h, z: p.pos.z - h },
          { x: p.pos.x + h, z: p.pos.z + h },
          { x: p.pos.x - h, z: p.pos.z + h },
        ];
        for (let i = 0; i < 4; i++) pedestalWalls.push({ a: c[i]!, b: c[(i + 1) % 4]! });
      }
    }

    // Œuvre réservée pour « trois fois la même » mais jamais accrochée : on la libère.
    if (triple && tripleLeft === tripleTotal) triple.texture.dispose();

    // Décors (géométries propres au module : chaque module tire les siens).
    const decor = buildDecor(this.def, this.preset, new Rng(this.seed, 'decor'), [...hung, ...spots.filter((sp) => sp.arrow !== 0).map(signSlot)], {
      emptied,
      forgotten: odd === 'veste-cafe',
      signed: this.signs.map((sg) => sg.connector),
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
    this.decorWalls = [...decor.collisions, ...pedestalWalls].map((w) => ({ a: applyTransform(this.transform, w.a), b: applyTransform(this.transform, w.b) }));
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

  /** Copie d'un couloir déjà traversé (étrangeté « couloir qui revient sur lui-même »). */
  get isLoopCopy(): boolean {
    return this.loopFrom !== null;
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

  /**
   * Déplace le module d'un bloc : rotation et translation dans le plan (`t` appliquée aux
   * coordonnées monde), et `dy` en hauteur. Sert à raccorder le monde d'un visiteur à celui
   * d'un autre (visite à deux), sans que rien ne change à l'écran.
   */
  reframe(t: Transform2, dy: number): void {
    const mv = (p: Vec2) => {
      const q = applyTransform(t, p);
      p.x = q.x;
      p.z = q.z;
    };
    const pos = applyTransform(t, { x: this.transform.x, z: this.transform.z });
    this.transform.x = pos.x;
    this.transform.z = pos.z;
    this.transform.angle += t.angle;
    this.baseY += dy;
    this.yRange[0] += dy;
    this.yRange[1] += dy;
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
      c.normal = rotate(c.normal, t.angle);
      c.y += dy;
    }
    for (const ad of this.adapters.values()) {
      mv(ad.portal.a);
      mv(ad.portal.b);
    }
    this.group.position.set(this.transform.x, this.groupY, this.transform.z);
    this.group.rotation.y = this.transform.angle;
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
      if (!this.mats.walls.colorWrite) mesh.renderOrder = -2;
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
    for (const p of this.signParts) p.dispose();
    this.signParts = [];
    for (const p of this.signObjects) p.dispose();
    this.signObjects = [];
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
