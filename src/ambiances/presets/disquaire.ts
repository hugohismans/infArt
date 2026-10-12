import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Disquaire, salon d'écoute : bacs à vinyles, pochettes, lumière tamisée, crépitement. */
export const disquaire: AmbiancePreset = {
  id: 'disquaire',
  name: 'Le disquaire',
  rarity: 'rare',
  tension: 0.3,
  affinities: { videoclub: 1.5, bibliotheque: 1, 'bureaux-nuit': 0.8 },
  zoneLength: [3, 7],
  geometry: { ceilingHeight: 3, corridorWidth: 4.2 },
  palette: {
    background: '#0e0806',
    wall: '#7a5640',
    wallShade: '#3a2418',
    ceiling: '#4a3426',
    skirting: '#2a1a10',
    floor: '#5a3a28',
    floorAlt: '#46301e',
    lightStrip: '#ffcf8a',
    frame: ['#1a1410'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'moquette', trims: true },
  fog: { color: '#1e140c', near: 4, far: 22 },
  lighting: { hemiSky: '#ffc88a', hemiGround: '#3a2010', hemiIntensity: 1.5, artGlow: 0.35, flicker: 0 },
  furniture: { small: 'banc', large: 'aucun' },
  decor: decor({ density: 1.8, pool: { 'bac-vinyles': 3, plante: 0.4, chaise: 0.4 }, dust: 0.3 }),
  sound: sound({ roomTone: 0.3, crackle: 1, reverb: 0.15 }),
  art: { density: 0.9, frames: 'moderne', prefer: ['pochette-disque', 'affiche'] },
  modules: { 'room-s': 1.5, 'straight-m': 1.3 },
};
