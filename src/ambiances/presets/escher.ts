import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Escher : escaliers à n'en plus finir, damier, œuvres dans toutes les orientations. */
export const escher: AmbiancePreset = {
  id: 'escher',
  name: 'Escher',
  rarity: 'tres-rare',
  tension: 0.7,
  zoneLength: [4, 8],
  affinities: { 'white-cube': 1.5, neant: 1.3, miroirs: 1.2 },
  geometry: { ceilingHeight: 4.4, corridorWidth: 4.4 },
  palette: {
    background: '#d8d8d8',
    wall: '#f2f2f0',
    wallShade: '#9a9a98',
    ceiling: '#e8e8e6',
    skirting: '#1a1a1a',
    floor: '#f0f0ee',
    floorAlt: '#1c1c1c',
    lightStrip: '#ffffff',
    frame: ['#1a1a1a', '#f2f2f2'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'marbre', trims: true },
  fog: { color: '#e2e2e0', near: 6, far: 28 },
  lighting: { hemiSky: '#ffffff', hemiGround: '#8a8a88', hemiIntensity: 2, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 0, dust: 0.1 }),
  sound: sound({ roomTone: 0.2, reverb: 0.75 }),
  art: { density: 0.75, frames: 'moderne', prefer: ['estampe', 'dessin'], rotations: true },
  modules: { 'stairs-up': 5, 'stairs-down': 5, 'turn-left': 1.5, 'turn-right': 1.5, 'room-l': 0.3 },
};
