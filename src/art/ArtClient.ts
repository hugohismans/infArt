import { ADAPTERS_BY_ID, DIRECT_ADAPTERS, type FetchJson } from '../../shared/adapters';
import type { Artwork } from '../../shared/artwork';
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

  setSeed(seed: string): void {
    this.seed = seed;
  }

  async fetchBatch(batch: number, count: number, theme?: ArtTheme): Promise<Artwork[]> {
    if (this.mode === 'worker') {
      try {
        const url = `${this.apiUrl}/artworks?count=${count}&seed=${encodeURIComponent(this.seed)}&batch=${batch}${theme ? `&theme=${theme.id}` : ''}`;
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
    const result = await gatherArtworks({ adapters: DIRECT_ADAPTERS, fetchJson: this.directFetch, seed: this.seed, batch, count, ...(theme ? { theme } : {}) });
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
