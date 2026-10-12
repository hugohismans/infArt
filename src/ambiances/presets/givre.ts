import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Givre : tout est gelé, la neige tombe à l'intérieur, les cadres sont pris dans la glace. */
export const givre: AmbiancePreset = {
  id: 'givre',
  name: 'Givre',
  rarity: 'rare',
  tension: 0.45,
  affinities: { 'beaux-arts': 1.2, serre: 0.6, 'musee-nuit': 1 },
  geometry: { ceilingHeight: 4.4, corridorWidth: 4.6 },
  palette: {
    background: '#cfdde8',
    wall: '#e2eff7',
    wallShade: '#9ab4c6',
    ceiling: '#eef6fb',
    skirting: '#a8c4d6',
    floor: '#f2f7fb',
    floorAlt: '#cfe0ec',
    lightStrip: '#eaf6ff',
    frame: ['#dff2ff'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'neige', trims: true },
  fog: { color: '#dae8f1', near: 5, far: 26 },
  lighting: { hemiSky: '#f2f9ff', hemiGround: '#8aa4b8', hemiIntensity: 1.9, artGlow: 0, flicker: 0 },
  furniture: { small: 'banc', large: 'banc' },
  decor: decor({ density: 1.3, pool: { stalactite: 2.5, chaise: 0.3 }, dust: 0.9, particles: 'neige' }),
  sound: sound({ roomTone: 0.3, wind: 0.75, reverb: 0.7 }),
  art: { density: 0.75, frames: 'classique', frameTint: '#dff2ff' },
};
