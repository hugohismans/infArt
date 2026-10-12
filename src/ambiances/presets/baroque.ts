import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Palais baroque : damas rouge, dorures, plafond peint, marbre, accrochage serré jusqu'au plafond. */
export const baroque: AmbiancePreset = {
  id: 'baroque',
  name: 'Palais baroque',
  rarity: 'rare',
  tension: 0.2,
  affinities: { 'beaux-arts': 1.6, 'galerie-japonaise': 0.5 },
  zoneLength: [5, 10],
  geometry: { ceilingHeight: 6.2, corridorWidth: 5.4 },
  palette: {
    background: '#1a0c08',
    wall: '#8e1f24',
    wallShade: '#4a0d10',
    ceiling: '#f2e8d6',
    skirting: '#b8913a',
    floor: '#ece6da',
    floorAlt: '#2a2420',
    lightStrip: '#fff1cf',
    frame: ['#c49a3e', '#8c6a24'],
  },
  surfaces: { wall: 'damas', ceiling: 'peint', floor: 'marbre', trims: true },
  fog: { color: '#2a120c', near: 8, far: 32 },
  lighting: { hemiSky: '#ffe2b0', hemiGround: '#5a2a1a', hemiIntensity: 2.1, artGlow: 0.5, flicker: 0 },
  furniture: { small: 'banc', large: 'banc' },
  decor: decor({ density: 1.2, pool: { statue: 1.2, plante: 0.6, chaise: 1, socle: 0.4 }, ropes: 0.2, dust: 0.35 }),
  sound: sound({ roomTone: 0.6, hvac: 0.1, distantSteps: 0.5, reverb: 0.85 }),
  art: { density: 1.15, frames: 'classique', prefer: ['peinture'], salon: true },
  modules: { 'room-l': 2.2, 'room-s': 1.6, 'room-s-side': 1.4, 'straight-l': 0.6 },
};
