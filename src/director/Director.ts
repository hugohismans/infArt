import type { ArtTheme } from '../../shared/themes';
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
 * - De temps en temps, une aile thématique : quelques modules dont les œuvres
 *   suivent un même sujet (les chats, la mer…), annoncé à l'entrée.
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

/** Aile thématique : indépendante des zones, elle peut traverser une transition. */
export interface Wing {
  id: number;
  theme: ArtTheme;
  /** Modules restants, celui-ci compris. */
  left: number;
}

/**
 * Étrangetés ponctuelles, saupoudrées par le Directeur (plus souvent quand la tension monte).
 * Chacune s'applique à un module ; celui-ci l'ignore si elle ne lui convient pas.
 */
export type Oddity =
  | 'cartel-illisible'
  | 'oeuvre-changeante'
  | 'triple'
  | 'porte-muree'
  | 'veste-cafe'
  | 'salle-vide'
  | 'a-l-envers'
  | 'oeuvre-plafond'
  | 'couloir-boucle';

export interface ZoneState {
  zone: Zone;
  /** Rang du module dans la zone (0 = premier module). */
  step: number;
  wing?: Wing;
  oddity?: Oddity;
}

const RARITY_WEIGHT: Record<Rarity, number> = { commune: 1, rare: 0.35, 'tres-rare': 0.1 };

export class Director {
  /** Essais : impose une étrangeté à chaque module (paramètre d'URL `oddity`). */
  static debugOddity: Oddity | null = null;

  private zoneCount = 0;
  private wingCount = 0;
  /**
   * Base des identifiants de zones et d'ailes : à deux visiteurs, chacun crée les siennes,
   * elles ne doivent pas se confondre.
   */
  private readonly idBase = Math.floor(Math.random() * 2 ** 20) * 1000;
  /** Modules créés depuis la dernière aile thématique, la dernière étrangeté. */
  private sinceWing = 0;
  private sinceOddity = 0;
  /** Fournit un thème prêt (œuvres chargées), ou null. Renseigné par le monde. */
  claimTheme: (() => ArtTheme | null) | null = null;
  /** Multiplicateur de fréquence des ailes (un thème apparenté aux goûts du visiteur est prêt). */
  wingBoost: (() => number) | null = null;
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
      id: this.idBase + this.zoneCount++,
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
   * Zones des sorties de la rotonde de départ : une ambiance différente par porte,
   * toutes distinctes de celle de la rotonde, pour montrer d'emblée qu'il y a des mondes
   * à explorer. Le début de chaque aile reste calme (comme un départ : ni étrangeté ni bifurcation).
   */
  hubExits(count: number): ZoneState[] {
    const rng = new Rng(this.seed, 'rotonde');
    const d = CONFIG.director;
    const pool: Record<string, number> = {};
    for (const a of Object.values(this.ambiances)) {
      if (a.id === this.start.id || a.rarity === 'tres-rare') continue;
      pool[a.id] = RARITY_WEIGHT[a.rarity];
    }
    const out: ZoneState[] = [];
    for (let i = 0; i < count; i++) {
      const id = Object.keys(pool).length > 0 ? rng.weighted(pool) : this.start.id;
      delete pool[id];
      const ambiance = this.ambiances[id] ?? this.start;
      this.history.push(id);
      out.push({
        zone: { id: this.idBase + this.zoneCount++, ambiance, from: this.start, transition: 'depart', length: rng.int(d.hubZoneLength[0], d.hubZoneLength[1]), blendSteps: 0, tension: ambiance.tension },
        step: 0,
      });
    }
    return out;
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
    const state: ZoneState = !ended && !branchOff ? { zone: z, step: parent.step + 1 } : { zone: this.newZone(z, rng), step: 0 };
    const wing = this.nextWing(parent, state, rng);
    if (wing) state.wing = wing;
    const oddity = this.nextOddity(state, rng);
    if (oddity) state.oddity = oddity;
    return state;
  }

  private nextOddity(state: ZoneState, rng: Rng): Oddity | undefined {
    const d = CONFIG.director;
    if (Director.debugOddity) return Director.debugOddity;
    this.sinceOddity++;
    // Jamais pendant la visite rassurante du début.
    if (state.zone.transition === 'depart' || this.sinceOddity < d.oddityGap) return undefined;
    if (!rng.chance(d.oddityChance * (0.4 + state.zone.tension))) return undefined;
    this.sinceOddity = 0;
    return rng.weighted(d.oddities) as Oddity;
  }

  private nextWing(parent: ZoneState, state: ZoneState, rng: Rng): Wing | undefined {
    const d = CONFIG.director;
    this.sinceWing++;
    // Pas d'aile dans une zone presque vide (back rooms) ni pendant le départ.
    if (state.zone.ambiance.art.density < d.wingMinDensity) return undefined;
    const pw = parent.wing;
    if (pw) return pw.left > 1 ? { ...pw, left: pw.left - 1 } : undefined;
    if (state.zone.transition === 'depart' && state.step < 4) return undefined;
    const boost = this.wingBoost?.() ?? 1;
    if (this.sinceWing < d.wingGap / boost || !rng.chance(Math.min(1, d.wingChance * boost))) return undefined;
    const theme = this.claimTheme?.();
    if (!theme) return undefined;
    this.sinceWing = 0;
    return { id: this.idBase + this.wingCount++, theme, left: rng.int(d.wingLength[0], d.wingLength[1]) };
  }

  /** Aile imposée (panneau d'orientation, voix off) : `theme` sur `length` modules. */
  makeWing(theme: ArtTheme, length: number): Wing {
    this.sinceWing = 0;
    return { id: this.idBase + this.wingCount++, theme, left: length };
  }

  /** Ambiance d'après son identifiant, y compris une étape de transition (« a>b@0.25 »). */
  presetByKey(key: string): AmbiancePreset | null {
    const direct = this.ambiances[key];
    if (direct) return direct;
    const m = key.match(/^(.+)>(.+)@([\d.]+)$/);
    const a = m && this.ambiances[m[1]!], b = m && this.ambiances[m[2]!];
    if (!m || !a || !b) return null;
    let p = this.blends.get(key);
    if (!p) {
      p = blendPresets(a, b, Number(m[3]));
      this.blends.set(key, p);
    }
    return p;
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
    const forced = ambiance.transition ?? prev.ambiance.transition;
    const transition = forced ?? rng.weighted({
      progressive: d.transitionWeights.progressive,
      seuil: d.transitionWeights.seuil,
      rupture: d.transitionWeights.rupture * (jump > 0.5 ? 2 : 0.5),
    }) as TransitionKind;
    const [minLen, maxLen] = ambiance.zoneLength ?? d.zoneLength;
    const length = rng.int(minLen, maxLen);
    const blendSteps = transition === 'progressive' ? Math.min(length - 1, rng.int(d.blendSteps[0], d.blendSteps[1])) : 0;
    return { id: this.idBase + index, ambiance, from: prev.ambiance, transition, length, blendSteps, tension: target };
  }
}
