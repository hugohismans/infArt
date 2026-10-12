import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Bibliothèque infinie : rayonnages jusqu'au plafond, échelles, couvertures de livres et gravures. */
export const bibliotheque: AmbiancePreset = {
  id: 'bibliotheque',
  name: 'Bibliothèque infinie',
  rarity: 'rare',
  tension: 0.3,
  affinities: { 'beaux-arts': 1.4, baroque: 1.2, 'musee-nuit': 1 },
  geometry: { ceilingHeight: 5.6, corridorWidth: 4.6 },
  palette: {
    background: '#140c06',
    wall: '#ffffff',
    wallShade: '#6a5a4a',
    ceiling: '#4a3220',
    skirting: '#3a2414',
    floor: '#5a3820',
    floorAlt: '#46281a',
    lightStrip: '#ffe2b0',
    frame: ['#4a3320'],
  },
  surfaces: { wall: 'rayonnages', ceiling: 'uni', floor: 'parquet', trims: true },
  fog: { color: '#1e140c', near: 6, far: 28 },
  lighting: { hemiSky: '#ffd9a0', hemiGround: '#3a2414', hemiIntensity: 1.7, artGlow: 0.35, flicker: 0 },
  furniture: { small: 'banc', large: 'banc' },
  decor: decor({ density: 1.4, pool: { echelle: 2, etagere: 1.2, chaise: 0.6 }, dust: 0.55 }),
  sound: sound({ roomTone: 0.6, distantSteps: 0.25, reverb: 0.3 }),
  art: { density: 0.55, frames: 'classique', prefer: ['couverture-livre', 'estampe', 'dessin'] },
};
