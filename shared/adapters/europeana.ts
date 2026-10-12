import { clean, parseYear, type ArtType, type Artwork } from '../artwork';
import { randomPageStart, type SourceAdapter } from './types';

/**
 * Europeana — https://pro.europeana.eu/page/search
 * Clé requise (EUROPEANA_KEY, gratuite). Agrégateur de milliers d'institutions
 * européennes (dont les musées belges). On ne garde que les licences ouvertes
 * (« reusability=open »). Les images d'origine sont sur des hôtes très variés,
 * sans CORS : la texture vient du service de vignettes de Europeana (400 px, CORS),
 * la fiche détaillée affiche l'image d'origine.
 */
const API = 'https://api.europeana.eu/record/v2/search.json';
const PAGE = 40;
/** La pagination simple s'arrête à 1 000 résultats. */
const MAX_RESULTS = 1000;

const WHAT: Partial<Record<ArtType, string>> = {
  peinture: 'painting',
  estampe: 'print',
  dessin: 'drawing',
  photographie: 'photograph',
  affiche: 'poster',
};
const SUBJECTS = ['landscape', 'portrait', 'city', 'sea', 'flowers', 'animals', 'interior', 'mythology', 'river', 'church', 'harbour', 'winter', 'garden', 'market', 'mountain'];

interface EuropeanaItem {
  id: string;
  title?: string[];
  dcCreator?: string[];
  year?: string[];
  dataProvider?: string[];
  country?: string[];
  rights?: string[];
  edmPreview?: string[];
  edmIsShownBy?: string[];
  guid?: string;
  dcDescription?: string[];
}

interface EuropeanaResponse {
  totalResults: number;
  items?: EuropeanaItem[];
}

const LICENSES: Array<[RegExp, string]> = [
  [/publicdomain\/mark/, 'Domaine public (Public Domain Mark)'],
  [/publicdomain\/zero/, 'CC0 1.0'],
  [/licenses\/by-sa\//, 'CC BY-SA'],
  [/licenses\/by\//, 'CC BY'],
];

export const europeana: SourceAdapter = {
  id: 'europeana',
  name: 'Europeana',
  homepage: 'https://www.europeana.eu',
  dataCors: true,
  imageCors: true,
  keys: ['EUROPEANA_KEY'],
  types: Object.keys(WHAT) as ArtType[],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type, theme, keys }) {
    const what = WHAT[type];
    if (!what || !keys?.EUROPEANA_KEY) return [];
    const q = theme?.q ? `title:${theme.q}` : rng.pick(SUBJECTS);
    const url = (start: number, rows: number) =>
      `${API}?wskey=${keys.EUROPEANA_KEY}&query=${encodeURIComponent(q)}&qf=TYPE:IMAGE&qf=${encodeURIComponent(`what:${what}`)}` +
      `&qf=${encodeURIComponent('contentTier:(2 OR 3 OR 4)')}&reusability=open&media=true&thumbnail=true&profile=standard&rows=${rows}&start=${start + 1}`;
    const head = (await fetchJson(url(0, 1), { ttl: 86400 })) as EuropeanaResponse;
    if (!head.totalResults) return [];
    const page = (await fetchJson(url(randomPageStart(rng, head.totalResults, PAGE, MAX_RESULTS - PAGE), PAGE), { ttl: 86400 * 7 })) as EuropeanaResponse;
    return rng
      .shuffle(page.items ?? [])
      .map((it): Artwork | null => {
        const title = clean(it.title?.[0]);
        const preview = it.edmPreview?.[0];
        const rights = it.rights?.[0] ?? '';
        const license = LICENSES.find(([re]) => re.test(rights))?.[1];
        if (!title || !preview || !license) return null;
        const creator = clean(it.dcCreator?.[0]);
        const year = parseYear(it.year?.[0]?.match(/\d{4}/)?.[0]);
        const provider = clean(it.dataProvider?.[0]);
        return {
          id: `europeana:${it.id}`,
          source: 'europeana',
          type,
          title,
          ...(creator && !/^http|_person$/.test(creator) ? { creator } : {}),
          ...(year !== undefined ? { year, date: String(year) } : {}),
          ...(clean(it.country?.[0]) ? { culture: clean(it.country?.[0])! } : {}),
          ...(clean(it.dcDescription?.[0]) ? { description: clean(it.dcDescription?.[0])!.slice(0, 1200) } : {}),
          tags: [what, ...(provider ? [provider] : [])],
          imageUrl: /[?&]size=/.test(preview) ? preview.replace(/([?&])size=[^&]*/, '$1size=w400') : `${preview}&size=w400`,
          ...(it.edmIsShownBy?.[0] ? { imageUrlHigh: it.edmIsShownBy[0] } : {}),
          sourceUrl: it.guid ?? `https://www.europeana.eu/item${it.id}`,
          license,
          credit: provider ? `${provider} · via Europeana` : 'Europeana',
        };
      })
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },
};
