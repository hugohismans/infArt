import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Monde inversé : on marche au plafond (une fresque), les bancs et les tableaux sont au-dessus. */
export const inverse: AmbiancePreset = {
  id: 'inverse',
  name: 'Monde inversé',
  rarity: 'tres-rare',
  tension: 0.75,
  zoneLength: [3, 6],
  affinities: { 'beaux-arts': 1.5, baroque: 1.3, escher: 1.2 },
  // On y bascule d'un coup.
  transition: 'rupture',
  inverted: true,
  geometry: { ceilingHeight: 4.2, corridorWidth: 4.4 },
  palette: {
    background: '#1a0c08',
    wall: '#2f4a3a',
    wallShade: '#16261c',
    ceiling: '#f2e8d6',
    skirting: '#3a2a1c',
    floor: '#7a4e2d',
    floorAlt: '#5c3a22',
    lightStrip: '#fff1cf',
    frame: ['#c49a3e', '#8c6a24'],
  },
  surfaces: { wall: 'uni', ceiling: 'peint', floor: 'parquet', trims: true },
  fog: { color: '#20140c', near: 6, far: 28 },
  lighting: { hemiSky: '#ffe2b0', hemiGround: '#3a2a1a', hemiIntensity: 1.9, artGlow: 0, flicker: 0 },
  furniture: { small: 'banc', large: 'banc' },
  decor: decor({ density: 1.4, pool: { chaise: 2, radiateur: 1, plante: 0.8, extincteur: 0.6 }, exitSigns: 0.3, dust: 0.3 }),
  sound: sound({ roomTone: 0.6, distantSteps: 0.4, reverb: 0.55 }),
  art: { density: 0.95, frames: 'classique', prefer: ['peinture'] },
  // Pas de salles (plus hautes que leurs portes) ni d'escaliers : ils ne se retournent pas bien.
  modules: { 'room-s': 0, 'room-s-side': 0, 'room-l': 0, 'stairs-up': 0, 'stairs-down': 0 },
};
