import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Ruines antiques : murs de pierre sans toit, colonnes brisées, lierre, ciel ouvert. */
export const ruines: AmbiancePreset = {
  id: 'ruines',
  name: 'Ruines antiques',
  rarity: 'rare',
  tension: 0.35,
  affinities: { serre: 1.5, desert: 1.3, vaporwave: 1, englouti: 0.8 },
  geometry: { ceilingHeight: 3.4, corridorWidth: 5 },
  palette: {
    background: '#dce6ee',
    wall: '#e8dcc4',
    wallShade: '#8a7c62',
    ceiling: '#e8dcc4',
    skirting: '#a89878',
    floor: '#6a8a4a',
    floorAlt: '#86a060',
    lightStrip: '#ffffff',
    frame: ['#8c6a24', '#4a3320'],
  },
  surfaces: { wall: 'pierre', ceiling: 'ciel', floor: 'herbe', trims: false },
  sky: { top: '#5a96d6', horizon: '#dce6ee' },
  fog: { color: '#dce6ee', near: 8, far: 34 },
  lighting: { hemiSky: '#fff6e0', hemiGround: '#6a7a4a', hemiIntensity: 2.2, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 2, pool: { colonne: 3, statue: 1.5, lierre: 2, plante: 0.4 }, leaves: 6, dust: 0.2 }),
  sound: sound({ birds: 0.6, wind: 0.35, reverb: 0.1 }),
  art: { density: 0.6, frames: 'classique', prefer: ['peinture'] },
  modules: { 'stairs-up': 0, 'stairs-down': 0, 'room-l': 1.5 },
};
