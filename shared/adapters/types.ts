import type { ArtType, Artwork } from '../artwork';
import type { Rng } from '../random';

/**
 * Récupère du JSON. Côté Worker : avec cache (Cache API) et en-têtes ;
 * côté navigateur (mode direct) : simple fetch, les en-têtes non standards étant ignorés
 * pour éviter les requêtes de pré-vérification CORS.
 */
export type FetchJson = (url: string, opts?: { ttl?: number; headers?: Record<string, string> }) => Promise<unknown>;

export interface BatchRequest {
  fetchJson: FetchJson;
  rng: Rng;
  count: number;
  type: ArtType;
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
  /** Une clé d'API est nécessaire (jamais côté client). */
  needsKey: boolean;
  /** Types fournis par la source. */
  types: ArtType[];
  /** Poids relatif dans le mélange. */
  weight: number;
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
