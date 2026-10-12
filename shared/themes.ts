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
  q: string;
  match: RegExp;
  types?: ArtType[];
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
];

export const THEMES_BY_ID: Record<string, ArtTheme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/** L'œuvre correspond-elle au thème (titre et étiquettes) ? */
export function matchesTheme(art: Artwork, theme: ArtTheme): boolean {
  return theme.match.test(art.title) || art.tags.some((t) => theme.match.test(t));
}
