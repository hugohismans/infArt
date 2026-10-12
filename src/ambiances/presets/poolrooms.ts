import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Poolrooms : carrelage blanc partout, eau turquoise au sol, échos, lumière zénithale. Zone liminale. */
export const poolrooms: AmbiancePreset = {
  id: 'poolrooms',
  rarity: 'rare',
  tension: 0.6,
  zoneLength: [3, 7],
  affinities: { 'back-rooms': 1.4, 'white-cube': 1, hopital: 1 },
  geometry: { ceilingHeight: 4.2, corridorWidth: 5 },
  palette: {
    background: '#cfe6ea',
    wall: '#f4fafa',
    wallShade: '#a8c4c8',
    ceiling: '#f4f8f8',
    skirting: '#d8e4e6',
    floor: '#5ec6d6',
    floorAlt: '#3a9cb4',
    lightStrip: '#ffffff',
    frame: ['#f2f2f2', '#c8d2d4'],
  },
  surfaces: { wall: 'faience', ceiling: 'uni', floor: 'eau', trims: false },
  fog: { color: '#d6ecee', near: 7, far: 30 },
  lighting: { hemiSky: '#ffffff', hemiGround: '#6ac0cc', hemiIntensity: 2.3, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 0, dust: 0.05 }),
  sound: sound({ roomTone: 0.15, water: 1, reverb: 1 }),
  art: { density: 0.35, frames: 'moderne' },
  modules: { 'room-l': 1.6, 'room-s': 1.4, 'straight-l': 1.3 },
};
