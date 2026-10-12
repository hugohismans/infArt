import type { AmbiancePreset } from '../types';
import { decor, OPEN_AIR_MODULES, sound } from './defaults';

/** Rêve pastel : sol de nuages, ciel rose, cadres qui flottent et tournent lentement. */
export const reve: AmbiancePreset = {
  id: 'reve-pastel',
  name: 'Rêve pastel',
  rarity: 'rare',
  tension: 0.35,
  zoneLength: [4, 9],
  affinities: { serre: 1.2, neant: 1.4, vaporwave: 1.2 },
  geometry: { ceilingHeight: 6, corridorWidth: 5.5 },
  palette: {
    background: '#fde4ef',
    wall: '#fbe2ee',
    wallShade: '#fbe2ee',
    ceiling: '#fbe2ee',
    skirting: '#fbe2ee',
    floor: '#fff4fa',
    floorAlt: '#e9bcd6',
    lightStrip: '#ffffff',
    frame: ['#f2e8ff', '#e8c8ff'],
  },
  surfaces: { wall: 'brume', ceiling: 'ciel', floor: 'nuages', trims: false },
  sky: { top: '#ffb8d8', horizon: '#fde4ef' },
  fog: { color: '#fbe2ee', near: 5, far: 26 },
  lighting: { hemiSky: '#fff0f8', hemiGround: '#e8c0d8', hemiIntensity: 1.8, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ boundary: 'nuages', density: 0, dust: 0.8, particles: 'paillettes' }),
  sound: sound({ roomTone: 0.15, birds: 0.1, wind: 0.1, reverb: 0.9 }),
  art: { density: 0.6, frames: 'moderne', mount: 'flottant' },
  modules: { ...OPEN_AIR_MODULES },
};
