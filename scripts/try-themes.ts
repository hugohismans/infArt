/**
 * Rendement des thèmes : `npx tsx scripts/try-themes.ts [thème]`
 * (derrière un proxy : NODE_USE_ENV_PROXY=1). Interroge directement les musées.
 */
import { ADAPTERS } from '../shared/adapters';
import { gatherArtworks } from '../shared/select';
import { THEMES } from '../shared/themes';

const [only] = process.argv.slice(2);
const fetchJson = async (url: string, opts?: { headers?: Record<string, string> }) => {
  const r = await fetch(url, { headers: opts?.headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${new URL(url).host}`);
  return r.json();
};

for (const theme of THEMES) {
  if (only && theme.id !== only) continue;
  const t0 = Date.now();
  const r = await gatherArtworks({ adapters: ADAPTERS, fetchJson, seed: 'essai', batch: 0, count: 24, theme });
  const bySource: Record<string, number> = {};
  for (const a of r.artworks) bySource[a.source] = (bySource[a.source] ?? 0) + 1;
  console.log(`${theme.title} : ${r.artworks.length} œuvres en ${Date.now() - t0} ms ${JSON.stringify(bySource)} ${r.errors.join(' ; ')}`);
  for (const a of r.artworks.slice(0, 3)) console.log(`   - ${a.title.slice(0, 70)} (${a.source}/${a.type})`);
}
