import type { AmbiancePreset } from '../types';
import { decor, OPEN_AIR_MODULES, sound } from './defaults';

/** Vaporwave : grille néon au sol, coucher de soleil, statues antiques, palmiers. */
export const vaporwave: AmbiancePreset = {
  id: 'vaporwave',
  name: 'Vaporwave',
  rarity: 'rare',
  tension: 0.45,
  zoneLength: [3, 7],
  affinities: { 'reve-pastel': 1.3, videoclub: 1.3, desert: 0.8 },
  geometry: { ceilingHeight: 6, corridorWidth: 6 },
  palette: {
    background: '#ff7aa8',
    wall: '#ff7aa8',
    wallShade: '#ff7aa8',
    ceiling: '#ff7aa8',
    skirting: '#ff7aa8',
    floor: '#ff3fd0',
    floorAlt: '#1a0830',
    lightStrip: '#ffffff',
    frame: ['#2ae6e6', '#ff3fd0'],
  },
  surfaces: { wall: 'brume', ceiling: 'ciel', floor: 'grille', trims: false },
  sky: { top: '#1a0a40', horizon: '#ff7aa8' },
  fog: { color: '#ff7aa8', near: 5, far: 26 },
  lighting: { hemiSky: '#ffc0e8', hemiGround: '#40108a', hemiIntensity: 1.6, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ boundary: 'colonnade', density: 1.6, pool: { statue: 2, palmier: 2 }, dust: 0.3, particles: 'paillettes' }),
  sound: sound({ roomTone: 0.2, hum: 0.08, reverb: 0.9 }),
  art: { density: 0.6, frames: 'moderne', mount: 'flottant' },
  modules: { ...OPEN_AIR_MODULES },
};
