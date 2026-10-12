import type * as THREE from 'three';
import type { Artwork } from '../../shared/artwork';
import { isSensitive } from '../../shared/filter';
import { CONFIG } from '../config';
import type { ArtClient } from './ArtClient';
import type { ImageLoader } from './ImageLoader';

/** Une œuvre dont l'image est prête à être accrochée. */
export interface ReadyArt {
  artwork: Artwork;
  texture: THREE.Texture;
  /** Largeur / hauteur réelle de l'image chargée. */
  aspect: number;
}

export interface LibraryStats {
  mode: 'worker' | 'direct';
  ready: number;
  queued: number;
  loading: number;
  waiting: number;
  batches: number;
  failedImages: number;
  filtered: number;
  offline: boolean;
  disabledSources: string[];
  /** Images chargées / en échec, par source (« aic 12/1 »). */
  perSource: string;
}

type Waiter = (art: ReadyArt) => void;

/**
 * Réserve d'œuvres : tire des lots auprès de l'API, précharge les images et garde
 * toujours quelques œuvres prêtes, pour que le visiteur n'attende jamais.
 *
 * Les emplacements qui n'ont rien trouvé s'inscrivent dans une file d'attente
 * (`request`) et sont servis en priorité dès qu'une image arrive.
 */
export class ArtLibrary {
  private ready: ReadyArt[] = [];
  private queued: Artwork[] = [];
  private waiters: Waiter[] = [];
  private loading = 0;
  private fetching = false;
  private batch = 0;
  private consecutiveFailures = 0;
  private retryAt = 0;
  private readonly seen = new Set<string>();
  private filteredCount = 0;
  /** Bilan des chargements d'images par source. */
  private readonly sourceHealth = new Map<string, { ok: number; fail: number }>();
  /** Sources écartées pour la visite (images systématiquement en échec). */
  readonly disabledSources = new Set<string>();
  private disposed = false;
  private generation = 0;
  /** Filtre de contenu sensible (réglage). */
  filterSensitive = true;

  constructor(
    readonly client: ArtClient,
    readonly loader: ImageLoader,
    private readonly textureSize: number,
  ) {}

  /** Plus aucun lot n'arrive (réseau coupé, sources en panne) : on passe aux œuvres factices. */
  get offline(): boolean {
    return this.consecutiveFailures >= 3 && this.ready.length === 0 && this.queued.length === 0;
  }

  /** Change de graine (nouvelle visite) : on repart de zéro. */
  reset(seed: string): void {
    this.client.setSeed(seed);
    this.generation++;
    for (const r of this.ready) r.texture.dispose();
    this.ready = [];
    this.queued = [];
    this.loading = 0;
    this.batch = 0;
    this.seen.clear();
    this.consecutiveFailures = 0;
    this.fetching = false;
    this.pump();
  }

  /** Prend une œuvre prête, s'il y en a. Le demandeur devient responsable de sa texture. */
  take(): ReadyArt | null {
    const art = this.ready.shift() ?? null;
    this.pump();
    return art;
  }

  /** S'inscrit pour la prochaine œuvre prête. Renvoie une fonction d'annulation. */
  request(cb: Waiter): () => void {
    this.waiters.push(cb);
    this.pump();
    return () => {
      const i = this.waiters.indexOf(cb);
      if (i >= 0) this.waiters.splice(i, 1);
    };
  }

  /** À appeler régulièrement : relance les téléchargements si besoin. */
  pump(): void {
    if (this.disposed) return;
    const target = CONFIG.art.bufferTarget + this.waiters.length;
    // Images : on charge tant que la réserve n'est pas pleine.
    while (this.queued.length > 0 && this.ready.length + this.loading < target) {
      this.loadNext();
    }
    // Lots : on en redemande avant d'être à court.
    if (!this.fetching && this.queued.length < CONFIG.art.batchSize / 2 && this.ready.length + this.loading < target && performance.now() >= this.retryAt) {
      void this.fetchNextBatch();
    }
  }

  stats(): LibraryStats {
    return {
      mode: this.client.mode,
      ready: this.ready.length,
      queued: this.queued.length,
      loading: this.loading,
      waiting: this.waiters.length,
      batches: this.batch,
      failedImages: this.loader.failures,
      filtered: this.filteredCount,
      offline: this.offline,
      disabledSources: [...this.disabledSources],
      perSource: [...this.sourceHealth].map(([id, h]) => `${id} ${h.ok}/${h.fail}`).join(' · '),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    for (const r of this.ready) r.texture.dispose();
    this.ready = [];
    this.queued = [];
    this.waiters = [];
  }

  private health(source: string): { ok: number; fail: number } {
    let h = this.sourceHealth.get(source);
    if (!h) {
      h = { ok: 0, fail: 0 };
      this.sourceHealth.set(source, h);
    }
    return h;
  }

  private async fetchNextBatch(): Promise<void> {
    this.fetching = true;
    const gen = this.generation;
    const batch = this.batch++;
    try {
      const arts = await this.client.fetchBatch(batch, CONFIG.art.batchSize);
      if (gen !== this.generation) return;
      let added = 0;
      for (const a of arts) {
        if (this.seen.has(a.id)) continue;
        this.seen.add(a.id);
        if (!this.client.canDisplay(a) || this.disabledSources.has(a.source)) continue;
        if (this.filterSensitive && isSensitive(a)) {
          this.filteredCount++;
          continue;
        }
        if (a.aspectRatio && (a.aspectRatio > CONFIG.art.maxAspect || a.aspectRatio < 1 / CONFIG.art.maxAspect)) continue;
        this.queued.push(a);
        added++;
      }
      this.consecutiveFailures = added > 0 ? 0 : this.consecutiveFailures + 1;
    } catch (e) {
      console.warn('[art] lot impossible à récupérer', e);
      this.consecutiveFailures++;
    } finally {
      if (gen === this.generation) {
        this.fetching = false;
        // Attente croissante après des échecs (2 s, 4 s, 8 s… max 30 s).
        if (this.consecutiveFailures > 0) this.retryAt = performance.now() + Math.min(30000, 1000 * 2 ** this.consecutiveFailures);
        this.pump();
      }
    }
  }

  private loadNext(): void {
    const art = this.queued.shift()!;
    const gen = this.generation;
    this.loading++;
    // Les emplacements en attente passent devant.
    const priority = this.waiters.length > 0 ? 0 : 5;
    const { promise } = this.loader.load(this.client.imageUrls(art, this.textureSize), this.textureSize, priority);
    promise
      .then((img) => {
        if (gen !== this.generation || this.disposed) {
          img.texture.dispose();
          return;
        }
        const aspect = img.naturalWidth / img.naturalHeight;
        const tooSmall = Math.max(img.naturalWidth, img.naturalHeight) < CONFIG.art.minImageSize;
        const tooThin = aspect > CONFIG.art.maxAspect || aspect < 1 / CONFIG.art.maxAspect;
        if (tooSmall || tooThin) {
          img.texture.dispose();
          return;
        }
        this.health(art.source).ok++;
        const ready: ReadyArt = { artwork: art, texture: img.texture, aspect };
        const waiter = this.waiters.shift();
        if (waiter) waiter(ready);
        else this.ready.push(ready);
      })
      .catch(() => {
        // Image indisponible : on passe à la suivante. Une source qui échoue
        // systématiquement est écartée (CORS bloqué, protection anti-robots, panne…).
        const h = this.health(art.source);
        h.fail++;
        if (h.ok === 0 && h.fail >= 5 && !this.disabledSources.has(art.source)) {
          this.disabledSources.add(art.source);
          this.queued = this.queued.filter((q) => q.source !== art.source);
          console.warn(`[art] source « ${art.source} » écartée : ses images ne se chargent pas`);
        }
      })
      .finally(() => {
        if (gen === this.generation) this.loading--;
        this.pump();
      });
  }
}
