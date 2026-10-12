import { clean, type Artwork } from '../artwork';
import { type SourceAdapter } from './types';

/**
 * Open Library — https://openlibrary.org/developers/api
 * Sans clé, CORS sur l'API et les couvertures. Les couvertures (par identifiant)
 * ne sont pas limitées en débit ; la recherche est mise en cache.
 * Les couvertures restent la propriété de leurs ayants droit (reproduites à titre
 * d'illustration, avec crédit) ; données Open Library en CC0.
 */
const API = 'https://openlibrary.org/search.json';
const COVERS = 'https://covers.openlibrary.org/b/id';
const PAGE = 50;
const FIELDS = 'key,title,author_name,first_publish_year,cover_i,subject,edition_count';

const SUBJECTS = [
  'science fiction', 'fantasy', 'mystery', 'detective', 'romance', 'poetry', 'horror', 'adventure',
  'history', 'art', 'cooking', 'travel', 'philosophy', 'music', 'photography', 'architecture',
  'comics', 'children', 'thriller', 'classics', 'gardening', 'design', 'mythology', 'space',
];

interface OlDoc {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
}

interface OlResponse {
  numFound: number;
  docs: OlDoc[];
}

export const openlibrary: SourceAdapter = {
  id: 'openlibrary',
  name: 'Open Library',
  homepage: 'https://openlibrary.org',
  dataCors: true,
  imageCors: true,
  types: ['couverture-livre'],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type, theme }) {
    if (type !== 'couverture-livre') return [];
    // Les plus réédités d'abord : des couvertures soignées et des livres connus.
    const q = theme?.q ? `title=${encodeURIComponent(theme.q)}` : `subject=${encodeURIComponent(rng.pick(SUBJECTS))}`;
    const offset = theme?.q ? 0 : PAGE * rng.int(0, 7);
    const res = (await fetchJson(`${API}?${q}&sort=editions&limit=${PAGE}&offset=${offset}&fields=${FIELDS}`, { ttl: 86400 * 14 })) as OlResponse;
    return rng
      .shuffle(res.docs)
      .map((d): Artwork | null => {
        const title = clean(d.title);
        if (!title || !d.cover_i || d.cover_i <= 0) return null;
        const author = clean(d.author_name?.slice(0, 2).join(', '));
        return {
          id: `openlibrary:${d.key.split('/').pop()}`,
          source: 'openlibrary',
          type: 'couverture-livre',
          title,
          ...(author ? { creator: author } : {}),
          ...(d.first_publish_year ? { year: d.first_publish_year, date: String(d.first_publish_year) } : {}),
          medium: 'Couverture de livre',
          tags: ['livre', ...(d.subject ?? []).slice(0, 6)],
          imageUrl: `${COVERS}/${d.cover_i}-L.jpg`,
          sourceUrl: `https://openlibrary.org${d.key}`,
          license: 'Couverture reproduite à titre d’illustration · données Open Library CC0',
          credit: 'Open Library (Internet Archive)',
        };
      })
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },

  imageForWidth(art, width) {
    return width <= 180 ? art.imageUrl.replace(/-L\.jpg$/, '-M.jpg') : art.imageUrl;
  },
};
