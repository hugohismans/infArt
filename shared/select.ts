import type { ArtType, Artwork } from './artwork';
import type { FetchJson, SourceAdapter } from './adapters/types';
import { Rng } from './random';
import { matchesTheme, type ArtTheme } from './themes';

/** Part de chaque type dans le mode « mélange » (phase 2 : œuvres murales uniquement). */
export const DEFAULT_TYPE_WEIGHTS: Partial<Record<ArtType, number>> = {
  peinture: 0.5,
  estampe: 0.22,
  dessin: 0.16,
  photographie: 0.12,
};

export interface GatherOptions {
  adapters: SourceAdapter[];
  fetchJson: FetchJson;
  /** Graine de la visite + numéro de lot : le tirage est reproductible. */
  seed: string;
  batch: number;
  count: number;
  types?: ArtType[];
  /** Nombre de requêtes (source × type) par lot : plus = plus de variété. */
  requests?: number;
  /** Aile thématique : œuvres dont le titre correspond au thème. */
  theme?: ArtTheme;
}

export interface GatherResult {
  artworks: Artwork[];
  /** Erreurs par source (une source en panne n'empêche pas les autres). */
  errors: string[];
}

/** Tire un lot d'œuvres en combinant plusieurs sources et types. */
export async function gatherArtworks(opts: GatherOptions): Promise<GatherResult> {
  const theme = opts.theme;
  const rng = new Rng(opts.seed, 'batch', opts.batch, ...(theme ? [theme.id] : []));
  const types = opts.types && opts.types.length > 0 ? opts.types : theme?.types;
  const allowed = types && types.length > 0 ? types : (Object.keys(DEFAULT_TYPE_WEIGHTS) as ArtType[]);
  const weights: Partial<Record<ArtType, number>> = {};
  for (const t of allowed) {
    if (opts.adapters.some((a) => a.types.includes(t))) weights[t] = DEFAULT_TYPE_WEIGHTS[t] ?? 0.1;
  }
  if (Object.keys(weights).length === 0) return { artworks: [], errors: ['aucune source pour ces types'] };

  // Un thème est plus rare : on interroge davantage de sources à la fois.
  const nReq = opts.requests ?? (theme ? 4 : 3);
  const per = Math.ceil(opts.count / nReq) + 2;
  const jobs: Array<{ adapter: SourceAdapter; type: ArtType }> = [];
  for (let i = 0; i < nReq; i++) {
    const type = rng.weighted(weights as Record<ArtType, number>);
    const candidates = opts.adapters.filter((a) => a.types.includes(type));
    const adapter = candidates.length === 1 ? candidates[0]! : candidates[pickWeighted(rng, candidates.map((c) => c.weight))]!;
    jobs.push({ adapter, type });
  }

  const results = await Promise.allSettled(
    jobs.map((j, i) => j.adapter.fetchBatch({ fetchJson: opts.fetchJson, rng: new Rng(opts.seed, opts.batch, i, j.adapter.id, j.type, ...(theme ? [theme.id] : [])), count: per, type: j.type, ...(theme ? { theme } : {}) })),
  );
  const errors: string[] = [];
  const seen = new Set<string>();
  const artworks: Artwork[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      errors.push(`${jobs[i]!.adapter.id}/${jobs[i]!.type}: ${String((r.reason as Error)?.message ?? r.reason)}`);
      return;
    }
    for (const a of r.value) {
      if (!seen.has(a.id) && a.imageUrl && (!theme || matchesTheme(a, theme))) {
        seen.add(a.id);
        artworks.push(a);
      }
    }
  });
  return { artworks: rng.shuffle(artworks).slice(0, opts.count), errors };
}

function pickWeighted(rng: Rng, weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}
