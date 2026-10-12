import type { Artwork } from './artwork';

/**
 * Filtre de contenu (désactivable dans les réglages), fondé sur les métadonnées.
 * Il vise la nudité explicite et la violence graphique, pas les nus académiques
 * qui peuplent tous les musées. Approche par mots-clés, donc imparfaite.
 */
const SENSITIVE = [
  // Sexualité explicite
  'erotic', 'érotique', 'erotisk', 'erotik', 'pornograph', 'shunga', 'sexual', 'sexuel', 'intercourse',
  'coitus', 'copulat', 'genital', 'phallus', 'phallic', 'orgy', 'orgie',
  // Violence graphique
  'torture', 'beheading', 'decapitat', 'décapit', 'execution', 'exécution', 'massacre', 'atrocit',
  'corpse', 'cadaver', 'cadavre', 'lig ', 'dissection', 'autopsy', 'mutilat', 'lynching', 'lynchage',
  'hanged man', 'pendu', 'war dead', 'dead soldier', 'gore', 'suicide',
];

export function isSensitive(art: Artwork): boolean {
  const text = `${art.title} ${art.tags.join(' ')} ${art.description ?? ''}`.toLowerCase();
  return SENSITIVE.some((k) => text.includes(k));
}
