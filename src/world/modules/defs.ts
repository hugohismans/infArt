import { CONFIG } from '../../config';
import { dist, sub, v2, type Segment, type Vec2 } from '../math2d';

/**
 * Description purement géométrique d'un type de module, dans son repère local.
 *
 * Convention : l'entrée (connecteur 0) est en (0, 0), à la hauteur 0, sa normale
 * sortante est (0, -1) ; le module s'étend vers +Z. En regardant vers +Z, +X est
 * à GAUCHE (repère Three.js).
 */
export interface ConnectorDef {
  /** Centre de l'ouverture, au sol. */
  pos: Vec2;
  /** Hauteur du sol à l'ouverture (escaliers). */
  y: number;
  /** Normale sortante (vers le module voisin). */
  normal: Vec2;
  /** Largeur de l'ouverture. */
  width: number;
  /** Hauteur de l'ouverture (sinon : hauteur sous plafond des couloirs de l'ambiance). */
  top?: number;
}

export interface WallDef {
  /** Segment dont la normale intérieure est (d.z, -d.x) avec d = b - a. */
  seg: Segment;
  /** On peut accrocher des œuvres sur ce mur. */
  hangable: boolean;
  /** Hauteur du mur s'il ne monte pas jusqu'au plafond (cimaise). */
  height?: number;
  /** Mur d'un obstacle (dessiné avec l'obstacle, mais utilisé pour les collisions et l'accrochage). */
  obstacle?: boolean;
}

/** Obstacle posé au sol, aligné sur les axes du module (cimaise, banc, jardinière). */
export interface ObstacleDef {
  kind: 'cimaise' | 'bench' | 'planter';
  center: Vec2;
  /** Dimensions au sol (x, z). */
  size: Vec2;
  height: number;
}

export interface ArtSlotDef {
  /** Point au pied du mur, au centre de l'emplacement. */
  pos: Vec2;
  /** Hauteur du sol à cet endroit. */
  y: number;
  /** Normale du mur, tournée vers l'intérieur du module. */
  normal: Vec2;
  /** Largeur maximale disponible. */
  maxWidth: number;
  /** Hauteur du mur porteur (sinon : hauteur sous plafond du module). */
  wallHeight?: number;
  /** Rang supérieur d'un accrochage serré : hauteur du centre et hauteur maximale. */
  hangY?: number;
  maxHeight?: number;
  /** Décalage le long du mur (plusieurs œuvres côte à côte sur un même emplacement). */
  offset?: number;
}

export type ModuleKind = 'straight' | 'turn' | 'junction' | 'room' | 'stairs' | 'deadend' | 'sas' | 'cap' | 'rotonde';

export interface ModuleDef {
  id: string;
  kind: ModuleKind;
  /** Polygone convexe au sol (rectangle). */
  footprint: Vec2[];
  connectors: ConnectorDef[];
  walls: WallDef[];
  /** Le module a un sol et un plafond (pas l'impasse « cap »). */
  hasFloor: boolean;
  /** Hauteur sous plafond, relative à celle de l'ambiance (salles plus hautes). */
  ceilingScale: number;
  /** Hauteur sous plafond absolue, prioritaire sur l'échelle (sas). */
  ceilingHeight?: number;
  /** Pas de bandes lumineuses : pièce sombre (sas). */
  dark?: boolean;
  /** Dénivelé entre l'entrée et la sortie (escaliers), en m. */
  rise: number;
  /** Hauteur du sol en un point local. */
  floorAt(p: Vec2): number;
  /** Ouvertures au-dessus desquelles il faut un linteau (plafond plus haut que les couloirs). */
  lintels: Segment[];
  obstacles: ObstacleDef[];
  /** Bandes lumineuses au plafond. */
  lightStrips: Segment[];
  /** Points libres pour l'itinéraire de l'auto-marche (contourner les obstacles). */
  navPoints: Vec2[];
  artSlots: ArtSlotDef[];
  /** Emplacements de socles (sculptures), au sol, face à `normal`. */
  pedestals: Array<{ pos: Vec2; normal: Vec2 }>;
}

export function wallNormal(seg: Segment): Vec2 {
  const d = sub(seg.b, seg.a);
  const l = Math.hypot(d.x, d.z);
  return { x: d.z / l, z: -d.x / l };
}

const flat = () => 0;

/** Répartit des emplacements d'œuvres le long des murs accrochables. */
function computeArtSlots(walls: WallDef[], floorAt: (p: Vec2) => number): ArtSlotDef[] {
  const slots: ArtSlotDef[] = [];
  const margin = 0.5;
  for (const wall of walls) {
    if (!wall.hangable) continue;
    const len = dist(wall.seg.a, wall.seg.b);
    const usable = len - 2 * margin;
    if (usable < 1) continue;
    const count = Math.max(1, Math.floor(usable / CONFIG.art.spacing));
    const step = usable / count;
    const n = wallNormal(wall.seg);
    for (let i = 0; i < count; i++) {
      const t = (margin + step * (i + 0.5)) / len;
      const pos = { x: wall.seg.a.x + (wall.seg.b.x - wall.seg.a.x) * t, z: wall.seg.a.z + (wall.seg.b.z - wall.seg.a.z) * t };
      slots.push({ pos, y: floorAt(pos), normal: n, maxWidth: step - 0.6, ...(wall.height ? { wallHeight: wall.height } : {}) });
    }
  }
  return slots;
}

function rect(minX: number, maxX: number, minZ: number, maxZ: number): Vec2[] {
  return [v2(minX, minZ), v2(maxX, minZ), v2(maxX, maxZ), v2(minX, maxZ)];
}

type Side = 'S' | 'N' | 'E' | 'W';

/** Ouverture sur un côté d'une pièce rectangulaire (centre le long du côté). */
interface Opening {
  side: Side;
  center: number;
  width: number;
}

/**
 * Murs d'une pièce rectangulaire percée d'ouvertures, orientés vers l'intérieur.
 * Côtés : S (z = minZ), N (z = maxZ), W (x = minX, à droite en regardant vers +Z), E (x = maxX, à gauche).
 */
function perimeter(minX: number, maxX: number, minZ: number, maxZ: number, openings: Opening[], hangable: boolean): { walls: WallDef[]; lintels: Segment[] } {
  const walls: WallDef[] = [];
  const lintels: Segment[] = [];
  // Pour chaque côté : axe parcouru et sens qui donne une normale intérieure.
  const sides: Record<Side, { from: number; to: number; at: (t: number) => Vec2 }> = {
    S: { from: maxX, to: minX, at: (t) => v2(t, minZ) },
    N: { from: minX, to: maxX, at: (t) => v2(t, maxZ) },
    W: { from: minZ, to: maxZ, at: (t) => v2(minX, t) },
    E: { from: maxZ, to: minZ, at: (t) => v2(maxX, t) },
  };
  for (const side of ['S', 'N', 'W', 'E'] as Side[]) {
    const { from, to, at } = sides[side];
    const dir = Math.sign(to - from);
    // Intervalles d'ouverture, triés dans le sens de parcours.
    const holes = openings
      .filter((o) => o.side === side)
      .map((o) => [o.center - (dir * o.width) / 2, o.center + (dir * o.width) / 2] as [number, number])
      .sort((a, b) => dir * (a[0] - b[0]));
    let cursor = from;
    for (const [h0, h1] of holes) {
      if (Math.abs(h0 - cursor) > 0.01) walls.push({ seg: { a: at(cursor), b: at(h0) }, hangable });
      lintels.push({ a: at(h0), b: at(h1) });
      cursor = h1;
    }
    if (Math.abs(to - cursor) > 0.01) walls.push({ seg: { a: at(cursor), b: at(to) }, hangable });
  }
  return { walls, lintels };
}

/** Murs d'un obstacle (boîte alignée sur les axes), orientés vers l'extérieur. */
function obstacleWalls(o: ObstacleDef, hangable: boolean): WallDef[] {
  const x0 = o.center.x - o.size.x / 2, x1 = o.center.x + o.size.x / 2;
  const z0 = o.center.z - o.size.z / 2, z1 = o.center.z + o.size.z / 2;
  // Sens inverse d'une pièce : la normale « intérieure » pointe vers l'extérieur de la boîte.
  const long = o.size.x >= o.size.z;
  return [
    { seg: { a: v2(x0, z0), b: v2(x1, z0) }, hangable: hangable && long, height: o.height, obstacle: true },
    { seg: { a: v2(x1, z1), b: v2(x0, z1) }, hangable: hangable && long, height: o.height, obstacle: true },
    { seg: { a: v2(x0, z1), b: v2(x0, z0) }, hangable: hangable && !long, height: o.height, obstacle: true },
    { seg: { a: v2(x1, z0), b: v2(x1, z1) }, hangable: hangable && !long, height: o.height, obstacle: true },
  ];
}

const entrance = (w: number): ConnectorDef => ({ pos: v2(0, 0), y: 0, normal: v2(0, -1), width: w });

function base(id: string, kind: ModuleKind): Pick<ModuleDef, 'id' | 'kind' | 'hasFloor' | 'ceilingScale' | 'rise' | 'floorAt' | 'lintels' | 'obstacles' | 'navPoints' | 'pedestals'> {
  return { id, kind, hasFloor: true, ceilingScale: 1, rise: 0, floorAt: flat, lintels: [], obstacles: [], navPoints: [], pedestals: [] };
}

function straight(id: string, w: number, length: number): ModuleDef {
  const h = w / 2;
  const walls: WallDef[] = [
    { seg: { a: v2(-h, 0), b: v2(-h, length) }, hangable: true }, // droite
    { seg: { a: v2(h, length), b: v2(h, 0) }, hangable: true }, // gauche
  ];
  return {
    ...base(id, 'straight'),
    footprint: rect(-h, h, 0, length),
    connectors: [entrance(w), { pos: v2(0, length), y: 0, normal: v2(0, 1), width: w }],
    walls,
    lightStrips: [{ a: v2(0, 0.6), b: v2(0, length - 0.6) }],
    artSlots: computeArtSlots(walls, flat),
  };
}

function turn(id: string, w: number, side: 'left' | 'right'): ModuleDef {
  const h = w / 2;
  const s = side === 'left' ? 1 : -1; // +X = gauche
  const outer: WallDef =
    side === 'left' ? { seg: { a: v2(-h, 0), b: v2(-h, w) }, hangable: true } : { seg: { a: v2(h, w), b: v2(h, 0) }, hangable: true };
  const back: WallDef = { seg: { a: v2(-h, w), b: v2(h, w) }, hangable: true };
  const walls = [outer, back];
  return {
    ...base(id, 'turn'),
    footprint: rect(-h, h, 0, w),
    connectors: [entrance(w), { pos: v2(s * h, h), y: 0, normal: v2(s, 0), width: w }],
    walls,
    lightStrips: [
      { a: v2(0, 0.6), b: v2(0, h) },
      { a: v2(0, h), b: v2(s * (h - 0.6), h) },
    ],
    navPoints: [v2(0, h)],
    artSlots: computeArtSlots(walls, flat),
  };
}

/** Intersection carrée (T ou croix) : `exits` parmi N (tout droit), E (gauche), W (droite). */
function junction(id: string, w: number, exits: Array<'N' | 'E' | 'W'>): ModuleDef {
  const h = w / 2;
  const openings: Opening[] = [{ side: 'S', center: 0, width: w }, ...exits.map((side) => ({ side, center: side === 'N' ? 0 : h, width: w }))];
  const { walls } = perimeter(-h, h, 0, w, openings, true);
  const connectors: ConnectorDef[] = [entrance(w)];
  for (const e of exits) {
    if (e === 'N') connectors.push({ pos: v2(0, w), y: 0, normal: v2(0, 1), width: w });
    if (e === 'E') connectors.push({ pos: v2(h, h), y: 0, normal: v2(1, 0), width: w });
    if (e === 'W') connectors.push({ pos: v2(-h, h), y: 0, normal: v2(-1, 0), width: w });
  }
  const strips: Segment[] = [{ a: v2(0, 0.6), b: v2(0, exits.includes('N') ? w - 0.6 : h) }];
  if (exits.includes('E') || exits.includes('W')) strips.push({ a: v2(exits.includes('W') ? -h + 0.6 : 0, h), b: v2(exits.includes('E') ? h - 0.6 : 0, h) });
  return {
    ...base(id, 'junction'),
    footprint: rect(-h, h, 0, w),
    connectors,
    walls,
    lightStrips: strips,
    navPoints: [v2(0, h)],
    artSlots: computeArtSlots(walls, flat),
  };
}

/**
 * Salle rectangulaire, plus haute de plafond. `exits` : N (au centre du fond),
 * E / W (au milieu des côtés). Petite salle : un banc ; grande salle : une cimaise
 * centrale accrochée des deux côtés.
 */
type RoomFurniture = 'banc' | 'cimaise' | 'jardinieres' | 'aucun';

function room(id: string, w: number, width: number, depth: number, exits: Array<'N' | 'E' | 'W'>, furniture: RoomFurniture): ModuleDef {
  const hx = width / 2;
  const openings: Opening[] = [{ side: 'S', center: 0, width: w }];
  const connectors: ConnectorDef[] = [entrance(w)];
  for (const e of exits) {
    if (e === 'N') {
      openings.push({ side: 'N', center: 0, width: w });
      connectors.push({ pos: v2(0, depth), y: 0, normal: v2(0, 1), width: w });
    } else {
      openings.push({ side: e, center: depth / 2, width: w });
      connectors.push({ pos: v2(e === 'E' ? hx : -hx, depth / 2), y: 0, normal: v2(e === 'E' ? 1 : -1, 0), width: w });
    }
  }
  const { walls, lintels } = perimeter(-hx, hx, 0, depth, openings, true);
  const c = v2(0, depth / 2);
  const obstacles: ObstacleDef[] = [];
  if (furniture === 'banc') obstacles.push({ kind: 'bench', center: c, size: v2(1.8, 0.55), height: 0.46 });
  if (furniture === 'cimaise') obstacles.push({ kind: 'cimaise', center: c, size: v2(Math.min(5.2, width - 6), 0.3), height: 2.9 });
  if (furniture === 'jardinieres') {
    // Un massif au centre des grandes salles, des pots dans les angles.
    if (width > 10) obstacles.push({ kind: 'planter', center: c, size: v2(3.2, 1.4), height: 0.55 });
    const ix = hx - 1.1, iz = 1.1;
    for (const [x, z] of [[-ix, iz], [ix, iz], [-ix, depth - iz], [ix, depth - iz]] as const) {
      obstacles.push({ kind: 'planter', center: v2(x, z), size: v2(0.9, 0.9), height: 0.6 });
    }
  }
  for (const o of obstacles) walls.push(...obstacleWalls(o, o.kind === 'cimaise'));
  // Points libres autour du centre, pour que l'auto-marche contourne l'obstacle central.
  const central = obstacles.find((o) => o.center.x === c.x && o.center.z === c.z);
  const ox = (central ? central.size.x / 2 : 0.5) + 1.1, oz = (central ? central.size.z / 2 : 0.5) + 1.1;
  const navPoints = [v2(-ox, c.z), v2(ox, c.z), v2(0, c.z - oz), v2(0, c.z + oz), v2(-ox, c.z - oz), v2(ox, c.z - oz), v2(-ox, c.z + oz), v2(ox, c.z + oz)];
  const nStrips = width > 10 ? 3 : 2;
  const lightStrips: Segment[] = [];
  for (let i = 0; i < nStrips; i++) {
    const x = (i - (nStrips - 1) / 2) * (width / nStrips);
    lightStrips.push({ a: v2(x, 1), b: v2(x, depth - 1) });
  }
  // Socles dans les coins du fond (et de l'entrée dans les grandes salles), loin des portes ;
  // pas avec les jardinières, qui occupent déjà les coins.
  const pedestals: ModuleDef['pedestals'] = [];
  if (furniture !== 'jardinieres') {
    const px = hx - 1.7;
    for (const x of [-px, px]) {
      pedestals.push({ pos: v2(x, depth - 1.7), normal: v2(0, -1) });
      if (width > 10) pedestals.push({ pos: v2(x, 1.7), normal: v2(0, 1) });
    }
  }
  return {
    ...base(id, 'room'),
    pedestals,
    ceilingScale: 1.4,
    footprint: rect(-hx, hx, 0, depth),
    connectors,
    walls,
    lintels,
    obstacles,
    lightStrips,
    navPoints,
    artSlots: computeArtSlots(walls, flat),
  };
}

/** Escalier droit : le sol monte (ou descend) de `rise` sur la longueur. */
function stairs(id: string, w: number, length: number, rise: number): ModuleDef {
  const h = w / 2;
  const floorAt = (p: Vec2) => rise * Math.max(0, Math.min(1, p.z / length));
  const walls: WallDef[] = [
    { seg: { a: v2(-h, 0), b: v2(-h, length) }, hangable: false },
    { seg: { a: v2(h, length), b: v2(h, 0) }, hangable: false },
  ];
  return {
    ...base(id, 'stairs'),
    rise,
    floorAt,
    footprint: rect(-h, h, 0, length),
    connectors: [entrance(w), { pos: v2(0, length), y: rise, normal: v2(0, 1), width: w }],
    walls,
    lightStrips: [{ a: v2(0, 0.6), b: v2(0, length - 0.6) }],
    artSlots: [],
  };
}

/** Impasse : un couloir court fermé, une seule œuvre au fond, mise en valeur. */
function deadend(id: string, w: number, length: number): ModuleDef {
  const h = w / 2;
  const walls: WallDef[] = [
    { seg: { a: v2(-h, 0), b: v2(-h, length) }, hangable: false },
    { seg: { a: v2(h, length), b: v2(h, 0) }, hangable: false },
    { seg: { a: v2(-h, length), b: v2(h, length) }, hangable: true },
  ];
  return {
    ...base(id, 'deadend'),
    footprint: rect(-h, h, 0, length),
    connectors: [entrance(w)],
    walls,
    lightStrips: [{ a: v2(0, 0.6), b: v2(0, length - 1.6) }],
    // Point d'arrêt de l'auto-marche, face à l'œuvre.
    navPoints: [v2(0, length - 2)],
    artSlots: [{ pos: v2(0, length), y: 0, normal: v2(0, -1), maxWidth: w - 0.9 }],
  };
}

/**
 * Sas : vestibule étroit et sombre entre deux mondes (transition « seuil »).
 * Ses ouvertures sont des portes : les modules voisins se referment autour
 * (voir les raccords d'ouvertures).
 */
function sas(id: string, length: number): ModuleDef {
  const dw = 1.7, h = dw / 2, top = 2.5;
  const walls: WallDef[] = [
    { seg: { a: v2(-h, 0), b: v2(-h, length) }, hangable: false },
    { seg: { a: v2(h, length), b: v2(h, 0) }, hangable: false },
  ];
  return {
    ...base(id, 'sas'),
    ceilingHeight: top,
    dark: true,
    footprint: rect(-h, h, 0, length),
    connectors: [
      { pos: v2(0, 0), y: 0, normal: v2(0, -1), width: dw, top },
      { pos: v2(0, length), y: 0, normal: v2(0, 1), width: dw, top },
    ],
    walls,
    lightStrips: [],
    artSlots: [],
  };
}

/** Bouchon : un simple mur qui ferme une ouverture (dernier recours), avec une œuvre au centre. */
function cap(id: string, w: number): ModuleDef {
  const h = w / 2;
  // Le mur est 1 cm en deçà de l'ouverture, débordant un peu sur les côtés : aucune fente
  // aux coins, et il masque le module qui occupe la place derrière (sans quoi le dos de
  // ses cadres, accrochés contre l'ouverture, apparaîtrait devant le bouchon).
  const depth = -0.01;
  const walls: WallDef[] = [{ seg: { a: v2(-h - 0.05, depth), b: v2(h + 0.05, depth) }, hangable: true }];
  return {
    ...base(id, 'cap'),
    hasFloor: false,
    footprint: rect(-h, h, 0, 0.05),
    connectors: [entrance(w)],
    walls,
    lightStrips: [],
    artSlots: [{ pos: v2(0, depth), y: 0, normal: v2(0, -1), maxWidth: w - 1.2 }],
  };
}

/**
 * Rotonde de départ : salle octogonale, haute de plafond, percée de quatre portes
 * (une par point cardinal, l'entrée comprise) ; les quatre pans en biais portent des œuvres.
 * Elle n'est jamais tirée au hasard : le monde la place au départ (voir World.init).
 */
function rotonde(id: string, w: number, extraDoor = false): ModuleDef {
  const sides = 8;
  const half = Math.PI / sides;
  // Pans assez larges pour une porte et deux jambages d'au moins 1,2 m.
  const r = Math.max(7, (w + 2.4) / (2 * Math.tan(half)));
  const s = r * Math.tan(half);
  const c = v2(0, r);
  const walls: WallDef[] = [];
  const connectors: ConnectorDef[] = [];
  const lintels: Segment[] = [];
  const footprint: Vec2[] = [];
  for (let k = 0; k < sides; k++) {
    const th = -Math.PI / 2 + k * 2 * half;
    const n = v2(Math.cos(th), Math.sin(th));
    const t = v2(-n.z, n.x);
    const mid = v2(c.x + n.x * r, c.z + n.z * r);
    const at = (u: number) => v2(mid.x + t.x * u, mid.z + t.z * u);
    footprint.push(at(-s));
    // Parcours dans le sens qui tourne la normale du mur vers l'intérieur.
    // (Variante de la finale : une cinquième porte, sur le pan en biais de droite, au fond.)
    if (k % 2 === 0 || (extraDoor && k === 3)) {
      const dw = w / 2;
      walls.push({ seg: { a: at(s), b: at(dw) }, hangable: false }, { seg: { a: at(-dw), b: at(-s) }, hangable: false });
      lintels.push({ a: at(dw), b: at(-dw) });
      connectors.push({ pos: k === 0 ? v2(0, 0) : mid, y: 0, normal: n, width: w });
    } else {
      walls.push({ seg: { a: at(s), b: at(-s) }, hangable: true });
    }
  }
  return {
    ...base(id, 'rotonde'),
    ceilingScale: 1.6,
    footprint,
    connectors,
    walls,
    lintels,
    lightStrips: [
      { a: v2(-r + 1.5, r), b: v2(r - 1.5, r) },
      { a: v2(0, 1.5), b: v2(0, 2 * r - 1.5) },
    ],
    navPoints: [v2(0, r * 0.55), v2(-2, r), v2(2, r)],
    // Une sculpture au centre, face à l'entrée.
    pedestals: [{ pos: c, normal: v2(0, -1) }],
    artSlots: computeArtSlots(walls, flat),
  };
}

/** Construit le catalogue des modules pour une largeur de couloir et un mobilier donnés. */
export function makeModuleDefs(corridorWidth: number, furniture: { small: RoomFurniture; large: RoomFurniture }): Record<string, ModuleDef> {
  const w = corridorWidth;
  const defs = [
    straight('straight-s', w, 7.2),
    straight('straight-m', w, 12.6),
    straight('straight-l', w, 19.8),
    turn('turn-left', w, 'left'),
    turn('turn-right', w, 'right'),
    junction('tee', w, ['E', 'W']),
    junction('tee-left', w, ['N', 'E']),
    junction('tee-right', w, ['N', 'W']),
    junction('cross', w, ['N', 'E', 'W']),
    room('room-s', w, 2 * w, 2 * w, ['N'], furniture.small),
    room('room-s-side', w, 2 * w, 2 * w, ['E', 'W'], furniture.small),
    room('room-l', w, 3 * w, 3 * w, ['N', 'E', 'W'], furniture.large),
    stairs('stairs-up', w, 7.6, 2.4),
    stairs('stairs-down', w, 7.6, -2.4),
    deadend('deadend', w, 5.4),
    sas('sas', 3.2),
    cap('cap', w),
    // La galerie des plâtres (voix off) : longue salle, une sortie au fond. Jamais tirée au sort.
    room('galerie', w, 2 * w, 6 * w, ['N'], 'aucun'),
    rotonde('rotonde', w),
    rotonde('rotonde-finale', w, true),
  ];
  return Object.fromEntries(defs.map((d) => [d.id, d]));
}
