import * as THREE from 'three';
import type { Segment, Vec2 } from '../world/math2d';
import { wallNormal, type ArtSlotDef, type ModuleDef } from '../world/modules/defs';
import type { Rng } from '../world/random';
import type { Kit } from './kit';

/** Lisière visible d'un monde à ciel ouvert (là où se tient le mur invisible). */
export type Boundary = 'lisiere' | 'dunes' | 'muret' | 'nuages' | 'colonnade';

/** Profondeur (m) de la bande occupée devant le mur : on ne peut pas y marcher. */
const BAND: Record<Boundary, number> = { lisiere: 0.75, dunes: 0.8, muret: 0.4, nuages: 0.85, colonnade: 0.6 };

const pal = (...c: string[]) => c.map((x) => new THREE.Color(x));
const FOLIAGE = pal('#1d3320', '#25402a', '#183020', '#2b4a2c');
const BUSH = pal('#22381f', '#2d4a28', '#1b2e18');
const SAND = pal('#d9b77e', '#cfa86c', '#e2c48f', '#c99e62');
const ROCK = pal('#8a6f55', '#7a614b', '#957a5d');
const CLOUD = pal('#ffffff', '#fdeef6', '#f7e4f1', '#fff6fb');

/**
 * Pose la lisière le long de chaque mur du module : arbres, dunes, muret, nuages ou
 * colonnade. Les objets peuvent déborder derrière le mur : le mur invisible, dessiné en
 * premier, les cache aux salles voisines. Devant une œuvre, on n'y met que des éléments
 * bas (ou rien). Renvoie la ligne de collision, au bord de la bande.
 */
export function buildBoundary(k: Kit, def: ModuleDef, kind: Boundary, rng: Rng, hung: readonly ArtSlotDef[], ceiling: number): Segment[] {
  const collisions: Segment[] = [];
  const band = BAND[kind];
  for (const w of def.walls) {
    if (w.obstacle || w.height !== undefined) continue;
    const a = w.seg.a, b = w.seg.b;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.4) continue;
    const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    const n = wallNormal(w.seg);
    const at = (t: number, d: number): Vec2 => ({ x: a.x + u.x * t + n.x * d, z: a.z + u.z * t + n.z * d });
    // Œuvres accrochées à ce mur : intervalles (le long du mur) à garder dégagés.
    const spans = hung
      .filter((s) => Math.abs((s.pos.x - a.x) * n.x + (s.pos.z - a.z) * n.z) < 0.08 && s.normal.x * n.x + s.normal.z * n.z > 0.99)
      .map((s) => {
        const c = (s.pos.x - a.x) * u.x + (s.pos.z - a.z) * u.z + (s.offset ?? 0);
        const half = Math.min(s.maxWidth, 1.6) / 2 + 0.35;
        return [c - half, c + half] as const;
      });
    const nearArt = (t: number) => spans.some(([s0, s1]) => t > s0 && t < s1);
    const angle = Math.atan2(n.x, n.z);
    collisions.push({ a: at(0, band), b: at(len, band) });

    switch (kind) {
      case 'lisiere': {
        // Troncs serrés (pas devant les œuvres, déjà accrochées à leur arbre), feuillage
        // au-dessus, buissons bas entre eux.
        for (let t = rng.range(0.2, 0.7); t < len; t += rng.range(0.9, 1.5)) {
          const p = at(t, rng.range(0.15, 0.45));
          if (!nearArt(t)) {
            const r = rng.range(0.18, 0.32), h = ceiling + rng.range(0.5, 2);
            k.place(p.x, 0, p.z, angle);
            k.cyl(r, h, 0, h / 2, 0, rng.pick(['#3b2c22', '#33261d', '#45332a']), 8, 0.7);
            k.blob(rng.range(1.1, 1.8), 0, h - rng.range(0.1, 0.5), 0, FOLIAGE, rng.int(0, 999));
          }
          const q = at(t + rng.range(-0.4, 0.4), rng.range(0.1, 0.35));
          k.place(q.x, 0, q.z, angle);
          const br = nearArt(t) ? rng.range(0.25, 0.4) : rng.range(0.45, 0.8);
          k.blob(br, 0, br * 0.45, 0, BUSH, rng.int(0, 999), 0.7);
        }
        break;
      }
      case 'dunes': {
        // Dunes à moitié derrière le mur : on n'en voit que le flanc, sans gêner les chevalets.
        for (let t = rng.range(0.3, 0.8); t < len - 0.3; t += rng.range(1.4, 2.4)) {
          const r = nearArt(t) ? rng.range(0.9, 1.2) : rng.range(1.3, 2.2);
          const p = at(t, band - r * 0.95);
          k.place(p.x, 0, p.z, angle);
          k.blob(r, 0, 0, 0, SAND, rng.int(0, 999), rng.range(0.55, 0.85));
          if (!nearArt(t) && rng.chance(0.45)) {
            const q = at(t + rng.range(-0.6, 0.6), rng.range(0.15, 0.45));
            k.place(q.x, 0, q.z, angle + rng.range(0, 3));
            k.blob(rng.range(0.25, 0.55), 0, 0.12, 0, ROCK, rng.int(0, 999), rng.range(0.6, 0.9));
          }
        }
        break;
      }
      case 'muret': {
        // Un muret blanc continu ; de hauts monolithes de loin en loin (pas devant les œuvres).
        k.place(at(len / 2, 0.18).x, 0, at(len / 2, 0.18).z, angle);
        k.box(len + 0.3, 0.5, 0.32, 0, 0.25, 0, '#dcdbd6');
        k.box(len + 0.34, 0.05, 0.38, 0, 0.525, 0, '#f2f1ec');
        for (let t = rng.range(0.6, 2.5); t < len - 0.3; t += rng.range(4, 7)) {
          if (nearArt(t)) continue;
          const p = at(t, 0.2);
          const h = rng.range(2.4, 4.2);
          k.place(p.x, 0, p.z, angle);
          k.box(0.3, h, 0.3, 0, h / 2, 0, '#e6e5e0');
        }
        break;
      }
      case 'nuages': {
        // Bancs de nuages, bas devant les œuvres flottantes.
        for (let t = rng.range(0.2, 0.5); t < len - 0.2; t += rng.range(0.55, 0.95)) {
          const low = nearArt(t);
          const r = low ? rng.range(0.4, 0.6) : rng.range(0.7, 1.3);
          const p = at(t, band - r * 0.8);
          k.place(p.x, 0, p.z, angle);
          k.blob(r, 0, low ? r * 0.4 : rng.range(r * 0.4, r * 1.3), 0, CLOUD, rng.int(0, 999), 0.7);
        }
        break;
      }
      case 'colonnade': {
        // Colonnes de marbre blanc, architrave, et un fil néon qui court d'une colonne à l'autre.
        const h = Math.min(3.4, ceiling - 0.5);
        const mid = at(len / 2, 0.3);
        k.place(mid.x, 0, mid.z, angle);
        k.box(len + 0.4, 0.28, 0.5, 0, h + 0.14, 0, '#f4eef4');
        k.glowBox(len, 0.035, 0.035, 0, 0.95, -0.02, '#ff4fd8');
        k.glowBox(len, 0.035, 0.035, 0, h - 0.12, 0.26, '#3ff0ff');
        const n0 = Math.max(1, Math.round(len / 2.4));
        for (let i = 0; i <= n0; i++) {
          const t = (i / n0) * len;
          if (nearArt(t) && i > 0 && i < n0) continue;
          const p = at(t, 0.3);
          k.place(p.x, 0, p.z, angle);
          k.box(0.62, 0.22, 0.62, 0, 0.11, 0, '#ece6ec');
          k.cyl(0.22, h - 0.4, 0, 0.22 + (h - 0.4) / 2, 0, '#f6f1f6', 14, 0.88);
          k.box(0.6, 0.18, 0.6, 0, h - 0.09, 0, '#ece6ec');
        }
        break;
      }
    }
  }
  return collisions;
}
