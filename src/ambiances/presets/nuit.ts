import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Musée la nuit : lumières éteintes, veilleuses et sorties de secours ; le visiteur a une lampe torche. */
export const nuit: AmbiancePreset = {
  id: 'musee-nuit',
  name: 'Le musée, la nuit',
  rarity: 'rare',
  tension: 0.7,
  affinities: { 'beaux-arts': 1.6, 'back-rooms': 1.1 },
  zoneLength: [4, 9],
  geometry: { ceilingHeight: 4.2, corridorWidth: 4.4 },
  palette: {
    background: '#010102',
    wall: '#6a1e22',
    wallShade: '#2a0a0c',
    ceiling: '#5a5650',
    skirting: '#3a2a1c',
    floor: '#5a3a22',
    floorAlt: '#4a2e1a',
    lightStrip: '#1c2024',
    frame: ['#8c6a24', '#2a2018'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'parquet', trims: true },
  fog: { color: '#000000', near: 2, far: 19 },
  lighting: { hemiSky: '#3a4a6a', hemiGround: '#0a0a10', hemiIntensity: 0.12, artGlow: 0, flicker: 0, flashlight: 1 },
  furniture: { small: 'banc', large: 'cimaise' },
  decor: decor({ density: 1.2, pool: { chaise: 2, extincteur: 1.5, radiateur: 1, socle: 0.6 }, ropes: 0.15, exitSigns: 0.85, dust: 0.25 }),
  sound: sound({ roomTone: 0.85, hvac: 0.15, distantSteps: 0.35, reverb: 0.65 }),
  art: { density: 0.95, frames: 'classique', prefer: ['peinture'] },
};
