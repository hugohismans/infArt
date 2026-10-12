import type { AmbiancePreset } from '../types';
import { decor, sound } from './defaults';

/** Vidéoclub années 90 : moquette, néons, rayonnages de cassettes, affiches en caissons lumineux. */
export const videoclub: AmbiancePreset = {
  id: 'videoclub',
  name: 'Vidéoclub',
  rarity: 'rare',
  tension: 0.45,
  affinities: { 'back-rooms': 1.2, 'bureaux-nuit': 1.2, 'white-cube': 0.8 },
  zoneLength: [3, 7],
  geometry: { ceilingHeight: 2.9, corridorWidth: 4.2 },
  palette: {
    background: '#07060c',
    wall: '#5e5880',
    wallShade: '#1e1a2c',
    ceiling: '#2a2836',
    skirting: '#101018',
    floor: '#3a3f86',
    floorAlt: '#5a1f4a',
    lightStrip: '#ff4fd8',
    frame: ['#111111'],
  },
  surfaces: { wall: 'uni', ceiling: 'dalles', floor: 'moquette', trims: false },
  fog: { color: '#0c0a16', near: 3, far: 22 },
  lighting: { hemiSky: '#b09aff', hemiGround: '#3a1a40', hemiIntensity: 1.8, artGlow: 0, flicker: 0.005 },
  furniture: { small: 'aucun', large: 'aucun' },
  decor: decor({ density: 1.6, pool: { 'presentoir-vhs': 3, cartons: 0.4, poubelle: 0.4 }, exitSigns: 0.3, dust: 0.1 }),
  sound: sound({ roomTone: 0.3, hum: 0.35, hvac: 0.3, reverb: 0.1 }),
  art: { density: 0.9, frames: 'moderne', prefer: ['affiche-film', 'affiche', 'jaquette-jeu'], mount: 'caisson' },
  modules: { 'straight-m': 1.4, 'room-s': 1.2 },
};
