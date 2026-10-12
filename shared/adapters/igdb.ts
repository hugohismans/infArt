import { clean, type Artwork } from '../artwork';
import { type FetchJson, type Keys, type SourceAdapter } from './types';

/**
 * IGDB (Twitch) — https://api-docs.igdb.com
 * Clés requises : TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET (côté Worker uniquement).
 * Jeton d'application obtenu auprès de Twitch (valable ~60 jours, mis en cache).
 * Requêtes en POST (langage « Apicalypse »). Attribution à IGDB ; jaquettes reproduites
 * à titre d'illustration. Images sur images.igdb.com.
 */
const TOKEN = 'https://id.twitch.tv/oauth2/token';
const API = 'https://api.igdb.com/v4/games';
const IMG = 'https://images.igdb.com/igdb/image/upload';

interface IgdbGame {
  id: number;
  name?: string;
  slug?: string;
  first_release_date?: number;
  cover?: { image_id?: string; width?: number; height?: number };
  genres?: Array<{ name?: string }>;
  platforms?: Array<{ abbreviation?: string; name?: string }>;
  involved_companies?: Array<{ developer?: boolean; company?: { name?: string } }>;
  summary?: string;
  themes?: Array<{ name?: string }>;
}

async function token(fetchJson: FetchJson, keys: Keys): Promise<string> {
  const body = `client_id=${encodeURIComponent(keys.TWITCH_CLIENT_ID!)}&client_secret=${encodeURIComponent(keys.TWITCH_CLIENT_SECRET!)}&grant_type=client_credentials`;
  const res = (await fetchJson(TOKEN, { body, ttl: 86400 * 20, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })) as { access_token?: string };
  if (!res.access_token) throw new Error('jeton Twitch refusé');
  return res.access_token;
}

export const igdb: SourceAdapter = {
  id: 'igdb',
  name: 'IGDB',
  homepage: 'https://www.igdb.com',
  dataCors: false,
  imageCors: true,
  keys: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
  types: ['jaquette-jeu'],
  weight: 1,

  async fetchBatch({ fetchJson, rng, count, type, theme, keys }) {
    if (type !== 'jaquette-jeu' || !keys) return [];
    const access = await token(fetchJson, keys);
    const fields = 'fields name,slug,first_release_date,summary,cover.image_id,cover.width,cover.height,genres.name,themes.name,platforms.abbreviation,involved_companies.developer,involved_companies.company.name;';
    let where: string;
    let offset = 0;
    if (theme?.like) {
      // Dans la lignée d'un jeu : les jeux que IGDB juge similaires.
      const id = Number(theme.like.id);
      if (!Number.isInteger(id)) return [];
      const ref = (await fetchJson(API, {
        body: `fields similar_games; where id = ${id};`,
        ttl: 86400 * 30,
        headers: { 'Client-ID': keys.TWITCH_CLIENT_ID!, Authorization: `Bearer ${access}`, 'Content-Type': 'text/plain' },
      })) as Array<{ similar_games?: number[] }>;
      const similar = (ref[0]?.similar_games ?? []).filter((n) => Number.isInteger(n)).slice(0, 40);
      if (similar.length === 0) return [];
      where = `where cover != null & id = (${similar.join(',')});`;
    } else if (theme?.q) {
      where = `where cover != null & name ~ *"${theme.q.replace(/"/g, '')}"* & total_rating_count > 5;`;
    } else {
      // Une période au hasard (de 1980 à aujourd'hui) ou celle du thème, parmi les jeux les plus notés.
      const year = theme?.years ? rng.int(theme.years[0], theme.years[1]) : rng.int(1980, 2023);
      const span = year < 1995 ? 5 : 2;
      const from = Date.UTC(year, 0, 1) / 1000, to = Date.UTC(year + span, 0, 1) / 1000;
      where = `where cover != null & total_rating_count > 20 & first_release_date >= ${from} & first_release_date < ${to};`;
      offset = 50 * rng.int(0, 2);
    }
    // Pas de contenu explicite (thème « Erotic » = 42).
    const body = `${fields} ${where.replace(/;$/, ' & themes != (42);')} sort total_rating_count desc; limit 50; offset ${offset};`;
    const games = (await fetchJson(API, {
      body,
      ttl: 86400 * 7,
      headers: { 'Client-ID': keys.TWITCH_CLIENT_ID!, Authorization: `Bearer ${access}`, 'Content-Type': 'text/plain' },
    })) as IgdbGame[];
    return rng
      .shuffle(games)
      .map((g): Artwork | null => {
        const title = clean(g.name);
        const img = g.cover?.image_id;
        if (!title || !img) return null;
        const dev = clean(g.involved_companies?.find((c) => c.developer)?.company?.name);
        const year = g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : undefined;
        const platforms = (g.platforms ?? []).map((p) => p.abbreviation ?? p.name).filter(Boolean).slice(0, 4).join(', ');
        return {
          id: `igdb:${g.id}`,
          source: 'igdb',
          type: 'jaquette-jeu',
          title,
          ...(dev ? { creator: dev } : {}),
          ...(year !== undefined ? { year, date: String(year) } : {}),
          medium: platforms ? `Jaquette de jeu vidéo · ${platforms}` : 'Jaquette de jeu vidéo',
          ...(clean(g.summary) ? { description: clean(g.summary)! } : {}),
          tags: ['jeu vidéo', ...(g.genres ?? []).map((x) => x.name ?? '').filter(Boolean)],
          imageUrl: `${IMG}/t_cover_big_2x/${img}.jpg`,
          imageUrlHigh: `${IMG}/t_1080p/${img}.jpg`,
          ...(g.cover?.width && g.cover.height ? { aspectRatio: g.cover.width / g.cover.height } : {}),
          sourceUrl: `https://www.igdb.com/games/${g.slug ?? g.id}`,
          license: 'Jaquette reproduite à titre d’illustration · données IGDB',
          credit: 'IGDB (Twitch)',
        };
      })
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },

  imageForWidth(art, width) {
    return width <= 264 ? art.imageUrl.replace('t_cover_big_2x', 't_cover_big') : art.imageUrl;
  },
};
