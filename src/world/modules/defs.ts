import { CONFIG } from '../../config';
import { dist, sub, v2, type Segment, type Vec2 } from '../math2d';

/**
 * Description purement géométrique d'un type de module, dans son repère local.
 *
 * Convention : l'entrée (connecteur 0) est en (0, 0), sa normale sortante est (0, -1),
 * le module s'étend vers +Z. En regardant vers +Z, +X est à GAUCHE (repère Three.js).
 */
export interface ConnectorDef {
  /** Centre de l'ouverture, au sol. */
  pos: Vec2;
  /** Normale sortante (vers le module voisin). */
  normal: Vec2;
  /** Largeur de l'ouverture. */
  width: number;
}

export interface WallDef {
  /** Segment dont la normale intérieure est (d.z, -d.x) avec d = b - a. */
  seg: Segment;
  /** On peut accrocher des œuvres sur ce mur. */
  hangable: boolean;
}

export interface ArtSlotDef {
  /** Point au pied du mur, au centre de l'emplacement. */
  pos: Vec2;
  /** Normale du mur, tournée vers l'intérieur du module. */
  normal: Vec2;
  /** Largeur maximale disponible. */
  maxWidth: number;
}

export interface ModuleDef {
  id: string;
  kind: 'straight' | 'turn' | 'cap';
  /** Sens du virage en allant de l'entrée (0) vers la sortie (1) : +1 gauche, -1 droite, 0 aucun. */
  turn: -1 | 0 | 1;
  /** Polygone convexe au sol (sens antihoraire ou horaire, cohérent). */
  footprint: Vec2[];
  connectors: ConnectorDef[];
  walls: WallDef[];
  /** Le module a un sol et un plafond (pas l'impasse « cap »). */
  hasFloor: boolean;
  /** Bandes lumineuses au plafond. */
  lightStrips: Segment[];
  /** Points de passage pour l'auto-marche, entre l'entrée et chaque sortie. */
  waypoints: Vec2[];
  artSlots: ArtSlotDef[];
}

export function wallNormal(seg: Segment): Vec2 {
  const d = sub(seg.b, seg.a);
  const l = Math.hypot(d.x, d.z);
  return { x: d.z / l, z: -d.x / l };
}

/** Répartit des emplacements d'œuvres le long des murs accrochables. */
function computeArtSlots(walls: WallDef[]): ArtSlotDef[] {
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
      slots.push({
        pos: { x: wall.seg.a.x + (wall.seg.b.x - wall.seg.a.x) * t, z: wall.seg.a.z + (wall.seg.b.z - wall.seg.a.z) * t },
        normal: n,
        maxWidth: step - 0.6,
      });
    }
  }
  return slots;
}

function rect(minX: number, maxX: number, minZ: number, maxZ: number): Vec2[] {
  return [v2(minX, minZ), v2(maxX, minZ), v2(maxX, maxZ), v2(minX, maxZ)];
}

function straight(id: string, w: number, length: number): ModuleDef {
  const h = w / 2;
  const walls: WallDef[] = [
    { seg: { a: v2(-h, 0), b: v2(-h, length) }, hangable: true }, // droite
    { seg: { a: v2(h, length), b: v2(h, 0) }, hangable: true }, // gauche
  ];
  return {
    id,
    kind: 'straight',
    turn: 0,
    footprint: rect(-h, h, 0, length),
    connectors: [
      { pos: v2(0, 0), normal: v2(0, -1), width: w },
      { pos: v2(0, length), normal: v2(0, 1), width: w },
    ],
    walls,
    hasFloor: true,
    lightStrips: [{ a: v2(0, 0.6), b: v2(0, length - 0.6) }],
    waypoints: [v2(0, length)],
    artSlots: computeArtSlots(walls),
  };
}

function turn(id: string, w: number, side: 'left' | 'right'): ModuleDef {
  const h = w / 2;
  const s = side === 'left' ? 1 : -1; // +X = gauche
  // Le mur extérieur (côté opposé au virage) et le mur du fond.
  const outer: WallDef =
    side === 'left'
      ? { seg: { a: v2(-h, 0), b: v2(-h, w) }, hangable: true }
      : { seg: { a: v2(h, w), b: v2(h, 0) }, hangable: true };
  const back: WallDef = { seg: { a: v2(-h, w), b: v2(h, w) }, hangable: true };
  const walls = [outer, back];
  return {
    id,
    kind: 'turn',
    turn: s as 1 | -1,
    footprint: rect(-h, h, 0, w),
    connectors: [
      { pos: v2(0, 0), normal: v2(0, -1), width: w },
      { pos: v2(s * h, h), normal: v2(s, 0), width: w },
    ],
    walls,
    hasFloor: true,
    lightStrips: [
      { a: v2(0, 0.6), b: v2(0, h) },
      { a: v2(0, h), b: v2(s * (h - 0.6), h) },
    ],
    waypoints: [v2(0, h * 0.9), v2(s * h, h)],
    artSlots: computeArtSlots(walls),
  };
}

/** Impasse : un simple mur qui ferme une ouverture, avec une œuvre au centre. */
function cap(id: string, w: number): ModuleDef {
  const h = w / 2;
  // Le mur est collé à l'ouverture (5 mm) pour ne laisser aucune fente visible aux coins.
  const depth = 0.005;
  const walls: WallDef[] = [{ seg: { a: v2(-h - 0.05, depth), b: v2(h + 0.05, depth) }, hangable: true }];
  return {
    id,
    kind: 'cap',
    turn: 0,
    footprint: rect(-h, h, 0, 0.05),
    connectors: [{ pos: v2(0, 0), normal: v2(0, -1), width: w }],
    walls,
    hasFloor: false,
    lightStrips: [],
    waypoints: [],
    artSlots: [{ pos: v2(0, depth), normal: v2(0, -1), maxWidth: w - 1.2 }],
  };
}

/** Construit le catalogue des modules pour une largeur de couloir donnée. */
export function makeModuleDefs(corridorWidth: number): Record<string, ModuleDef> {
  const w = corridorWidth;
  const defs = [
    straight('straight-s', w, 7.2),
    straight('straight-m', w, 12.6),
    straight('straight-l', w, 19.8),
    turn('turn-left', w, 'left'),
    turn('turn-right', w, 'right'),
    cap('cap', w),
  ];
  return Object.fromEntries(defs.map((d) => [d.id, d]));
}
