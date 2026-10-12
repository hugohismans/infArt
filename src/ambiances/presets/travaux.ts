import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Musée en travaux : bâches, échafaudages, cônes ; œuvres emballées ou posées au sol. */
export const travaux: AmbiancePreset = {
  id: 'travaux',
  name: 'Musée en travaux',
  rarity: 'rare',
  tension: 0.4,
  affinities: { 'beaux-arts': 1.3, 'white-cube': 1.3, parking: 1 },
  geometry: { ceilingHeight: 4.4, corridorWidth: 5 },
  palette: {
    background: '#141210',
    wall: '#dad5cc',
    wallShade: '#8a857c',
    ceiling: '#e6e2da',
    skirting: '#8a857c',
    floor: '#9c9890',
    floorAlt: '#86827a',
    lightStrip: '#fffaf0',
    frame: ['#2a2a2a', '#ebe7df'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'beton', trims: false },
  fog: { color: '#cfcac0', near: 6, far: 28 },
  lighting: { hemiSky: '#fff8ec', hemiGround: '#6a645a', hemiIntensity: 1.8, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 1.8, pool: { echafaudage: 1.4, bache: 1.5, cone: 1.4, escabeau: 1, cartons: 1, caisse: 1.2 }, stains: 0.6, dust: 0.8 }),
  sound: sound({ roomTone: 0.5, hvac: 0.2, distantSteps: 0.3, reverb: 0.55 }),
  art: { density: 0.6, frames: 'classique', mount: 'sol', wrapped: 0.35 },
};
