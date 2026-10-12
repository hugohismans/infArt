/**
 * Essai rapide des adaptateurs depuis Node : `npx tsx scripts/try-adapters.ts [source] [type]`
 * (derrière un proxy : NODE_USE_ENV_PROXY=1).
 */
import { ADAPTERS, hasKeys } from '../shared/adapters';
import type { ArtType } from '../shared/artwork';
import { Rng } from '../shared/random';

const [only, onlyType] = process.argv.slice(2);
const fetchJson = async (url: string, opts?: { headers?: Record<string, string>; body?: string }) => {
  const r = await fetch(url, {
    method: opts?.body ? 'POST' : 'GET',
    headers: { 'User-Agent': 'galerie-infinie/0.2 (+https://github.com/hugohismans/infArt)', ...opts?.headers },
    ...(opts?.body ? { body: opts.body } : {}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
};

for (const a of ADAPTERS) {
  if (only && a.id !== only) continue;
  if (!hasKeys(a, process.env)) {
    console.log(`– ${a.id} : clé manquante (${a.keys?.join(', ')})`);
    continue;
  }
  for (const type of a.types as ArtType[]) {
    if (onlyType && type !== onlyType) continue;
    const t0 = Date.now();
    try {
      const arts = await a.fetchBatch({ fetchJson, rng: new Rng('essai', a.id, type, process.env.SEED ?? ''), count: 4, type, keys: process.env });
      console.log(`✓ ${a.id}/${type} : ${arts.length} œuvres en ${Date.now() - t0} ms`);
      for (const x of arts.slice(0, 2)) {
        console.log(`   - ${x.title.slice(0, 60)} | ${x.creator ?? '?'} | ${x.date ?? '?'} (${x.year ?? '?'}) | ${x.dimensions ? `${x.dimensions.w}×${x.dimensions.h} cm` : 'dims ?'} | ar ${x.aspectRatio?.toFixed(2) ?? '?'} | ${x.type}`);
        console.log(`     ${x.imageUrl}`);
      }
    } catch (e) {
      console.log(`✗ ${a.id}/${type} : ${(e as Error).message}`);
    }
  }
}
