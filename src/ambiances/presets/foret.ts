import type { AmbiancePreset } from '../types';
import { decor, OPEN_AIR_MODULES, sound } from './defaults';

/** Forêt de cadres : une forêt la nuit, des lucioles, des œuvres accrochées aux arbres. */
export const foret: AmbiancePreset = {
  id: 'foret',
  name: 'La forêt des cadres',
  rarity: 'rare',
  tension: 0.55,
  zoneLength: [4, 9],
  affinities: { serre: 1.6, 'musee-nuit': 1.2, givre: 0.8 },
  geometry: { ceilingHeight: 5, corridorWidth: 5.5 },
  palette: {
    background: '#0a1210',
    wall: '#0c1612',
    wallShade: '#0c1612',
    ceiling: '#0c1612',
    skirting: '#0c1612',
    floor: '#1c2a18',
    floorAlt: '#2c3c22',
    lightStrip: '#ffffff',
    frame: ['#4a3320', '#2a2018'],
  },
  surfaces: { wall: 'brume', ceiling: 'ciel', floor: 'herbe', trims: false },
  sky: { top: '#02040a', horizon: '#0c1612', stars: true },
  fog: { color: '#0c1612', near: 2, far: 20 },
  lighting: { hemiSky: '#7a9ab8', hemiGround: '#0c140e', hemiIntensity: 0.55, artGlow: 0, flicker: 0, flashlight: 0.45 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 1.2, pool: { arbre: 3 }, leaves: 10, dust: 1, particles: 'lucioles', trunksBehindArt: true }),
  sound: sound({ crickets: 1, wind: 0.25, reverb: 0.1 }),
  art: { density: 0.7, frames: 'classique' },
  modules: { ...OPEN_AIR_MODULES },
};
