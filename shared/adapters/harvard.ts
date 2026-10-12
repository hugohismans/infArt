import { clean, dimsCm, parseYear, type ArtType, type Artwork } from '../artwork';
import { randomPageStart, type SourceAdapter } from './types';

/**
 * Harvard Art Museums — https://github.com/harvardartmuseums/api-docs
 * Clé requise (HARVARD_KEY, gratuite). Usage non commercial, crédit « Harvard Art Museums ».
 * On ne garde que les images dont la diffusion est libre (imagepermissionlevel = 0).
 */
const API = 'https://api.harvardartmuseums.org/object';
const PAGE = 40;
/** L'API ne pagine pas au-delà de 10 000 résultats (une page vide, sans erreur). */
const MAX_RESULTS = 10000;
const FIELDS = 'id,title,people,dated,datebegin,medium,dimensions,culture,period,classification,primaryimageurl,images,url,creditline,imagepermissionlevel,description';

const CLASSIFICATIONS: Partial<Record<ArtType, string>> = {
  peinture: 'Paintings',
  estampe: 'Prints',
  dessin: 'Drawings',
  photographie: 'Photographs',
  affiche: 'Posters',
};

interface HarvardObject {
  id: number;
  title?: string;
  people?: Array<{ name?: string; role?: string }>;
  dated?: string;
  datebegin?: number;
  medium?: string;
  dimensions?: string;
  culture?: string;
  period?: string;
  classification?: string;
  primaryimageurl?: string;
  images?: Array<{ iiifbaseuri?: string; idsid?: number; baseimageurl?: string; width?: number; height?: number }>;
  url?: string;
  creditline?: string;
  imagepermissionlevel?: number;
  description?: string;
}

interface HarvardResponse {
  info: { totalrecords: number };
  records: HarvardObject[];
}

/** Base IIIF d'une image : `iiifbaseuri` n'est plus toujours fourni, on la reconstruit depuis `idsid`. */
function iiifOf(img: NonNullable<HarvardObject['images']>[number] | undefined): string | undefined {
  if (img?.iiifbaseuri) return img.iiifbaseuri;
  if (img?.idsid) return `https://ids.lib.harvard.edu/ids/iiif/${img.idsid}`;
  return undefined;
}

/** « 81.3 x 65.1 cm (32 x 25 5/8 in.) » → largeur × hauteur (Harvard donne h × l). */
function parseDims(s: string | undefined): Artwork['dimensions'] {
  const m = s?.match(/([\d.]+)\s*x\s*([\d.]+)\s*cm/);
  return m ? dimsCm(Number(m[2]), Number(m[1])) : undefined;
}

export const harvard: SourceAdapter = {
  id: 'harvard',
  name: 'Harvard Art Museums',
  homepage: 'https://harvardartmuseums.org',
  dataCors: true,
  imageCors: false,
  keys: ['HARVARD_KEY'],
  types: Object.keys(CLASSIFICATIONS) as ArtType[],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type, theme, keys }) {
    const cls = CLASSIFICATIONS[type];
    if (!cls || !keys?.HARVARD_KEY) return [];
    const base = `${API}?apikey=${keys.HARVARD_KEY}&classification=${encodeURIComponent(cls)}&hasimage=1&q=imagepermissionlevel:0` + (theme?.q ? `&title=${encodeURIComponent(theme.q)}` : '');
    const head = (await fetchJson(`${base}&size=1&fields=id`, { ttl: 86400 })) as HarvardResponse;
    if (!head.info?.totalrecords) throw new Error(`aucun résultat (champs : ${Object.keys(head ?? {}).join(', ')})`);
    const start = randomPageStart(rng, head.info.totalrecords, PAGE, MAX_RESULTS - PAGE);
    const page = (await fetchJson(`${base}&size=${PAGE}&page=${start / PAGE + 1}&fields=${FIELDS}`, { ttl: 86400 * 7 })) as HarvardResponse;
    const records = page.records ?? [];
    const found = rng
      .shuffle(records)
      .map((o): Artwork | null => {
        const title = clean(o.title);
        const iiif = iiifOf(o.images?.[0]);
        if (!title || !iiif || o.imagepermissionlevel !== 0) return null;
        const artist = clean(o.people?.find((p) => /artist/i.test(p.role ?? ''))?.name ?? o.people?.[0]?.name);
        const year = parseYear(o.datebegin, o.dated);
        const dims = parseDims(o.dimensions);
        const img = o.images![0]!;
        return {
          id: `harvard:${o.id}`,
          source: 'harvard',
          type,
          title,
          ...(artist && !/^unidentified/i.test(artist) ? { creator: artist } : {}),
          ...(clean(o.dated) ? { date: clean(o.dated)! } : {}),
          ...(year ? { year } : {}),
          ...(clean(o.medium) ? { medium: clean(o.medium)! } : {}),
          ...(dims ? { dimensions: dims } : {}),
          ...(clean(o.culture) ? { culture: clean(o.culture)! } : {}),
          ...(clean(o.period) ? { movement: clean(o.period)! } : {}),
          ...(clean(o.description) ? { description: clean(o.description)! } : {}),
          tags: [o.classification, o.culture, o.period].filter((t): t is string => !!t),
          imageUrl: `${iiif}/full/!843,843/0/default.jpg`,
          imageUrlHigh: `${iiif}/full/!2000,2000/0/default.jpg`,
          iiif,
          ...(img.width && img.height ? { aspectRatio: img.width / img.height } : {}),
          sourceUrl: o.url ?? `https://harvardartmuseums.org/collections/object/${o.id}`,
          license: 'Usage non commercial (conditions des Harvard Art Museums)',
          credit: `Harvard Art Museums${o.creditline ? `, ${o.creditline}` : ''}`,
        };
      })
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
    // Diagnostic : une page sans œuvre exploitable est signalée (sans la clé).
    if (!found.length) {
      // Diagnostic : quel critère écarte les objets ? (sans la clé)
      const r0 = records[0] as unknown as Record<string, unknown> | undefined;
      const stats = `sans titre ${records.filter((o) => !clean(o.title)).length}, sans iiif ${records.filter((o) => !iiifOf(o.images?.[0])).length}, droits≠0 ${records.filter((o) => o.imagepermissionlevel !== 0).length}`;
      throw new Error(`page ${start / PAGE + 1} : ${records.length} objets, aucun exploitable (${stats} ; champs ${r0 ? Object.keys(r0).join(',') : '-'} ; images[0] ${JSON.stringify(records[0]?.images?.[0] ?? null).slice(0, 160)})`);
    }
    return found;
  },

  imageForWidth(art, width) {
    if (!art.iiif) return art.imageUrl;
    const w = Math.min(2000, Math.max(128, Math.round(width)));
    return `${art.iiif}/full/!${w},${w}/0/default.jpg`;
  },
};
