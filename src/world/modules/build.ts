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
  /** Murs, plinthes, moulures, plafond (couleurs par sommet). */
  structure: THREE.BufferGeometry | null;
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

/** Construit les géométries (partageables) d'un type de module pour une ambiance. */
export function buildModuleGeometries(def: ModuleDef, preset: AmbiancePreset): ModuleGeometries {
  const Hc = preset.geometry.ceilingHeight;
  const H = Hc * def.ceilingScale;
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

  const structure = new GeometryBuilder();
  const floor = new GeometryBuilder();
  const lights = new GeometryBuilder();

  const skirtH = 0.14, skirtD = 0.022;
  const moldH = 0.16, moldD = 0.05;

  for (const w of def.walls) {
    if (w.obstacle) continue; // dessinés avec leur obstacle
    const base = baseOf(w.seg);
    // Mur principal, en deux bandes pour un dégradé plus doux.
    strip(structure, w.seg, base, skirtH, 1.4, wallLow, wallMid);
    strip(structure, w.seg, base, 1.4, H - moldH, wallMid, wallTop);
    if (def.hasFloor) {
      // Plinthe : face avant + dessus.
      strip(structure, offsetSegment(w.seg, skirtD), base, 0, skirtH, skirting, skirting);
      ledge(structure, w.seg, base, skirtH, skirtD, skirting, 1);
      // Corniche sous le plafond.
      strip(structure, offsetSegment(w.seg, moldD), base, H - moldH, H, molding, molding);
      ledge(structure, w.seg, base, H - moldH, moldD, molding.clone().multiplyScalar(0.7), -1);
    } else {
      // Bouchon sans sol propre : le mur descend jusqu'au sol et monte jusqu'au plafond.
      strip(structure, w.seg, base, 0, skirtH, skirting, skirting);
      strip(structure, w.seg, base, H - moldH, H, molding, molding);
    }
  }

  // Linteaux : le mur au-dessus des portes d'une salle plus haute que les couloirs.
  for (const l of def.lintels) {
    if (H - Hc < 0.01) break;
    strip(structure, l, baseOf(l), Hc, H - moldH, wallTop, wallTop);
    strip(structure, offsetSegment(l, moldD), baseOf(l), H - moldH, H, molding, molding);
    ledge(structure, l, baseOf(l), Hc, 0.25, wallMid.clone().multiplyScalar(0.8), -1);
  }

  // Obstacles : cimaise (cloison basse peinte comme les murs) et banc de velours.
  for (const o of def.obstacles) {
    const x0 = o.center.x - o.size.x / 2, x1 = o.center.x + o.size.x / 2;
    const z0 = o.center.z - o.size.z / 2, z1 = o.center.z + o.size.z / 2;
    if (o.kind === 'cimaise') {
      box(structure, x0, x1, z0, z1, 0, o.height, wallLow, wallTop, molding);
      box(structure, x0 - skirtD, x1 + skirtD, z0 - skirtD, z1 + skirtD, 0, skirtH, skirting, skirting, skirting);
    } else {
      const velvet = col(pal.wallShade).lerp(col('#7a1f2b'), 0.6);
      const wood = col(pal.skirting);
      box(structure, x0 + 0.08, x1 - 0.08, z0 + 0.06, z1 - 0.06, 0, o.height - 0.1, wood, wood, wood);
      box(structure, x0, x1, z0, z1, o.height - 0.1, o.height, velvet, velvet.clone().multiplyScalar(1.15), velvet.clone().multiplyScalar(1.2));
    }
  }

  if (def.hasFloor) {
    surface(structure, def.footprint, (p) => at(p) + H, -1, ceiling, 1);
    if (def.rise === 0) surface(floor, def.footprint, () => 0, 1, col('#ffffff'), 0.5);
    else {
      const xs = def.footprint.map((p) => p.x);
      const zs = def.footprint.map((p) => p.z);
      steps(floor, (Math.max(...xs) - Math.min(...xs)) / 2, Math.max(...zs), def.rise, col('#ffffff'));
    }
  }

  // Bandes lumineuses : une boîte plate suspendue sous le plafond (dessous + côtés).
  const white = col('#ffffff');
  for (const s of def.lightStrips) {
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

  return {
    structure: structure.empty ? null : structure.build(true),
    floor: floor.empty ? null : floor.build(false),
    lights: lights.empty ? null : lights.build(false),
  };
}
