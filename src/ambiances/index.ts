import type { AmbiancePreset } from './types';
import { beauxArts } from './presets/beaux-arts';
import { whiteCube } from './presets/white-cube';
import { backRooms } from './presets/back-rooms';
import { serre } from './presets/serre';
import { baroque } from './presets/baroque';
import { japonaise } from './presets/japonaise';
import { nuit } from './presets/nuit';
import { videoclub } from './presets/videoclub';
import { bibliotheque } from './presets/bibliotheque';
import { poolrooms } from './presets/poolrooms';
import { bureaux } from './presets/bureaux';
import { hopital } from './presets/hopital';
import { parking } from './presets/parking';
import { travaux } from './presets/travaux';
import { givre } from './presets/givre';
import { neant } from './presets/neant';
import { desert } from './presets/desert';
import { foret } from './presets/foret';
import { reve } from './presets/reve';
import { vaporwave } from './presets/vaporwave';

/** Registre des ambiances disponibles : ajouter une ambiance = ajouter un preset ici. */
export const AMBIANCES: Record<string, AmbiancePreset> = Object.fromEntries(
  [
    // Musées « réels »
    beauxArts, whiteCube, baroque, japonaise, nuit,
    // Lieux culturels détournés
    videoclub, bibliotheque,
    // Liminal
    backRooms, poolrooms, bureaux, hopital, parking, travaux,
    // Onirique
    serre, reve, vaporwave, foret, desert,
    // Étrange
    neant, givre,
  ].map((p) => [p.id, p]),
);

/** Ambiance du départ : toujours un musée classique rassurant. */
export const DEFAULT_AMBIANCE = beauxArts;

export { blendPresets } from './blend';
export type { AmbiancePreset } from './types';
