import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Échelle déréglée (géant) : couloirs immenses, œuvres gigantesques. */
export const geant: AmbiancePreset = {
  id: 'geant',
  name: 'Échelle déréglée',
  rarity: 'tres-rare',
  tension: 0.6,
  zoneLength: [3, 6],
  affinities: { 'beaux-arts': 1.4, 'white-cube': 1.4, miniature: 1.5 },
  geometry: { ceilingHeight: 14, corridorWidth: 12 },
  palette: {
    background: '#0e1410',
    wall: '#2f4a3a',
    wallShade: '#14221a',
    ceiling: '#e6dfd0',
    skirting: '#3a2a1c',
    floor: '#7a4e2d',
    floorAlt: '#5c3a22',
    lightStrip: '#fff6e0',
    frame: ['#c49a3e', '#8c6a24'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'parquet', trims: true },
  fog: { color: '#18201a', near: 10, far: 48 },
  lighting: { hemiSky: '#ffe8c0', hemiGround: '#3a2a1a', hemiIntensity: 1.9, artGlow: 0.4, flicker: 0 },
  furniture: { small: 'banc', large: 'banc' },
  decor: decor({ density: 0.6, pool: { chaise: 1 }, dust: 0.4 }),
  sound: sound({ roomTone: 0.8, distantSteps: 0.3, reverb: 1 }),
  art: { density: 0.7, frames: 'classique', prefer: ['peinture'], scale: 5 },
  modules: { 'stairs-up': 0, 'stairs-down': 0, 'straight-l': 1.4 },
};
