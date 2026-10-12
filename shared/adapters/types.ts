import type { ArtType, Artwork } from '../artwork';
import type { Rng } from '../random';
import type { ArtTheme } from '../themes';

/**
 * Récupère du JSON. Côté Worker : avec cache (Cache API) et en-têtes ;
 * côté navigateur (mode direct) : simple fetch, les en-têtes non standards étant ignorés
 * pour éviter les requêtes de pré-vérification CORS.
 */
export type FetchJson = (
  url: string,
  opts?: {
    ttl?: number;
    headers?: Record<string, string>;
    /** Requête POST (IGDB) : le corps fait partie de la clé de cache. */
    body?: string;
    /** Ne pas mettre en cache (jeton d'authentification…). */
    noCache?: boolean;
  },
) => Promise<unknown>;

/** Clés d'API (secrets du Worker). Jamais côté navigateur. */
export type Keys = Readonly<Record<string, string | undefined>>;

export interface BatchRequest {
  fetchJson: FetchJson;
  rng: Rng;
  count: number;
  type: ArtType;
  /** Aile thématique : recherche par mot-clé dans les titres. */
  theme?: ArtTheme;
  /** Secrets disponibles (Worker uniquement). */
  keys?: Keys;
}

export interface SourceAdapter {
  id: string;
  /** Nom affiché (cartel, fiche). */
  name: string;
  homepage: string;
  /** L'API répond avec des en-têtes CORS (utilisable depuis le navigateur). */
  dataCors: boolean;
  /** Les images ont des en-têtes CORS (utilisables comme textures sans proxy). */
  imageCors: boolean;
  /** Secrets nécessaires (noms des variables du Worker) ; la source est inactive sans eux. */
  keys?: string[];
  /** Types fournis par la source. */
  types: ArtType[];
  /** Poids relatif dans le mélange. */
  weight: number;
  /** Sait chercher les œuvres d'un artiste (thèmes « autour de… »). */
  byCreator?: boolean;
  /** Source mise de côté (raison) : hors du mélange par défaut, interrogeable avec `sources=`. */
  paused?: string;
  /** Tire `count` œuvres d'un type donné, de façon déterminée par `rng`. */
  fetchBatch(req: BatchRequest): Promise<Artwork[]>;
  /** URL d'image pour une largeur souhaitée (sources IIIF) ; sinon on garde imageUrl. */
  imageForWidth?(art: Artwork, width: number): string;
}

/** Entier aléatoire aligné sur une taille de page, pour que les pages soient mises en cache. */
export function randomPageStart(rng: Rng, total: number, pageSize: number, maxStart = Infinity): number {
  const pages = Math.max(1, Math.floor((Math.min(total, maxStart) - 1) / pageSize) + 1);
  return rng.int(0, pages - 1) * pageSize;
}

/** Tire `n` éléments distincts d'une liste. */
export function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  return rng.shuffle(items).slice(0, n);
}

/** La source est-elle utilisable avec ces secrets ? */
export function hasKeys(adapter: SourceAdapter, keys: Keys | undefined): boolean {
  return (adapter.keys ?? []).every((k) => !!keys?.[k]);
}
