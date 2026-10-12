import { clean, dimsCm, parseYear, stripHtml, type ArtType, type Artwork } from '../artwork';
import { randomPageStart, type SourceAdapter } from './types';

/**
 * Art Institute of Chicago — https://api.artic.edu/docs/
 * Sans clé, 60 requêtes/min par IP, CORS sur l'API et les images (IIIF).
 * Données CC0, champ `description` en CC BY 4.0. On ne garde que le domaine public.
 */
const API = 'https://api.artic.edu/api/v1/artworks/search';
const IIIF = 'https://www.artic.edu/iiif/2';
const HEADERS = { 'AIC-User-Agent': 'galerie-infinie (https://github.com/hugohismans/infArt)' };
const PAGE = 40;
/**
 * L'API refuse offset + limit > 1 000 (contrairement à ce que laisse penser la doc) :
 * pour parcourir toute la collection, on tire une fenêtre aléatoire d'identifiants
 * (« id ≥ début », triés), ce qui reste toujours sous la limite.
 */
const MAX_ID = 260000;
const ID_BUCKET = 2500;
/** Tailles recommandées par l'AIC (meilleures chances d'être en cache). */
const SIZES = [200, 400, 600, 843, 1686];

const TYPE_IDS: Partial<Record<ArtType, number[]>> = {
  peinture: [1],
  estampe: [18],
  dessin: [14],
  photographie: [2],
  sculpture: [3],
};

const FIELDS = [
  'id', 'title', 'artist_title', 'artist_display', 'date_display', 'date_start', 'medium_display',
  'dimensions_detail', 'image_id', 'thumbnail', 'artwork_type_title', 'place_of_origin', 'style_title',
  'short_description', 'description', 'credit_line', 'term_titles', 'classification_titles',
];

interface AicItem {
  id: number;
  title?: string;
  artist_title?: string | null;
  artist_display?: string | null;
  date_display?: string | null;
  date_start?: number | null;
  medium_display?: string | null;
  dimensions_detail?: Array<{ width?: number | null; height?: number | null; depth?: number | null }> | null;
  image_id?: string | null;
  thumbnail?: { width?: number; height?: number } | null;
  artwork_type_title?: string | null;
  place_of_origin?: string | null;
  style_title?: string | null;
  short_description?: string | null;
  description?: string | null;
  credit_line?: string | null;
  term_titles?: string[] | null;
  classification_titles?: string[] | null;
}

interface AicResponse {
  pagination: { total: number };
  data: AicItem[];
}

function query(typeIds: number[], fromId: number, extra: Record<string, unknown>, title?: string, field = 'title'): string {
  const must: unknown[] = [{ term: { is_public_domain: true } }, { exists: { field: 'image_id' } }, { terms: { artwork_type_id: typeIds } }];
  // Thème : recherche dans les titres (ou l'artiste), classée par pertinence ; sinon fenêtre d'identifiants.
  if (title) must.push({ match: { [field]: title } });
  else must.push({ range: { id: { gte: fromId } } });
  const params = {
    query: { bool: { must } },
    ...(title ? {} : { sort: [{ id: 'asc' }] }),
    ...extra,
  };
  return `${API}?params=${encodeURIComponent(JSON.stringify(params))}`;
}

function normalize(it: AicItem, type: ArtType): Artwork | null {
  if (!it.image_id || !it.title) return null;
  const base = `${IIIF}/${it.image_id}`;
  const dim = it.dimensions_detail?.[0];
  const tw = it.thumbnail?.width, th = it.thumbnail?.height;
  const creator = clean(it.artist_title) ?? clean(it.artist_display?.split('\n')[0]);
  return {
    id: `aic:${it.id}`,
    source: 'aic',
    type,
    title: it.title,
    ...(creator ? { creator } : {}),
    ...(clean(it.date_display) ? { date: clean(it.date_display)! } : {}),
    ...(parseYear(it.date_start ?? undefined, it.date_display) !== undefined ? { year: parseYear(it.date_start ?? undefined, it.date_display)! } : {}),
    ...(clean(it.medium_display) ? { medium: clean(it.medium_display)! } : {}),
    ...(dim && dimsCm(dim.width, dim.height, dim.depth) ? { dimensions: dimsCm(dim.width, dim.height, dim.depth)! } : {}),
    ...(clean(it.place_of_origin) ? { culture: clean(it.place_of_origin)! } : {}),
    ...(clean(it.style_title) ? { movement: clean(it.style_title)! } : {}),
    ...(stripHtml(it.short_description ?? it.description) ? { description: stripHtml(it.short_description ?? it.description)! } : {}),
    tags: [...(it.classification_titles ?? []), ...(it.term_titles ?? [])].slice(0, 20),
    imageUrl: `${base}/full/843,/0/default.jpg`,
    imageUrlHigh: `${base}/full/1686,/0/default.jpg`,
    iiif: base,
    ...(tw && th ? { aspectRatio: tw / th } : {}),
    sourceUrl: `https://www.artic.edu/artworks/${it.id}`,
    license: 'CC0 1.0 (image et données), description CC BY 4.0',
    credit: `Art Institute of Chicago${it.credit_line ? `, ${it.credit_line}` : ''}`,
  };
}

export const aic: SourceAdapter = {
  id: 'aic',
  name: 'Art Institute of Chicago',
  homepage: 'https://www.artic.edu',
  dataCors: true,
  imageCors: true,
  types: Object.keys(TYPE_IDS) as ArtType[],
  weight: 1,
  byCreator: true,

  async fetchBatch({ fetchJson, rng, count, type, theme }) {
    const ids = TYPE_IDS[type];
    if (!ids) return [];
    const text = theme?.creator ?? theme?.q;
    if (text) {
      const field = theme?.creator ? 'artist_title' : 'title';
      const head = (await fetchJson(query(ids, 0, { fields: ['id'], limit: 1 }, text, field), { ttl: 86400, headers: HEADERS })) as AicResponse;
      if (!head.pagination.total) return [];
      const from = randomPageStart(rng, head.pagination.total, PAGE, 1000 - PAGE);
      const page = (await fetchJson(query(ids, 0, { fields: FIELDS, size: PAGE, from }, text, field), { ttl: 86400 * 7, headers: HEADERS })) as AicResponse;
      return rng.shuffle(page.data).map((it) => normalize(it, type)).filter((a): a is Artwork => a !== null).slice(0, count);
    }
    // Début de fenêtre aligné sur des paliers, pour que les pages soient réutilisées par le cache.
    let fromId = randomPageStart(rng, MAX_ID, ID_BUCKET);
    let page = (await fetchJson(query(ids, fromId, { fields: FIELDS, limit: PAGE }), { ttl: 86400 * 7, headers: HEADERS })) as AicResponse;
    if (page.data.length < count && fromId > 0) {
      // Fin de collection : on repart du début.
      fromId = 0;
      page = (await fetchJson(query(ids, fromId, { fields: FIELDS, limit: PAGE }), { ttl: 86400 * 7, headers: HEADERS })) as AicResponse;
    }
    const items = rng.shuffle(page.data).map((it) => normalize(it, type)).filter((a): a is Artwork => a !== null);
    return items.slice(0, count);
  },

  imageForWidth(art, width) {
    if (!art.iiif) return art.imageUrl;
    const size = SIZES.find((s) => s >= width) ?? SIZES[SIZES.length - 1]!;
    return `${art.iiif}/full/${size},/0/default.jpg`;
  },
};
