import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Bureaux vides la nuit : faux plafond, moquette grise, open space désert, œuvres sur les cloisons. */
export const bureaux: AmbiancePreset = {
  id: 'bureaux-nuit',
  rarity: 'commune',
  tension: 0.65,
  zoneLength: [3, 8],
  affinities: { 'back-rooms': 1.4, 'white-cube': 1.1, videoclub: 1 },
  geometry: { ceilingHeight: 2.8, corridorWidth: 4.6 },
  palette: {
    background: '#0c0e12',
    wall: '#c8cac4',
    wallShade: '#7a7e78',
    ceiling: '#d8d8d2',
    skirting: '#5a5e5a',
    floor: '#5a5e64',
    floorAlt: '#484c52',
    lightStrip: '#e2ecff',
    frame: ['#2a2a2a', '#d8d8d8'],
  },
  surfaces: { wall: 'uni', ceiling: 'dalles', floor: 'moquette', trims: false },
  fog: { color: '#14171c', near: 4, far: 24 },
  lighting: { hemiSky: '#c8d8ff', hemiGround: '#2a2e36', hemiIntensity: 1, artGlow: 0, flicker: 0.012 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 1.6, pool: { bureau: 3, chaise: 0.8, cartons: 0.6, poubelle: 1, plante: 0.5, extincteur: 0.6 }, exitSigns: 0.4, dust: 0.15 }),
  sound: sound({ roomTone: 0.4, hvac: 0.9, hum: 0.12, reverb: 0.2 }),
  art: { density: 0.5, frames: 'bon-marche' },
  modules: { 'room-l': 1.8, 'room-s': 1.3, cross: 1.4 },
};
