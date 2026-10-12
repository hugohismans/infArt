import { aic } from './aic';
import { cleveland } from './cleveland';
import { europeana } from './europeana';
import { harvard } from './harvard';
import { igdb } from './igdb';
import { met } from './met';
import { musicbrainz } from './musicbrainz';
import { openlibrary } from './openlibrary';
import { smithsonian } from './smithsonian';
import { smk } from './smk';
import { tmdb } from './tmdb';
import type { SourceAdapter } from './types';
import { vam } from './vam';
import { wikidata } from './wikidata';

/** Registre des sources. Ajouter une source = ajouter un adaptateur ici. */
export const ADAPTERS: SourceAdapter[] = [
  // Musées et patrimoine
  aic, cleveland, met, smk, vam, wikidata, europeana, harvard, smithsonian,
  // Culture populaire
  tmdb, igdb, musicbrainz, openlibrary,
];

export const ADAPTERS_BY_ID: Record<string, SourceAdapter> = Object.fromEntries(ADAPTERS.map((a) => [a.id, a]));

/** Sources utilisables sans Worker : API et images en CORS, sans clé. */
export const DIRECT_ADAPTERS = ADAPTERS.filter((a) => a.dataCors && a.imageCors && !a.keys?.length);

export { hasKeys } from './types';
export type { SourceAdapter, FetchJson, Keys } from './types';
