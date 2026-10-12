/**
 * Géométrie 2D vue de dessus. Convention : un point (x, z) du plan horizontal.
 * La rotation `angle` suit celle de Three.js autour de l'axe Y
 * (x' = x cos + z sin, z' = -x sin + z cos), pour rester cohérent avec `object.rotation.y`.
 */
export interface Vec2 {
  x: number;
  z: number;
}

export interface Transform2 {
  x: number;
  z: number;
  angle: number;
}

export interface Segment {
  a: Vec2;
  b: Vec2;
}

export const v2 = (x: number, z: number): Vec2 => ({ x, z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
/** Produit vectoriel 2D (composante « verticale »). */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.z - a.z * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.z);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

export function rotate(p: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: p.x * c + p.z * s, z: -p.x * s + p.z * c };
}

/** Applique une transformation (rotation puis translation) à un point local. */
export function applyTransform(t: Transform2, p: Vec2): Vec2 {
  const r = rotate(p, t.angle);
  return { x: r.x + t.x, z: r.z + t.z };
}

/** Transforme un point du monde dans le repère local de `t`. */
export function inverseTransform(t: Transform2, p: Vec2): Vec2 {
  return rotate({ x: p.x - t.x, z: p.z - t.z }, -t.angle);
}

/** Angle (convention rotation.y) qui fait pointer l'axe local +Z vers `dir`. */
export function angleOf(dir: Vec2): number {
  return Math.atan2(dir.x, dir.z);
}

/** Distance d'un point à un segment. */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  return length(sub(p, closestPointOnSegment(p, a, b)));
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 < 1e-12) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return { x: a.x + ab.x * t, z: a.z + ab.z * t };
}

/** Teste si deux polygones convexes se chevauchent (axes séparateurs). */
export function convexOverlap(a: readonly Vec2[], b: readonly Vec2[], clearance = 0): boolean {
  // Théorème de l'axe séparateur. Avec `clearance`, deux polygones plus proches que
  // cette distance comptent comme se chevauchant ; négative, un léger contact est toléré.
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % poly.length]!;
      const axis = { x: -(p2.z - p1.z), z: p2.x - p1.x };
      const gap = clearance * Math.hypot(axis.x, axis.z);
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of a) {
        const d = dot(p, axis);
        minA = Math.min(minA, d); maxA = Math.max(maxA, d);
      }
      for (const p of b) {
        const d = dot(p, axis);
        minB = Math.min(minB, d); maxB = Math.max(maxB, d);
      }
      if (maxA + gap <= minB || maxB + gap <= minA) return false;
    }
  }
  return true;
}

/** Point dans un polygone convexe (sommets dans un ordre quelconque mais cohérent). */
export function pointInConvex(p: Vec2, poly: readonly Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = cross(sub(b, a), sub(p, a));
    if (Math.abs(c) < 1e-9) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Rétrécit un polygone convexe vers son centroïde (tolérance aux contacts). */
export function shrinkConvex(poly: readonly Vec2[], amount: number): Vec2[] {
  const c = poly.reduce((acc, p) => add(acc, p), v2(0, 0));
  const center = scale(c, 1 / poly.length);
  return poly.map((p) => {
    const d = sub(p, center);
    const l = length(d);
    return l < 1e-9 ? p : add(center, scale(d, Math.max(0, l - amount) / l));
  });
}

/**
 * Cône de vision 2D (angle < 180°) issu de l'œil, délimité par deux directions :
 * `right` (sens horaire) et `left` (sens antihoraire), avec cross(right, left) > 0.
 */
export interface Cone {
  right: Vec2;
  left: Vec2;
}

/** Cône sous-tendu par un segment vu depuis `eye` ; null si le segment est vu par la tranche. */
export function coneFromSegment(eye: Vec2, seg: Segment): Cone | null {
  const da = sub(seg.a, eye);
  const db = sub(seg.b, eye);
  const c = cross(da, db);
  if (Math.abs(c) < 1e-6) return null;
  return c > 0 ? { right: da, left: db } : { right: db, left: da };
}

/** Garde la partie d'un segment où f(p) = cross(edge, p - eye) * sign ≥ 0. */
function clipHalfPlane(seg: Segment, eye: Vec2, edge: Vec2, sign: number): Segment | null {
  const fa = cross(edge, sub(seg.a, eye)) * sign;
  const fb = cross(edge, sub(seg.b, eye)) * sign;
  if (fa < 0 && fb < 0) return null;
  if (fa >= 0 && fb >= 0) return seg;
  const t = fa / (fa - fb);
  const m = lerp(seg.a, seg.b, t);
  return fa >= 0 ? { a: seg.a, b: m } : { a: m, b: seg.b };
}

/** Partie d'un segment comprise dans le cône (ou null). */
export function clipSegmentToCone(seg: Segment, eye: Vec2, cone: Cone): Segment | null {
  const s1 = clipHalfPlane(seg, eye, cone.right, 1);
  if (!s1) return null;
  const s2 = clipHalfPlane(s1, eye, cone.left, -1);
  if (!s2) return null;
  if (dist(s2.a, s2.b) < 1e-4) return null;
  return s2;
}

/** Les segments [p1, p2] et [q1, q2] se croisent-ils (intersection propre) ? */
export function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const d1 = cross(sub(q2, q1), sub(p1, q1));
  const d2 = cross(sub(q2, q1), sub(p2, q1));
  const d3 = cross(sub(p2, p1), sub(q1, p1));
  const d4 = cross(sub(p2, p1), sub(q2, p1));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Distance minimale entre deux segments. */
export function segmentDistance(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): number {
  if (segmentsIntersect(p1, p2, q1, q2)) return 0;
  return Math.min(
    pointSegmentDistance(p1, q1, q2),
    pointSegmentDistance(p2, q1, q2),
    pointSegmentDistance(q1, p1, p2),
    pointSegmentDistance(q2, p1, p2),
  );
}
