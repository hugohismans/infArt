import { aic } from './aic';
import { cleveland } from './cleveland';
import { met } from './met';
import { smk } from './smk';
import type { SourceAdapter } from './types';

/** Registre des sources. Ajouter une source = ajouter un adaptateur ici. */
export const ADAPTERS: SourceAdapter[] = [aic, cleveland, met, smk];

export const ADAPTERS_BY_ID: Record<string, SourceAdapter> = Object.fromEntries(ADAPTERS.map((a) => [a.id, a]));

/** Sources utilisables sans Worker : API et images en CORS, sans clé. */
export const DIRECT_ADAPTERS = ADAPTERS.filter((a) => a.dataCors && a.imageCors && !a.needsKey);

export type { SourceAdapter, FetchJson } from './types';
