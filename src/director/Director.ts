import { blendPresets } from '../ambiances/blend';
import type { AmbiancePreset, Rarity } from '../ambiances/types';
import { CONFIG } from '../config';
import { Rng } from '../world/random';

/**
 * Le Directeur : il décide de ce qui vient ensuite. Il ne tire pas au hasard pur,
 * il orchestre la surprise.
 *
 * - Le musée est découpé en zones (une ambiance, une durée de 3 à 15 modules).
 * - Une courbe de tension monte et redescend : on alterne calme et étrangeté.
 * - Rareté, affinités entre ambiances et historique pondèrent les choix.
 * - Les premiers modules sont toujours un musée classique rassurant.
 * - Un embranchement peut mener à une autre zone que le couloir principal.
 *
 * Le graphe de modules n'ayant pas de plan global, chaque module porte son propre
 * état de zone, hérité de son parent : deux branches peuvent diverger.
 */
export type TransitionKind = 'depart' | 'progressive' | 'seuil' | 'rupture';

export interface Zone {
  id: number;
  ambiance: AmbiancePreset;
  /** Ambiance d'où l'on vient (transitions progressives). */
  from: AmbiancePreset | null;
  transition: TransitionKind;
  /** Durée de la zone, en modules. */
  length: number;
  /** Nombre de modules d'interpolation (transition progressive). */
  blendSteps: number;
  /** Tension visée au moment où la zone a été choisie. */
  tension: number;
}

export interface ZoneState {
  zone: Zone;
  /** Rang du module dans la zone (0 = premier module). */
  step: number;
}

const RARITY_WEIGHT: Record<Rarity, number> = { commune: 1, rare: 0.35, 'tres-rare': 0.1 };

export class Director {
  private zoneCount = 0;
  /** Dernières ambiances choisies (pour éviter les répétitions). */
  private history: string[] = [];
  private readonly blends = new Map<string, AmbiancePreset>();
  private readonly phase: number;

  constructor(
    private readonly seed: string,
    private readonly ambiances: Record<string, AmbiancePreset>,
    private readonly start: AmbiancePreset,
  ) {
    this.phase = new Rng(seed, 'tension').range(0, Math.PI * 2);
  }

  /** Zone de départ : musée classique, assez longue pour que la dérive soit sentie. */
  initial(): ZoneState {
    const rng = new Rng(this.seed, 'depart');
    const d = CONFIG.director;
    const zone: Zone = {
      id: this.zoneCount++,
      ambiance: this.start,
      from: null,
      transition: 'depart',
      length: rng.int(d.firstZoneLength[0], d.firstZoneLength[1]),
      blendSteps: 0,
      tension: 0,
    };
    this.history.push(this.start.id);
    return { zone, step: 0 };
  }

  /**
   * État de zone d'un nouveau module raccordé à `parent`.
   * @param key identifiant stable du raccord (graine du tirage)
   * @param branch le raccord est une sortie latérale d'un embranchement
   */
  next(parent: ZoneState, key: string, branch: boolean): ZoneState {
    const rng = new Rng(this.seed, 'directeur', key);
    const z = parent.zone;
    const ended = parent.step + 1 >= z.length;
    // Une branche latérale peut partir ailleurs, sauf au départ ou en pleine transition.
    const settled = z.transition === 'depart' ? false : parent.step >= z.blendSteps;
    const branchOff = branch && settled && rng.chance(CONFIG.director.branchNewZone);
    if (!ended && !branchOff) return { zone: z, step: parent.step + 1 };
    return { zone: this.newZone(z, rng), step: 0 };
  }

  /** Ambiance effective d'un module (intermédiaire pendant une transition progressive). */
  presetFor(state: ZoneState): AmbiancePreset {
    const z = state.zone;
    if (z.transition !== 'progressive' || !z.from || state.step >= z.blendSteps) return z.ambiance;
    const t = (state.step + 1) / (z.blendSteps + 1);
    const key = `${z.from.id}>${z.ambiance.id}@${t.toFixed(2)}`;
    let p = this.blends.get(key);
    if (!p) {
      p = blendPresets(z.from, z.ambiance, t);
      this.blends.set(key, p);
    }
    return p;
  }

  /** Tension visée pour la n-ième zone : une houle lente, un peu bruitée. */
  private targetTension(index: number, rng: Rng): number {
    // Centrée vers le calme : les pics d'étrangeté restent des moments.
    const wave = 0.35 + 0.35 * Math.sin(index * 0.85 + this.phase);
    return Math.min(1, Math.max(0, wave + rng.range(-0.15, 0.15)));
  }

  private newZone(prev: Zone, rng: Rng): Zone {
    const d = CONFIG.director;
    const index = this.zoneCount++;
    const target = this.targetTension(index, rng);
    const recent = this.history.slice(-2);

    const weights: Record<string, number> = {};
    for (const a of Object.values(this.ambiances)) {
      if (a.id === prev.ambiance.id) continue;
      const affinity = prev.ambiance.affinities?.[a.id] ?? 1;
      const fit = Math.exp(-((a.tension - target) ** 2) / 0.12);
      const repeat = recent.includes(a.id) ? 0.35 : 1;
      weights[a.id] = RARITY_WEIGHT[a.rarity] * affinity * fit * repeat;
    }
    const id = Object.keys(weights).length > 0 ? rng.weighted(weights) : prev.ambiance.id;
    const ambiance = this.ambiances[id]!;
    this.history.push(id);
    if (this.history.length > 8) this.history.shift();

    // Plus le saut de tension est grand, plus la rupture est probable.
    const jump = Math.abs(ambiance.tension - prev.ambiance.tension);
    const transition = rng.weighted({
      progressive: d.transitionWeights.progressive,
      seuil: d.transitionWeights.seuil,
      rupture: d.transitionWeights.rupture * (jump > 0.5 ? 2 : 0.5),
    }) as TransitionKind;
    const [minLen, maxLen] = ambiance.zoneLength ?? d.zoneLength;
    const length = rng.int(minLen, maxLen);
    const blendSteps = transition === 'progressive' ? Math.min(length - 1, rng.int(d.blendSteps[0], d.blendSteps[1])) : 0;
    return { id: index, ambiance, from: prev.ambiance, transition, length, blendSteps, tension: target };
  }
}
