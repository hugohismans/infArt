/**
 * Worker « Galerie Infinie » : proxy des API de musées.
 *
 * - GET /artworks?count=24&seed=…&batch=0&types=peinture,estampe&sources=aic,met&theme=chats
 *     &weights=peinture:0.5,affiche:0.1 (mode mélange : part de chaque type)
 *     Lot d'œuvres normalisées (format Artwork), tiré de plusieurs sources.
 *     Le tirage dépend de (seed, batch) : une visite est reproductible.
 * - GET /image?url=…
 *     Relais des images dont la source n'envoie pas d'en-têtes CORS (indispensables
 *     pour en faire des textures WebGL). Limité à une liste d'hôtes de musées.
 * - GET /health
 *
 * Les réponses des API sont mises en cache (Cache API) pour ménager les sources
 * et leurs limites de débit.
 */
import { ADAPTERS, ADAPTERS_BY_ID, hasKeys, type FetchJson, type Keys } from '../../shared/adapters';
import { parseWeights, SUPPORTED_TYPES, type ArtType } from '../../shared/artwork';
import { gatherArtworks } from '../../shared/select';
import { THEMES_BY_ID } from '../../shared/themes';

/** Secrets (wrangler secret put …) : chaque source qui en a besoin reste inactive sans eux. */
export type Env = Keys;

const USER_AGENT = 'galerie-infinie/0.2 (+https://github.com/hugohismans/infArt)';

/** Hôtes d'images autorisés pour le relais (jamais un proxy ouvert). */
const IMAGE_HOSTS = new Set([
  'www.artic.edu',
  'openaccess-cdn.clevelandart.org',
  'images.metmuseum.org',
  'iip.smk.dk',
  'iip-thumb.smk.dk',
  'framemark.vam.ac.uk',
  'iiif.micr.io',
  'upload.wikimedia.org',
  'covers.openlibrary.org',
  'coverartarchive.org',
  'image.tmdb.org',
  'images.igdb.com',
  'api.europeana.eu',
  'nrs.harvard.edu',
  'ids.lib.harvard.edu',
  'ids.si.edu',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
      ...CORS_HEADERS,
    },
  });
}

/**
 * Quota de sous-requêtes par appel : 50 sur le plan gratuit, Cache API comprise.
 * On garde une marge pour la mise en cache de la réponse finale.
 */
const SUBREQUEST_BUDGET = 44;

/** Mémoire locale à l'isolat (gratuite, contrairement à la Cache API) : les « têtes » de requêtes reviennent souvent. */
const memory = new Map<string, { data: unknown; expires: number }>();
const MEMORY_MAX = 300;

/**
 * fetch JSON avec cache (mémoire de l'isolat, puis Cache API du datacenter), dans la
 * limite du quota de sous-requêtes : au-delà, la requête échoue proprement et le lot
 * est servi avec ce qui a déjà été obtenu.
 */
function makeCachedFetchJson(ctx: ExecutionContext): FetchJson {
  let budget = SUBREQUEST_BUDGET;
  const spend = () => {
    if (budget <= 0) throw new Error('quota de sous-requêtes atteint');
    budget--;
  };
  return async (url, opts) => {
    const ttl = opts?.ttl ?? 3600;
    const now = Date.now();
    // Requête POST : le corps fait partie de la clé (la Cache API n'accepte que des GET).
    const id = opts?.body ? `${url}#${await sha1(opts.body)}` : url;
    const mem = memory.get(id);
    if (!opts?.noCache && mem && mem.expires > now) return mem.data;

    const remember = (data: unknown) => {
      if (opts?.noCache) return data;
      memory.set(id, { data, expires: now + Math.min(ttl, 3600) * 1000 });
      if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
      return data;
    };

    const key = new Request(opts?.body ? `https://cache.galerie-infinie/${encodeURIComponent(id)}` : url);
    const cache = caches.default;
    if (!opts?.noCache) {
      spend();
      const hit = await cache.match(key);
      if (hit) return remember(await hit.json());
    }
    spend();

    const res = await fetch(url, {
      method: opts?.body ? 'POST' : 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(opts?.headers ?? {}) },
      ...(opts?.body ? { body: opts.body } : {}),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${new URL(url).host}`);
    const body = await res.text();
    const data = JSON.parse(body) as unknown;
    if (budget > 0 && !opts?.noCache) {
      budget--;
      ctx.waitUntil(
        cache.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } })),
      );
    }
    return remember(data);
  };
}

async function sha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseList(v: string | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function handleArtworks(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const count = Math.min(60, Math.max(1, Number(url.searchParams.get('count')) || 24));
  const seed = (url.searchParams.get('seed') ?? 'galerie').slice(0, 64);
  const batch = Math.max(0, Math.floor(Number(url.searchParams.get('batch')) || 0));
  const types = parseList(url.searchParams.get('types')).filter((t): t is ArtType => (SUPPORTED_TYPES as string[]).includes(t));
  const weights = parseWeights(url.searchParams.get('weights'));
  const sourceIds = parseList(url.searchParams.get('sources'));
  const theme = THEMES_BY_ID[url.searchParams.get('theme') ?? ''];
  const adapters = (sourceIds.length > 0 ? sourceIds.map((id) => ADAPTERS_BY_ID[id]).filter((a) => !!a) : ADAPTERS.filter((a) => !a.paused)).filter((a) => hasKeys(a, env));

  // Le résultat est déterministe pour une URL donnée : on met la réponse entière en cache.
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const result = await gatherArtworks({ adapters, fetchJson: makeCachedFetchJson(ctx), seed, batch, count, keys: env, ...(types.length ? { types } : {}), ...(Object.keys(weights).length ? { weights } : {}), ...(theme ? { theme } : {}) });
  const response = json(result, 200, result.errors.length > 0 ? 60 : 3600);
  if (result.artworks.length > 0) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleImage(url: URL, ctx: ExecutionContext): Promise<Response> {
  const target = url.searchParams.get('url');
  let parsed: URL;
  try {
    parsed = new URL(target ?? '');
  } catch {
    return json({ error: 'paramètre url invalide' }, 400);
  }
  if (parsed.protocol !== 'https:' || !IMAGE_HOSTS.has(parsed.hostname)) {
    return json({ error: 'hôte non autorisé' }, 403);
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const upstream = await fetch(parsed.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/avif,image/webp,image/jpeg,image/*' },
    cf: { cacheTtl: 2592000, cacheEverything: true },
  });
  const type = upstream.headers.get('Content-Type') ?? '';
  if (!upstream.ok || !type.startsWith('image/')) {
    // L'hôte final (après redirections) aide à savoir qui refuse.
    return json({ error: `image indisponible (HTTP ${upstream.status}, ${upstream.url ? new URL(upstream.url).hostname : '?'}${upstream.redirected ? ', redirigée' : ''})` }, 502);
  }
  const response = new Response(upstream.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=2592000, immutable',
      ...CORS_HEADERS,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'GET') return json({ error: 'méthode non autorisée' }, 405);
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case '/':
        case '/health':
          return json({
            ok: true,
            sources: ADAPTERS.map((a) => ({ id: a.id, name: a.name, types: a.types, imageCors: a.imageCors, active: hasKeys(a, env) && !a.paused, ...(a.paused ? { paused: a.paused } : {}) })),
          });
        case '/artworks':
          return await handleArtworks(url, env, ctx);
        case '/image':
          return await handleImage(url, ctx);
        default:
          return json({ error: 'introuvable' }, 404);
      }
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
