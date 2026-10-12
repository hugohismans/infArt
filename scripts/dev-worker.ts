/**
 * Fait tourner le Worker sous Node (sans compte Cloudflare), sur http://localhost:8787.
 * Utile pour tester localement : `npx tsx scripts/dev-worker.ts` puis ouvrir le site avec ?api=http://localhost:8787
 * Les clés d'API sont lues dans les variables d'environnement (TMDB_TOKEN=… npx tsx …).
 * (`npx wrangler dev --config worker/wrangler.jsonc` fait la même chose avec le vrai moteur Workers).
 */
import { createServer } from 'node:http';

const store = new Map<string, { body: ArrayBuffer; init: ResponseInit }>();
(globalThis as unknown as { caches: unknown }).caches = {
  default: {
    async match(req: Request) {
      const hit = store.get(req.url);
      return hit ? new Response(hit.body.slice(0), hit.init) : undefined;
    },
    async put(req: Request, res: Response) {
      store.set(req.url, { body: await res.arrayBuffer(), init: { status: res.status, headers: res.headers } });
    },
  },
};

const worker = (await import('../worker/src/index')).default;
const port = Number(process.env.PORT ?? 8787);
const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => undefined), passThroughOnException() {} };

createServer(async (req, res) => {
  try {
    const response = await worker.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method }) as never, process.env as never, ctx as never);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(port, () => console.log(`Worker local sur http://localhost:${port}`));
