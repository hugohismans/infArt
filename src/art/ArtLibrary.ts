import type * as THREE from 'three';
import type { Artwork, TypeWeights } from '../../shared/artwork';
import { isSensitive } from '../../shared/filter';
import { THEMES, themesFor, type ArtTheme } from '../../shared/themes';
import { CONFIG } from '../config';
import type { ArtClient } from './ArtClient';
import type { ImageLoader } from './ImageLoader';
import { readJson, writeJson } from '../progress/storage';

const THEME_HISTORY_KEY = 'galerie-infinie:themes';

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
  /** Né d'un intérêt du visiteur (et non tiré au hasard). */
  interest: boolean;
  /** Épinglée (thème promis par un panneau) : jamais libérée pour inactivité. */
  pinned: boolean;
  /** Emplacements d'une aile qui attendent une œuvre de ce thème. */
  waiters: Waiter[];
}

/** Œuvre en volume : posée sur un socle. */
function onPedestal(r: ReadyArt): boolean {
  return r.artwork.type === 'sculpture';
}

interface Interest {
  theme: ArtTheme;
  score: number;
  /** Date (ms) du score. */
  at: number;
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
  /** Thèmes déjà proposés, d'une visite à l'autre (les plus récents à la fin). */
  private recentThemes: string[] = readJson<string[]>(THEME_HISTORY_KEY, []);
  /** Thèmes apparentés aux œuvres qui ont retenu le visiteur. */
  private interests = new Map<string, Interest>();
  /** Le thème en préparation vient d'être écarté pour un intérêt : le suivant en vient forcément. */
  private forceInterest = false;
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
    this.pump();
  }

  /**
   * Prend une œuvre prête, s'il y en a, de préférence d'un des types `prefer`
   * (affinités de l'ambiance). Le demandeur devient responsable de sa texture.
   */
  take(prefer?: readonly string[], themeId?: string): ReadyArt | null {
    // (Les sculptures vont sur les socles, jamais au mur.)
    if (themeId) {
      const pool = this.activePools.find((p) => p.theme.id === themeId);
      const i = pool ? pool.ready.findIndex((r) => !onPedestal(r)) : -1;
      if (pool && i >= 0) {
        pool.lastTake = performance.now();
        const art = pool.ready.splice(i, 1)[0]!;
        this.pump();
        return art;
      }
      // Le thème a encore des œuvres à venir : l'emplacement les attend (requestTheme)
      // plutôt que d'accrocher une œuvre étrangère au thème.
      if (pool && !this.poolDone(pool)) return null;
    }
    let index = this.ready.findIndex((r) => !onPedestal(r));
    if (index < 0) return null;
    if (prefer && prefer.length > 0 && Math.random() < 0.75) {
      const i = this.ready.findIndex((r) => prefer.includes(r.artwork.type) && !onPedestal(r));
      if (i >= 0) index = i;
    }
    const art = this.ready.splice(index, 1)[0] ?? null;
    this.pump();
    return art;
  }

  /** Aperçu (écran d'accueil) : œuvres murales prêtes ou en file, sans les consommer. */
  preview(n: number): Artwork[] {
    return [...this.ready.map((r) => r.artwork), ...this.queued].filter((a) => a.type !== 'sculpture').slice(0, n);
  }

  /** Une sculpture prête pour un socle, s'il y en a (sinon le socle n'est pas installé). */
  takeSculpture(): ReadyArt | null {
    const i = this.ready.findIndex(onPedestal);
    if (i < 0) return null;
    const art = this.ready.splice(i, 1)[0]!;
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
    this.trimPools();
    this.pump();
    return p.theme;
  }

  /** Au plus deux ailes ouvertes à la fois, sans compter les thèmes épinglés. */
  private trimPools(): void {
    for (;;) {
      const free = this.activePools.filter((p) => !p.pinned);
      if (free.length <= 2) return;
      this.dropPool(free[0]!);
    }
  }

  /**
   * Prépare et ouvre tout de suite un thème précis (promis par un panneau, ou par la voix
   * off) ; il reste épinglé jusqu'à `unpinTheme`.
   */
  openTheme(theme: ArtTheme, pin = true): void {
    let p = this.activePools.find((x) => x.theme.id === theme.id);
    if (!p && this.upcoming?.theme.id === theme.id) {
      p = this.upcoming;
      this.upcoming = null;
      this.activePools.push(p);
    }
    if (!p) {
      p = { theme, queued: [], ready: [], loading: 0, batch: 0, fetching: false, exhausted: false, active: true, dropped: false, lastTake: 0, interest: false, pinned: pin, waiters: [] };
      this.activePools.push(p);
      this.rememberTheme(theme.id);
    }
    p.active = true;
    p.pinned ||= pin;
    p.lastTake = performance.now();
    this.trimPools();
    this.pump();
  }

  unpinTheme(id: string): void {
    const p = this.activePools.find((x) => x.theme.id === id);
    if (!p) return;
    p.pinned = false;
    p.lastTake = performance.now();
  }

  /** Œuvres prêtes d'un thème ouvert (pour patienter avant d'entrer). */
  themeReadyCount(id: string): number {
    return this.activePools.find((x) => x.theme.id === id)?.ready.length ?? 0;
  }

  /** Le visiteur n'en veut pas : ce thème ne revient plus (ni aile, ni intérêt). */
  banTheme(id: string): void {
    this.banned.add(id);
    this.interests.delete(id);
    const p = this.activePools.find((x) => x.theme.id === id) ?? (this.upcoming?.theme.id === id ? this.upcoming : null);
    if (p) {
      p.pinned = false;
      if (p === this.upcoming) this.upcoming = null;
      this.dropPool(p);
    }
  }
  private readonly banned = new Set<string>();

  /** Le visiteur change d'avis : le thème peut revenir. */
  unbanTheme(id: string): void {
    this.banned.delete(id);
  }

  /** Le thème le plus proche des goûts du moment (regards, fiches, favoris), sans le consommer. */
  topInterest(): ArtTheme | null {
    const now = performance.now();
    let best: ArtTheme | null = null;
    let score = 0.2;
    for (const i of this.interests.values()) {
      const s = this.decayed(i, now);
      if (s > score && this.themeAvailable(i.theme)) {
        score = s;
        best = i.theme;
      }
    }
    return best;
  }

  /** `n` thèmes fixes servis par les sources, au hasard, sauf ceux de `exclude`. */
  pickThemes(n: number, exclude: readonly string[] = []): ArtTheme[] {
    const pool = THEMES.filter((t) => !t.like && this.themeAvailable(t) && !exclude.includes(t.id));
    const out: ArtTheme[] = [];
    while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
    return out;
  }

  /**
   * Un emplacement d'aile attend une œuvre du thème, encore en chargement : il patiente
   * dans la file du thème (null si le thème n'a plus rien à offrir).
   */
  requestTheme(themeId: string, cb: Waiter): (() => void) | null {
    const p = this.activePools.find((x) => x.theme.id === themeId);
    if (!p || this.poolDone(p)) return null;
    p.waiters.push(cb);
    p.lastTake = performance.now();
    this.pump();
    return () => {
      const i = p.waiters.indexOf(cb);
      if (i >= 0) p.waiters.splice(i, 1);
      const j = this.waiters.indexOf(cb);
      if (j >= 0) this.waiters.splice(j, 1);
    };
  }

  /**
   * Une aile peut-elle continuer ? Seulement s'il reste au thème des œuvres connues (prêtes,
   * en chargement ou en file) pour un module de plus, une fois servis les emplacements qui
   * attendent déjà ; pendant une recherche, on accorde un module d'avance.
   */
  themeAlive(id: string): boolean {
    const p = this.activePools.find((x) => x.theme.id === id);
    if (!p) return false;
    const min = CONFIG.art.themeModuleMin;
    const spare = p.ready.length + p.queued.length + p.loading - p.waiters.length;
    return spare >= min || (p.fetching && !p.exhausted && p.waiters.length < min);
  }

  /** Le thème n'a plus rien à offrir (ni en file, ni en chargement, ni à demander). */
  private poolDone(p: ThemePool): boolean {
    return p.exhausted && p.queued.length === 0 && p.loading === 0;
  }

  /**
   * Le visiteur s'est intéressé à une œuvre (regard prolongé, fiche, favori, selon `strength`) :
   * les thèmes qui lui sont apparentés deviennent plus probables pour les prochaines ailes.
   */
  noteInterest(art: Artwork, strength: number): void {
    const now = performance.now();
    for (const { theme, weight } of themesFor(art)) {
      if (!this.themeAvailable(theme) || this.recentThemes.slice(-8).includes(theme.id)) continue;
      const cur = this.interests.get(theme.id);
      this.interests.set(theme.id, { theme, score: (cur ? this.decayed(cur, now) : 0) + strength * weight, at: now });
    }
    // Un intérêt marqué prend la place du thème quelconque qui se préparait (pas encore annoncé).
    const top = Math.max(0, ...[...this.interests.values()].map((i) => this.decayed(i, now)));
    if (this.upcoming && !this.upcoming.interest && !this.upcoming.active && top >= CONFIG.interest.preempt) {
      this.dropPool(this.upcoming);
      this.upcoming = null;
      this.forceInterest = true;
    }
    this.pump();
  }

  /** Un thème né des intérêts du visiteur est prêt à ouvrir une aile. */
  get interestReady(): boolean {
    return !!this.upcoming?.interest && this.upcoming.ready.length >= CONFIG.art.themeMinReady;
  }

  private decayed(i: Interest, now: number): number {
    return i.score * 0.5 ** ((now - i.at) / 1000 / CONFIG.interest.halfLife);
  }

  /** Thème servi par les sources disponibles (pas d'aile « cinéma » sans affiches de films). */
  private themeAvailable(t: ArtTheme): boolean {
    if (this.banned.has(t.id)) return false;
    return !t.types || t.types.some((type) => this.client.availableTypes.has(type));
  }

  /** Tire (et consomme) un thème parmi les intérêts, d'autant plus probablement qu'ils sont forts. */
  private pickInterest(): ArtTheme | null {
    const now = performance.now();
    const scored = [...this.interests.values()].map((i) => ({ i, s: this.decayed(i, now) })).filter((x) => x.s > 0.2);
    for (const [id, i] of this.interests) if (this.decayed(i, now) <= 0.2) this.interests.delete(id);
    const total = scored.reduce((n, x) => n + x.s, 0);
    const c = CONFIG.interest;
    const force = this.forceInterest;
    this.forceInterest = false;
    if (total <= 0 || (!force && Math.random() > Math.min(c.maxChance, (c.maxChance * total) / c.saturation))) return null;
    let r = Math.random() * total;
    const pick = scored.find((x) => (r -= x.s) <= 0) ?? scored[scored.length - 1]!;
    this.interests.delete(pick.i.theme.id);
    return pick.i.theme;
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

  /**
   * Les thèmes passent après la réserve générale : tant qu'elle a des emplacements en
   * attente, seules les ailes qui attendent elles aussi continuent de charger.
   */
  private pumpThemes(): void {
    if (this.offline) return;
    const starving = this.waiters.length > 0;
    const now = performance.now();
    // Une aile délaissée depuis 40 s ne réclamera plus rien : on libère ses textures.
    for (const p of [...this.activePools]) {
      if (!p.pinned && p.waiters.length === 0 && now - p.lastTake > 40000) this.dropPool(p);
    }
    if (this.upcoming && this.upcoming.exhausted && this.upcoming.loading === 0 && this.upcoming.queued.length === 0 && this.upcoming.ready.length < CONFIG.art.themeMinReady) {
      // Trop peu d'œuvres pour ce thème : on en essaie un autre.
      this.dropPool(this.upcoming);
      this.upcoming = null;
    }
    if (!this.upcoming && !starving && this.ready.length >= CONFIG.art.bufferTarget / 2) this.upcoming = this.newPool();
    for (const p of this.upcoming ? [this.upcoming, ...this.activePools] : this.activePools) {
      if (starving && p.waiters.length === 0) continue;
      const target = CONFIG.art.themeBufferTarget + p.waiters.length;
      while (p.queued.length > 0 && p.ready.length + p.loading < target) this.loadNext(p);
      if (!p.fetching && !p.exhausted && p.queued.length === 0 && p.ready.length + p.loading < target) {
        void this.fetchThemeBatch(p);
      }
      // Plus rien à charger pour ce thème : les emplacements qui l'attendaient prennent autre chose.
      if (p.exhausted && p.queued.length === 0 && p.loading === 0 && p.waiters.length > 0) {
        this.waiters.push(...p.waiters);
        p.waiters = [];
      }
    }
  }

  private newPool(): ThemePool {
    // D'abord les intérêts du visiteur ; sinon un thème fixe au hasard.
    const wanted = this.pickInterest();
    // Un thème fixe ne revient qu'une fois la plupart des autres proposés.
    const available = THEMES.filter((t) => this.themeAvailable(t));
    const memory = Math.floor(available.length * CONFIG.art.themeHistory);
    const recent = this.recentThemes.slice(-memory);
    const fresh = available.filter((t) => !recent.includes(t.id));
    const choices = fresh.length > 0 ? fresh : available;
    const theme = wanted ?? choices[Math.floor(Math.random() * choices.length)] ?? THEMES[0]!;
    this.rememberTheme(theme.id);
    return { theme, queued: [], ready: [], loading: 0, batch: 0, fetching: false, exhausted: false, active: false, dropped: false, lastTake: 0, interest: !!wanted, pinned: false, waiters: [] };
  }

  private rememberTheme(id: string): void {
    this.recentThemes = [...this.recentThemes.filter((x) => x !== id), id].slice(-THEMES.length);
    writeJson(THEME_HISTORY_KEY, this.recentThemes);
  }

  private dropPool(p: ThemePool): void {
    p.dropped = true;
    // Ce qui attendait une œuvre du thème se rabat sur la réserve générale.
    this.waiters.push(...p.waiters);
    p.waiters = [];
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
          const w = !onPedestal(ready) ? pool.waiters.shift() : undefined;
          if (w) w(ready);
          else pool.ready.push(ready);
          return;
        }
        if (onPedestal(ready)) {
          // Réserve de sculptures bornée : elles n'attendent que les socles.
          if (this.ready.filter(onPedestal).length >= CONFIG.art.sculptureStock) ready.texture.dispose();
          else this.ready.push(ready);
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
