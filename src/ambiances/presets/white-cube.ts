import type { AmbiancePreset } from '../types';

/** White cube contemporain : béton ciré, murs blancs, lumière froide et uniforme, beaucoup d'espace. */
export const whiteCube: AmbiancePreset = {
  id: 'white-cube',
  name: 'Galerie contemporaine',
  rarity: 'commune',
  tension: 0.15,
  affinities: { 'beaux-arts': 1.1, 'back-rooms': 0.8, serre: 0.9 },
  geometry: { ceilingHeight: 4.8, corridorWidth: 5.6 },
  palette: {
    background: '#e8e8e5',
    wall: '#f4f3ef',
    wallShade: '#dad9d4',
    ceiling: '#f7f7f5',
    skirting: '#e3e2dd',
    floor: '#a7a6a1',
    floorAlt: '#8f8e89',
    lightStrip: '#f4f8ff',
    frame: ['#151515', '#f1f1ef', '#2a2a2a'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'beton', trims: false },
  fog: { color: '#ecece9', near: 9, far: 36 },
  lighting: {
    hemiSky: '#ffffff',
    hemiGround: '#d6d6d2',
    hemiIntensity: 1.95,
    artGlow: 0,
    flicker: 0,
  },
  furniture: { small: 'aucun', large: 'cimaise' },
  art: { density: 0.7, frames: 'moderne', prefer: ['photographie', 'dessin', 'estampe'] },
  modules: { 'room-l': 3, 'room-s': 1.8, 'room-s-side': 1.5, 'straight-l': 0.6, deadend: 1.4 },
};
