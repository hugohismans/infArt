import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Station orbitale : hublots sur les étoiles, panneaux rivetés, cadres en légère apesanteur. */
export const station: AmbiancePreset = {
  id: 'station',
  name: 'Station orbitale',
  rarity: 'tres-rare',
  tension: 0.5,
  zoneLength: [3, 7],
  affinities: { 'white-cube': 1.4, hopital: 1.2, vaporwave: 1 },
  geometry: { ceilingHeight: 3.2, corridorWidth: 4.2 },
  palette: {
    background: '#05060a',
    wall: '#ffffff',
    wallShade: '#8a9098',
    ceiling: '#dfe3e8',
    skirting: '#6a7078',
    floor: '#9aa0a8',
    floorAlt: '#7a8088',
    lightStrip: '#cfe8ff',
    frame: ['#c8ccd2', '#2a2e34'],
  },
  surfaces: { wall: 'hublots', ceiling: 'dalles', floor: 'lino', trims: true },
  fog: { color: '#1a1e24', near: 5, far: 24 },
  lighting: { hemiSky: '#e8f4ff', hemiGround: '#3a4048', hemiIntensity: 1.9, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 1.1, pool: { console: 2.5 }, dust: 0.05 }),
  sound: sound({ roomTone: 0.3, hvac: 0.9, hum: 0.3, reverb: 0.2 }),
  art: { density: 0.65, frames: 'moderne', mount: 'flottant' },
};
