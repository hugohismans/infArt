import * as THREE from 'three';
import type { DecorKind } from '../ambiances/types';
import type { Rng } from '../world/random';
import type { Kit } from './kit';

/**
 * Catalogue des objets de décor. Chaque objet est construit dans son repère :
 * origine au sol, au pied du mur ; X le long du mur, +Z vers l'intérieur de la pièce.
 * Toutes les mesures sont en mètres.
 */
export interface DecorItem {
  /** Largeur le long du mur. */
  width: number;
  /** Profondeur occupée depuis le mur. */
  depth: number;
  height: number;
  /**
   * Objet bas : il peut se glisser sous une œuvre sans la masquer.
   * Sinon il ne se place qu'entre les œuvres.
   */
  low: boolean;
  /** Fixé au mur, assez plat pour ne gêner personne (pas de collision). */
  flat: boolean;
  /** Fuite au plafond : une goutte tombe dans l'objet (animation et son). */
  drip?: { y: number; z: number };
  /** `ceilingStain` : le plafond peut porter une auréole (pas une verrière). */
  build(k: Kit, rng: Rng, ceiling: number, ceilingStain: boolean): void;
}

const c = (hex: string) => new THREE.Color(hex);
const GREENS = [c('#3f6b35'), c('#4f7d3e'), c('#355a2c'), c('#5d8a46'), c('#2f5527')];

export const CATALOG: Record<DecorKind, DecorItem> = {
  /** Chaise de gardien, dossier contre le mur. */
  chaise: {
    width: 0.46, depth: 0.55, height: 0.95, low: false, flat: false,
    build(k, rng) {
      const wood = rng.chance(0.6) ? rng.pick(['#5a3b24', '#6e4a2c', '#3e2a1b']) : '#26262a';
      const seat = rng.chance(0.5) ? '#7a1f24' : wood;
      for (const x of [-0.18, 0.18]) for (const z of [0.12, 0.46]) k.box(0.03, 0.45, 0.03, x, 0.225, z, wood);
      k.box(0.42, 0.045, 0.4, 0, 0.47, 0.29, seat);
      for (const x of [-0.18, 0.18]) k.box(0.03, 0.5, 0.03, x, 0.72, 0.1, wood);
      k.box(0.42, 0.16, 0.025, 0, 0.86, 0.1, wood);
    },
  },

  /** Corbeille métallique. */
  poubelle: {
    width: 0.38, depth: 0.45, height: 0.5, low: true, flat: false,
    build(k, rng) {
      const metal = rng.pick(['#3d3f42', '#55585c', '#2b2c2e']);
      k.cyl(0.17, 0.48, 0, 0.24, 0.24, metal, 12, 1.08);
      k.cyl(0.19, 0.025, 0, 0.49, 0.24, '#1f2022', 12);
    },
  },

  /** Extincteur sur son support, et son panneau. */
  extincteur: {
    width: 0.22, depth: 0.17, height: 1.65, low: false, flat: true,
    build(k) {
      k.box(0.12, 0.05, 0.03, 0, 0.88, 0.015, '#7c7f83');
      k.cyl(0.075, 0.42, 0, 1.05, 0.09, '#b3221b', 12);
      k.cyl(0.035, 0.06, 0, 1.29, 0.09, '#1c1c1c', 8);
      k.box(0.11, 0.02, 0.03, 0.02, 1.33, 0.09, '#1c1c1c');
      k.box(0.02, 0.3, 0.02, -0.07, 1.12, 0.12, '#1c1c1c', { z: 0.12 });
      k.box(0.17, 0.21, 0.008, 0, 1.6, 0.004, '#f1f1ee');
      k.box(0.11, 0.13, 0.004, 0, 1.6, 0.01, '#c4281f');
    },
  },

  /** Radiateur en fonte, à ailettes. */
  radiateur: {
    width: 0.96, depth: 0.14, height: 0.78, low: false, flat: true,
    build(k, rng) {
      const paint = rng.pick(['#e9e4d6', '#d8d2c2', '#c9c3b1', '#9a9c94']);
      k.box(0.92, 0.5, 0.06, 0, 0.45, 0.05, paint);
      for (let i = 0; i < 11; i++) k.box(0.045, 0.6, 0.12, -0.42 + i * 0.084, 0.46, 0.07, paint);
      k.cyl(0.018, 0.12, -0.5, 0.14, 0.06, '#8a8c86', 6);
      k.cyl(0.018, 0.12, 0.5, 0.14, 0.06, '#8a8c86', 6);
    },
  },

  /** Plante en pot : buisson ou petit arbre. */
  plante: {
    width: 0.66, depth: 0.72, height: 1.7, low: false, flat: false,
    build(k, rng) {
      const pot = rng.pick(['#a8562f', '#b5653a', '#ece9e2', '#3a3d40']);
      const seed = rng.int(0, 1000);
      k.cyl(0.21, 0.42, 0, 0.21, 0.36, pot, 12, 1.25);
      k.cyl(0.24, 0.03, 0, 0.42, 0.36, '#3b2a1c', 12);
      if (rng.chance(0.55)) {
        // Buisson.
        k.blob(0.4, 0, 0.82, 0.36, GREENS, seed);
        k.blob(0.26, 0.12, 1.1, 0.32, GREENS, seed + 3);
      } else {
        // Petit arbre (ficus) : un tronc, trois houppiers.
        k.cyl(0.03, 0.9, 0, 0.85, 0.36, '#5a4330', 6);
        k.blob(0.3, 0, 1.38, 0.36, GREENS, seed);
        k.blob(0.22, 0.17, 1.2, 0.3, GREENS, seed + 5);
        k.blob(0.2, -0.15, 1.25, 0.42, GREENS, seed + 9);
      }
    },
  },

  /** Socle vide : l'œuvre est partie en restauration. */
  socle: {
    width: 0.52, depth: 0.7, height: 1.05, low: false, flat: false,
    build(k, rng) {
      const stone = rng.pick(['#ece9e2', '#dcd6ca', '#2d2d2f']);
      k.box(0.52, 0.06, 0.52, 0, 0.03, 0.4, stone);
      k.box(0.44, 0.94, 0.44, 0, 0.53, 0.4, stone);
      k.box(0.52, 0.04, 0.52, 0, 1.02, 0.4, stone);
    },
  },

  /** Escabeau replié, appuyé contre le mur. */
  escabeau: {
    width: 0.5, depth: 0.5, height: 1.65, low: false, flat: false,
    build(k) {
      const alu = '#aeb2b6';
      const a = 0.16;
      const H = 1.6;
      const along = (y: number) => 0.38 - y * Math.tan(a);
      for (const x of [-0.2, 0.2]) k.box(0.04, H / Math.cos(a), 0.03, x, H / 2, along(H / 2), alu, { x: -a });
      for (let i = 1; i <= 5; i++) {
        const y = (i * H) / 6;
        k.box(0.38, 0.025, 0.09, 0, y, along(y), '#8d9195', { x: -a });
      }
    },
  },

  /** Caisse de transport en contreplaqué, parfois deux empilées. */
  caisse: {
    width: 1.0, depth: 0.7, height: 1.2, low: false, flat: false,
    build(k, rng) {
      const ply = rng.pick(['#b08a5a', '#c29b66', '#9c7a4c']);
      const batten = '#7d6040';
      const crate = (w: number, h: number, d: number, y0: number, x: number) => {
        k.box(w, h, d, x, y0 + h / 2, 0.36, ply);
        for (const y of [y0 + 0.03, y0 + h - 0.03]) k.box(w + 0.02, 0.06, d + 0.02, x, y, 0.36, batten);
        k.box(0.06, h, d + 0.02, x - w / 2 + 0.03, y0 + h / 2, 0.36, batten);
        k.box(0.06, h, d + 0.02, x + w / 2 - 0.03, y0 + h / 2, 0.36, batten);
      };
      crate(0.92, 0.62, 0.62, 0, 0);
      if (rng.chance(0.4)) crate(0.6, 0.45, 0.5, 0.62, rng.range(-0.1, 0.1));
    },
  },

  /** Cartons de déménagement. */
  cartons: {
    width: 0.95, depth: 0.55, height: 0.46, low: true, flat: false,
    build(k, rng) {
      const kraft = ['#b98f5e', '#a9814f', '#c49c6a'];
      k.box(0.5, 0.42, 0.42, -0.2, 0.21, 0.27, rng.pick(kraft), { y: rng.range(-0.15, 0.15) });
      k.box(0.4, 0.34, 0.36, 0.26, 0.17, 0.26, rng.pick(kraft), { y: rng.range(-0.25, 0.25) });
      k.box(0.06, 0.005, 0.43, -0.2, 0.422, 0.27, '#d9c9a0');
    },
  },

  /** Seau sous une fuite du plafond, avec la tache au-dessus. */
  seau: {
    width: 0.4, depth: 0.62, height: 0.3, low: true, flat: false,
    drip: { y: 0.24, z: 0.45 },
    build(k, rng, ceiling, ceilingStain) {
      const plastic = rng.pick(['#2f6fb0', '#b7322a', '#6f7478', '#d9b234']);
      const seed = rng.int(0, 1000);
      k.cyl(0.15, 0.28, 0, 0.14, 0.45, plastic, 12, 1.2);
      k.cyl(0.165, 0.015, 0, 0.24, 0.45, '#2a3a46', 12);
      // Éclaboussures autour du seau, auréole au plafond.
      k.splotch(0.32, 0.05, 0.004, 0.45, '#4a4232', seed);
      if (ceilingStain) k.splotch(0.4, 0, ceiling - 0.008, 0.45, '#8c7a52', seed + 1, true);
    },
  },
};

/** Cordon de sécurité devant une œuvre : deux poteaux en laiton, une corde rouge. */
export function buildRope(k: Kit, halfSpan: number, z: number): void {
  const brass = '#b8913a';
  for (const x of [-halfSpan, halfSpan]) {
    k.cyl(0.12, 0.03, x, 0.015, z, brass, 12);
    k.cyl(0.022, 0.9, x, 0.45, z, brass, 8);
    k.cyl(0.04, 0.05, x, 0.92, z, brass, 8);
  }
  // Corde en chaînette (quatre segments).
  const n = 6;
  const sag = 0.12;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([-halfSpan + 2 * halfSpan * t, 0.88 - sag * 4 * t * (1 - t)]);
  }
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    k.box(len + 0.01, 0.035, 0.035, (x0 + x1) / 2, (y0 + y1) / 2, z, '#7a1020', { z: Math.atan2(y1 - y0, x1 - x0) });
  }
}

/** Panneau « sortie » suspendu au plafond. */
export function buildExitSign(k: Kit, y: number, ceiling: number): void {
  k.glowBox(0.44, 0.17, 0.05, 0, y, 0, '#20c05c');
  k.glowBox(0.3, 0.05, 0.052, 0, y - 0.02, 0, '#e8fff0');
  k.glowBox(0.05, 0.1, 0.052, -0.17, y + 0.01, 0, '#e8fff0');
  const rod = ceiling - (y + 0.085);
  if (rod > 0.02) for (const x of [-0.17, 0.17]) k.box(0.012, rod, 0.012, x, y + 0.085 + rod / 2, 0, '#5c5f63');
}
