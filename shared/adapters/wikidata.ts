import { clean, dimsCm, parseYear, type Artwork } from '../artwork';
import { md5 } from '../md5';
import { randomPageStart, type SourceAdapter } from './types';

/**
 * Wikidata (SPARQL) + Wikimedia Commons — https://query.wikidata.org
 * Sans clé, CORS. Les peintures des grands musées dont l'image est sur Commons
 * (Commons n'héberge que des fichiers libres : reproductions de peintures du domaine public).
 * Une seule requête SPARQL ; les vignettes sont servies par upload.wikimedia.org (CORS).
 * Titres en français quand Wikidata les a.
 */
const SPARQL = 'https://query.wikidata.org/sparql';
const UPLOAD = 'https://upload.wikimedia.org/wikipedia/commons/thumb';
const PAGE = 40;
/** Tailles de vignettes standard de Wikimedia (les autres sont limitées pour les robots). */
const SIZES = [500, 960, 1280, 1920];

/** Collections (QID, nom, nombre approximatif de peintures illustrées). */
const COLLECTIONS: Array<[string, string, number]> = [
  ['Q190804', 'Rijksmuseum, Amsterdam', 5500],
  ['Q3044768', 'Musée du Louvre, Paris', 4700],
  ['Q23402', 'Musée d’Orsay, Paris', 1850],
  ['Q180788', 'National Gallery, Londres', 4000],
  ['Q160112', 'Musée du Prado, Madrid', 3950],
  ['Q214867', 'National Gallery of Art, Washington', 2900],
  ['Q132783', 'Musée de l’Ermitage, Saint-Pétersbourg', 3450],
  ['Q95569', 'Kunsthistorisches Museum, Vienne', 3500],
  ['Q221092', 'Mauritshuis, La Haye', 1100],
  ['Q842858', 'Nationalmuseum, Stockholm', 7000],
  ['Q303139', 'Belvedere, Vienne', 2700],
  ['Q377500', 'Musées royaux des Beaux-Arts de Belgique, Bruxelles', 930],
  ['Q1471477', 'Musée royal des Beaux-Arts d’Anvers (KMSKA)', 2700],
  ['Q2365880', 'Musée des Beaux-Arts de Gand (MSK)', 1450],
  ['Q51252', 'Galerie des Offices, Florence', 770],
  ['Q165631', 'Gemäldegalerie, Berlin', 2150],
];

const UNIT_CM: Record<string, number> = {
  'http://www.wikidata.org/entity/Q174728': 1,
  'http://www.wikidata.org/entity/Q11573': 100,
  'http://www.wikidata.org/entity/Q174789': 0.1,
};

interface Binding {
  [k: string]: { value: string } | undefined;
}
interface SparqlResponse {
  results: { bindings: Binding[] };
}
function query(collection: string, offset: number, title?: string): string {
  const themed = title
    ? `?item rdfs:label ?en. FILTER(LANG(?en) = "en" && CONTAINS(LCASE(?en), "${title.toLowerCase().replace(/[^a-z -]/g, '')}"))`
    : '';
  return `SELECT ?item ?itemLabel ?creatorLabel ?inception ?img ?h ?hu ?w ?wu ?movementLabel WHERE {
  ?item wdt:P195 wd:${collection}; wdt:P31 wd:Q3305213; wdt:P18 ?img.
  ${themed}
  OPTIONAL { ?item wdt:P170 ?creator. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item p:P2048/psv:P2048 [ wikibase:quantityAmount ?h; wikibase:quantityUnit ?hu ]. }
  OPTIONAL { ?item p:P2049/psv:P2049 [ wikibase:quantityAmount ?w; wikibase:quantityUnit ?wu ]. }
  OPTIONAL { ?item wdt:P135 ?movement. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} LIMIT ${PAGE * 2} OFFSET ${offset}`;
}

function cm(amount: string | undefined, unit: string | undefined): number {
  const k = unit ? UNIT_CM[unit] : undefined;
  return k && amount ? Number(amount) * k : NaN;
}

/** Nom de fichier Commons (avec « _ ») à partir de l'URL Special:FilePath de Wikidata. */
function fileName(img: string): string {
  const name = decodeURIComponent(img.split('/').pop() ?? '').replace(/ /g, '_');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Vignette Commons, calculée sans appel d'API (celle-ci limite vite le débit) :
 * le chemin dépend du MD5 du nom de fichier.
 */
function thumb(file: string, width: number): string {
  const h = md5(file);
  const enc = encodeURIComponent(file);
  return `${UPLOAD}/${h[0]}/${h.slice(0, 2)}/${enc}/${width}px-${enc}`;
}

export const wikidata: SourceAdapter = {
  id: 'wikidata',
  name: 'Wikidata / Wikimedia Commons',
  homepage: 'https://www.wikidata.org',
  dataCors: true,
  imageCors: true,
  types: ['peinture'],
  weight: 2,

  async fetchBatch({ fetchJson, rng, count, type, theme }) {
    if (type !== 'peinture') return [];
    const [qid, museum, total] = rng.pick(COLLECTIONS);
    const offset = theme?.q ? 0 : randomPageStart(rng, total, PAGE * 2);
    const sparql = (await fetchJson(`${SPARQL}?format=json&query=${encodeURIComponent(query(qid, offset, theme?.q))}`, {
      ttl: 86400 * 7,
      headers: { Accept: 'application/sparql-results+json' },
    })) as SparqlResponse;

    // Une ligne par combinaison de valeurs : on garde la première par œuvre.
    const byItem = new Map<string, Binding>();
    for (const b of sparql.results.bindings) {
      const id = b.item?.value;
      if (id && b.img && !byItem.has(id)) byItem.set(id, b);
    }
    return rng
      .shuffle([...byItem.values()])
      .map((b): Artwork | null => {
        const title = clean(b.itemLabel?.value);
        // Sans libellé, le service renvoie l'identifiant (« Q12345 ») : inutilisable.
        if (!title || /^Q\d+$/.test(title)) return null;
        const file = fileName(b.img!.value);
        if (!/\.(jpe?g|png)$/i.test(file)) return null;
        const qidItem = b.item!.value.split('/').pop()!;
        const creator = clean(b.creatorLabel?.value);
        const year = parseYear(b.inception?.value?.slice(0, 5));
        const dims = dimsCm(cm(b.w?.value, b.wu?.value), cm(b.h?.value, b.hu?.value));
        return {
          id: `wikidata:${qidItem}`,
          source: 'wikidata',
          type: 'peinture',
          title,
          ...(creator && !/^(Q\d+|https?:)/.test(creator) && !/^(anonyme|anonymous|inconnu|unknown)/i.test(creator) ? { creator } : {}),
          ...(year !== undefined ? { year, date: String(year) } : {}),
          ...(dims ? { dimensions: dims } : {}),
          ...(clean(b.movementLabel?.value) ? { movement: clean(b.movementLabel?.value)! } : {}),
          tags: ['peinture', museum],
          imageUrl: thumb(file, SIZES[1]!),
          imageUrlHigh: thumb(file, SIZES[3]!),
          sourceUrl: `https://www.wikidata.org/wiki/${qidItem}`,
          license: 'Domaine public (reproduction Wikimedia Commons)',
          credit: `${museum} · image Wikimedia Commons`,
        };
      })
      .filter((a): a is Artwork => a !== null)
      .slice(0, count);
  },

  imageForWidth(art, width) {
    const size = SIZES.find((s) => s >= width) ?? SIZES[SIZES.length - 1]!;
    return art.imageUrl.replace(/\/\d+px-/, `/${size}px-`);
  },
};
