import type { AmbiancePreset } from '../types';
import { sound } from './defaults';

/**
 * La galerie des plâtres (la récréation du Conservateur) : une longue salle blanche sous
 * verrière, où personne ne vient jamais, et des moulages en plâtre qui s'ennuient. Jamais
 * tirée au sort : le Conservateur y conduit le visiteur pour jouer à 1, 2, 3, soleil.
 */
export const platres: AmbiancePreset = {
  id: 'platres',
  name: 'La galerie des plâtres',
  rarity: 'tres-rare',
  scripted: true,
  tension: 0.2,
  zoneLength: [1, 1],
  geometry: { ceilingHeight: 4.6, corridorWidth: 4.4 },
  palette: {
    background: '#ece9e2',
    wall: '#f1eee7',
    wallShade: '#ddd8cd',
    ceiling: '#f6f4ef',
    skirting: '#cfc8ba',
    floor: '#c9c1b2',
    floorAlt: '#b9b09f',
    lightStrip: '#fffaf0',
    frame: ['#d8d2c4'],
  },
  surfaces: { wall: 'uni', ceiling: 'verriere', floor: 'marbre', trims: true },
  fog: { color: '#ece9e2', near: 14, far: 48 },
  lighting: { hemiSky: '#fffdf6', hemiGround: '#cfc6b4', hemiIntensity: 1.9, artGlow: 0, flicker: 0 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: { density: 0, pool: {}, ropes: 0, exitSigns: 0, leaves: 0, stains: 0, lightShafts: 0.6, dust: 0.35 },
  sound: sound({ roomTone: 0.5, hvac: 0.2, reverb: 0.9 }),
  art: { density: 0, frames: 'classique' },
};
