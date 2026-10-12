import type { AmbiancePreset } from '../types';
import { decor, OPEN_AIR_MODULES, sound } from './defaults';

/** Le Néant : blanc infini, sans murs, seulement des œuvres sur des chevalets, et nos pas. Zone liminale. */
export const neant: AmbiancePreset = {
  id: 'neant',
  rarity: 'tres-rare',
  tension: 0.55,
  zoneLength: [4, 8],
  affinities: { 'white-cube': 2, 'reve-pastel': 1.2 },
  geometry: { ceilingHeight: 6, corridorWidth: 6.5 },
  palette: {
    background: '#f6f6f4',
    wall: '#f6f6f4',
    wallShade: '#f6f6f4',
    ceiling: '#f6f6f4',
    skirting: '#f6f6f4',
    floor: '#f2f2f0',
    floorAlt: '#e8e8e6',
    lightStrip: '#ffffff',
    frame: ['#1a1a1a', '#f2f2f2'],
  },
  surfaces: { wall: 'brume', ceiling: 'ciel', floor: 'beton', trims: false },
  sky: { top: '#ffffff', horizon: '#f6f6f4' },
  fog: { color: '#f6f6f4', near: 4, far: 24 },
  lighting: { hemiSky: '#ffffff', hemiGround: '#d8d8d6', hemiIntensity: 2.4, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ boundary: 'muret', density: 0, dust: 0 }),
  sound: sound({ reverb: 0.05 }),
  art: { density: 0.55, frames: 'moderne', mount: 'chevalet' },
  modules: { ...OPEN_AIR_MODULES, 'straight-l': 1.5 },
};
