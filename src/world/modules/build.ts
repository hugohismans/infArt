import * as THREE from 'three';
import type { AmbiancePreset } from '../../ambiances/types';
import { dist, sub, type Segment, type Vec2 } from '../math2d';
import { wallNormal, type ModuleDef } from './defs';

type V3 = [number, number, number];

/**
 * Accumule des quadrilatères (position, normale, couleur, uv) puis produit
 * une seule BufferGeometry : un module entier = quelques draw calls seulement.
 */
class GeometryBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private uvs: number[] = [];

  /**
   * Ajoute un quad p0-p1-p2-p3 (dans l'ordre du contour). L'ordre des sommets est
   * corrigé automatiquement pour que la face avant regarde vers `normal`.
   */
  quad(p: [V3, V3, V3, V3], normal: V3, colors: [THREE.Color, THREE.Color, THREE.Color, THREE.Color], uv?: [number, number][]): void {
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const facing = n[0]! * normal[0] + n[1]! * normal[1] + n[2]! * normal[2];
    const order = facing >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    const quadUv = uv ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const i of order) {
      this.positions.push(...p[i]!);
      this.normals.push(...normal);
      const c = colors[i]!;
      this.colors.push(c.r, c.g, c.b);
      this.uvs.push(...quadUv[i]!);
    }
  }

  /** Triangle à normale plate (feuillages low-poly). */
  tri(p: [V3, V3, V3], colors: [THREE.Color, THREE.Color, THREE.Color]): void {
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    for (let i = 0; i < 3; i++) {
      this.positions.push(...p[i]!);
      this.normals.push(n[0]! / l, n[1]! / l, n[2]! / l);
      const c = colors[i]!;
      this.colors.push(c.r, c.g, c.b);
      this.uvs.push(0, 0);
    }
  }

  get empty(): boolean {
    return this.positions.length === 0;
  }

  build(withColors: boolean): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (withColors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export interface ModuleGeometries {
  /** Murs et linteaux (couleurs par sommet, motif éventuel). */
  walls: THREE.BufferGeometry | null;
  /** Plinthes, corniches, obstacles (couleurs par sommet). */
  trims: THREE.BufferGeometry | null;
  /** Plafond. */
  ceiling: THREE.BufferGeometry | null;
  /** Sol texturé. */
  floor: THREE.BufferGeometry | null;
  /** Bandes lumineuses (matériau non éclairé). */
  lights: THREE.BufferGeometry | null;
}

const col = (hex: string) => new THREE.Color(hex);
const four = (c: THREE.Color): [THREE.Color, THREE.Color, THREE.Color, THREE.Color] => [c, c, c, c];

/** Décale un segment de `offset` le long de sa normale intérieure. */
function offsetSegment(seg: Segment, offset: number): Segment {
  const n = wallNormal(seg);
  return {
    a: { x: seg.a.x + n.x * offset, z: seg.a.z + n.z * offset },
    b: { x: seg.b.x + n.x * offset, z: seg.b.z + n.z * offset },
  };
}

/** Hauteurs du sol aux deux extrémités d'un segment (sols en pente des escaliers). */
type Base = [number, number];

/**
 * Bande de mur le long d'un segment, de `h0` à `h1` au-dessus du sol local
 * (qui peut être en pente : `base` donne le sol en a et en b).
 */
function strip(b: GeometryBuilder, seg: Segment, base: Base, h0: number, h1: number, bottom: THREE.Color, top: THREE.Color): void {
  const n = wallNormal(seg);
  const len = dist(seg.a, seg.b);
  const [ya, yb] = base;
  b.quad(
    [
      [seg.a.x, ya + h0, seg.a.z],
      [seg.b.x, yb + h0, seg.b.z],
      [seg.b.x, yb + h1, seg.b.z],
      [seg.a.x, ya + h1, seg.a.z],
    ],
    [n.x, 0, n.z],
    [bottom, bottom, top, top],
    [[0, h0], [len, h0], [len, h1], [0, h1]],
  );
}

/** Bande horizontale (dessus de plinthe, corniche) entre le mur et un décalage. */
function ledge(b: GeometryBuilder, seg: Segment, base: Base, h: number, depth: number, color: THREE.Color, facing: 1 | -1): void {
  const o = offsetSegment(seg, depth);
  const [ya, yb] = base;
  b.quad(
    [
      [seg.a.x, ya + h, seg.a.z],
      [seg.b.x, yb + h, seg.b.z],
      [o.b.x, yb + h, o.b.z],
      [o.a.x, ya + h, o.a.z],
    ],
    [0, facing, 0],
    four(color),
  );
}

/** Rectangle horizontal (ou incliné : hauteur donnée par `yAt`) couvrant l'empreinte. */
function surface(b: GeometryBuilder, poly: Vec2[], yAt: (p: Vec2) => number, facing: 1 | -1, color: THREE.Color, uvScale: number): void {
  if (poly.length !== 4) throw new Error('Surface : 4 sommets attendus');
  const p = poly.map((v) => [v.x, yAt(v), v.z] as V3) as [V3, V3, V3, V3];
  const uv = poly.map((v) => [v.x * uvScale, v.z * uvScale] as [number, number]);
  b.quad(p, [0, facing, 0], four(color), uv);
}

/** Boîte alignée sur les axes : quatre faces latérales et le dessus. */
function box(b: GeometryBuilder, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, side: THREE.Color, sideTop: THREE.Color, top: THREE.Color): void {
  const sides: Array<[Segment, V3]> = [
    [{ a: { x: x0, z: z0 }, b: { x: x1, z: z0 } }, [0, 0, -1]],
    [{ a: { x: x1, z: z1 }, b: { x: x0, z: z1 } }, [0, 0, 1]],
    [{ a: { x: x0, z: z1 }, b: { x: x0, z: z0 } }, [-1, 0, 0]],
    [{ a: { x: x1, z: z0 }, b: { x: x1, z: z1 } }, [1, 0, 0]],
  ];
  for (const [s, n] of sides) {
    b.quad(
      [
        [s.a.x, y0, s.a.z],
        [s.b.x, y0, s.b.z],
        [s.b.x, y1, s.b.z],
        [s.a.x, y1, s.a.z],
      ],
      n,
      [side, side, sideTop, sideTop],
    );
  }
  b.quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], four(top));
}

/** Marches d'escalier (girons et contremarches) le long de Z, pour un dénivelé `rise` sur `length`. */
function steps(b: GeometryBuilder, halfW: number, length: number, rise: number, color: THREE.Color): void {
  const n = Math.max(2, Math.round(Math.abs(rise) / 0.18));
  // Le sol « physique » est une rampe : chaque giron est à la hauteur de la rampe en son milieu.
  const treadY = (i: number) => (rise * (i + 0.5)) / n;
  // Les contremarches regardent vers le bas de l'escalier.
  const riserFacing: V3 = [0, 0, rise > 0 ? -1 : 1];
  for (let i = 0; i < n; i++) {
    const z0 = (length * i) / n, z1 = (length * (i + 1)) / n;
    const y = treadY(i);
    b.quad([[-halfW, y, z0], [halfW, y, z0], [halfW, y, z1], [-halfW, y, z1]], [0, 1, 0], four(color), [
      [-halfW * 0.5, z0 * 0.5], [halfW * 0.5, z0 * 0.5], [halfW * 0.5, z1 * 0.5], [-halfW * 0.5, z1 * 0.5],
    ]);
    const prev = i === 0 ? 0 : treadY(i - 1);
    b.quad([[-halfW, prev, z0], [halfW, prev, z0], [halfW, y, z0], [-halfW, y, z0]], riserFacing, four(color.clone().multiplyScalar(0.8)));
  }
  // Dernière contremarche jusqu'au palier suivant.
  b.quad([[-halfW, treadY(n - 1), length], [halfW, treadY(n - 1), length], [halfW, rise, length], [-halfW, rise, length]], riserFacing, four(color.clone().multiplyScalar(0.8)));
}

/** Feuillage low-poly : octaèdre subdivisé, aux sommets légèrement déformés. */
function foliage(b: GeometryBuilder, cx: number, cy: number, cz: number, r: number, seed: number): void {
  // Octaèdre de base, subdivisé une fois (32 triangles).
  const top: V3 = [0, 1, 0], bottom: V3 = [0, -1, 0];
  const ring: V3[] = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
  let faces: Array<[V3, V3, V3]> = [];
  for (let i = 0; i < 4; i++) {
    faces.push([top, ring[i]!, ring[(i + 1) % 4]!]);
    faces.push([bottom, ring[(i + 1) % 4]!, ring[i]!]);
  }
  const mid = (a: V3, c: V3): V3 => {
    const m: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    const l = Math.hypot(...m);
    return [m[0] / l, m[1] / l, m[2] / l];
  };
  faces = faces.flatMap(([a, c, d]) => {
    const ab = mid(a, c), bc = mid(c, d), ca = mid(d, a);
    return [[a, ab, ca], [ab, c, bc], [ca, bc, d], [ab, bc, ca]] as Array<[V3, V3, V3]>;
  });
  // Déformation déterministe (pas d'aléatoire global : la géométrie est partagée).
  const jitter = (v: V3): V3 => {
    const k = 1 + 0.18 * Math.sin(seed * 12.9898 + v[0] * 7.1 + v[1] * 3.7 + v[2] * 5.3);
    return [cx + v[0] * r * k, cy + v[1] * r * 0.85 * k, cz + v[2] * r * k];
  };
  const greens = [new THREE.Color('#3f6b35'), new THREE.Color('#4f7d3e'), new THREE.Color('#355a2c'), new THREE.Color('#5d8a46')];
  faces.forEach(([a, c, d], i) => {
    // (seed peut être négatif : modulo toujours positif.)
    const g = greens[(((i + seed) % greens.length) + greens.length) % greens.length]!;
    b.tri([jitter(a), jitter(c), jitter(d)], [g, g, g]);
  });
}

/** Construit les géométries (partageables) d'un type de module pour une ambiance. */
export function buildModuleGeometries(def: ModuleDef, preset: AmbiancePreset): ModuleGeometries {
  const Hc = preset.geometry.ceilingHeight;
  const H = def.ceilingHeight ?? Hc * def.ceilingScale;
  const pal = preset.palette;
  const wall = col(pal.wall);
  const shade = col(pal.wallShade);
  // Dégradé du mur : sombre au pied, couleur pleine vers le haut (fausse occlusion ambiante).
  const wallLow = shade.clone().lerp(wall, 0.35);
  const wallMid = wall;
  const wallTop = wall.clone().lerp(col(pal.ceiling), 0.08);
  const skirting = col(pal.skirting);
  const molding = col(pal.ceiling).multiplyScalar(0.92);
  const ceiling = col(pal.ceiling);
  const at = (p: Vec2) => def.floorAt(p);
  const baseOf = (s: Segment): Base => [at(s.a), at(s.b)];
  const trimsOn = preset.surfaces.trims && def.kind !== 'sas';
  // Un sas est sombre : ses murs sont assombris.
  const dim = def.dark ? 0.35 : 1;

  const walls = new GeometryBuilder();
  const trims = new GeometryBuilder();
  const ceil = new GeometryBuilder();
  const floor = new GeometryBuilder();
  const lights = new GeometryBuilder();

  const skirtH = trimsOn ? 0.14 : 0, skirtD = 0.022;
  const moldH = trimsOn ? 0.16 : 0, moldD = 0.05;
  const wl = wallLow.clone().multiplyScalar(dim), wm = wallMid.clone().multiplyScalar(dim), wt = wallTop.clone().multiplyScalar(dim);

  for (const w of def.walls) {
    if (w.obstacle) continue; // dessinés avec leur obstacle
    const base = baseOf(w.seg);
    // Mur principal, en deux bandes pour un dégradé plus doux.
    strip(walls, w.seg, base, skirtH, Math.min(1.4, H - moldH), wl, wm);
    strip(walls, w.seg, base, Math.min(1.4, H - moldH), H - moldH, wm, wt);
    if (trimsOn && def.hasFloor) {
      // Plinthe : face avant + dessus.
      strip(trims, offsetSegment(w.seg, skirtD), base, 0, skirtH, skirting, skirting);
      ledge(trims, w.seg, base, skirtH, skirtD, skirting, 1);
      // Corniche sous le plafond.
      strip(trims, offsetSegment(w.seg, moldD), base, H - moldH, H, molding, molding);
      ledge(trims, w.seg, base, H - moldH, moldD, molding.clone().multiplyScalar(0.7), -1);
    } else if (trimsOn) {
      // Bouchon sans sol propre : le mur descend jusqu'au sol et monte jusqu'au plafond.
      strip(trims, w.seg, base, 0, skirtH, skirting, skirting);
      strip(trims, w.seg, base, H - moldH, H, molding, molding);
    }
  }

  // Linteaux : le mur au-dessus des portes d'une salle plus haute que les couloirs.
  for (const l of def.lintels) {
    if (H - Hc < 0.01) break;
    strip(walls, l, baseOf(l), Hc, H - moldH, wallTop, wallTop);
    if (trimsOn) strip(trims, offsetSegment(l, moldD), baseOf(l), H - moldH, H, molding, molding);
    ledge(trims, l, baseOf(l), Hc, 0.25, wallMid.clone().multiplyScalar(0.8), -1);
  }

  // Obstacles : cimaise, banc de velours, jardinière.
  for (const o of def.obstacles) {
    const x0 = o.center.x - o.size.x / 2, x1 = o.center.x + o.size.x / 2;
    const z0 = o.center.z - o.size.z / 2, z1 = o.center.z + o.size.z / 2;
    if (o.kind === 'cimaise') {
      box(trims, x0, x1, z0, z1, 0, o.height, wallLow, wallTop, molding);
      if (trimsOn) box(trims, x0 - skirtD, x1 + skirtD, z0 - skirtD, z1 + skirtD, 0, 0.14, skirting, skirting, skirting);
    } else if (o.kind === 'bench') {
      const velvet = col(pal.wallShade).lerp(col('#7a1f2b'), 0.6);
      const wood = col(pal.skirting);
      box(trims, x0 + 0.08, x1 - 0.08, z0 + 0.06, z1 - 0.06, 0, o.height - 0.1, wood, wood, wood);
      box(trims, x0, x1, z0, z1, o.height - 0.1, o.height, velvet, velvet.clone().multiplyScalar(1.15), velvet.clone().multiplyScalar(1.2));
    } else {
      // Jardinière en terre cuite et feuillage.
      const pot = col('#9a5536'), soil = col('#3b2a1e');
      box(trims, x0, x1, z0, z1, 0, o.height, pot.clone().multiplyScalar(0.8), pot, soil);
      const n = Math.max(1, Math.round(o.size.x / 1.1));
      for (let i = 0; i < n; i++) {
        const fx = x0 + (o.size.x * (i + 0.5)) / n;
        const r = Math.min(0.75, o.size.z * 0.55 + 0.15);
        foliage(trims, fx, o.height + r * 0.8, o.center.z, r, i + Math.round(o.center.x * 3 + o.center.z * 7));
      }
    }
  }

  const openSky = preset.surfaces.ceiling === 'ciel';
  if (def.hasFloor && !openSky) {
    surface(ceil, def.footprint, (p) => at(p) + H, -1, ceiling.clone().multiplyScalar(def.dark ? 0.3 : 1), 1);
  }
  if (def.hasFloor) {
    if (def.rise === 0) surface(floor, def.footprint, () => 0, 1, col('#ffffff'), 0.5);
    else {
      const xs = def.footprint.map((p) => p.x);
      const zs = def.footprint.map((p) => p.z);
      steps(floor, (Math.max(...xs) - Math.min(...xs)) / 2, Math.max(...zs), def.rise, col('#ffffff'));
    }
  }

  // Bandes lumineuses : une boîte plate suspendue sous le plafond (dessous + côtés).
  const white = col('#ffffff');
  for (const s of openSky ? [] : def.lightStrips) {
    const width = 0.28;
    const ya = at(s.a) + H, yb = at(s.b) + H;
    const d = sub(s.b, s.a);
    const l = Math.hypot(d.x, d.z);
    const n = { x: ((d.z / l) * width) / 2, z: ((-d.x / l) * width) / 2 };
    const a1 = { x: s.a.x + n.x, z: s.a.z + n.z }, b1 = { x: s.b.x + n.x, z: s.b.z + n.z };
    const a2 = { x: s.a.x - n.x, z: s.a.z - n.z }, b2 = { x: s.b.x - n.x, z: s.b.z - n.z };
    lights.quad([[a1.x, ya - 0.07, a1.z], [b1.x, yb - 0.07, b1.z], [b2.x, yb - 0.07, b2.z], [a2.x, ya - 0.07, a2.z]], [0, -1, 0], four(white));
    strip(lights, { a: a1, b: b1 }, [ya, yb], -0.07, 0, white, white);
    strip(lights, { a: b2, b: a2 }, [ya, yb], -0.07, 0, white, white);
  }

  const g = (b: GeometryBuilder, colors: boolean) => (b.empty ? null : b.build(colors));
  return {
    walls: g(walls, true),
    trims: g(trims, true),
    ceiling: g(ceil, true),
    floor: g(floor, false),
    lights: g(lights, false),
  };
}

/**
 * Raccord d'ouverture : quand le module voisin a une ouverture plus étroite ou plus
 * basse, on referme l'écart de ce côté-ci (jambages de part et d'autre, linteau au-dessus).
 * Coordonnées locales du module ; `pos`/`normal` : l'ouverture ; `y` : sol à l'ouverture.
 */
export function buildPortalAdapter(
  preset: AmbiancePreset,
  pos: Vec2,
  normal: Vec2,
  y: number,
  own: { width: number; top: number },
  other: { width: number; top: number },
): { geometry: THREE.BufferGeometry | null; jambs: Segment[] } {
  const b = new GeometryBuilder();
  const jambs: Segment[] = [];
  const pal = preset.palette;
  const wall = col(pal.wall), low = col(pal.wallShade).lerp(wall, 0.35), top = wall.clone().lerp(col(pal.ceiling), 0.08);
  // Tangente le long de l'ouverture ; les faces regardent vers l'intérieur du module (-normal).
  const t = { x: -normal.z, z: normal.x };
  const at = (u: number): Vec2 => ({ x: pos.x + t.x * u, z: pos.z + t.z * u });
  const inward = (s: Segment): Segment => {
    // Oriente le segment pour que sa normale « intérieure » (d.z, -d.x) soit -normal.
    const d = sub(s.b, s.a);
    return d.z * -normal.x - d.x * -normal.z >= 0 ? s : { a: s.b, b: s.a };
  };
  const ow = own.width / 2, nw = Math.min(own.width, other.width) / 2;
  const base: Base = [y, y];
  if (ow - nw > 0.01) {
    for (const [u0, u1] of [[-ow, -nw], [nw, ow]] as const) {
      const seg = inward({ a: at(u0), b: at(u1) });
      strip(b, seg, base, 0, Math.min(1.4, own.top), low, wall);
      strip(b, seg, base, Math.min(1.4, own.top), own.top, wall, top);
      jambs.push(seg);
    }
  }
  if (own.top - other.top > 0.01) {
    const seg = inward({ a: at(-nw), b: at(nw) });
    strip(b, seg, base, other.top, own.top, top, top);
  }
  return { geometry: b.empty ? null : b.build(true), jambs };
}
