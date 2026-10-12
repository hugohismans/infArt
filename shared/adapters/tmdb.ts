import { clean, parseYear, type Artwork } from '../artwork';
import { type SourceAdapter } from './types';

/**
 * The Movie Database — https://developer.themoviedb.org/docs
 * Clé requise (jeton « API Read Access Token », secret TMDB_TOKEN du Worker).
 * Conditions : usage non commercial, attribution obligatoire (« utilise l'API TMDB
 * sans être approuvé ni certifié par TMDB »), pas de stockage permanent des images.
 * Les affiches sont servies par image.tmdb.org (CORS).
 */
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

interface TmdbMovie {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  adult?: boolean;
  genre_ids?: number[];
}

interface TmdbPage {
  total_pages: number;
  results: TmdbMovie[];
}

export const tmdb: SourceAdapter = {
  id: 'tmdb',
  name: 'The Movie Database (TMDB)',
  homepage: 'https://www.themoviedb.org',
  dataCors: true,
  imageCors: true,
  keys: ['TMDB_TOKEN'],
  types: ['affiche-film'],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type, theme, keys }) {
    if (type !== 'affiche-film' || !keys?.TMDB_TOKEN) return [];
    const headers = { Authorization: `Bearer ${keys.TMDB_TOKEN}` };
    let url: string;
    if (theme?.q) {
      url = `${API}/search/movie?query=${encodeURIComponent(theme.q)}&include_adult=false&language=fr-FR&page=1`;
    } else {
      // Une décennie au hasard (ou celle du thème), parmi les films les plus votés : des affiches connues.
      const decade = 10 * rng.int(192, 202);
      const [from, to] = theme?.years ?? [decade, decade + 9];
      url =
        `${API}/discover/movie?include_adult=false&language=fr-FR&sort_by=vote_count.desc` +
        `&primary_release_date.gte=${from}-01-01&primary_release_date.lte=${to}-12-31&page=${rng.int(1, 15)}`;
    }
    const page = (await fetchJson(url, { ttl: 86400 * 7, headers })) as TmdbPage;
    return rng
      .shuffle(page.results ?? [])
      .map((m): Artwork | null => {
        const title = clean(m.title) ?? clean(m.original_title);
        if (!title || !m.poster_path || m.adult) return null;
        const year = parseYear(m.release_date);
        const original = clean(m.original_title);
        return {
          id: `tmdb:${m.id}`,
          source: 'tmdb',
          type: 'affiche-film',
          title,
          ...(year !== undefined ? { year, date: String(year) } : {}),
          medium: original && original !== title ? `Affiche de film · titre original : ${original}` : 'Affiche de film',
          // Format « one sheet » américain.
          dimensions: { w: 68.6, h: 101.6, unit: 'cm' },
          ...(clean(m.overview) ? { description: clean(m.overview)! } : {}),
          tags: ['cinéma'],
          imageUrl: `${IMG}/w500${m.poster_path}`,
          imageUrlHigh: `${IMG}/original${m.poster_path}`,
          aspectRatio: 2 / 3,
          sourceUrl: `https://www.themoviedb.org/movie/${m.id}`,
          license: 'Affiche reproduite à titre d’illustration. Ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB.',
          credit: 'The Movie Database (TMDB)',
        };
      })
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },

  imageForWidth(art, width) {
    const size = width <= 342 ? 'w342' : width <= 500 ? 'w500' : width <= 780 ? 'w780' : 'original';
    return art.imageUrl.replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`);
  },
};
