import type { AmbiancePreset } from '../types';
import { decor, OPEN_AIR_MODULES, sound } from './defaults';

/**
 * La terrasse, au soleil couchant (visite guidée) : des dalles de pierre bordées d'une
 * balustrade, au-dessus de la mer ; le soleil se couche droit devant. Jamais tirée au sort :
 * le Conservateur y conduit le visiteur pour son bouquet final.
 */
export const couchant: AmbiancePreset = {
  id: 'couchant',
  name: 'La terrasse',
  rarity: 'tres-rare',
  scripted: true,
  tension: 0.05,
  zoneLength: [40, 40],
  geometry: { ceilingHeight: 8, corridorWidth: 7 },
  palette: {
    background: '#f39a5a',
    wall: '#f39a5a',
    wallShade: '#f39a5a',
    ceiling: '#f39a5a',
    skirting: '#f39a5a',
    floor: '#d9c4a6',
    floorAlt: '#c8ae8c',
    lightStrip: '#ffffff',
    frame: ['#6a4a2a'],
  },
  surfaces: { wall: 'brume', ceiling: 'ciel', floor: 'marbre', trims: false },
  ground: false,
  sky: {
    top: '#2b2452',
    horizon: '#f6a05a',
    sea: { horizon: '#e08a62', deep: '#1b2140' },
    sun: { color: '#ffb05a', elevation: 3 },
  },
  fog: { color: '#f39a5a', near: 22, far: 55 },
  lighting: { hemiSky: '#ffc690', hemiGround: '#6a4a68', hemiIntensity: 1.8, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ boundary: 'balustrade', density: 0, dust: 0 }),
  sound: sound({ wind: 0.3, water: 0.35, reverb: 0.03 }),
  art: { density: 0, frames: 'classique' },
  modules: { ...OPEN_AIR_MODULES, 'straight-s': 0.5, 'room-l': 2, 'room-s': 1.5 },
};
