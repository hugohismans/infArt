import { closestPointOnSegment, type Segment, type Vec2 } from '../world/math2d';

/**
 * Collisions simples : un cercle (le visiteur) contre des segments de murs.
 * Le déplacement est découpé en petits pas pour éviter de traverser un mur
 * quand la frame est longue.
 */
export function moveWithCollisions(pos: Vec2, delta: Vec2, radius: number, walls: readonly Segment[]): Vec2 {
  const len = Math.hypot(delta.x, delta.z);
  const steps = Math.max(1, Math.ceil(len / (radius * 0.5)));
  let x = pos.x, z = pos.z;
  for (let s = 0; s < steps; s++) {
    x += delta.x / steps;
    z += delta.z / steps;
    // Quelques itérations pour bien gérer les coins.
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const w of walls) {
        const cp = closestPointOnSegment({ x, z }, w.a, w.b);
        const dx = x - cp.x, dz = z - cp.z;
        const d = Math.hypot(dx, dz);
        if (d < radius && d > 1e-6) {
          const push = radius - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  return { x, z };
}
