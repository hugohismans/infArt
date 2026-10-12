import { clean, parseYear, type ArtType, type Artwork } from '../artwork';
import { randomPageStart, type SourceAdapter } from './types';

/**
 * Victoria and Albert Museum — https://developers.vam.ac.uk/
 * Sans clé, CORS sur l'API et les images (IIIF). Images utilisables à des fins non
 * commerciales, avec le crédit « © Victoria and Albert Museum, London ».
 * La recherche ne va pas au-delà de 10 000 résultats : on tire une fenêtre de dates.
 */
const API = 'https://api.vam.ac.uk/v2/objects/search';
const PAGE = 45;
const MAX_RESULTS = 10000;

/** Type d'objet V&A (recherche) et motif de vérification (le filtre de l'API est souple). */
const OBJECT_TYPES: Partial<Record<ArtType, { q: string; match: RegExp; years: [number, number] }>> = {
  peinture: { q: 'Painting', match: /painting/i, years: [1500, 1920] },
  estampe: { q: 'Print', match: /print|etching|engraving|woodcut|lithograph/i, years: [1500, 1930] },
  dessin: { q: 'Drawing', match: /drawing|watercolour|sketch/i, years: [1500, 1930] },
  photographie: { q: 'Photograph', match: /photograph/i, years: [1845, 1940] },
  affiche: { q: 'Poster', match: /poster/i, years: [1880, 1990] },
};

interface VamRecord {
  systemNumber: string;
  objectType?: string;
  _primaryTitle?: string;
  _primaryMaker?: { name?: string };
  _primaryDate?: string;
  _primaryPlace?: string;
  _warningTypes?: string[];
  _images?: { _iiif_image_base_url?: string | null; imageResolution?: string };
}

interface VamResponse {
  info: { record_count: number };
  records: VamRecord[];
}

function search(type: string, extra: string): string {
  return `${API}?q_object_type=${encodeURIComponent(type)}&images_exist=1&response_format=json&${extra}`;
}

function normalize(r: VamRecord, type: ArtType, match: RegExp): Artwork | null {
  const base = r._images?._iiif_image_base_url;
  // Les avertissements signalent un contenu potentiellement offensant : on s'abstient.
  if (!base || (r._warningTypes?.length ?? 0) > 0 || !match.test(r.objectType ?? '')) return null;
  const maker = clean(r._primaryMaker?.name);
  const creator = maker && !/^unknown$/i.test(maker) ? maker.replace(/^(.+), (.+)$/, '$2 $1') : undefined;
  // Sans titre ni auteur, le cartel n'aurait rien à dire (« Painting », « Drawing »…).
  const title = clean(r._primaryTitle) ?? (creator ? 'Sans titre' : undefined);
  if (!title) return null;
  const year = parseYear(r._primaryDate);
  const iiif = base.replace(/\/$/, '');
  return {
    id: `vam:${r.systemNumber}`,
    source: 'vam',
    type,
    title,
    ...(creator ? { creator } : {}),
    ...(clean(r._primaryDate) ? { date: clean(r._primaryDate)! } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(clean(r._primaryPlace) ? { culture: clean(r._primaryPlace)! } : {}),
    tags: [r.objectType, r._primaryPlace].filter((t): t is string => !!t),
    imageUrl: `${iiif}/full/!843,843/0/default.jpg`,
    imageUrlHigh: `${iiif}/full/!2000,2000/0/default.jpg`,
    iiif,
    sourceUrl: `https://collections.vam.ac.uk/item/${r.systemNumber}/`,
    license: 'Usage non commercial (conditions du V&A)',
    credit: '© Victoria and Albert Museum, London',
  };
}

export const vam: SourceAdapter = {
  id: 'vam',
  name: 'Victoria and Albert Museum',
  homepage: 'https://www.vam.ac.uk',
  dataCors: true,
  imageCors: true,
  types: Object.keys(OBJECT_TYPES) as ArtType[],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type, theme }) {
    const spec = OBJECT_TYPES[type];
    if (!spec) return [];
    let filter: string;
    if (theme?.q) filter = `q_object_title=${encodeURIComponent(theme.q)}`;
    else {
      const from = 10 * Math.floor(rng.range(spec.years[0], spec.years[1] - 20) / 10);
      filter = `year_made_from=${from}&year_made_to=${from + 25}`;
    }
    const head = (await fetchJson(search(spec.q, `${filter}&page_size=1`), { ttl: 86400 })) as VamResponse;
    if (!head.info.record_count) return [];
    const start = randomPageStart(rng, head.info.record_count, PAGE, MAX_RESULTS - PAGE);
    const page = (await fetchJson(search(spec.q, `${filter}&page_size=${PAGE}&page=${start / PAGE + 1}`), { ttl: 86400 * 7 })) as VamResponse;
    return rng
      .shuffle(page.records ?? [])
      .map((r) => normalize(r, type, spec.match))
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },

  imageForWidth(art, width) {
    if (!art.iiif) return art.imageUrl;
    const w = Math.min(2000, Math.max(128, Math.round(width)));
    return `${art.iiif}/full/!${w},${w}/0/default.jpg`;
  },
};
