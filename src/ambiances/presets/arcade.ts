import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Salle d'arcade, chambre d'ado : bornes, posters, jaquettes, lumière RVB. */
export const arcade: AmbiancePreset = {
  id: 'arcade',
  name: 'Salle d’arcade',
  rarity: 'rare',
  tension: 0.4,
  affinities: { videoclub: 1.6, vaporwave: 1.3, disquaire: 1 },
  zoneLength: [3, 7],
  geometry: { ceilingHeight: 3, corridorWidth: 4.6 },
  palette: {
    background: '#06040c',
    wall: '#4a3a7a',
    wallShade: '#1a1030',
    ceiling: '#2a2040',
    skirting: '#120a20',
    floor: '#3a2a6a',
    floorAlt: '#6a1f5a',
    lightStrip: '#ff4fd8',
    frame: ['#111111', '#2ae6e6'],
  },
  surfaces: { wall: 'uni', ceiling: 'dalles', floor: 'moquette', trims: false },
  fog: { color: '#0c0818', near: 3, far: 22 },
  lighting: { hemiSky: '#b09aff', hemiGround: '#40104a', hemiIntensity: 1.8, artGlow: 0, flicker: 0, rgb: true },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 2, pool: { borne: 3, cartons: 0.3 }, dust: 0.1 }),
  sound: sound({ roomTone: 0.2, hum: 0.2, bleeps: 1, reverb: 0.15 }),
  art: { density: 0.9, frames: 'moderne', prefer: ['jaquette-jeu', 'affiche-film', 'affiche'] },
  modules: { 'room-l': 1.6, 'room-s': 1.4 },
};
