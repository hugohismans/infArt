import { readJson, writeJson } from '../progress/storage';

const KEY = 'galerie-infinie:narrateur';

/**
 * Où en est le visiteur avec la mer : proposée (porte fléchée de la rotonde), prise,
 * refusée une fois (elle sera refléchée plus loin), refléchée, ou retirée pour de bon.
 */
export type SeaState = 'propose' | 'pris' | 'refuse' | 'relance' | 'retire';

/** Histoire 1 : le tableau manquant. */
export interface AtelierState {
  stage: 'attente' | 'appel' | 'quete' | 'atelier' | 'fin';
  /** Panneaux « ATELIER » croisés, et ignorés. */
  signs: number;
  ignored: number;
  result?: 'reste' | 'parti' | 'abandon';
  /** La toile est dans la collection. */
  canvas?: boolean;
}

/** Histoire 2 : la sortie. */
export interface SortieState {
  stage: 'attente' | 'chemin' | 'ignore' | 'fin';
  /** Carrefours « SORTIE » suivis (chemin), petits panneaux ignorés (ignore). */
  step: number;
  small: number;
  result?: 'retour' | 'disparu' | 'renonce' | 'parti';
  /** Le visiteur était sur le chemin de la sortie quand la visite s'est arrêtée. */
  inPath?: boolean;
}

/** Histoire 3 : l'autre visiteur. */
export interface AutreState {
  stage: 'attente' | 'traces' | 'poursuite' | 'fin';
  traces: number;
  signs: number;
  ignored: number;
  result?: 'vu' | 'ignore';
}

/** Histoire 4 : le jeu des trois portes. */
export interface PortesState {
  rounds: number;
  /** Points du Conservateur (porte étoilée prise), du visiteur. */
  him: number;
  me: number;
  streakHim: number;
  streakMe: number;
  /** Manches de suite où l'étoile a été évitée. */
  avoid: number;
  lastVisit: number;
  done?: boolean;
}

/** Histoire 5 : le Conservateur se raconte. */
export interface RaconteState {
  /** Prochain fragment à dire (index dans la suite des fragments). */
  next: number;
  lastVisit: number;
  choice?: 'silence' | 'continuez';
  /** Visite où le visiteur a demandé le silence. */
  silenceVisit?: number;
  done?: boolean;
}

/**
 * La visite guidée (première visite, après la mer) : trois consignes, le noir, la lampe,
 * le bouquet final. Jouée une seule fois.
 */
export interface GuideState {
  stage: 'attente' | 'jeu' | 'noir' | 'bouquet' | 'fin';
  /** Consignes déjà tranchées (0 à 3), et celles respectées. */
  round: number;
  obeyed: number;
  /** Respectée ou non, manche par manche. */
  choices: boolean[];
  /** Le visiteur est parti en plein jeu (il le saura à la visite suivante). */
  left?: boolean;
  /** Visite où le jeu s'est joué. */
  visit?: number;
}

/** La récréation (entre l'atelier et la sortie) : 1, 2, 3, soleil dans la galerie des plâtres. */
export interface RecreState {
  stage: 'attente' | 'invite' | 'jeu' | 'fin';
  /** Retours au début. */
  fails: number;
  won?: 'honnete' | 'triche';
  /** Parti en pleine partie. */
  left?: boolean;
  visit?: number;
}

export interface Memory {
  /** Répliques déjà entendues (chacune n'est jouée qu'une fois, sauf certains retours). */
  heard: string[];
  sea: SeaState;
  /** Visite où la mer a été retirée (elle peut être reproposée 10 visites plus tard). */
  seaRetiredAt?: number;
  /** La mer a d'abord été refusée, puis prise. */
  seaChangedMind?: boolean;
  firstVisit: number | null;
  lastVisit: number | null;
  /** Nombre de visites (celle en cours comprise). */
  visits: number;
  /** Durée de la dernière visite (s), favoris ajoutés pendant, visite à deux. */
  lastDuration: number;
  lastFavsAdded: number;
  lastWasDuo: boolean;
  /** Visites du jour (pour « troisième fois aujourd'hui »). */
  day: { key: string; n: number };
  /** Retours ordinaires : les variantes tournent. */
  returns: number;
  ignoredSigns: number;
  /** Ambiances déjà commentées, et visite de la dernière rencontre. */
  worlds: Record<string, number>;
  /** Distance totale parcourue (m), fiches ouvertes au total. */
  walked: number;
  sheets: number;
  device: 'mobile' | 'pc' | null;
  /** Les histoires, dans l'ordre : 1 atelier, 2 sortie, 3 l'autre, 4 portes, 5 se raconte ; 6 = finale faite. */
  story: number;
  atelier: AtelierState;
  sortie: SortieState;
  autre: AutreState;
  portes: PortesState;
  raconte: RaconteState;
  /** Épilogue d'histoire à dire au début de la visite suivante. */
  epilogue: string[];
  finaleDone: boolean;
  /** Histoires abandonnées (rappel X18). */
  abandoned: number;
  guide: GuideState;
  recre: RecreState;
}

export const FRESH: Memory = {
  heard: [],
  sea: 'propose',
  firstVisit: null,
  lastVisit: null,
  visits: 0,
  lastDuration: 0,
  lastFavsAdded: 0,
  lastWasDuo: false,
  day: { key: '', n: 0 },
  returns: 0,
  ignoredSigns: 0,
  worlds: {},
  walked: 0,
  sheets: 0,
  device: null,
  story: 1,
  atelier: { stage: 'attente', signs: 0, ignored: 0 },
  sortie: { stage: 'attente', step: 0, small: 0 },
  autre: { stage: 'attente', traces: 0, signs: 0, ignored: 0 },
  portes: { rounds: 0, him: 0, me: 0, streakHim: 0, streakMe: 0, avoid: 0, lastVisit: 0 },
  raconte: { next: 0, lastVisit: 0 },
  epilogue: [],
  finaleDone: false,
  abandoned: 0,
  guide: { stage: 'attente', round: 0, obeyed: 0, choices: [] },
  recre: { stage: 'attente', fails: 0 },
};

/** Mémoire du navigateur, complétée des champs ajoutés depuis (anciens visiteurs). */
export function loadMemory(reset: boolean): Memory {
  if (reset) writeJson(KEY, FRESH);
  const raw = readJson<Partial<Memory>>(KEY, {});
  const fresh = structuredClone(FRESH);
  return {
    ...fresh,
    ...raw,
    atelier: { ...fresh.atelier, ...raw.atelier },
    sortie: { ...fresh.sortie, ...raw.sortie },
    autre: { ...fresh.autre, ...raw.autre },
    portes: { ...fresh.portes, ...raw.portes },
    raconte: { ...fresh.raconte, ...raw.raconte },
    guide: { ...fresh.guide, ...raw.guide },
    recre: { ...fresh.recre, ...raw.recre },
    day: { ...fresh.day, ...raw.day },
    worlds: { ...raw.worlds },
    // (Avant la saison 2, les visites n'étaient pas comptées : une visite connue en vaut au moins une.)
    visits: raw.visits ?? (raw.firstVisit ? 1 : 0),
  };
}

export function saveMemory(m: Memory): void {
  writeJson(KEY, m);
}
