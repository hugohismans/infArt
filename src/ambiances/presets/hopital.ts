import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Couloir d'hôpital, de service : lino, lumière clinique, brancards. */
export const hopital: AmbiancePreset = {
  id: 'hopital',
  rarity: 'rare',
  tension: 0.55,
  zoneLength: [3, 7],
  affinities: { 'bureaux-nuit': 1.3, poolrooms: 1, 'back-rooms': 1 },
  geometry: { ceilingHeight: 2.9, corridorWidth: 4 },
  palette: {
    background: '#0e1412',
    wall: '#e2ece4',
    wallShade: '#86a892',
    ceiling: '#eef2ee',
    skirting: '#5e8a72',
    floor: '#cad6ce',
    floorAlt: '#a6b8ac',
    lightStrip: '#f4fbff',
    frame: ['#e8e8e8', '#9aa4a0'],
  },
  surfaces: { wall: 'uni', ceiling: 'dalles', floor: 'lino', trims: true },
  fog: { color: '#cad8d0', near: 6, far: 28 },
  lighting: { hemiSky: '#f4ffff', hemiGround: '#7a948a', hemiIntensity: 2.1, artGlow: 0, flicker: 0.008 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 1.1, pool: { brancard: 1.5, chaise: 1, extincteur: 1, poubelle: 0.6 }, exitSigns: 0.6, dust: 0.05 }),
  sound: sound({ roomTone: 0.3, hvac: 0.6, hum: 0.4, distantSteps: 0.2, reverb: 0.5 }),
  art: { density: 0.4, frames: 'moderne' },
  modules: { 'straight-l': 2, 'straight-m': 1.5, 'room-l': 0.4 },
};
