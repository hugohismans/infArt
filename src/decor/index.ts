import * as THREE from 'three';
import type { AmbiancePreset, DecorKind } from '../ambiances/types';
import { CONFIG } from '../config';
import { dist, dot, pointInConvex, sub, type Segment, type Vec2 } from '../world/math2d';
import { wallNormal, type ArtSlotDef, type ModuleDef } from '../world/modules/defs';
import { Rng } from '../world/random';
import { buildExitSign, buildRope, CATALOG } from './catalog';
import { Kit } from './kit';
import { buildBoundary } from './boundary';

/**
 * Décors procéduraux d'un module, tirés dans le pool de son ambiance avec la graine
 * du module. Règles :
 * - jamais au milieu du passage : les objets restent contre les murs (≤ 0,75 m) ;
 * - jamais devant une œuvre : seuls les objets bas se glissent sous un emplacement ;
 * - jamais devant une ouverture ni contre un obstacle (banc, cimaise, jardinière) ;
 * - légers : tout le décor d'un module tient en trois géométries fusionnées.
 */
export interface DecorBuild {
  solid: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
  shafts: THREE.BufferGeometry | null;
  /** Contours des objets au sol (repère du module), pour les collisions. */
  collisions: Segment[];
  /** Fuites : point de départ de la goutte (plafond) et hauteur d'arrivée. */
  drips: Array<{ x: number; z: number; top: number; bottom: number }>;
  /** Café encore chaud : d'où monte la fumée (repère du module). */
  steam?: { x: number; y: number; z: number };
}

/** Étrangetés qui passent par le décor. */
export interface DecorOddities {
  /** Salle vidée : traces claires des cadres décrochés, et leurs clous. */
  emptied?: boolean;
  /** Une veste oubliée sur un banc ou une chaise, un gobelet de café qui fume encore. */
  forgotten?: boolean;
  /** Ouvertures surmontées d'un panneau d'orientation (pas de panneau « sortie » par-dessus). */
  signed?: readonly number[];
}

interface Spot {
  pos: Vec2;
  /** Normale du mur, vers l'intérieur. */
  n: Vec2;
  /** Demi-largeur libre le long du mur (ouvertures, coins, obstacles). */
  free: number;
  /** Idem en tenant compte des emplacements d'œuvres (objets hauts). */
  freeHigh: number;
}

const SPOT_STEP = 0.5;
/** Distance minimale entre un objet et une ouverture (passage dégagé). */
const DOOR_CLEARANCE = 0.6;

/**
 * Emplacements candidats le long des murs pleins du module. Les objets hauts évitent
 * les emplacements où une œuvre est accrochée ; un emplacement resté vide est libre.
 */
function wallSpots(def: ModuleDef, hung: readonly ArtSlotDef[]): Spot[] {
  const spots: Spot[] = [];
  for (const w of def.walls) {
    if (w.obstacle || w.height !== undefined) continue;
    const len = dist(w.seg.a, w.seg.b);
    if (len < 1) continue;
    const n = wallNormal(w.seg);
    const t = { x: (w.seg.b.x - w.seg.a.x) / len, z: (w.seg.b.z - w.seg.a.z) / len };
    for (let s = SPOT_STEP; s <= len - SPOT_STEP + 1e-6; s += SPOT_STEP) {
      const pos = { x: w.seg.a.x + t.x * s, z: w.seg.a.z + t.z * s };
      // Coins : l'objet ne doit pas entrer dans le mur perpendiculaire.
      let free = Math.min(s, len - s) - 0.05;
      for (const c of def.connectors) {
        // L'objet garde ses distances avec le bord de l'ouverture.
        const d = dist(pos, c.pos) - c.width / 2;
        free = Math.min(free, d - DOOR_CLEARANCE);
      }
      if (free < 0.1) continue;
      let freeHigh = free;
      for (const slot of hung) {
        if (dot(slot.normal, n) < 0.99 || Math.abs(dot(sub(slot.pos, pos), n)) > 0.05) continue;
        const along = Math.abs(dot(sub(slot.pos, pos), t));
        freeHigh = Math.min(freeHigh, along - slot.maxWidth / 2 - 0.12);
      }
      spots.push({ pos, n, free, freeHigh });
    }
  }
  return spots;
}

/** Rectangle occupé par un objet (repère du module), avec une marge. */
function footprint(pos: Vec2, n: Vec2, width: number, depth: number, margin = 0): Vec2[] {
  const t = { x: -n.z, z: n.x };
  const hw = width / 2 + margin;
  const z0 = -margin, z1 = depth + margin;
  const at = (u: number, v: number) => ({ x: pos.x + t.x * u + n.x * v, z: pos.z + t.z * u + n.z * v });
  return [at(-hw, z0), at(hw, z0), at(hw, z1), at(-hw, z1)];
}

function overlapsRect(poly: Vec2[], o: { center: Vec2; size: Vec2 }, margin: number): boolean {
  const x0 = o.center.x - o.size.x / 2 - margin, x1 = o.center.x + o.size.x / 2 + margin;
  const z0 = o.center.z - o.size.z / 2 - margin, z1 = o.center.z + o.size.z / 2 + margin;
  return poly.some((p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1);
}

function edges(poly: Vec2[]): Segment[] {
  return poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length]! }));
}

export function buildDecor(def: ModuleDef, preset: AmbiancePreset, rng: Rng, hung: readonly ArtSlotDef[], odd: DecorOddities = {}): DecorBuild {
  const k = new Kit();
  const out: DecorBuild = { solid: null, glow: null, shafts: null, collisions: [], drips: [] };
  const d = preset.decor;
  const ceiling = def.ceilingHeight ?? preset.geometry.ceilingHeight * def.ceilingScale;
  // Ciel ouvert : la lisière rend visibles les limites (même au bout d'une impasse).
  if (d.boundary && def.kind !== 'stairs' && def.kind !== 'sas') {
    out.collisions.push(...buildBoundary(k, def, d.boundary, new Rng(rng.nextUint(), 'lisiere'), hung, ceiling));
    if (def.kind === 'cap' || !def.hasFloor) return { ...out, ...k.build() };
  }
  // Pas de décor dans les escaliers, les sas et les bouchons.
  if (def.kind === 'stairs' || def.kind === 'sas' || def.kind === 'cap' || !def.hasFloor) return out;
  const angleOf = (n: Vec2) => Math.atan2(n.x, n.z);
  // Objet contre un mur : décollé de quelques millimètres (le mur voisin est au même plan).
  const placeOnWall = (p: Vec2, y: number, n: Vec2) => k.place(p.x + n.x * CONFIG.world.wallGap, y, p.z + n.z * CONFIG.world.wallGap, angleOf(n));
  const placed: Vec2[][] = [];
  const free = (poly: Vec2[]) => !placed.some((p) => p.some((v) => pointInConvex(v, poly)) || poly.some((v) => pointInConvex(v, p)));

  // Chevalets : l'œuvre est posée devant le mur, on ne la traverse pas.
  if (preset.art.mount === 'chevalet') {
    for (const slot of hung) {
      if (slot.hangY) continue;
      const poly = footprint(slot.pos, slot.normal, 1.1, CONFIG.art.easelDistance + 0.35);
      placed.push(poly);
      out.collisions.push(...edges(footprint(slot.pos, slot.normal, 1.0, CONFIG.art.easelDistance + 0.3)));
    }
  }
  // Forêt : chaque œuvre est accrochée à un tronc.
  if (d.trunksBehindArt) {
    for (const slot of hung) {
      if (slot.hangY) continue;
      // Tronc devant le mur (invisible mais opaque) ; l'œuvre est sur sa face avant (voir ArtPiece).
      const r = CONFIG.decor.trunkRadius, z = r + CONFIG.world.wallGap;
      placed.push(footprint(slot.pos, slot.normal, 2 * r + 0.3, 2 * z + 0.15));
      out.collisions.push(...edges(footprint(slot.pos, slot.normal, 2 * r, 2 * z)));
      k.place(slot.pos.x, slot.y, slot.pos.z, angleOf(slot.normal));
      const seed = rng.int(0, 1000);
      k.cyl(r, ceiling + 1, 0, (ceiling + 1) / 2, z, '#3b2c22', 9, 0.7);
      k.blob(1.4, 0, ceiling + 1.2, z + 0.4, [new THREE.Color('#1d3320'), new THREE.Color('#25402a'), new THREE.Color('#183020')], seed);
    }
  }

  // Salle vidée : il ne reste que les traces des cadres, plus claires que le mur, et les clous.
  if (odd.emptied) {
    const ghost = new THREE.Color(preset.palette.wall).lerp(new THREE.Color('#ffffff'), 0.22);
    for (const slot of def.artSlots) {
      const w = Math.min(slot.maxWidth, rng.range(0.4, 1.3)), h = rng.range(0.45, 1.2);
      const cy = Math.max(1.55, h / 2 + 0.6);
      k.place(slot.pos.x, slot.y, slot.pos.z, angleOf(slot.normal));
      k.box(w, h, 0.003, 0, cy, 0.008, ghost);
      k.cyl(0.006, 0.035, 0, cy + h / 2 - 0.1, 0.02, '#2a2622', 6, 1, { x: Math.PI / 2 });
    }
  }

  // Objets contre les murs.
  const spots = rng.shuffle(wallSpots(def, hung));

  // Veste oubliée et café encore chaud : sur le banc s'il y en a un, sinon sur une chaise.
  if (odd.forgotten) {
    // Tissu, revers (plus sombre), doublure : des teintes qui se détachent de la chaise (pas de rouge : l'assise l'est souvent).
    const jacket = rng.pick(JACKETS);
    const bench = def.obstacles.find((o) => o.kind === 'bench');
    if (bench) {
      const y = bench.height;
      k.place(bench.center.x, 0, bench.center.z, 0);
      jacketFolded(k, jacket, -0.3, y);
      k.cyl(0.035, 0.1, 0.45, y + 0.05, 0.05, '#f2efe8', 10, 1.15);
      out.steam = { x: bench.center.x + 0.45, y: y + 0.11, z: bench.center.z + 0.05 };
    } else {
      const spot = spots.find((sp) => sp.freeHigh >= 0.3 && !def.obstacles.some((o) => overlapsRect(footprint(sp.pos, sp.n, 0.5, 0.6), o, 0.3)));
      if (spot) {
        spots.splice(spots.indexOf(spot), 1);
        placed.push(footprint(spot.pos, spot.n, 0.5, 0.6, 0.15));
        placeOnWall(spot.pos, def.floorAt(spot.pos), spot.n);
        CATALOG.chaise.build(k, rng, ceiling, true);
        // Veste sur le dossier, gobelet sur l'assise.
        jacketOnChair(k, jacket);
        k.cyl(0.035, 0.1, 0.1, 0.545, 0.32, '#f2efe8', 10, 1.15);
        const p = { x: spot.pos.x + spot.n.x * 0.32 - spot.n.z * 0.1, z: spot.pos.z + spot.n.z * 0.32 + spot.n.x * 0.1 };
        out.steam = { x: p.x, y: def.floorAt(spot.pos) + 0.6, z: p.z };
        out.collisions.push(...edges(footprint(spot.pos, spot.n, 0.46, 0.55)));
      }
    }
  }
  const room = def.kind === 'room';
  const count = Math.round(d.density * (room ? 2 : 1) * rng.range(0.4, 1.6) * CONFIG.decor.density);
  const pool = Object.entries(d.pool).filter(([, w]) => (w ?? 0) > 0) as Array<[DecorKind, number]>;
  for (let i = 0; i < count && pool.length > 0; i++) {
    const kind = rng.weighted(Object.fromEntries(pool)) as DecorKind;
    const item = CATALOG[kind];
    const spot = spots.find((s) => {
      if ((item.low ? s.free : s.freeHigh) < item.width / 2) return false;
      const poly = footprint(s.pos, s.n, item.width, item.depth, 0.15);
      return free(poly) && !def.obstacles.some((o) => overlapsRect(poly, o, 0.3));
    });
    if (!spot) continue;
    const poly = footprint(spot.pos, spot.n, item.width, item.depth);
    placed.push(footprint(spot.pos, spot.n, item.width, item.depth, 0.15));
    placeOnWall(spot.pos, def.floorAt(spot.pos), spot.n);
    item.build(k, rng, ceiling, preset.surfaces.ceiling !== 'verriere');
    if (!item.flat) out.collisions.push(...edges(poly));
    if (item.drip) {
      out.drips.push({ x: spot.pos.x + spot.n.x * item.drip.z, z: spot.pos.z + spot.n.z * item.drip.z, top: ceiling - 0.02, bottom: item.drip.y });
    }
  }

  // Cordons devant certaines œuvres (pas dans les couloirs étroits).
  if (d.ropes > 0 && preset.geometry.corridorWidth >= 4) {
    for (const slot of hung) {
      if (slot.wallHeight !== undefined || !rng.chance(d.ropes)) continue;
      const half = Math.min(slot.maxWidth / 2, 1.3) + 0.15;
      const z = 0.65;
      const poly = footprint(slot.pos, slot.normal, half * 2 + 0.3, z + 0.15);
      if (!free(poly) || def.obstacles.some((o) => overlapsRect(poly, o, 0.3))) continue;
      if (def.connectors.some((c) => dist(c.pos, slot.pos) - c.width / 2 < half + 0.6)) continue;
      placed.push(poly);
      k.place(slot.pos.x, slot.y, slot.pos.z, angleOf(slot.normal));
      buildRope(k, half, z);
      const tn = { x: -slot.normal.z, z: slot.normal.x };
      const at = (u: number) => ({ x: slot.pos.x + tn.x * u + slot.normal.x * z, z: slot.pos.z + tn.z * u + slot.normal.z * z });
      out.collisions.push({ a: at(-half), b: at(half) });
    }
  }

  // Panneaux « sortie » au-dessus des ouvertures, côté intérieur.
  if (d.exitSigns > 0) {
    for (const [i, c] of def.connectors.entries()) {
      if (!rng.chance(d.exitSigns) || odd.signed?.includes(i)) continue;
      const top = c.top ?? preset.geometry.ceilingHeight;
      const y = Math.min(top - 0.25, ceiling - 0.35);
      if (y < 2.25) continue;
      const inward = { x: -c.normal.x, z: -c.normal.z };
      k.place(c.pos.x + inward.x * 0.6, c.y, c.pos.z + inward.z * 0.6, angleOf(inward));
      buildExitSign(k, y, ceiling);
    }
  }

  // Au sol : feuilles mortes, taches (n'importe où : c'est plat).
  const scatter = (n: number, draw: (p: Vec2) => void) => {
    const xs = def.footprint.map((p) => p.x), zs = def.footprint.map((p) => p.z);
    for (let i = 0; i < n; i++) {
      const p = { x: rng.range(Math.min(...xs) + 0.3, Math.max(...xs) - 0.3), z: rng.range(Math.min(...zs) + 0.3, Math.max(...zs) - 0.3) };
      if (pointInConvex(p, def.footprint)) draw(p);
    }
  };
  const poissonish = (mean: number) => Math.round(mean * rng.range(0.3, 1.7));
  k.place(0, 0, 0, 0);
  scatter(poissonish(d.leaves * CONFIG.decor.density), (p) => {
    const s = rng.range(0.05, 0.11);
    k.flat(s, s * rng.range(0.5, 0.8), p.x, def.floorAt(p) + 0.005 + rng.range(0, 0.002), p.z, rng.range(0, Math.PI), rng.pick(['#8a5a2b', '#a8732f', '#6f4a22', '#9b6b1e', '#5d6b2c']));
  });
  scatter(poissonish(d.stains), (p) => {
    k.splotch(rng.range(0.25, 0.6), p.x, def.floorAt(p) + 0.004, p.z, rng.pick(['#6f6236', '#5e5330', '#776a3c']), rng.int(0, 1000));
  });

  // Rayons de lumière tombant de la verrière.
  const shafts = poissonish(d.lightShafts);
  for (let i = 0; i < shafts; i++) {
    const xs = def.footprint.map((p) => p.x), zs = def.footprint.map((p) => p.z);
    const x = rng.range(Math.min(...xs) + 1, Math.max(...xs) - 1), z = rng.range(Math.min(...zs) + 1, Math.max(...zs) - 1);
    const angle = rng.range(0, Math.PI);
    const w = rng.range(0.5, 1.1);
    const h = ceiling / Math.cos(0.32);
    // Très ténus : en mélange additif, ils s'accumulent vite quand on les voit en enfilade.
    k.shaft(w, h, x, ceiling - 0.05, z, angle, 0.32, '#100e09');
    k.shaft(w * 0.7, h, x, ceiling - 0.05, z, angle + Math.PI / 2, 0.32, '#0c0a07');
  }

  return { ...out, ...k.build() };
}

/** Veste oubliée : tissu, revers, doublure. */
const JACKETS: Array<[string, string, string]> = [
  ['#b07a3c', '#8a5a28', '#e6dcc6'], // camel
  ['#3e6694', '#2c4b70', '#d8d2c4'], // jean
  ['#6f7d3c', '#535e2b', '#d9cfb0'], // kaki
  ['#c9c1ad', '#a69d86', '#7a2a2a'], // trench
];

/**
 * Veste jetée sur le dossier d'une chaise (celle du catalogue : dossier en z = 0,1, haut à
 * 0,95 m) : épaules et col par-dessus, devant ouvert sur la doublure, revers en V, deux
 * boutons, des poches, et les manches qui pendent de chaque côté.
 */
function jacketOnChair(k: Kit, [cloth, lapel, lining]: [string, string, string]): void {
  const top = 0.975;
  // Épaules arrondies par-dessus le dossier, qui retombent de chaque côté.
  k.box(0.3, 0.06, 0.13, 0, top, 0.1, cloth);
  for (const sx of [-1, 1]) k.box(0.15, 0.06, 0.13, sx * 0.2, top - 0.03, 0.1, cloth, { z: sx * -0.4 });
  // Col relevé, derrière.
  k.box(0.18, 0.07, 0.035, 0, top + 0.04, 0.06, lapel, { x: -0.25 });
  // Dos qui pend derrière le dossier.
  k.box(0.46, 0.44, 0.025, 0, top - 0.25, 0.07, cloth);
  // Devant : doublure au milieu, deux pans, revers en V.
  k.box(0.14, 0.24, 0.01, 0, top - 0.15, 0.125, lining);
  for (const sx of [-1, 1]) {
    k.box(0.2, 0.42, 0.03, sx * 0.115, top - 0.24, 0.135, cloth, { z: sx * 0.05 });
    k.box(0.055, 0.24, 0.012, sx * 0.062, top - 0.13, 0.153, lapel, { z: sx * 0.32 });
    // Poche à rabat.
    k.box(0.1, 0.022, 0.012, sx * 0.13, top - 0.33, 0.153, lapel);
    // Manche : du bout de l'épaule jusque sous l'assise, poignet en doublure.
    k.cyl(0.048, 0.48, sx * 0.29, top - 0.29, 0.12, cloth, 8, 0.85, { z: sx * 0.1, x: 0.06 });
    k.cyl(0.042, 0.035, sx * 0.315, top - 0.54, 0.105, lining, 8);
  }
  // Boutons, là où les pans se croisent.
  for (const y of [top - 0.3, top - 0.39]) k.box(0.028, 0.028, 0.012, 0.012, y, 0.155, '#e8dfc8');
}

/** Veste pliée en deux sur un banc : col et revers dessus, une manche qui pend. */
function jacketFolded(k: Kit, [cloth, lapel, lining]: [string, string, string], x: number, y: number): void {
  k.box(0.44, 0.06, 0.36, x, y + 0.03, 0, cloth, { y: 0.25 });
  k.box(0.16, 0.012, 0.22, x + 0.02, y + 0.066, 0.02, lining, { y: 0.25 });
  for (const sx of [-1, 1]) k.box(0.05, 0.012, 0.2, x + 0.02 + sx * 0.07, y + 0.07, 0.02, lapel, { y: 0.25 + sx * 0.3 });
  k.box(0.2, 0.05, 0.05, x - 0.05, y + 0.08, -0.15, lapel, { y: 0.25 });
  k.cyl(0.045, 0.34, x + 0.24, y - 0.13, 0.12, cloth, 8, 0.85, { z: 0.25 });
  k.cyl(0.04, 0.03, x + 0.28, y - 0.3, 0.12, lining, 8);
}
