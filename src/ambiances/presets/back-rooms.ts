import type { AmbiancePreset } from '../types';

/**
 * Back rooms : moquette humide jaunâtre, papier peint jaune, néons qui grésillent,
 * plafond bas, couloirs trop longs et répétitifs, presque aucune œuvre.
 * Zone liminale : aucun nom n'est affiché.
 */
export const backRooms: AmbiancePreset = {
  id: 'back-rooms',
  rarity: 'rare',
  tension: 0.85,
  // On s'y perd un moment, puis on en ressort : des zones courtes.
  zoneLength: [3, 6],
  affinities: { 'white-cube': 1.2, 'beaux-arts': 0.9, serre: 0.8 },
  geometry: { ceilingHeight: 2.75, corridorWidth: 3.8 },
  palette: {
    background: '#1c190f',
    wall: '#c9b770',
    wallShade: '#8a7a3c',
    ceiling: '#d8d1b2',
    skirting: '#7d6e3a',
    floor: '#8f7f4a',
    floorAlt: '#7a6b3a',
    lightStrip: '#fbffe8',
    frame: ['#3a2f1c', '#1c1914'],
  },
  surfaces: { wall: 'papier-peint', ceiling: 'dalles', floor: 'moquette', trims: false },
  fog: { color: '#2a2614', near: 4, far: 26 },
  lighting: {
    hemiSky: '#fff6c8',
    hemiGround: '#7c6f3c',
    hemiIntensity: 1.9,
    artGlow: 0,
    flicker: 0.04,
  },
  furniture: { small: 'aucun', large: 'aucun' },
  art: { density: 0.12, frames: 'bon-marche' },
  modules: {
    'straight-l': 3,
    'straight-m': 1.5,
    tee: 1.8,
    'tee-left': 1.5,
    'tee-right': 1.5,
    cross: 2,
    'room-s': 0.6,
    'room-s-side': 0.8,
    'room-l': 0.5,
    'stairs-up': 0.2,
    'stairs-down': 0.2,
    deadend: 1.8,
  },
};
