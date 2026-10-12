/**
 * Exécute le Worker sous Node, sans Cloudflare : `NODE_USE_ENV_PROXY=1 npx tsx scripts/try-worker.ts [chemin]`.
 * La Cache API est simulée en mémoire.
 */
const store = new Map<string, Response>();
(globalThis as unknown as { caches: unknown }).caches = {
  default: {
    async match(req: Request) {
      return store.get(req.url)?.clone();
    },
    async put(req: Request, res: Response) {
      store.set(req.url, res);
    },
  },
};
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} };

const worker = (await import('../worker/src/index')).default;
const paths = process.argv.slice(2);
for (const path of paths.length ? paths : ['/health', '/artworks?count=12&seed=essai&batch=0', '/artworks?count=12&seed=essai&batch=0']) {
  const t0 = Date.now();
  const res = await worker.fetch(new Request(`http://local${path}`) as never, {} as never, ctx as never);
  const type = res.headers.get('Content-Type') ?? '';
  const body = type.includes('json') ? await res.json() : `${(await res.arrayBuffer()).byteLength} octets`;
  console.log(`${path} → ${res.status} ${type} en ${Date.now() - t0} ms, CORS=${res.headers.get('Access-Control-Allow-Origin')}`);
  const b = body as { artworks?: Array<{ id: string; type: string; title: string }>; errors?: string[] };
  if (b.artworks) {
    console.log(`  ${b.artworks.length} œuvres, erreurs: ${JSON.stringify(b.errors)}`);
    for (const a of b.artworks.slice(0, 5)) console.log(`   ${a.id} [${a.type}] ${a.title.slice(0, 60)}`);
  } else console.log(' ', JSON.stringify(body).slice(0, 300));
  await Promise.all(pending);
}
