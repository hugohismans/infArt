import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Labyrinthe de miroirs : murs argentés, virages serrés, la même œuvre reflétée partout (faux reflets). */
export const miroirs: AmbiancePreset = {
  id: 'miroirs',
  name: 'Labyrinthe de miroirs',
  rarity: 'tres-rare',
  tension: 0.65,
  zoneLength: [4, 8],
  affinities: { escher: 1.3, 'white-cube': 1.2, baroque: 1 },
  geometry: { ceilingHeight: 3.4, corridorWidth: 3.4 },
  palette: {
    background: '#0c0e12',
    wall: '#ffffff',
    wallShade: '#9aa2ac',
    ceiling: '#2a2e34',
    skirting: '#1a1c20',
    floor: '#1c1e22',
    floorAlt: '#2c2f34',
    lightStrip: '#f4f8ff',
    frame: ['#c8ccd2', '#1a1a1a'],
  },
  surfaces: { wall: 'miroir', ceiling: 'uni', floor: 'marbre', trims: true },
  fog: { color: '#14161a', near: 4, far: 22 },
  lighting: { hemiSky: '#f4f8ff', hemiGround: '#3a3e44', hemiIntensity: 2, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 0, dust: 0.15 }),
  sound: sound({ roomTone: 0.3, reverb: 0.45 }),
  art: { density: 0.9, frames: 'moderne', mirror: true },
  modules: { 'turn-left': 3, 'turn-right': 3, tee: 2, cross: 2, 'straight-s': 2, 'straight-l': 0.3, 'room-l': 0.2, 'room-s': 0.4 },
};
