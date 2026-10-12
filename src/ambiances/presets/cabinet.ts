import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Cabinet de curiosités : boiseries sombres, vitrines d'objets, accrochage chaotique. */
export const cabinet: AmbiancePreset = {
  id: 'cabinet',
  name: 'Cabinet de curiosités',
  rarity: 'rare',
  tension: 0.4,
  affinities: { bibliotheque: 1.5, baroque: 1.2, 'beaux-arts': 1 },
  geometry: { ceilingHeight: 4.6, corridorWidth: 4.4 },
  palette: {
    background: '#0e0806',
    wall: '#6a4228',
    wallShade: '#2a160c',
    ceiling: '#3a2416',
    skirting: '#2a180c',
    floor: '#4a2e1a',
    floorAlt: '#3a2212',
    lightStrip: '#ffd9a0',
    frame: ['#8c6a24', '#2a1c10'],
  },
  surfaces: { wall: 'boiserie', ceiling: 'uni', floor: 'parquet', trims: true },
  fog: { color: '#1a100a', near: 4, far: 24 },
  lighting: { hemiSky: '#ffcf90', hemiGround: '#2a1408', hemiIntensity: 1.5, artGlow: 0.45, flicker: 0 },
  furniture: { small: 'banc', large: 'aucun' },
  decor: decor({ density: 1.6, pool: { vitrine: 3, statue: 0.6, socle: 0.3 }, dust: 0.5 }),
  sound: sound({ roomTone: 0.6, distantSteps: 0.15, reverb: 0.3 }),
  art: { density: 0.9, frames: 'classique', prefer: ['dessin', 'estampe', 'peinture'], salon: true },
  modules: { 'room-s': 1.6, 'room-l': 1.2 },
};
