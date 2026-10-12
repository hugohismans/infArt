import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Galerie japonaise : tatamis, shoji, bois clair, lumière diffuse, peu d'œuvres, très espacées. */
export const japonaise: AmbiancePreset = {
  id: 'galerie-japonaise',
  name: 'Galerie japonaise',
  rarity: 'rare',
  tension: 0.12,
  affinities: { serre: 1.5, 'white-cube': 1.2, baroque: 0.4 },
  geometry: { ceilingHeight: 3.3, corridorWidth: 4.4 },
  palette: {
    background: '#1e1a14',
    wall: '#f6f0e0',
    wallShade: '#b8a888',
    ceiling: '#d9c49e',
    skirting: '#7a5e3c',
    floor: '#c8b878',
    floorAlt: '#a39256',
    lightStrip: '#fff6e4',
    frame: ['#2a2420', '#8a6a44'],
  },
  surfaces: { wall: 'shoji', ceiling: 'uni', floor: 'tatami', trims: true },
  fog: { color: '#d8cdb4', near: 7, far: 30 },
  lighting: { hemiSky: '#fff8ea', hemiGround: '#9c8a64', hemiIntensity: 2, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 0.9, pool: { lanterne: 1, bonsai: 1.6 }, dust: 0.12 }),
  sound: sound({ roomTone: 0.3, birds: 0.25, water: 0.15, reverb: 0.2 }),
  art: { density: 0.45, frames: 'moderne', prefer: ['estampe', 'dessin'] },
  modules: { 'room-s': 1.4, 'straight-l': 0.8 },
};
