import { clean, parseYear, type Artwork } from '../artwork';
import { type SourceAdapter } from './types';

/**
 * MusicBrainz + Cover Art Archive — https://musicbrainz.org/doc/MusicBrainz_API
 * Sans clé, CORS. MusicBrainz demande un User-Agent identifiable et au plus une
 * requête par seconde : les recherches sont mises en cache longtemps.
 * Données MusicBrainz en CC0 ; les pochettes restent la propriété de leurs ayants droit
 * (reproduites à titre d'illustration, avec crédit).
 * Toutes les pochettes ne sont pas archivées (~75 %) : une image manquante est simplement sautée.
 */
const API = 'https://musicbrainz.org/ws/2/release-group';
const CAA = 'https://coverartarchive.org/release-group';
const PAGE = 50;

const GENRES = [
  'rock', 'jazz', 'pop', 'soul', 'funk', 'electronic', 'hip hop', 'classical', 'reggae', 'blues',
  'folk', 'punk', 'disco', 'metal', 'ambient', 'bossa nova', 'chanson', 'new wave', 'country', 'psychedelic',
];

interface MbReleaseGroup {
  id: string;
  title?: string;
  'first-release-date'?: string;
  'primary-type'?: string;
  'artist-credit'?: Array<{ name?: string; joinphrase?: string }>;
  tags?: Array<{ name: string; count?: number }>;
}

interface MbResponse {
  count: number;
  'release-groups': MbReleaseGroup[];
}

export const musicbrainz: SourceAdapter = {
  id: 'musicbrainz',
  name: 'MusicBrainz / Cover Art Archive',
  homepage: 'https://musicbrainz.org',
  dataCors: true,
  imageCors: true,
  types: ['pochette-disque'],
  weight: 1,
  byCreator: true,

  async fetchBatch({ fetchJson, rng, count, type, theme }) {
    if (type !== 'pochette-disque') return [];
    let q: string;
    let offset = 0;
    if (theme?.creator) {
      q = `artist:"${theme.creator.replace(/"/g, '')}" AND primarytype:album`;
    } else if (theme?.q) {
      q = `releasegroup:"${theme.q}" AND primarytype:album`;
    } else {
      const genre = rng.pick(GENRES);
      const decade = 10 * rng.int(195, 201);
      const [from, to] = theme?.years ?? [decade, decade + 9];
      q = `tag:"${genre}" AND primarytype:album AND firstreleasedate:[${from} TO ${to}]`;
      // Les plus pertinents d'abord : ce sont aussi ceux qui ont le plus souvent une pochette.
      offset = PAGE * rng.int(0, 5);
    }
    const url = (o: number) => `${API}?query=${encodeURIComponent(q)}&limit=${PAGE}&offset=${o}&fmt=json`;
    let res = (await fetchJson(url(offset), { ttl: 86400 * 30 })) as MbResponse;
    if (res['release-groups'].length === 0 && offset > 0) res = (await fetchJson(url(0), { ttl: 86400 * 30 })) as MbResponse;
    return rng
      .shuffle(res['release-groups'])
      .map((g): Artwork | null => {
        const title = clean(g.title);
        if (!title) return null;
        const artist = clean((g['artist-credit'] ?? []).map((a) => `${a.name ?? ''}${a.joinphrase ?? ''}`).join(''));
        const date = clean(g['first-release-date']);
        const year = parseYear(date);
        return {
          id: `musicbrainz:${g.id}`,
          source: 'musicbrainz',
          type: 'pochette-disque',
          title,
          ...(artist ? { creator: artist } : {}),
          ...(year !== undefined ? { year, date: String(year) } : {}),
          medium: 'Pochette d’album',
          dimensions: { w: 31.4, h: 31.4, unit: 'cm' },
          tags: ['musique', ...(g.tags ?? []).slice(0, 6).map((t) => t.name)],
          imageUrl: `${CAA}/${g.id}/front-500`,
          imageUrlHigh: `${CAA}/${g.id}/front-1200`,
          aspectRatio: 1,
          sourceUrl: `https://musicbrainz.org/release-group/${g.id}`,
          license: 'Pochette reproduite à titre d’illustration · données MusicBrainz CC0',
          credit: 'Cover Art Archive / MusicBrainz',
        };
      })
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },

  imageForWidth(art, width) {
    const size = width <= 250 ? 250 : width <= 500 ? 500 : 1200;
    return art.imageUrl.replace(/front-\d+$/, `front-${size}`);
  },
};
