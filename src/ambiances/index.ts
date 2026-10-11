import type { AmbiancePreset } from './types';
import { beauxArts } from './presets/beaux-arts';

/** Registre des ambiances disponibles. */
export const AMBIANCES: Record<string, AmbiancePreset> = {
  [beauxArts.id]: beauxArts,
};

export const DEFAULT_AMBIANCE = beauxArts;

export type { AmbiancePreset } from './types';
