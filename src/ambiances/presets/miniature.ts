import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Échelle déréglée (miniature) : couloirs minuscules, on se baisse, œuvres de timbre-poste. */
export const miniature: AmbiancePreset = {
  id: 'miniature',
  name: 'Échelle déréglée',
  rarity: 'tres-rare',
  tension: 0.65,
  zoneLength: [3, 5],
  affinities: { geant: 1.5, 'beaux-arts': 1.3, 'back-rooms': 1 },
  geometry: { ceilingHeight: 1.45, corridorWidth: 2.2 },
  palette: {
    background: '#1a0c08',
    wall: '#7a1f24',
    wallShade: '#3a0c10',
    ceiling: '#e9e2d4',
    skirting: '#3a2a1c',
    floor: '#7a4e2d',
    floorAlt: '#5c3a22',
    lightStrip: '#fff1cf',
    frame: ['#c49a3e', '#8c6a24'],
  },
  surfaces: { wall: 'uni', ceiling: 'uni', floor: 'parquet', trims: true },
  fog: { color: '#20120c', near: 2, far: 16 },
  lighting: { hemiSky: '#ffe2b0', hemiGround: '#3a2a1a', hemiIntensity: 1.9, artGlow: 0, flicker: 0 },
  visitor: { eyeScale: 0.55, speed: 0.7 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 0, dust: 0.3 }),
  sound: sound({ roomTone: 0.7, reverb: 0.1 }),
  art: { density: 1, frames: 'classique', prefer: ['peinture', 'estampe'], scale: 0.35 },
  modules: { 'stairs-up': 0, 'stairs-down': 0 },
};
