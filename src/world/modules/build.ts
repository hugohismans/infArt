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

/** Bande verticale le long d'un segment, entre y0 et y1. */
function verticalStrip(b: GeometryBuilder, seg: Segment, y0: number, y1: number, bottom: THREE.Color, top: THREE.Color, uvScale = 1): void {
  const n = wallNormal(seg);
  const len = dist(seg.a, seg.b) * uvScale;
  b.quad(
    [
      [seg.a.x, y0, seg.a.z],
      [seg.b.x, y0, seg.b.z],
      [seg.b.x, y1, seg.b.z],
      [seg.a.x, y1, seg.a.z],
    ],
    [n.x, 0, n.z],
    [bottom, bottom, top, top],
    [[0, y0 * uvScale], [len, y0 * uvScale], [len, y1 * uvScale], [0, y1 * uvScale]],
  );
}

/** Bande horizontale (dessus de plinthe, corniche) entre le mur et un décalage. */
function horizontalLedge(b: GeometryBuilder, seg: Segment, y: number, depth: number, color: THREE.Color, facing: 1 | -1): void {
  const o = offsetSegment(seg, depth);
  b.quad(
    [
      [seg.a.x, y, seg.a.z],
      [seg.b.x, y, seg.b.z],
      [o.b.x, y, o.b.z],
      [o.a.x, y, o.a.z],
    ],
    [0, facing, 0],
    four(color),
  );
}

function horizontalPolygon(b: GeometryBuilder, poly: Vec2[], y: number, facing: 1 | -1, color: THREE.Color, uvScale: number): void {
  // Les empreintes sont des rectangles (4 sommets) en phase 1.
  if (poly.length !== 4) throw new Error('Polygone horizontal : 4 sommets attendus');
  const p = poly.map((v) => [v.x, y, v.z] as V3) as [V3, V3, V3, V3];
  const uv = poly.map((v) => [v.x * uvScale, v.z * uvScale] as [number, number]);
  b.quad(p, [0, facing, 0], four(color), uv);
}

/** Construit les géométries (partageables) d'un type de module pour une ambiance. */
export function buildModuleGeometries(def: ModuleDef, preset: AmbiancePreset): ModuleGeometries {
  const H = preset.geometry.ceilingHeight;
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

  const structure = new GeometryBuilder();
  const floor = new GeometryBuilder();
  const lights = new GeometryBuilder();

  const skirtH = 0.14, skirtD = 0.022;
  const moldH = 0.16, moldD = 0.05;

  for (const w of def.walls) {
    // Mur principal, en deux bandes pour un dégradé plus doux.
    verticalStrip(structure, w.seg, skirtH, 1.4, wallLow, wallMid);
    verticalStrip(structure, w.seg, 1.4, H - moldH, wallMid, wallTop);
    if (def.hasFloor) {
      // Plinthe : face avant + dessus.
      const sk = offsetSegment(w.seg, skirtD);
      verticalStrip(structure, sk, 0, skirtH, skirting, skirting);
      horizontalLedge(structure, w.seg, skirtH, skirtD, skirting, 1);
      // Corniche sous le plafond.
      const md = offsetSegment(w.seg, moldD);
      verticalStrip(structure, md, H - moldH, H, molding, molding);
      horizontalLedge(structure, w.seg, H - moldH, moldD, molding.clone().multiplyScalar(0.7), -1);
    } else {
      // Impasse sans sol propre : le mur descend jusqu'au sol et monte jusqu'au plafond.
      verticalStrip(structure, w.seg, 0, skirtH, skirting, skirting);
      verticalStrip(structure, w.seg, H - moldH, H, molding, molding);
    }
  }

  if (def.hasFloor) {
    horizontalPolygon(structure, def.footprint, H, -1, ceiling, 1);
    horizontalPolygon(floor, def.footprint, 0, 1, col('#ffffff'), 0.5);
  }

  // Bandes lumineuses : une boîte plate suspendue sous le plafond (dessous + côtés).
  const white = col('#ffffff');
  for (const s of def.lightStrips) {
    const width = 0.28;
    const y0 = H - 0.07, y1 = H;
    const d = sub(s.b, s.a);
    const l = Math.hypot(d.x, d.z);
    const n = { x: d.z / l * width / 2, z: -d.x / l * width / 2 };
    const a1 = { x: s.a.x + n.x, z: s.a.z + n.z }, b1 = { x: s.b.x + n.x, z: s.b.z + n.z };
    const a2 = { x: s.a.x - n.x, z: s.a.z - n.z }, b2 = { x: s.b.x - n.x, z: s.b.z - n.z };
    lights.quad([[a1.x, y0, a1.z], [b1.x, y0, b1.z], [b2.x, y0, b2.z], [a2.x, y0, a2.z]], [0, -1, 0], four(white));
    verticalStrip(lights, { a: a1, b: b1 }, y0, y1, white, white);
    verticalStrip(lights, { a: b2, b: a2 }, y0, y1, white, white);
  }

  return {
    structure: structure.empty ? null : structure.build(true),
    floor: floor.empty ? null : floor.build(false),
    lights: lights.empty ? null : lights.build(false),
  };
}
