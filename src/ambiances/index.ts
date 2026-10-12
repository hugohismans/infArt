import type { AmbiancePreset } from './types';
import { beauxArts } from './presets/beaux-arts';
import { whiteCube } from './presets/white-cube';
import { backRooms } from './presets/back-rooms';
import { serre } from './presets/serre';

/** Registre des ambiances disponibles : ajouter une ambiance = ajouter un preset ici. */
export const AMBIANCES: Record<string, AmbiancePreset> = Object.fromEntries(
  [beauxArts, whiteCube, backRooms, serre].map((p) => [p.id, p]),
);

/** Ambiance du départ : toujours un musée classique rassurant. */
export const DEFAULT_AMBIANCE = beauxArts;

export { blendPresets } from './blend';
export type { AmbiancePreset } from './types';
