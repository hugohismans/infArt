import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Parking souterrain : béton, piliers numérotés, lumière orange, œuvres posées au sol contre les murs. */
export const parking: AmbiancePreset = {
  id: 'parking',
  rarity: 'rare',
  tension: 0.6,
  zoneLength: [3, 7],
  affinities: { travaux: 1.4, 'bureaux-nuit': 1.1, 'back-rooms': 1 },
  geometry: { ceilingHeight: 3, corridorWidth: 6 },
  palette: {
    background: '#0c0906',
    wall: '#8e8b85',
    wallShade: '#4a4844',
    ceiling: '#7a7772',
    skirting: '#d9b11e',
    floor: '#5a5955',
    floorAlt: '#4a4945',
    lightStrip: '#ffb35c',
    frame: ['#2a2a2a'],
  },
  surfaces: { wall: 'uni', ceiling: 'beton', floor: 'beton', trims: true },
  fog: { color: '#1e1710', near: 4, far: 26 },
  lighting: { hemiSky: '#ffb878', hemiGround: '#3a3024', hemiIntensity: 1.9, artGlow: 0, flicker: 0.01 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 1.6, pool: { pilier: 3, cone: 1, poubelle: 0.3 }, exitSigns: 0.5, stains: 1.2, dust: 0.25 }),
  sound: sound({ roomTone: 0.7, hvac: 0.5, hum: 0.15, distantSteps: 0.3, reverb: 0.95 }),
  art: { density: 0.5, frames: 'bon-marche', mount: 'sol' },
  modules: { 'straight-l': 1.6, cross: 1.4 },
};
