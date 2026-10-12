import type { AmbiancePreset, SoundProfile } from '../types';

/** Profil sonore : tout à zéro sauf ce qui est précisé. */
export function sound(p: Partial<SoundProfile>): SoundProfile {
  return { roomTone: 0, hvac: 0, hum: 0, rain: 0, birds: 0, distantSteps: 0, reverb: 0.3, wind: 0, crickets: 0, water: 0, crackle: 0, bleeps: 0, ...p };
}

/** Décors : rien sauf ce qui est précisé. */
export function decor(p: Partial<AmbiancePreset['decor']>): AmbiancePreset['decor'] {
  return { density: 1, pool: {}, ropes: 0, exitSigns: 0, leaves: 0, stains: 0, lightShafts: 0, dust: 0.2, ...p };
}

/** Lieux à ciel ouvert : pas d'escaliers (le sol s'y voit de loin). */
export const OPEN_AIR_MODULES = { 'stairs-up': 0, 'stairs-down': 0 };
