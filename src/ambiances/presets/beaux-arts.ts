import type { AmbiancePreset } from '../types';

/** Musée des beaux-arts classique : l'ambiance rassurante du départ. */
export const beauxArts: AmbiancePreset = {
  id: 'beaux-arts',
  name: 'Musée des beaux-arts',
  rarity: 'commune',
  tension: 0,
  affinities: { 'white-cube': 1.2, serre: 1.3, 'back-rooms': 0.5 },
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
  decor: {
    density: 1.7,
    pool: { chaise: 3, poubelle: 1, extincteur: 1.5, radiateur: 1.6, plante: 0.7, socle: 0.6 },
    ropes: 0.12,
    exitSigns: 0.25,
    leaves: 0,
    stains: 0,
    lightShafts: 0,
    dust: 0.35,
  },
  sound: { roomTone: 0.7, hvac: 0.2, hum: 0, rain: 0, birds: 0, distantSteps: 0.6, reverb: 0.5, wind: 0, crickets: 0, water: 0 },
  art: { density: 1, frames: 'classique', prefer: ['peinture'] },
};
