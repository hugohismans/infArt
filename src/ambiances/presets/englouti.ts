import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Musée englouti : sous l'eau, rayons de lumière, bulles, mouvements lents. */
export const englouti: AmbiancePreset = {
  id: 'englouti',
  name: 'Le musée englouti',
  rarity: 'tres-rare',
  tension: 0.6,
  zoneLength: [3, 7],
  affinities: { poolrooms: 1.6, ruines: 1.3, serre: 0.8 },
  geometry: { ceilingHeight: 5.2, corridorWidth: 5 },
  palette: {
    background: '#0c4252',
    wall: '#6a9aae',
    wallShade: '#1a4a5a',
    ceiling: '#3a7a9a',
    skirting: '#2a5a6a',
    floor: '#8a9a7a',
    floorAlt: '#6a7a5a',
    lightStrip: '#9ae8ff',
    frame: ['#4a7a6a'],
  },
  surfaces: { wall: 'pierre', ceiling: 'uni', floor: 'sable', trims: true },
  fog: { color: '#0e4a5e', near: 2, far: 18 },
  lighting: { hemiSky: '#8ae0f0', hemiGround: '#103a40', hemiIntensity: 1.4, artGlow: 0, flicker: 0 },
  visitor: { speed: 0.55 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 1.2, pool: { colonne: 1.5, statue: 1, plante: 0.6 }, lightShafts: 2, dust: 0.9, particles: 'bulles' }),
  sound: sound({ roomTone: 0.6, water: 0.9, reverb: 0.9 }),
  art: { density: 0.7, frames: 'classique', frameTint: '#5a8a7a' },
};
