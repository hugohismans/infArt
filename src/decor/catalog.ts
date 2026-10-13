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
      // (Aucune face de tasseau dans le plan d'une autre : elles se disputeraient l'écran.)
      const crate = (w: number, h: number, d: number, y0: number, x: number) => {
        k.box(w, h, d, x, y0 + h / 2, 0.36, ply);
        for (const y of [y0 + 0.035, y0 + h - 0.035]) k.box(w + 0.02, 0.06, d + 0.02, x, y, 0.36, batten);
        for (const sx of [-1, 1]) k.box(0.06, h - 0.02, d + 0.04, x + sx * (w / 2 - 0.025), y0 + h / 2, 0.36, batten);
      };
      crate(0.92, 0.62, 0.62, 0, 0);
      if (rng.chance(0.4)) crate(0.6, 0.45, 0.5, 0.625, rng.range(-0.1, 0.1));
    },
  },

  /** Cartons de déménagement. */
  cartons: {
    width: 0.95, depth: 0.55, height: 0.46, low: true, flat: false,
    build(k, rng) {
      const kraft = ['#b98f5e', '#a9814f', '#c49c6a'];
      const turn = rng.range(-0.15, 0.15);
      k.box(0.5, 0.42, 0.42, -0.2, 0.21, 0.27, rng.pick(kraft), { y: turn });
      k.box(0.4, 0.34, 0.36, 0.26, 0.17, 0.26, rng.pick(kraft), { y: rng.range(-0.25, 0.25) });
      // Adhésif sur le dessus (tourné avec le carton).
      k.box(0.06, 0.006, 0.43, -0.2, 0.423, 0.27, '#d9c9a0', { y: turn });
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

  /** Étagère de livres contre le mur, jusqu'à 2,4 m. */
  etagere: {
    width: 1.2, depth: 0.38, height: 2.4, low: false, flat: false,
    build(k, rng) {
      const wood = rng.pick(['#4a3020', '#5c3b25', '#3a2818']);
      const spines = ['#7a2a24', '#2d4a6b', '#3d5a35', '#8a6a2c', '#5a3a5c', '#2a2a2a', '#9c8a6a', '#6b2f2f'];
      // Fond entre les montants (pas dans leur plan).
      k.box(1.16, 2.38, 0.04, 0, 1.19, 0.025, wood);
      for (const x of [-0.58, 0.58]) k.box(0.04, 2.4, 0.36, x, 1.2, 0.18, wood);
      for (let r = 0; r < 6; r++) {
        const y = 0.06 + r * 0.42;
        k.box(1.14, 0.03, 0.34, 0, y, 0.18, wood);
        if (r === 5) break;
        let x = -0.55;
        while (x < 0.52) {
          const w = rng.range(0.03, 0.07), h = rng.range(0.24, 0.36);
          if (rng.chance(0.06)) { x += 0.08; continue; }
          k.box(w - 0.004, h, rng.range(0.18, 0.26), x + w / 2, y + 0.015 + h / 2, 0.16, rng.pick(spines));
          x += w;
        }
      }
    },
  },

  /** Échelle de bibliothèque appuyée contre le mur. */
  echelle: {
    width: 0.5, depth: 0.7, height: 3, low: false, flat: false,
    build(k) {
      const wood = '#6e4a2c';
      const a = 0.2, H = 3;
      const at = (y: number) => 0.62 - y * Math.tan(a);
      for (const x of [-0.2, 0.2]) k.box(0.05, H / Math.cos(a), 0.04, x, H / 2, at(H / 2), wood, { x: -a });
      for (let i = 1; i <= 9; i++) {
        const y = (i * H) / 10;
        k.box(0.4, 0.03, 0.04, 0, y, at(y), wood);
      }
    },
  },

  /** Bureau avec fauteuil et écran éteint. */
  bureau: {
    width: 1.3, depth: 1.2, height: 1.2, low: false, flat: false,
    build(k, rng) {
      const top = rng.pick(['#d9d4c7', '#bfb8a8', '#8d8577']);
      k.box(1.25, 0.03, 0.65, 0, 0.74, 0.36, top);
      for (const x of [-0.58, 0.58]) k.box(0.04, 0.72, 0.6, x, 0.37, 0.36, '#5b5d60');
      k.box(0.5, 0.32, 0.03, 0.1, 0.95, 0.2, '#16171a');
      k.box(0.08, 0.16, 0.08, 0.1, 0.83, 0.22, '#2a2b2e');
      // Fauteuil de bureau, un peu de travers.
      const r = rng.range(-0.5, 0.5);
      k.box(0.48, 0.07, 0.46, -0.1, 0.48, 0.95, '#2c2e33', { y: r });
      k.box(0.46, 0.5, 0.06, -0.1 + Math.sin(r) * 0.2, 0.78, 1.15, '#2c2e33', { y: r });
      k.cyl(0.03, 0.4, -0.1, 0.24, 0.95, '#6a6c70', 6);
      k.cyl(0.26, 0.03, -0.1, 0.04, 0.95, '#3a3c40', 5);
    },
  },

  /** Pilier de parking en béton, rayé jaune et noir, numéroté. */
  pilier: {
    width: 0.7, depth: 0.8, height: 3, low: false, flat: false,
    build(k, rng, ceiling) {
      const z = 0.4;
      k.box(0.6, ceiling, 0.6, 0, ceiling / 2, z, '#8e8b85');
      for (let i = 0; i < 4; i++) k.box(0.62, 0.12, 0.62, 0, 0.06 + i * 0.24, z, i % 2 ? '#1c1c1c' : '#d9b11e');
      k.box(0.3, 0.3, 0.62, 0, 2.0, z, rng.pick(['#2a62a8', '#b8322a', '#2a7a3a']));
    },
  },

  /** Cônes de chantier. */
  cone: {
    width: 0.6, depth: 0.55, height: 0.7, low: true, flat: false,
    build(k, rng) {
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.22;
        // Socles qui se chevauchent : chacun à sa hauteur.
        const base = 0.03 + i * 0.006;
        k.box(0.36, base, 0.36 + i * 0.012, x, base / 2, 0.3, '#2a2a2a');
        k.cyl(0.16, 0.5, x, 0.28, 0.3, '#e8641e', 10, 0.18);
        k.cyl(0.11, 0.07, x, 0.32, 0.3, '#f2f2f2', 10, 0.75);
      }
    },
  },

  /** Échafaudage contre le mur. */
  echafaudage: {
    width: 1.8, depth: 0.8, height: 3.2, low: false, flat: false,
    build(k, rng, ceiling) {
      const H = Math.min(ceiling - 0.3, 3.4);
      const steel = '#9aa0a6';
      for (const x of [-0.85, 0.85]) for (const z of [0.1, 0.7]) k.cyl(0.025, H, x, H / 2, z, steel, 6);
      for (const y of [0.15, H / 2, H - 0.1]) {
        for (const z of [0.1, 0.7]) k.cyl(0.02, 1.7, 0, y, z, steel, 6, 1, { z: Math.PI / 2 });
        k.box(1.7, 0.04, 0.6, 0, y + 0.04, 0.4, rng.pick(['#9a7a4a', '#8a6d42']));
      }
      k.cyl(0.02, Math.hypot(1.7, H / 2), 0, H * 0.25, 0.1, steel, 6, 1, { z: Math.atan2(1.7, H / 2) });
    },
  },

  /** Bâche de protection tendue sur le mur. */
  bache: {
    width: 1.8, depth: 0.12, height: 3, low: false, flat: true,
    build(k, rng, ceiling) {
      const H = Math.min(ceiling - 0.2, 3.2);
      const color = rng.pick(['#4d6f8f', '#b9bdb6', '#6b7a5a']);
      for (let i = 0; i < 6; i++) k.box(0.3, H, 0.02, -0.75 + i * 0.3, H / 2, 0.04 + (i % 2) * 0.03, color, { y: (i % 2 ? 1 : -1) * 0.12 });
    },
  },

  /** Arbre (forêt) : tronc et houppier. On y accroche parfois une œuvre. */
  arbre: {
    width: 1.2, depth: 1.2, height: 4.5, low: false, flat: false,
    build(k, rng) {
      const seed = rng.int(0, 1000);
      const dark = [new THREE.Color('#1d3320'), new THREE.Color('#25402a'), new THREE.Color('#183020'), new THREE.Color('#2c4a2c')];
      k.cyl(0.18, 4, 0, 2, 0.6, '#3b2c22', 8, 0.6);
      k.blob(1.1, 0, 4.2, 0.6, dark, seed);
      k.blob(0.8, 0.5, 3.6, 0.4, dark, seed + 3);
    },
  },

  /** Palmier (vaporwave). */
  palmier: {
    width: 1.4, depth: 1.4, height: 4, low: false, flat: false,
    build(k, rng) {
      const trunk = '#c98fb8';
      for (let i = 0; i < 6; i++) k.cyl(0.13 - i * 0.012, 0.65, Math.sin(i * 0.4) * 0.08, 0.32 + i * 0.6, 0.7, trunk, 7, 0.9);
      const leaf = rng.pick(['#3fd9b0', '#2ec4c4', '#59e0a0']);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        k.box(1.3, 0.04, 0.28, Math.cos(a) * 0.6, 3.7, 0.7 + Math.sin(a) * 0.6, leaf, { y: -a, z: -0.35 });
      }
    },
  },

  /** Buste antique sur son socle. */
  statue: {
    width: 0.6, depth: 0.7, height: 1.8, low: false, flat: false,
    build(k, rng) {
      const marble = rng.pick(['#eae6de', '#f2efe9', '#dcd8d0']);
      const white = [new THREE.Color(marble), new THREE.Color(marble).multiplyScalar(0.94), new THREE.Color(marble).multiplyScalar(0.88)];
      k.box(0.45, 1.05, 0.45, 0, 0.525, 0.4, marble);
      k.box(0.52, 0.05, 0.52, 0, 1.075, 0.4, marble);
      k.blob(0.2, 0, 1.25, 0.4, white, rng.int(0, 99), 0.7);
      k.cyl(0.07, 0.14, 0, 1.38, 0.4, marble, 8);
      k.blob(0.15, 0, 1.58, 0.42, white, rng.int(0, 99), 1.15);
    },
  },

  /** Brancard d'hôpital oublié. */
  brancard: {
    width: 2, depth: 0.75, height: 0.95, low: false, flat: false,
    build(k) {
      k.box(1.9, 0.12, 0.62, 0, 0.72, 0.4, '#e8eef0');
      k.box(1.95, 0.03, 0.66, 0, 0.64, 0.4, '#9aa3a8');
      for (const x of [-0.85, 0.85]) for (const z of [0.15, 0.65]) {
        k.box(0.03, 0.6, 0.03, x, 0.33, z, '#9aa3a8');
        k.cyl(0.05, 0.04, x, 0.05, z, '#2a2a2a', 8, 1, { z: Math.PI / 2 });
      }
      k.box(0.5, 0.08, 0.35, -0.7, 0.82, 0.4, '#ffffff');
    },
  },

  /** Présentoir de cassettes vidéo. */
  'presentoir-vhs': {
    width: 1.3, depth: 0.45, height: 2, low: false, flat: false,
    build(k, rng) {
      k.box(1.3, 2, 0.4, 0, 1, 0.2, '#1b1b22');
      const covers = ['#c8282e', '#1f4fa0', '#f2c230', '#2a8a4a', '#e6e6e6', '#7a2aa0', '#111111', '#e86a1a'];
      for (let r = 0; r < 5; r++) {
        const y = 0.3 + r * 0.36;
        k.box(1.24, 0.02, 0.38, 0, y - 0.13, 0.22, '#30303a');
        for (let i = 0; i < 9; i++) k.box(0.115, 0.21, 0.025, -0.55 + i * 0.137, y, 0.41, rng.pick(covers), { x: -0.08 });
      }
    },
  },

  /** Lanterne de pierre (galerie japonaise). */
  lanterne: {
    width: 0.6, depth: 0.7, height: 1.3, low: false, flat: false,
    build(k) {
      const stone = '#8d8a82';
      k.cyl(0.24, 0.12, 0, 0.06, 0.4, stone, 6);
      k.cyl(0.08, 0.55, 0, 0.4, 0.4, stone, 6);
      k.box(0.36, 0.06, 0.36, 0, 0.7, 0.4, stone);
      k.glowBox(0.22, 0.2, 0.22, 0, 0.84, 0.4, '#ffd9a0');
      k.cyl(0.3, 0.16, 0, 1.02, 0.4, stone, 6, 0.25);
      k.cyl(0.04, 0.1, 0, 1.15, 0.4, stone, 6);
    },
  },

  /** Bonsaï sur une sellette basse. */
  bonsai: {
    width: 0.6, depth: 0.6, height: 1.0, low: false, flat: false,
    build(k, rng) {
      const greens = [new THREE.Color('#3d5e2e'), new THREE.Color('#4c6e36'), new THREE.Color('#2f4c25')];
      k.box(0.5, 0.45, 0.4, 0, 0.225, 0.32, '#3a2a1c');
      k.box(0.36, 0.08, 0.24, 0, 0.49, 0.32, '#5a6a72');
      k.cyl(0.03, 0.25, 0.02, 0.64, 0.32, '#4a3626', 6, 0.7, { z: 0.3 });
      k.blob(0.16, -0.06, 0.82, 0.32, greens, rng.int(0, 99), 0.6);
      k.blob(0.12, 0.12, 0.74, 0.3, greens, rng.int(0, 99), 0.6);
    },
  },

  /** Stalactites de glace sous la corniche (givre). */
  stalactite: {
    width: 1.2, depth: 0.15, height: 0.6, low: false, flat: true,
    build(k, rng, ceiling) {
      const n = rng.int(4, 8);
      for (let i = 0; i < n; i++) {
        const h = rng.range(0.15, 0.6);
        k.cyl(rng.range(0.02, 0.05), h, -0.55 + (i / (n - 1)) * 1.1, ceiling - h / 2 - 0.05, 0.07, '#dff2ff', 6, 0.05, { x: Math.PI });
      }
    },
  },

  /** Vitrine de cabinet de curiosités : coquillages, crânes, minéraux sous verre. */
  vitrine: {
    width: 1.1, depth: 0.6, height: 1.9, low: false, flat: false,
    build(k, rng) {
      const wood = rng.pick(['#3a2414', '#4a2c18', '#2e1c10']);
      k.box(1.1, 0.8, 0.55, 0, 0.4, 0.3, wood);
      for (const x of [-0.525, 0.525]) for (const z of [0.05, 0.55]) k.box(0.04, 1.05, 0.04, x, 1.32, z, wood);
      k.box(1.1, 0.06, 0.55, 0, 1.87, 0.3, wood);
      // Objets : boules nacrées, crâne, cristaux.
      const shells = [new THREE.Color('#e8dcc6'), new THREE.Color('#d6c2a0'), new THREE.Color('#f2ece0')];
      const seed = rng.int(0, 999);
      k.blob(0.09, -0.32, 0.9, 0.3, shells, seed, 0.8);
      k.blob(0.1, 0, 0.92, 0.32, [new THREE.Color('#ece6d8'), new THREE.Color('#d8d0c0')], seed + 4, 1.1);
      k.cyl(0.05, 0.16, 0.3, 0.88, 0.28, rng.pick(['#6a3a8a', '#3a7a6a', '#b84a2a']), 6, 0.1);
      k.box(0.2, 0.012, 0.4, 0, 1.25, 0.3, '#d8e4e8');
      k.blob(0.07, 0.25, 1.33, 0.3, shells, seed + 7, 0.6);
      k.cyl(0.035, 0.22, -0.25, 1.37, 0.3, '#c8d8a0', 6, 0.5);
    },
  },

  /** Bac à vinyles : une rangée de pochettes dont on voit le dos. */
  'bac-vinyles': {
    width: 1.1, depth: 0.55, height: 0.95, low: false, flat: false,
    build(k, rng) {
      k.box(1.05, 0.7, 0.45, 0, 0.35, 0.3, '#2a1c14');
      const sleeves = ['#c8282e', '#1f4fa0', '#f2c230', '#2a8a4a', '#e6e6e6', '#7a2aa0', '#111111', '#e86a1a', '#d8b88a'];
      for (let i = 0; i < 22; i++) k.box(0.31, 0.31, 0.012, -0.47 + i * 0.045, 0.82, 0.3, rng.pick(sleeves), { y: Math.PI / 2, z: rng.range(-0.18, 0.05) });
    },
  },

  /** Borne d'arcade, écran allumé. */
  borne: {
    width: 0.75, depth: 0.85, height: 1.85, low: false, flat: false,
    build(k, rng) {
      const body = rng.pick(['#1a1a2a', '#2a0a3a', '#0a2a3a']);
      k.box(0.7, 1.85, 0.7, 0, 0.925, 0.4, body);
      k.box(0.72, 0.16, 0.06, 0, 1.75, 0.76, rng.pick(['#ff3fd0', '#3fd0ff', '#ffd23f']));
      k.glowBox(0.55, 0.42, 0.02, 0, 1.32, 0.76, rng.pick(['#3a6aff', '#22c88a', '#ff5a3a', '#c83aff']), { x: -0.25 });
      k.box(0.72, 0.06, 0.3, 0, 0.98, 0.86, '#222230');
      k.cyl(0.02, 0.08, -0.12, 1.04, 0.88, '#d8d8d8', 6);
      k.glowBox(0.05, 0.02, 0.05, 0.08, 1.02, 0.9, '#ff2a2a');
      k.glowBox(0.05, 0.02, 0.05, 0.18, 1.02, 0.88, '#2aff6a');
    },
  },

  /** Rangée de fauteuils de cinéma, velours rouge élimé. */
  sieges: {
    width: 2.2, depth: 0.9, height: 1.0, low: false, flat: false,
    build(k, rng) {
      const velvet = rng.pick(['#7a1420', '#6a1018', '#8a2028']);
      for (let i = 0; i < 4; i++) {
        const x = -0.83 + i * 0.55;
        k.box(0.5, 0.12, 0.5, x, 0.45, 0.45, velvet, { x: rng.chance(0.3) ? -0.9 : 0 });
        k.box(0.48, 0.55, 0.1, x, 0.75, 0.2, velvet);
        k.box(0.05, 0.6, 0.55, x + 0.27, 0.3, 0.42, '#2a2420');
      }
    },
  },

  /** Colonne antique brisée. */
  colonne: {
    width: 0.9, depth: 0.9, height: 3, low: false, flat: false,
    build(k, rng) {
      const stone = rng.pick(['#d8d0bc', '#cbc2ac', '#e2dccc']);
      k.box(0.8, 0.25, 0.8, 0, 0.125, 0.45, stone);
      const h = rng.range(0.8, 2.8);
      k.cyl(0.3, h, 0, 0.25 + h / 2, 0.45, stone, 14, 0.92);
      if (rng.chance(0.6)) k.cyl(0.28, 0.5, 0.55, 0.25, 0.75, stone, 14, 1, { z: Math.PI / 2, y: rng.range(0, 3) });
    },
  },

  /** Lierre qui court sur le mur. */
  lierre: {
    width: 1.4, depth: 0.15, height: 3, low: false, flat: true,
    build(k, rng, ceiling) {
      const greens = [new THREE.Color('#2e5a26'), new THREE.Color('#3c6e30'), new THREE.Color('#244a20')];
      const top = Math.min(ceiling, 3.5);
      let y = top - 0.2;
      while (y > 0.3) {
        k.blob(rng.range(0.12, 0.26), rng.range(-0.6, 0.6), y, 0.06, greens, rng.int(0, 999), 1);
        y -= rng.range(0.12, 0.3);
      }
    },
  },

  /** Console de station orbitale : écrans et voyants. */
  console: {
    width: 1.3, depth: 0.5, height: 1.4, low: false, flat: false,
    build(k, rng) {
      k.box(1.3, 0.9, 0.45, 0, 0.45, 0.25, '#c8ccd2');
      k.box(1.3, 0.05, 0.5, 0, 0.92, 0.27, '#8a9098', { x: -0.3 });
      for (let i = 0; i < 3; i++) k.glowBox(0.34, 0.24, 0.02, -0.42 + i * 0.42, 1.18, 0.06, rng.pick(['#2ad0ff', '#2aff9a', '#ffb02a']));
      for (let i = 0; i < 8; i++) k.glowBox(0.03, 0.03, 0.02, -0.5 + i * 0.14, 0.95, 0.4, rng.pick(['#ff3a3a', '#3aff6a', '#ffd23a']));
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
