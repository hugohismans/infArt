import type { AmbiancePreset } from '../types';

/** Serre / jardin d'hiver : verrière, plantes, carrelage en terre cuite, lumière douce et humide. */
export const serre: AmbiancePreset = {
  id: 'serre',
  name: 'Jardin d’hiver',
  rarity: 'commune',
  tension: 0.1,
  affinities: { 'beaux-arts': 1.3, 'white-cube': 1, 'back-rooms': 0.4 },
  geometry: { ceilingHeight: 5.2, corridorWidth: 5 },
  palette: {
    background: '#c9d6c4',
    wall: '#e3e8d6',
    wallShade: '#9fae92',
    ceiling: '#eef6f2',
    skirting: '#5d6b4f',
    floor: '#b0603e',
    floorAlt: '#93492c',
    lightStrip: '#ffffff',
    frame: ['#e9e6dc', '#6b5a43', '#2f3a2a'],
  },
  surfaces: { wall: 'uni', ceiling: 'verriere', floor: 'carrelage', trims: true },
  fog: { color: '#d3ded0', near: 8, far: 32 },
  lighting: {
    hemiSky: '#f6fff2',
    hemiGround: '#8c7a5c',
    hemiIntensity: 1.9,
    artGlow: 0,
    flicker: 0,
  },
  furniture: { small: 'jardinieres', large: 'jardinieres' },
  art: { density: 0.75, frames: 'classique', prefer: ['peinture', 'dessin'] },
  modules: { 'room-l': 2.2, 'room-s': 1.6, 'room-s-side': 1.4, 'straight-l': 0.7 },
};
