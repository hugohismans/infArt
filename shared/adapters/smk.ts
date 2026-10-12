import { clean, dimsCm, parseYear, stripHtml, type ArtType, type Artwork } from '../artwork';
import { randomPageStart, type SourceAdapter } from './types';

/**
 * SMK – Statens Museum for Kunst (Copenhague) — https://open.smk.dk/en/article/api
 * Sans clé, CORS sur l'API et les images (IIIF). On ne garde que le domaine public
 * (Public Domain Mark).
 */
const API = 'https://api.smk.dk/api/v1/art/search/';
const PAGE = 30;

const OBJECT_NAMES: Partial<Record<ArtType, string[]>> = {
  peinture: ['painting'],
  estampe: ['print', 'etching', 'engraving', 'copper engraving', 'lithograph', 'woodcut'],
  dessin: ['drawing', 'watercolour', 'gouache'],
};

interface SmkItem {
  object_number?: string;
  id: string;
  titles?: Array<{ title?: string; language?: string }>;
  artist?: string[];
  production?: Array<{ creator?: string; creator_nationality?: string }>;
  production_date?: Array<{ start?: string; period?: string }>;
  techniques?: string[];
  dimensions?: Array<{ part?: string; type?: string; unit?: string; value?: string }>;
  object_names?: Array<{ name?: string }>;
  image_iiif_id?: string;
  image_thumbnail?: string;
  image_width?: number;
  image_height?: number;
  frontend_url?: string;
  rights?: string;
  labels?: Array<{ text?: string }>;
  content_subject?: string[];
}

interface SmkResponse {
  found: number;
  items: SmkItem[] | null;
}

function url(name: string, offset: number, rows: number, keys = '*'): string {
  const filters = `[has_image:true],[public_domain:true],[object_names:${name}]`;
  return `${API}?keys=${encodeURIComponent(keys)}&filters=${encodeURIComponent(filters)}&offset=${offset}&rows=${rows}&lang=en`;
}

function toCm(value: string | undefined, unit: string | undefined): number {
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  return unit === 'millimeter' || unit === 'mm' ? v / 10 : unit === 'meter' || unit === 'm' ? v * 100 : v;
}

function normalize(it: SmkItem, type: ArtType): Artwork | null {
  if (!it.image_iiif_id) return null;
  const title = it.titles?.find((t) => t.language === 'engelsk')?.title ?? it.titles?.[0]?.title;
  if (!title) return null;
  // On privilégie les dimensions « nettes » (sans cadre).
  const dims = it.dimensions ?? [];
  const part = dims.find((d) => /netto|blad|sheet/i.test(d.part ?? ''))?.part ?? dims[0]?.part;
  const sel = dims.filter((d) => d.part === part);
  const h = sel.find((d) => /height|højde/i.test(d.type ?? ''));
  const w = sel.find((d) => /width|bredde/i.test(d.type ?? ''));
  const dim = h && w ? dimsCm(toCm(w.value, w.unit), toCm(h.value, h.unit)) : undefined;
  const pd = it.production_date?.[0];
  const creator = clean(it.artist?.[0]) ?? clean(it.production?.[0]?.creator);
  const base = it.image_iiif_id;
  const description = stripHtml(it.labels?.[0]?.text);
  return {
    id: `smk:${it.object_number ?? it.id}`,
    source: 'smk',
    type,
    title,
    ...(creator ? { creator } : {}),
    ...(clean(pd?.period) ? { date: clean(pd?.period)! } : {}),
    ...(parseYear(pd?.period, pd?.start) !== undefined ? { year: parseYear(pd?.period, pd?.start)! } : {}),
    ...(clean(it.techniques?.[0]) ? { medium: clean(it.techniques?.[0])! } : {}),
    ...(dim ? { dimensions: dim } : {}),
    ...(clean(it.production?.[0]?.creator_nationality) ? { culture: clean(it.production?.[0]?.creator_nationality)! } : {}),
    ...(description ? { description } : {}),
    tags: [...(it.object_names ?? []).map((o) => o.name), ...(it.content_subject ?? [])].filter((t): t is string => !!t),
    imageUrl: `${base}/full/!843,843/0/default.jpg`,
    imageUrlHigh: `${base}/full/!2048,2048/0/default.jpg`,
    iiif: base,
    ...(it.image_width && it.image_height ? { aspectRatio: it.image_width / it.image_height } : {}),
    sourceUrl: it.frontend_url ?? 'https://open.smk.dk',
    license: 'Domaine public (Public Domain Mark 1.0)',
    credit: 'SMK – Statens Museum for Kunst',
  };
}

export const smk: SourceAdapter = {
  id: 'smk',
  name: 'SMK – Statens Museum for Kunst',
  homepage: 'https://open.smk.dk',
  dataCors: true,
  imageCors: true,
  types: Object.keys(OBJECT_NAMES) as ArtType[],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type, theme }) {
    const names = OBJECT_NAMES[type];
    if (!names) return [];
    const name = rng.pick(names);
    const keys = theme?.q || '*';
    const head = (await fetchJson(url(name, 0, 0, keys), { ttl: 86400 })) as SmkResponse;
    if (!head.found) return [];
    const page = (await fetchJson(url(name, randomPageStart(rng, head.found, PAGE), PAGE, keys), { ttl: 86400 * 7 })) as SmkResponse;
    return rng
      .shuffle(page.items ?? [])
      .map((it) => normalize(it, type))
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },

  imageForWidth(art, width) {
    if (!art.iiif) return art.imageUrl;
    const w = Math.min(2048, Math.max(128, Math.round(width)));
    return `${art.iiif}/full/!${w},${w}/0/default.jpg`;
  },
};
