import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Le musée qui respire : les murs ondulent, la lumière enfle et retombe comme un souffle. */
export const respire: AmbiancePreset = {
  id: 'respire',
  name: 'Le musée qui respire',
  rarity: 'tres-rare',
  tension: 0.8,
  zoneLength: [3, 6],
  affinities: { 'musee-nuit': 1.4, 'back-rooms': 1.3, 'beaux-arts': 1 },
  geometry: { ceilingHeight: 4, corridorWidth: 4.2 },
  palette: {
    background: '#140606',
    wall: '#b86a5a',
    wallShade: '#5a2018',
    ceiling: '#c88a7a',
    skirting: '#4a1810',
    floor: '#5a2a24',
    floorAlt: '#4a1e1a',
    lightStrip: '#ffd8c8',
    frame: ['#8c6a24', '#3a1a10'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'moquette', trims: true },
  fog: { color: '#2a0e0a', near: 4, far: 24 },
  lighting: { hemiSky: '#ffd0c0', hemiGround: '#3a1008', hemiIntensity: 1.6, artGlow: 0.3, flicker: 0, breath: 0.25 },
  furniture: { small: 'banc', large: 'aucun' },
  decor: decor({ density: 0.6, pool: { chaise: 1, plante: 0.5 }, dust: 0.3 }),
  sound: sound({ roomTone: 1, wind: 0.25, reverb: 0.4 }),
  art: { density: 0.85, frames: 'classique' },
};
