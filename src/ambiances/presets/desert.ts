import type { AmbiancePreset } from '../types';
import { decor, OPEN_AIR_MODULES, sound } from './defaults';

/** Désert : sable à perte de vue, vent ; le « couloir » n'est suggéré que par les œuvres. */
export const desert: AmbiancePreset = {
  id: 'desert',
  name: 'Le désert',
  rarity: 'tres-rare',
  tension: 0.55,
  zoneLength: [4, 8],
  affinities: { serre: 1.2, neant: 1.2, vaporwave: 1 },
  geometry: { ceilingHeight: 8, corridorWidth: 7 },
  palette: {
    background: '#efd2a2',
    wall: '#ead0a4',
    wallShade: '#ead0a4',
    ceiling: '#ead0a4',
    skirting: '#ead0a4',
    floor: '#d9b27a',
    floorAlt: '#c49858',
    lightStrip: '#ffffff',
    frame: ['#6a4a2a'],
  },
  surfaces: { wall: 'brume', ceiling: 'ciel', floor: 'sable', trims: false },
  sky: { top: '#4f86cc', horizon: '#efd2a2' },
  fog: { color: '#ead0a4', near: 5, far: 26 },
  lighting: { hemiSky: '#fff2d6', hemiGround: '#b08850', hemiIntensity: 2.4, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 0, dust: 0.45 }),
  sound: sound({ wind: 1, reverb: 0.05 }),
  art: { density: 0.45, frames: 'classique', mount: 'chevalet' },
  modules: { ...OPEN_AIR_MODULES, 'straight-l': 1.6, 'room-l': 0.6 },
};
