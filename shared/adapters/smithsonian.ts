import { clean, parseYear, type ArtType, type Artwork } from '../artwork';
import { randomPageStart, type SourceAdapter } from './types';

/**
 * Smithsonian Open Access — https://www.si.edu/openaccess/devtools
 * Clé api.data.gov requise (SMITHSONIAN_KEY, gratuite). On ne garde que les images
 * en CC0. Images servies par ids.si.edu (CORS, taille au choix).
 */
const API = 'https://api.si.edu/openaccess/api/v1.0/search';
const PAGE = 40;
const MAX_RESULTS = 2000;

/** Musées d'art du Smithsonian et mot-clé de recherche par type. */
const UNITS = ['SAAM', 'NPG', 'CHNDM', 'FSG', 'HMSG', 'NMAAHC', 'NMAH'];
const QUERY: Partial<Record<ArtType, string>> = {
  peinture: 'painting',
  estampe: 'print',
  dessin: 'drawing',
  photographie: 'photograph',
  affiche: 'poster',
};

function typeOf(objectTypes: string[]): ArtType | null {
  const s = objectTypes.join(' ').toLowerCase();
  if (s.includes('poster')) return 'affiche';
  if (s.includes('photograph')) return 'photographie';
  if (s.includes('print') || s.includes('lithograph') || s.includes('etching')) return 'estampe';
  if (s.includes('drawing') || s.includes('watercolor')) return 'dessin';
  if (s.includes('painting')) return 'peinture';
  return null;
}

interface SiRow {
  id: string;
  title?: string;
  unitCode?: string;
  content?: {
    descriptiveNonRepeating?: {
      record_link?: string;
      data_source?: string;
      online_media?: { media?: Array<{ idsId?: string; usage?: { access?: string } }> };
    };
    freetext?: Record<string, Array<{ label?: string; content?: string }> | undefined>;
    indexedStructured?: { object_type?: string[]; date?: string[] };
  };
}

interface SiResponse {
  response: { rowCount: number; rows: SiRow[] };
}

export const smithsonian: SourceAdapter = {
  id: 'smithsonian',
  name: 'Smithsonian Open Access',
  homepage: 'https://www.si.edu/openaccess',
  dataCors: true,
  imageCors: true,
  keys: ['SMITHSONIAN_KEY'],
  types: Object.keys(QUERY) as ArtType[],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type, theme, keys }) {
    const word = QUERY[type];
    if (!word || !keys?.SMITHSONIAN_KEY) return [];
    const unit = rng.pick(UNITS);
    const q = `${theme?.q ? `title:${theme.q} AND ` : ''}${word} AND online_media_type:Images AND unit_code:${unit}`;
    const url = (start: number, rows: number) => `${API}?api_key=${keys.SMITHSONIAN_KEY}&q=${encodeURIComponent(q)}&rows=${rows}&start=${start}`;
    const head = (await fetchJson(url(0, 1), { ttl: 86400 })) as SiResponse;
    if (!head.response?.rowCount) return [];
    const page = (await fetchJson(url(randomPageStart(rng, head.response.rowCount, PAGE, MAX_RESULTS), PAGE), { ttl: 86400 * 7 })) as SiResponse;
    return rng
      .shuffle(page.response.rows ?? [])
      .map((r): Artwork | null => {
        const c = r.content;
        const media = c?.descriptiveNonRepeating?.online_media?.media?.find((m) => m.usage?.access === 'CC0' && m.idsId);
        const title = clean(r.title);
        const actual = typeOf(c?.indexedStructured?.object_type ?? []);
        if (!media?.idsId || !title || actual !== type) return null;
        const ft = c?.freetext ?? {};
        const creator = clean(ft.name?.[0]?.content);
        const date = clean(ft.date?.[0]?.content);
        const medium = clean(ft.physicalDescription?.find((p) => /medium/i.test(p.label ?? ''))?.content);
        const credit = clean(ft.creditLine?.[0]?.content);
        const source = clean(c?.descriptiveNonRepeating?.data_source) ?? 'Smithsonian Institution';
        const year = parseYear(date);
        const ids = `https://ids.si.edu/ids/deliveryService?id=${encodeURIComponent(media.idsId)}`;
        return {
          id: `smithsonian:${r.id}`,
          source: 'smithsonian',
          type,
          title,
          ...(creator && !/^unidentified|unknown/i.test(creator) ? { creator } : {}),
          ...(date ? { date } : {}),
          ...(year !== undefined ? { year } : {}),
          ...(medium ? { medium } : {}),
          tags: [...(c?.indexedStructured?.object_type ?? []), source],
          imageUrl: `${ids}&max=1000`,
          imageUrlHigh: `${ids}&max=3000`,
          sourceUrl: c?.descriptiveNonRepeating?.record_link ?? 'https://collections.si.edu',
          license: 'CC0 1.0',
          credit: credit ?? source,
        };
      })
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },

  imageForWidth(art, width) {
    return art.imageUrl.replace(/max=\d+/, `max=${Math.min(3000, Math.max(200, Math.round(width)))}`);
  },
};
