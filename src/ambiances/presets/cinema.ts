import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Cinéma abandonné : fauteuils rouges, une œuvre projetée en grand, poussière dans le faisceau. */
export const cinema: AmbiancePreset = {
  id: 'cinema',
  name: 'Cinéma abandonné',
  rarity: 'tres-rare',
  tension: 0.55,
  zoneLength: [3, 6],
  affinities: { videoclub: 1.5, 'musee-nuit': 1.3, travaux: 1 },
  geometry: { ceilingHeight: 5, corridorWidth: 5 },
  palette: {
    background: '#050304',
    wall: '#4a161c',
    wallShade: '#1a0608',
    ceiling: '#2a1a16',
    skirting: '#1a0c08',
    floor: '#5a1a20',
    floorAlt: '#3a1014',
    lightStrip: '#3a2a20',
    frame: ['#111111'],
  },
  surfaces: { wall: 'damas', ceiling: 'uni', floor: 'moquette', trims: true },
  fog: { color: '#080406', near: 3, far: 22 },
  lighting: { hemiSky: '#a88080', hemiGround: '#2a1010', hemiIntensity: 0.75, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 2.2, pool: { sieges: 4 }, dust: 1 }),
  sound: sound({ roomTone: 0.5, crackle: 0.35, hum: 0.08, reverb: 0.55 }),
  art: { density: 0.3, frames: 'moderne', mount: 'projection', scale: 2.4, prefer: ['affiche-film', 'peinture'] },
  modules: { 'room-l': 3, 'room-s': 2, 'straight-l': 0.4 },
};
