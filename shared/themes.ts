import type { ArtType, Artwork } from './artwork';

/**
 * Thèmes d'œuvres : le Directeur ouvre parfois une « aile » où les œuvres
 * suivent un sujet (les chats, la mer…), annoncée à l'entrée.
 *
 * `q` est cherché dans les titres (en anglais : toutes les sources l'indexent) ;
 * `match` vérifie ensuite la pertinence sur le titre et les étiquettes,
 * car certaines recherches restent floues.
 */
export interface ArtTheme {
  id: string;
  /** Titre annoncé. */
  title: string;
  /** Mot-clé cherché dans les titres ('' : pas de recherche, seulement types et années). */
  q: string;
  match: RegExp;
  types?: ArtType[];
  /** Période (années incluses) : les sources qui savent filtrer par date l'appliquent. */
  years?: [number, number];
  /** Thème « autour d'un artiste » : seules les sources qui savent chercher par auteur répondent. */
  creator?: string;
  /** Thème « dans la lignée de » : œuvres apparentées selon la source (films recommandés, jeux similaires). */
  like?: { source: string; id: string };
}

export const THEMES: ArtTheme[] = [
  { id: 'portraits', title: 'Les portraits', q: 'portrait', match: /portrait|portræt|bildnis/i },
  { id: 'autoportraits', title: 'Autoportraits', q: 'self-portrait', match: /self[- ]?portrait|selvportræt|autoportrait/i },
  { id: 'mer', title: 'La mer', q: 'sea', match: /\b(sea|seas|seascape|ocean|marine|surf|waves?|coast|shore|beach|havet|kyst|strand)\b/i },
  { id: 'chats', title: 'Les chats', q: 'cat', match: /\b(cats?|kittens?|kat|katten|katte)\b/i },
  { id: 'chiens', title: 'Les chiens', q: 'dog', match: /\b(dogs?|hounds?|pupp(y|ies)|spaniels?|poodles?|terriers?|hund|hunden|hunde)\b/i },
  { id: 'chevaux', title: 'Les chevaux', q: 'horse', match: /\b(horses?|horseman|horsemen|mares?|stallions?|pon(y|ies)|hest|hesten|heste|rytter)\b/i },
  { id: 'fleurs', title: 'Les fleurs', q: 'flowers', match: /\b(flowers?|bouquets?|roses|tulips?|peon(y|ies)|lil(y|ies)|irises|blomst|blomster|blomsterne)\b/i },
  { id: 'natures-mortes', title: 'Natures mortes', q: 'still life', match: /still[- ]?life|stilleben|opstilling|nature morte/i },
  { id: 'hiver', title: 'L’hiver', q: 'winter', match: /\b(winter|snow|snowy|frost|skating|sne)|vinter/i },
  { id: 'nuit', title: 'La nuit', q: 'night', match: /\b(night|nocturne|moon|moonlight|moonlit|nat|natten|måne)\b/i },
  { id: 'oiseaux', title: 'Les oiseaux', q: 'bird', match: /\b(birds?|owls?|herons?|parrots?|swans?|ducks?|eagles?|roosters?|peacocks?|sparrows?|crows?|fugl\w*)\b/i },
  { id: 'bateaux', title: 'Les bateaux', q: 'ship', match: /\b(ships?|boats?|sail\w*|vessels?|frigates?|schooners?|skib\w*|båd\w*)/i },
  { id: 'montagnes', title: 'Les montagnes', q: 'mountain', match: /\b(mountains?|mount|alps|alpine|peaks?|bjerg\w*)\b/i },
  { id: 'foret', title: 'La forêt', q: 'forest', match: /\b(forests?|woods|woodland|trees?|skov\w*|træer)\b/i },
  { id: 'musique', title: 'La musique', q: 'music', match: /\b(music\w*|violin\w*|lutes?|guitar\w*|piano|flutes?|singers?|concert|musik\w*)\b/i },
  { id: 'anges', title: 'Les anges', q: 'angel', match: /\b(angels?|cherubs?|putti|putto|engel|englen|engle)\b/i },
  { id: 'enfance', title: 'L’enfance', q: 'child', match: /\b(child|children|infant|baby|barn|barnet|børn)\b/i },
  { id: 'lecture', title: 'La lecture', q: 'reading', match: /\b(reading|reader|books?|letters?|læs\w*)\b/i },
  // Culture populaire : une décennie, un médium.
  { id: 'cinema-50', title: 'Le cinéma des années 50', q: '', match: /./, types: ['affiche-film'], years: [1950, 1959] },
  { id: 'cinema-70', title: 'Le cinéma des années 70', q: '', match: /./, types: ['affiche-film'], years: [1970, 1979] },
  { id: 'cinema-90', title: 'Le cinéma des années 90', q: '', match: /./, types: ['affiche-film'], years: [1990, 1999] },
  { id: 'jeux-80', title: 'Jeux vidéo des années 80', q: '', match: /./, types: ['jaquette-jeu'], years: [1980, 1989] },
  { id: 'jeux-90', title: 'Jeux vidéo des années 90', q: '', match: /./, types: ['jaquette-jeu'], years: [1990, 1999] },
  { id: 'jeux-2000', title: 'Jeux vidéo des années 2000', q: '', match: /./, types: ['jaquette-jeu'], years: [2000, 2009] },
  { id: 'disques-60', title: 'Les années 60 en musique', q: '', match: /./, types: ['pochette-disque'], years: [1960, 1969] },
  { id: 'disques-80', title: 'Les années 80 en musique', q: '', match: /./, types: ['pochette-disque'], years: [1980, 1989] },
  { id: 'affiches', title: 'Affiches', q: '', match: /./, types: ['affiche'] },
  { id: 'bibliotheque', title: 'La bibliothèque', q: '', match: /./, types: ['couverture-livre'] },
];

export const THEMES_BY_ID: Record<string, ArtTheme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/** L'œuvre correspond-elle au thème (titre et étiquettes, artiste, source) ? */
export function matchesTheme(art: Artwork, theme: ArtTheme): boolean {
  if (theme.years && art.year !== undefined && (art.year < theme.years[0] || art.year > theme.years[1])) return false;
  if (theme.types && !theme.types.includes(art.type)) return false;
  if (theme.like) return art.source === theme.like.source && art.id !== `${theme.like.source}:${theme.like.id}`;
  if (theme.creator) return !!art.creator && norm(art.creator).includes(norm(theme.creator));
  return theme.match.test(art.title) || art.tags.some((t) => theme.match.test(t));
}

// --- Thèmes dynamiques -------------------------------------------------------
// Nés d'une œuvre qui a retenu le visiteur. Leur identifiant décrit le thème en entier
// (le Worker le reconstruit sans table) : `genre~paramètres…`.

const SEP = '~';
/** Types « beaux-arts » : un artiste de musée est cherché dans tous. */
const FINE_ARTS: ArtType[] = ['peinture', 'estampe', 'dessin', 'photographie'];
const DECADE_TYPES: Partial<Record<ArtType, (d: string) => string>> = {
  'affiche-film': (d) => `Le cinéma des années ${d}`,
  'jaquette-jeu': (d) => `Jeux vidéo des années ${d}`,
  'pochette-disque': (d) => `Les années ${d} en musique`,
};
const CREATOR_TITLES: Partial<Record<ArtType, (n: string) => string>> = {
  'pochette-disque': (n) => `Discographie : ${n}`,
  'couverture-livre': (n) => `Les livres de ${n}`,
};
/** Sources qui savent proposer des œuvres apparentées. */
const LIKE_SOURCES: Record<string, ArtType> = { tmdb: 'affiche-film', igdb: 'jaquette-jeu' };

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function short(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Reconstruit un thème (fixe ou dynamique) à partir de son identifiant ; null s'il est invalide. */
export function resolveTheme(id: string): ArtTheme | null {
  if (THEMES_BY_ID[id]) return THEMES_BY_ID[id]!;
  if (id.length > 160) return null;
  const [kind, a, b, c] = id.split(SEP);
  if (kind === 'artiste' && a && b) {
    const type = a as ArtType;
    const types = type === 'peinture' ? FINE_ARTS : [type];
    const title = CREATOR_TITLES[type]?.(b) ?? `Autour de ${b}`;
    return { id, title, q: '', match: /./, types, creator: b };
  }
  if (kind === 'lignee' && a && b && LIKE_SOURCES[a]) {
    return { id, title: `Dans la lignée de « ${c ?? '…'} »`, q: '', match: /./, types: [LIKE_SOURCES[a]], like: { source: a, id: b } };
  }
  if (kind === 'decennie' && a && b) {
    const label = DECADE_TYPES[a as ArtType];
    const y = Number(b);
    if (!label || !Number.isInteger(y) || y % 10 !== 0) return null;
    return { id, title: label(y < 2000 ? String(y % 100).padStart(2, '0') : String(y)), q: '', match: /./, types: [a as ArtType], years: [y, y + 9] };
  }
  return null;
}

/**
 * Thèmes apparentés à une œuvre, avec un poids relatif : le même artiste, des œuvres
 * dans sa lignée (films, jeux), sa décennie (culture populaire), les sujets qu'elle illustre.
 */
export function themesFor(art: Artwork): Array<{ theme: ArtTheme; weight: number }> {
  const out: Array<{ theme: ArtTheme; weight: number }> = [];
  const add = (id: string, weight: number) => {
    const theme = resolveTheme(id);
    if (theme && !out.some((o) => o.theme.id === theme.id)) out.push({ theme, weight });
  };
  const native = art.id.slice(art.source.length + 1);
  if (LIKE_SOURCES[art.source] && native) add(['lignee', art.source, native, short(art.title, 40).replaceAll(SEP, ' ')].join(SEP), 1.6);
  // Artiste : « Claude Monet (French, 1840–1926) » → « Claude Monet » ; « A, B » → « A ».
  const creator = art.creator?.replace(/\s*[([].*$/, '').split(/,\s*/)[0]?.trim();
  const group: ArtType | null = FINE_ARTS.includes(art.type) ? 'peinture' : art.type === 'pochette-disque' || art.type === 'couverture-livre' ? art.type : null;
  if (group && creator && creator.length >= 3 && !/unknown|anonym|anónimo|unidentified|inconnu|ukendt|unbekannt|onbekend|various/i.test(creator)) {
    add(['artiste', group, short(creator, 50).replaceAll(SEP, ' ')].join(SEP), 1.5);
  }
  if (art.year !== undefined && DECADE_TYPES[art.type]) add(['decennie', art.type, String(10 * Math.floor(art.year / 10))].join(SEP), 0.8);
  for (const t of THEMES) if (t.q && matchesTheme(art, t)) add(t.id, 1);
  return out;
}
