import { clean, dimsCm, parseYear, type ArtType, type Artwork } from '../artwork';
import { randomPageStart, sample, type SourceAdapter } from './types';

/**
 * The Metropolitan Museum of Art Collection API — https://metmuseum.github.io/
 * Sans clé, 80 requêtes/s max. Recherche paginée v1.1 (la v1 a été retirée le
 * 1er octobre 2026), sans en-têtes CORS ; images sans CORS non plus :
 * source utilisable uniquement via le Worker. Œuvres du domaine public en CC0.
 */
const BASE = 'https://collectionapi.metmuseum.org/public/collection';
const PAGE = 80;
/** La recherche v1.1 ne renvoie rien au-delà de offset 10 000. */
const MAX_RESULTS = 10000;

/** Départements par type (9 = Drawings and Prints : le type exact vient de la classification). */
const DEPARTMENTS: Partial<Record<ArtType, number[]>> = {
  // 11 European Paintings (deux fois : la plus riche), 21 Modern Art, 6 Asian Art (rouleaux peints).
  peinture: [11, 11, 21, 6],
  estampe: [9],
  dessin: [9],
  photographie: [19],
};

interface MetSearch {
  total: number;
  objectIDs: number[] | null;
}

interface MetObject {
  objectID: number;
  isPublicDomain?: boolean;
  primaryImage?: string;
  primaryImageSmall?: string;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  objectBeginDate?: number;
  medium?: string;
  culture?: string;
  country?: string;
  period?: string;
  classification?: string;
  department?: string;
  creditLine?: string;
  objectURL?: string;
  tags?: Array<{ term: string }> | null;
  measurements?: Array<{ elementName?: string; elementMeasurements?: { Height?: number; Width?: number; Depth?: number } }> | null;
}

/** Type mural d'après la classification du Met, ou null pour un objet en volume (bol, sabre…). */
function typeFromClassification(c: string | undefined): ArtType | null {
  const s = (c ?? '').toLowerCase();
  if (s.includes('photograph')) return 'photographie';
  if (s.includes('print')) return 'estampe';
  if (s.includes('drawing') || s.includes('watercolor') || s.includes('pastel')) return 'dessin';
  if (s.includes('painting')) return 'peinture';
  return null;
}

function normalize(o: MetObject): Artwork | null {
  if (!o.isPublicDomain || !o.primaryImageSmall || !o.title) return null;
  const type = typeFromClassification(o.classification);
  if (!type) return null;
  const m = o.measurements?.find((x) => x.elementMeasurements?.Height && x.elementMeasurements?.Width)?.elementMeasurements;
  const dims = m ? dimsCm(m.Width, m.Height, m.Depth) : undefined;
  const year = parseYear(o.objectBeginDate, o.objectDate);
  return {
    id: `met:${o.objectID}`,
    source: 'met',
    type,
    title: o.title,
    ...(clean(o.artistDisplayName) ? { creator: clean(o.artistDisplayName)! } : {}),
    ...(clean(o.objectDate) ? { date: clean(o.objectDate)! } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(clean(o.medium) ? { medium: clean(o.medium)! } : {}),
    ...(dims ? { dimensions: dims } : {}),
    ...(clean(o.culture) ?? clean(o.country) ? { culture: (clean(o.culture) ?? clean(o.country))! } : {}),
    ...(clean(o.period) ? { movement: clean(o.period)! } : {}),
    tags: [o.classification, o.department, ...(o.tags ?? []).map((t) => t.term)].filter((t): t is string => !!t),
    imageUrl: o.primaryImageSmall,
    ...(o.primaryImage ? { imageUrlHigh: o.primaryImage } : {}),
    sourceUrl: o.objectURL ?? `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
    license: 'CC0 1.0 (Open Access)',
    credit: `The Metropolitan Museum of Art${o.creditLine ? `, ${o.creditLine}` : ''}`,
  };
}

export const met: SourceAdapter = {
  id: 'met',
  name: 'The Metropolitan Museum of Art',
  homepage: 'https://www.metmuseum.org',
  dataCors: false,
  imageCors: false,
  types: Object.keys(DEPARTMENTS) as ArtType[],
  weight: 1,
  byCreator: true,

  async fetchBatch({ fetchJson, rng, count, type, theme }) {
    const deps = DEPARTMENTS[type];
    if (!deps) return [];
    const dep = rng.pick(deps);
    // Les résultats sont triés par identifiant et plafonnés à 10 000 : une fenêtre de
    // dates aléatoire (un demi-siècle) permet d'atteindre toute la collection.
    const [minYear, maxYear] = type === 'photographie' ? [1840, 1930] : [1400, 1900];
    const from = 10 * Math.floor(rng.range(minYear, maxYear - 30) / 10);
    const window = type === 'photographie' ? 20 : 50;
    const q = theme?.creator ? `${encodeURIComponent(theme.creator)}&artistOrCulture=true` : theme?.q ? `${encodeURIComponent(theme.q)}&title=true` : '*';
    const search = (offset: number, limit: number, dated: boolean) =>
      `${BASE}/v1.1/search?departmentId=${dep}&hasImages=true&isPublicDomain=true&q=${q}` +
      (dated ? `&dateBegin=${from}&dateEnd=${from + window}` : '') +
      `&offset=${offset}&limit=${limit}`;
    // Thème : peu de résultats, inutile de fenêtrer par dates.
    let dated = !theme?.q && !theme?.creator;
    let head = (await fetchJson(search(0, 1, dated), { ttl: 86400 })) as MetSearch;
    if (!head.total && dated) {
      // Fenêtre vide : on se rabat sur le département entier.
      dated = false;
      head = (await fetchJson(search(0, 1, dated), { ttl: 86400 })) as MetSearch;
    }
    if (!head.total) return [];
    const page = (await fetchJson(search(randomPageStart(rng, head.total, PAGE, MAX_RESULTS), PAGE, dated), { ttl: 86400 * 7 })) as MetSearch;
    // Une requête par objet : on en demande un peu plus que nécessaire (certains n'ont pas d'image).
    // Les départements mélangent peintures et objets : on demande large.
    // (Une requête par objet : borné pour respecter le quota de sous-requêtes du Worker.)
    const ids = sample(rng, page.objectIDs ?? [], Math.min(count + 4, 10));
    const objects = await Promise.allSettled(ids.map((id) => fetchJson(`${BASE}/v1/objects/${id}`, { ttl: 86400 * 30 })));
    return objects
      .map((r) => (r.status === 'fulfilled' ? normalize(r.value as MetObject) : null))
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },
};
