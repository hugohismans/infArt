import { clean, dimsCm, parseYear, stripHtml, type ArtType, type Artwork } from '../artwork';
import { randomPageStart, type SourceAdapter } from './types';

/**
 * Cleveland Museum of Art Open Access — https://openaccess-api.clevelandart.org/
 * Sans clé, données et images CC0. L'API a des en-têtes CORS, mais pas les images
 * (openaccess-cdn) : elles passent par le proxy du Worker.
 */
const API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const PAGE = 30;
/**
 * Champs utiles seulement : une page passe de ~400 à ~85 Ko, ce qui compte pour le
 * temps CPU du Worker. (Demander `fun_fact` provoque une erreur 500 chez eux.)
 */
const FIELDS = 'id,title,creation_date,creation_date_earliest,creators,technique,culture,description,wall_description,url,type,department,collection,creditline,dimensions,images';

const TYPE_NAMES: Partial<Record<ArtType, string>> = {
  peinture: 'Painting',
  estampe: 'Print',
  dessin: 'Drawing',
  photographie: 'Photograph',
};

type Dim = { width?: number; height?: number; depth?: number };
interface ClevelandItem {
  id: number;
  title?: string;
  creation_date?: string | null;
  creation_date_earliest?: number | null;
  creators?: Array<{ description?: string | null }> | null;
  technique?: string | null;
  culture?: string[] | null;
  description?: string | null;
  wall_description?: string | null;
  url?: string;
  type?: string;
  department?: string | null;
  collection?: string | null;
  creditline?: string | null;
  dimensions?: Record<string, Dim | undefined> | null;
  images?: { web?: { url?: string; width?: string; height?: string }; print?: { url?: string } } | null;
}

interface ClevelandResponse {
  info: { total: number };
  data: ClevelandItem[];
}

function url(type: string, extra: string): string {
  return `${API}?cc0=1&has_image=1&type=${encodeURIComponent(type)}&fields=${FIELDS}&${extra}`;
}

function normalize(it: ClevelandItem, type: ArtType): Artwork | null {
  const web = it.images?.web;
  if (!web?.url || !it.title) return null;
  // Les dimensions sont en mètres ; on prend l'œuvre sans cadre si possible.
  const d = it.dimensions ?? {};
  const dim = d.unframed ?? d.overall ?? d.image ?? d.sheet ?? d.plate ?? d.framed;
  const dims = dim ? dimsCm((dim.width ?? 0) * 100, (dim.height ?? 0) * 100, dim.depth ? dim.depth * 100 : undefined) : undefined;
  // « Nom (Nationalité, dates) » → « Nom »
  const creatorFull = clean(it.creators?.[0]?.description);
  const creator = creatorFull?.replace(/\s*\(.*\)\s*$/, '');
  const w = Number(web.width), h = Number(web.height);
  const description = stripHtml(it.wall_description ?? it.description);
  return {
    id: `cleveland:${it.id}`,
    source: 'cleveland',
    type,
    title: it.title,
    ...(creator ? { creator } : {}),
    ...(clean(it.creation_date) ? { date: clean(it.creation_date)! } : {}),
    ...(parseYear(it.creation_date_earliest ?? undefined, it.creation_date ?? undefined) !== undefined
      ? { year: parseYear(it.creation_date_earliest ?? undefined, it.creation_date ?? undefined)! }
      : {}),
    ...(clean(it.technique) ? { medium: clean(it.technique)! } : {}),
    ...(dims ? { dimensions: dims } : {}),
    ...(it.culture?.[0] ? { culture: it.culture[0] } : {}),
    ...(description ? { description } : {}),
    tags: [it.type, it.department, it.collection, ...(it.culture ?? [])].filter((t): t is string => !!t),
    imageUrl: web.url,
    ...(it.images?.print?.url ? { imageUrlHigh: it.images.print.url } : {}),
    ...(w > 0 && h > 0 ? { aspectRatio: w / h } : {}),
    sourceUrl: it.url ?? `https://clevelandart.org/art/collection/search?search=${it.id}`,
    license: 'CC0 1.0',
    credit: `The Cleveland Museum of Art${it.creditline ? `, ${it.creditline}` : ''}`,
  };
}

export const cleveland: SourceAdapter = {
  id: 'cleveland',
  name: 'Cleveland Museum of Art',
  homepage: 'https://www.clevelandart.org',
  dataCors: true,
  imageCors: false,
  needsKey: false,
  types: Object.keys(TYPE_NAMES) as ArtType[],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type }) {
    const name = TYPE_NAMES[type];
    if (!name) return [];
    const head = (await fetchJson(url(name, 'limit=1'), { ttl: 86400 })) as ClevelandResponse;
    const skip = randomPageStart(rng, head.info.total, PAGE);
    const page = (await fetchJson(url(name, `limit=${PAGE}&skip=${skip}`), { ttl: 86400 * 7 })) as ClevelandResponse;
    return rng
      .shuffle(page.data)
      .map((it) => normalize(it, type))
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },
};
