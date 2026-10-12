import { ADAPTERS_BY_ID, DIRECT_ADAPTERS, type FetchJson } from '../../shared/adapters';
import { formatWeights, type Artwork, type TypeWeights } from '../../shared/artwork';
import { gatherArtworks } from '../../shared/select';
import type { ArtTheme } from '../../shared/themes';

/**
 * Accès aux œuvres. Deux modes :
 * - « worker » : le Worker Cloudflare agrège toutes les sources et relaie les images sans CORS ;
 * - « direct » : sans Worker (ou s'il est injoignable), le navigateur interroge lui-même
 *   les sources qui le permettent (API et images en CORS, sans clé).
 */
export class ArtClient {
  private readonly apiUrl: string | null;
  private workerDown = false;
  private readonly cache = new Map<string, Promise<unknown>>();
  lastErrors: string[] = [];

  constructor(
    private seed: string,
    apiUrl?: string | null,
  ) {
    this.apiUrl = apiUrl ? apiUrl.replace(/\/+$/, '') : null;
  }

  get mode(): 'worker' | 'direct' {
    return this.apiUrl && !this.workerDown ? 'worker' : 'direct';
  }

  /** Types d'œuvres que les sources actives peuvent fournir (selon les clés du Worker). */
  availableTypes = new Set<string>(DIRECT_ADAPTERS.flatMap((a) => a.types));

  /** Interroge le Worker sur ses sources actives (clés présentes). */
  async probe(): Promise<void> {
    if (this.mode !== 'worker') return;
    try {
      const res = await fetch(`${this.apiUrl}/health`);
      const data = (await res.json()) as { sources?: Array<{ types: string[]; active?: boolean }> };
      const types = (data.sources ?? []).filter((s) => s.active !== false).flatMap((s) => s.types);
      if (types.length > 0) this.availableTypes = new Set(types);
    } catch {
      // Sans réponse, on garde les types du mode direct.
    }
  }

  setSeed(seed: string): void {
    this.seed = seed;
  }

  /** @param weights mode mélange : part de chaque type */
  async fetchBatch(batch: number, count: number, opts: { theme?: ArtTheme; weights?: TypeWeights } = {}): Promise<Artwork[]> {
    const { theme, weights } = opts;
    if (this.mode === 'worker') {
      try {
        const url =
          `${this.apiUrl}/artworks?count=${count}&seed=${encodeURIComponent(this.seed)}&batch=${batch}` +
          (theme ? `&theme=${encodeURIComponent(theme.id)}` : '') +
          (weights ? `&weights=${formatWeights(weights)}` : '');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { artworks: Artwork[]; errors: string[] };
        this.lastErrors = data.errors;
        return data.artworks;
      } catch (e) {
        // Worker injoignable : on bascule en mode direct pour le reste de la visite.
        console.warn('[art] Worker injoignable, passage en mode direct', e);
        this.workerDown = true;
      }
    }
    const result = await gatherArtworks({ adapters: DIRECT_ADAPTERS, fetchJson: this.directFetch, seed: this.seed, batch, count, ...(theme ? { theme } : {}), ...(weights ? { weights } : {}) });
    this.lastErrors = result.errors;
    return result.artworks;
  }

  /** L'image de cette œuvre peut-elle devenir une texture (CORS direct ou via le Worker) ? */
  canDisplay(art: Artwork): boolean {
    const adapter = ADAPTERS_BY_ID[art.source];
    return !!adapter && (adapter.imageCors || this.mode === 'worker');
  }

  /** URLs à essayer, dans l'ordre, pour une largeur souhaitée. */
  imageUrls(art: Artwork, width: number): string[] {
    const adapter = ADAPTERS_BY_ID[art.source];
    const raw = adapter?.imageForWidth ? adapter.imageForWidth(art, width) : art.imageUrl;
    const urls: string[] = [];
    if (adapter?.imageCors) urls.push(raw);
    // Le relais sert aussi de solution de secours si le chargement direct échoue.
    if (this.apiUrl && !this.workerDown) urls.push(this.proxied(raw));
    return urls;
  }

  /** Taille d'image la plus haute disponible (IIIF) : sans IIIF, l'image d'affichage est déjà la meilleure option raisonnable. */
  supportsHighRes(art: Artwork): boolean {
    return !!art.iiif && !!ADAPTERS_BY_ID[art.source]?.imageForWidth;
  }

  /** URL de la grande image pour la fiche détaillée (via le relais si nécessaire). */
  detailImageUrl(art: Artwork, high: boolean): string {
    const raw = high ? (art.imageUrlHigh ?? art.imageUrl) : art.imageUrl;
    // Une balise <img> n'a pas besoin de CORS : on charge directement depuis la source.
    return raw;
  }

  /** Vignette (collection) : petite image, chargée directement par une balise <img>. */
  thumbUrl(art: Artwork, width = 360): string {
    const adapter = ADAPTERS_BY_ID[art.source];
    return adapter?.imageForWidth ? adapter.imageForWidth(art, width) : art.imageUrl;
  }

  proxied(url: string): string {
    return `${this.apiUrl}/image?url=${encodeURIComponent(url)}`;
  }

  /** fetch JSON du mode direct, mémorisé pendant la session (les « têtes » de requête reviennent souvent). */
  private readonly directFetch: FetchJson = (url) => {
    let p = this.cache.get(url);
    if (!p) {
      p = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} sur ${new URL(url).host}`);
        return r.json() as Promise<unknown>;
      });
      p.catch(() => this.cache.delete(url));
      this.cache.set(url, p);
      // Mémoire bornée.
      if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  };
}
