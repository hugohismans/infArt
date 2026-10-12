import type { AmbiancePreset } from '../types';

/** Musée des beaux-arts classique : l'ambiance rassurante du départ. */
export const beauxArts: AmbiancePreset = {
  id: 'beaux-arts',
  name: 'Musée des beaux-arts',
  rarity: 'commune',
  tension: 0,
  affinities: { 'white-cube': 1.2, serre: 1.3, 'back-rooms': 0.8 },
  geometry: { ceilingHeight: 4.2, corridorWidth: 4.4 },
  palette: {
    background: '#14100d',
    wall: '#6b1f24',
    wallShade: '#3a1416',
    ceiling: '#e9e2d4',
    skirting: '#2a1a12',
    floor: '#7a4e2d',
    floorAlt: '#5e3a20',
    lightStrip: '#fff2d6',
    frame: ['#b88a2e', '#a07526', '#c9a14a', '#3b2a1c', '#1c1714'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'parquet', trims: true },
  fog: { color: '#14100d', near: 6, far: 30 },
  lighting: {
    hemiSky: '#fff1dc',
    hemiGround: '#a08468',
    hemiIntensity: 2.2,
    artGlow: 0.32,
    flicker: 0,
  },
  furniture: { small: 'banc', large: 'cimaise' },
  art: { density: 1, frames: 'classique', prefer: ['peinture'] },
};
