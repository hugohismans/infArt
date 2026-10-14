import { writeJson } from '../progress/storage';
import { FRESH, type Memory } from './memory';

/**
 * TESTS SEULEMENT (à retirer, comme DevReset) : `?essai=<id>` remplace la mémoire du
 * narrateur par l'état juste avant une histoire (ou une de ses étapes), et avance l'horloge
 * de la visite pour qu'elle démarre tout de suite. Le paramètre est retiré de l'adresse :
 * une actualisation de la page, c'est la visite suivante.
 * (La collection et les succès ne sont pas touchés.)
 * `visits` : visites déjà faites (celle qui commence s'y ajoute).
 */
interface Essai {
  memory: Partial<Memory>;
  /** Temps de visite au départ (s). */
  time?: number;
}

const DAY = 86400000;

/** Première visite jouée jusqu'au bout : mer prise, visite guidée finie. */
function apresGuide(over: Partial<Memory>): Partial<Memory> {
  const now = Date.now();
  return {
    heard: ['A01', 'A02', 'B01', 'J01', 'J04', 'J09', 'J16', 'J18', 'J20'],
    sea: 'pris',
    firstVisit: now - 3 * DAY,
    lastVisit: now - DAY,
    visits: 1,
    device: null,
    guide: { stage: 'fin', round: 3, obeyed: 2, choices: [true, true, false], visit: 1 },
    ...over,
  };
}

/** Atelier, récréation et sortie terminés (histoire 3 et suivantes). */
const SAISON2 = {
  atelier: { stage: 'fin', signs: 3, ignored: 0, result: 'reste', canvas: true },
  recre: { stage: 'fin', fails: 1, won: 'honnete', visit: 3 },
  sortie: { stage: 'fin', step: 3, small: 0, result: 'retour' },
} as const;

/** Toutes les histoires 1 à 3 finies. */
const HISTOIRES_1_3 = { ...SAISON2, autre: { stage: 'fin', traces: 4, signs: 3, ignored: 0, result: 'vu' } } as const;

const ESSAIS: Record<string, Essai> = {
  // Acte I et visite guidée.
  premiere: { memory: structuredClone(FRESH) },
  'mer-refusee': { memory: apresGuide({ sea: 'refuse', heard: ['A01', 'A02', 'C01'], guide: { stage: 'attente', round: 0, obeyed: 0, choices: [] } }) },
  guide: { memory: apresGuide({ heard: ['A01', 'A02', 'B01'], guide: { stage: 'attente', round: 0, obeyed: 0, choices: [] } }), time: 40 },
  'guide-quitte': { memory: apresGuide({ guide: { stage: 'noir', round: 3, obeyed: 2, choices: [true, true, false], visit: 1 } }) },
  'mer-retour': { memory: apresGuide({ sea: 'retire', seaRetiredAt: 1, visits: 10, story: 3, ...HISTOIRES_1_3 }) },
  // Histoire 1 : l'atelier.
  atelier: { memory: apresGuide({ story: 1 }), time: 240 },
  'atelier-toile': { memory: apresGuide({ story: 1, atelier: { stage: 'quete', signs: 2, ignored: 0 } }) },
  // La récréation.
  recre: { memory: apresGuide({ visits: 2, story: 2, atelier: SAISON2.atelier }), time: 60 },
  'recre-quitte': { memory: apresGuide({ visits: 2, story: 2, atelier: SAISON2.atelier, recre: { stage: 'jeu', fails: 2, visit: 2 } }) },
  'recre-apres': { memory: apresGuide({ visits: 3, story: 2, atelier: SAISON2.atelier, recre: { stage: 'fin', fails: 1, won: 'honnete', visit: 3 } }) },
  // Histoire 2 : la sortie.
  sortie: { memory: apresGuide({ visits: 3, story: 2, atelier: SAISON2.atelier, recre: SAISON2.recre }), time: 60 },
  'sortie-bout': { memory: apresGuide({ visits: 3, story: 2, atelier: SAISON2.atelier, recre: SAISON2.recre, sortie: { stage: 'chemin', step: 2, small: 0 } }) },
  'sortie-petits': { memory: apresGuide({ visits: 3, story: 2, atelier: SAISON2.atelier, recre: SAISON2.recre, sortie: { stage: 'ignore', step: 0, small: 0 } }) },
  'sortie-quittee': { memory: apresGuide({ visits: 3, story: 2, atelier: SAISON2.atelier, recre: SAISON2.recre, sortie: { stage: 'chemin', step: 1, small: 0, inPath: true } }) },
  // Histoire 3 : l'autre visiteur.
  autre: { memory: apresGuide({ visits: 4, story: 3, ...SAISON2 }), time: 100 },
  'autre-poursuite': { memory: apresGuide({ visits: 4, story: 3, ...SAISON2, autre: { stage: 'traces', traces: 3, signs: 0, ignored: 0 } }), time: 100 },
  // Histoire 4 : les trois portes.
  portes: { memory: apresGuide({ visits: 5, story: 4, ...HISTOIRES_1_3 }), time: 60 },
  'portes-fin': { memory: apresGuide({ visits: 14, story: 4, ...HISTOIRES_1_3, portes: { rounds: 9, him: 5, me: 4, streakHim: 1, streakMe: 0, avoid: 0, lastVisit: 13 } }), time: 60 },
  // Histoire 5 : il se raconte.
  raconte: { memory: apresGuide({ visits: 8, story: 5, ...HISTOIRES_1_3, portes: { rounds: 10, him: 6, me: 4, streakHim: 0, streakMe: 0, avoid: 0, lastVisit: 7, done: true } }), time: 90 },
  'raconte-question': {
    memory: apresGuide({ visits: 18, story: 5, ...HISTOIRES_1_3, portes: { rounds: 10, him: 6, me: 4, streakHim: 0, streakMe: 0, avoid: 0, lastVisit: 7, done: true }, raconte: { next: 10, lastVisit: 17 } }),
    time: 90,
  },
  'raconte-fin': {
    memory: apresGuide({ visits: 32, story: 5, ...HISTOIRES_1_3, portes: { rounds: 10, him: 6, me: 4, streakHim: 0, streakMe: 0, avoid: 0, lastVisit: 7, done: true }, raconte: { next: 24, lastVisit: 31, choice: 'continuez' } }),
    time: 90,
  },
  'silence-retour': {
    memory: apresGuide({ visits: 19, story: 5, ...HISTOIRES_1_3, portes: { rounds: 10, him: 6, me: 4, streakHim: 0, streakMe: 0, avoid: 0, lastVisit: 7, done: true }, raconte: { next: 11, lastVisit: 18, choice: 'silence', silenceVisit: 19 } }),
  },
  // Finale.
  finale: {
    memory: apresGuide({ visits: 33, story: 6, ...HISTOIRES_1_3, portes: { rounds: 10, him: 6, me: 4, streakHim: 0, streakMe: 0, avoid: 0, lastVisit: 7, done: true }, raconte: { next: 25, lastVisit: 32, choice: 'continuez', done: true } }),
  },
  'apres-finale': {
    memory: apresGuide({ visits: 34, story: 6, finaleDone: true, ...HISTOIRES_1_3, portes: { rounds: 10, him: 6, me: 4, streakHim: 0, streakMe: 0, avoid: 0, lastVisit: 7, done: true }, raconte: { next: 25, lastVisit: 32, choice: 'continuez', done: true } }),
    time: 60,
  },
};

/** Applique `?essai=<id>` s'il y en a un ; renvoie le temps de visite de départ. */
export function applyEssai(key: string): number {
  const url = new URL(window.location.href);
  const id = url.searchParams.get('essai');
  if (!id) return 0;
  url.searchParams.delete('essai');
  history.replaceState(history.state, '', url);
  const essai = ESSAIS[id];
  if (!essai) {
    console.warn(`Essai inconnu : ${id}`);
    return 0;
  }
  writeJson(key, essai.memory);
  console.info(`Essai « ${id} » chargé.`);
  return essai.time ?? 0;
}
