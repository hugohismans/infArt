import type * as THREE from 'three';
import type { Artwork, TypeWeights } from '../../shared/artwork';
import { isSensitive } from '../../shared/filter';
import { THEMES, type ArtTheme } from '../../shared/themes';
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
  /** Réserves thématiques (« chats 7 en préparation · mer 3 ouvert »). */
  themes: string;
  /** Textures prêtes dans les réserves thématiques. */
  themeReady: number;
}

type Waiter = (art: ReadyArt) => void;

/** Réserve d'une aile thématique, préparée avant que le Directeur ne l'ouvre. */
interface ThemePool {
  theme: ArtTheme;
  queued: Artwork[];
  ready: ReadyArt[];
  loading: number;
  batch: number;
  fetching: boolean;
  /** Plus rien de neuf à tirer pour ce thème. */
  exhausted: boolean;
  /** Ouverte par le Directeur. */
  active: boolean;
  dropped: boolean;
  lastTake: number;
}

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
  /** Lots en cours de téléchargement. */
  private fetching = 0;
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
  /** Thème en préparation (pas encore annoncé). */
  private upcoming: ThemePool | null = null;
  /** Thèmes ouverts récemment (une aile peut encore réclamer des œuvres). */
  private activePools: ThemePool[] = [];
  private recentThemes: string[] = [];
  /** Filtre de contenu sensible (réglage). */
  filterSensitive = true;
  /** Réserve visée avant l'entrée dans la visite (écran de chargement), 0 ensuite. */
  startTarget = 0;
  /** Mode mélange : part de chaque type (paramètre d'URL `mix` pour les essais). */
  mix: TypeWeights = CONFIG.art.mix;

  constructor(
    readonly client: ArtClient,
    readonly loader: ImageLoader,
    private readonly textureSize: number,
  ) {
    void client.probe();
  }

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
    this.fetching = 0;
    this.dropAllPools();
    this.recentThemes = [];
    this.pump();
  }

  /**
   * Prend une œuvre prête, s'il y en a, de préférence d'un des types `prefer`
   * (affinités de l'ambiance). Le demandeur devient responsable de sa texture.
   */
  take(prefer?: readonly string[], themeId?: string): ReadyArt | null {
    if (themeId) {
      const pool = this.activePools.find((p) => p.theme.id === themeId);
      const art = pool?.ready.shift();
      if (pool && art) {
        pool.lastTake = performance.now();
        this.pump();
        return art;
      }
    }
    let index = 0;
    if (prefer && prefer.length > 0 && Math.random() < 0.75) {
      const i = this.ready.findIndex((r) => prefer.includes(r.artwork.type));
      if (i >= 0) index = i;
    }
    const art = this.ready.splice(index, 1)[0] ?? null;
    this.pump();
    return art;
  }

  /**
   * Le Directeur veut ouvrir une aile thématique : renvoie le thème préparé
   * s'il a assez d'œuvres prêtes, sinon null (on réessaiera plus tard).
   */
  claimTheme(): ArtTheme | null {
    const p = this.upcoming;
    if (!p || p.ready.length < CONFIG.art.themeMinReady) return null;
    this.upcoming = null;
    p.active = true;
    p.lastTake = performance.now();
    this.activePools.push(p);
    while (this.activePools.length > 2) this.dropPool(this.activePools.shift()!);
    this.pump();
    return p.theme;
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
    const target = Math.max(CONFIG.art.bufferTarget, this.startTarget) + this.waiters.length;
    // Images : on charge tant que la réserve n'est pas pleine.
    while (this.queued.length > 0 && this.ready.length + this.loading < target) {
      this.loadNext();
    }
    // Lots : on en redemande avant d'être à court.
    // Un lot à la fois ; deux si des emplacements attendent déjà (lot lent, réserve vide).
    const maxInFlight = this.waiters.length > 0 && this.consecutiveFailures === 0 ? 2 : 1;
    if (this.fetching < maxInFlight && this.queued.length < CONFIG.art.batchSize / 2 && this.ready.length + this.loading < target && performance.now() >= this.retryAt) {
      void this.fetchNextBatch();
    }
    this.pumpThemes();
  }

  /** Les thèmes passent après la réserve générale : jamais d'attente à cause d'eux. */
  private pumpThemes(): void {
    if (this.waiters.length > 0 || this.offline) return;
    const now = performance.now();
    // Une aile délaissée depuis 40 s ne réclamera plus rien : on libère ses textures.
    for (const p of [...this.activePools]) {
      if (now - p.lastTake > 40000) this.dropPool(p);
    }
    if (this.upcoming && this.upcoming.exhausted && this.upcoming.loading === 0 && this.upcoming.queued.length === 0 && this.upcoming.ready.length < CONFIG.art.themeMinReady) {
      // Trop peu d'œuvres pour ce thème : on en essaie un autre.
      this.dropPool(this.upcoming);
      this.upcoming = null;
    }
    if (!this.upcoming && this.ready.length >= CONFIG.art.bufferTarget / 2) this.upcoming = this.newPool();
    for (const p of this.upcoming ? [this.upcoming, ...this.activePools] : this.activePools) {
      while (p.queued.length > 0 && p.ready.length + p.loading < CONFIG.art.themeBufferTarget) this.loadNext(p);
      if (!p.fetching && !p.exhausted && p.queued.length === 0 && p.ready.length + p.loading < CONFIG.art.themeBufferTarget) {
        void this.fetchThemeBatch(p);
      }
    }
  }

  private newPool(): ThemePool {
    // Pas d'aile « cinéma » sans source d'affiches de films (clé absente, mode direct…).
    const available = (t: ArtTheme) => !t.types || t.types.some((type) => this.client.availableTypes.has(type));
    const choices = THEMES.filter((t) => !this.recentThemes.includes(t.id) && available(t));
    const theme = choices[Math.floor(Math.random() * choices.length)] ?? THEMES[0]!;
    this.recentThemes.push(theme.id);
    if (this.recentThemes.length > Math.min(8, THEMES.length - 1)) this.recentThemes.shift();
    return { theme, queued: [], ready: [], loading: 0, batch: 0, fetching: false, exhausted: false, active: false, dropped: false, lastTake: 0 };
  }

  private dropPool(p: ThemePool): void {
    p.dropped = true;
    for (const r of p.ready) r.texture.dispose();
    p.ready = [];
    p.queued = [];
    const i = this.activePools.indexOf(p);
    if (i >= 0) this.activePools.splice(i, 1);
  }

  private dropAllPools(): void {
    if (this.upcoming) this.dropPool(this.upcoming);
    this.upcoming = null;
    for (const p of [...this.activePools]) this.dropPool(p);
  }

  private async fetchThemeBatch(p: ThemePool): Promise<void> {
    p.fetching = true;
    const gen = this.generation;
    try {
      const arts = await this.client.fetchBatch(p.batch++, CONFIG.art.batchSize, { theme: p.theme, weights: this.mix });
      if (gen !== this.generation || p.dropped) return;
      const added = arts.filter((a) => this.accept(a));
      p.queued.push(...added);
      if (added.length === 0 || p.batch >= CONFIG.art.themeMaxBatches) p.exhausted = true;
    } catch (e) {
      console.warn(`[art] thème « ${p.theme.id} » indisponible`, e);
      if (p.batch >= CONFIG.art.themeMaxBatches) p.exhausted = true;
    } finally {
      p.fetching = false;
      if (gen === this.generation) this.pump();
    }
  }

  /** Œuvre jamais vue, affichable, ni filtrée : on la garde. */
  private accept(a: Artwork): boolean {
    if (this.seen.has(a.id)) return false;
    this.seen.add(a.id);
    if (!this.client.canDisplay(a) || this.disabledSources.has(a.source)) return false;
    if (this.filterSensitive && isSensitive(a)) {
      this.filteredCount++;
      return false;
    }
    return !(a.aspectRatio && (a.aspectRatio > CONFIG.art.maxAspect || a.aspectRatio < 1 / CONFIG.art.maxAspect));
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
      themeReady: [this.upcoming, ...this.activePools].reduce((n, p) => n + (p?.ready.length ?? 0), 0),
      themes: [...(this.upcoming ? [this.upcoming] : []), ...this.activePools]
        .map((p) => `${p.theme.id} ${p.ready.length}${p.loading ? `+${p.loading}` : ''} ${p.active ? 'ouvert' : p.exhausted ? 'épuisé' : 'en préparation'}`)
        .join(' · '),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    for (const r of this.ready) r.texture.dispose();
    this.ready = [];
    this.queued = [];
    this.waiters = [];
    this.dropAllPools();
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
    this.fetching++;
    const gen = this.generation;
    const batch = this.batch++;
    try {
      const arts = await this.client.fetchBatch(batch, CONFIG.art.batchSize, { weights: this.mix });
      if (gen !== this.generation) return;
      let added = 0;
      for (const a of arts) {
        if (!this.accept(a)) continue;
        this.queued.push(a);
        added++;
      }
      this.consecutiveFailures = added > 0 ? 0 : this.consecutiveFailures + 1;
    } catch (e) {
      console.warn('[art] lot impossible à récupérer', e);
      this.consecutiveFailures++;
    } finally {
      if (gen === this.generation) {
        this.fetching--;
        // Attente croissante après des échecs (2 s, 4 s, 8 s… max 30 s).
        if (this.consecutiveFailures > 0) this.retryAt = performance.now() + Math.min(30000, 1000 * 2 ** this.consecutiveFailures);
        this.pump();
      }
    }
  }

  /** Charge l'image suivante de la réserve générale, ou de celle d'un thème. */
  private loadNext(pool?: ThemePool): void {
    const art = (pool ? pool.queued : this.queued).shift()!;
    const gen = this.generation;
    if (pool) pool.loading++;
    else this.loading++;
    // Les emplacements en attente passent devant ; les thèmes passent après.
    const priority = this.waiters.length > 0 ? 0 : pool ? 7 : 5;
    const { promise } = this.loader.load(this.client.imageUrls(art, this.textureSize), this.textureSize, priority);
    promise
      .then((img) => {
        if (gen !== this.generation || this.disposed || pool?.dropped) {
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
        if (pool) {
          pool.ready.push(ready);
          return;
        }
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
          for (const p of [this.upcoming, ...this.activePools]) if (p) p.queued = p.queued.filter((q) => q.source !== art.source);
          console.warn(`[art] source « ${art.source} » écartée : ses images ne se chargent pas`);
        }
      })
      .finally(() => {
        if (gen === this.generation) {
          if (pool) pool.loading--;
          else this.loading--;
        }
        this.pump();
      });
  }
}
