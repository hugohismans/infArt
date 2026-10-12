import { resolveTheme, themesFor, type ArtTheme } from '../../shared/themes';
import type { Artwork } from '../../shared/artwork';
import type { ArtLibrary } from '../art/ArtLibrary';
import type { AudioEngine } from '../audio/AudioEngine';
import { AMBIANCES } from '../ambiances';
import { CONFIG } from '../config';
import type { Engine } from '../engine/Engine';
import { readJson, writeJson } from '../progress/storage';
import { isOpenAir } from '../world/resources';
import type { WorldModule } from '../world/WorldModule';
import { estimatedDuration, LINES, lineFamily, type LineId } from './script';

const KEY = 'galerie-infinie:narrateur';
/** Le thème proposé à la première visite. */
const FIRST_THEME = 'mer';

/**
 * Où en est le visiteur avec la mer : proposée (porte fléchée de la rotonde), prise,
 * refusée une fois (elle sera refléchée plus loin), refléchée, ou retirée pour de bon.
 */
type SeaState = 'propose' | 'pris' | 'refuse' | 'relance' | 'retire';

interface Memory {
  /** Répliques déjà entendues (chacune n'est jouée qu'une fois, sauf les retours). */
  heard: string[];
  sea: SeaState;
  firstVisit: number | null;
  lastVisit: number | null;
  /** Retours ordinaires : R03 et R04 alternent. */
  returns: number;
  ignoredSigns: number;
}

const FRESH: Memory = { heard: [], sea: 'propose', firstVisit: null, lastVisit: null, returns: 0, ignoredSigns: 0 };

/** Une réplique en cours de lecture. */
interface Clip {
  ended: boolean;
  stop(): void;
}

interface Pending {
  id: LineId;
  at: number;
}

/**
 * La voix off : le Conservateur. Il commente la visite en solo (jamais à deux), d'après
 * ce que fait le visiteur. Chaque réplique est un fichier audio (voix/<ID>.mp3, listés
 * dans voix/index.json) ; tant qu'il manque, la réplique s'affiche en sous-titre seul.
 *
 * Paramètres d'URL pour les essais : `narrateur=0` (muet), `narrateur=reset` (mémoire
 * effacée : première visite).
 */
export class Narrator {
  /** Sous-titre affiché. */
  current = $state<{ id: LineId; text: string } | null>(null);
  private memory: Memory;
  private engine: Engine | null = null;
  private timer = 0;
  private active = false;
  private queue: Pending[] = [];
  private playing: { id: LineId; until: number; audio: Clip | null } | null = null;
  private available: Set<string> | null = null;
  private sound = true;
  private lastEvent = -Infinity;
  private lastDebut = -Infinity;
  private visitTime = 0;
  private idle = 0;
  private push = 0;
  private placeholder = 0;
  private prev: WorldModule | null = null;
  private backCount = 0;
  private roomsSinceDwell = 0;
  private hiddenAt = 0;
  private leftRotonde = false;
  private seenAmbiance: string | null = null;
  private readonly onVisibility = () => this.visibility();
  readonly disabled: boolean;

  constructor(
    private readonly library: ArtLibrary,
    private readonly audio: AudioEngine,
  ) {
    const q = new URLSearchParams(window.location.search).get('narrateur');
    this.disabled = q === '0';
    if (q === 'reset') writeJson(KEY, FRESH);
    this.memory = { ...FRESH, ...readJson<Partial<Memory>>(KEY, {}) };
    if (this.memory.sea === 'retire') library.banTheme(FIRST_THEME);
    void this.loadManifest();
  }

  /**
   * Avant la visite : le thème à flécher sur une porte de la rotonde (tant que le visiteur
   * n'a pas choisi), préparé tout de suite pour que l'aile soit prête.
   */
  firstTheme(): ArtTheme | null {
    if (this.disabled || this.memory.sea !== 'propose') return null;
    const t = resolveTheme(FIRST_THEME);
    if (t) this.library.openTheme(t);
    return t;
  }

  /** Début de la visite (solo). `hub` : départ dans la rotonde. */
  start(engine: Engine, hub: boolean): void {
    this.engine = engine;
    this.active = !this.disabled;
    const now = Date.now();
    const m = this.memory;
    const first = m.firstVisit === null;
    if (first) m.firstVisit = now;
    if (this.active) {
      if (hub && m.sea === 'propose') {
        this.say('A01', 2);
        this.say('A02', 2);
      } else if (!first) this.sayReturn(now);
    }
    m.lastVisit = now;
    this.save();
    this.prev = engine.world.currentModule;
    this.seenAmbiance = this.prev?.preset.id ?? null;
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(0.25), 250);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.silence();
    this.engine = null;
  }

  /** Visite à deux : pas de narrateur. À la fin, il se réjouit d'être de nouveau seul avec vous. */
  setDuo(duo: boolean): void {
    if (this.disabled) return;
    this.active = !duo;
    if (duo) this.silence();
    else this.say('E18', 3);
  }

  /** Le son est coupé ou rétabli : la voix suit, les sous-titres restent. */
  setSound(on: boolean): void {
    const was = this.sound;
    this.sound = on;
    if (!this.engine || was === on) return;
    if (!on) {
      // La réplique en cours continue en sous-titre seul.
      const p = this.playing;
      if (p?.audio) {
        p.audio.stop();
        p.audio = null;
        p.until = performance.now() / 1000 + estimatedDuration(LINES[p.id]) / 2;
        this.audio.duck(false);
      }
      this.say('T01', 0.5);
    } else if (this.heard('T01')) this.say('T02', 0.5);
  }

  /** Arrêt prolongé devant une œuvre. */
  dwell(art: Artwork): void {
    if (!this.active) return;
    this.roomsSinceDwell = 0;
    const m = this.engine?.world.currentModule;
    if (this.memory.sea === 'retire' && themesFor(art).some((t) => t.theme.id === FIRST_THEME)) this.say('C05');
    else if (m?.zone.wing?.theme.id === FIRST_THEME && this.memory.sea === 'pris') this.say('B02');
    else this.say('D01');
  }

  favorite(): void {
    if (this.active) this.say('D02');
  }

  /** Succès débloqué (hors « premier pas », obtenu à l'entrée). */
  achievement(id: string): void {
    if (this.active && id !== 'premier-pas') this.say('E15');
  }

  // --- Déroulement ------------------------------------------------------------------

  private tick(dt: number): void {
    const e = this.engine;
    if (!e) return;
    const now = performance.now() / 1000;
    this.updatePlayback(now);
    if (!this.active || e.isPaused) return;
    this.visitTime += dt;
    const cur = e.world.currentModule;
    if (cur && cur !== this.prev) {
      const prev = this.prev;
      this.prev = cur;
      if (prev) this.moved(prev, cur);
    }

    // Immobile (sans même regarder autour : l'œil qui balaie la salle compte comme de l'activité).
    // (Le temps passé à l'écouter ne compte pas.)
    const still = e.player.speed < 0.05 && !e.input.hasMoveIntent && !this.playing && this.queue.length === 0;
    this.idle = still ? this.idle + dt : 0;
    const [r1, r2] = CONFIG.narrator.idleRotonde;
    if (cur?.def.kind === 'rotonde' && !this.leftRotonde && this.memory.sea === 'propose') {
      if (this.idle >= r1 && !this.heard('A03')) {
        this.say('A03');
        this.idle = 0;
      } else if (this.idle >= r2 - r1 && this.heard('A03')) this.say('A04');
    } else if (this.idle >= CONFIG.narrator.idle) this.say('E02');

    // Il pousse contre la limite d'un monde à ciel ouvert.
    const pushing = e.input.hasMoveIntent && e.player.speed < 0.15 && !!cur && isOpenAir(cur.preset);
    this.push = pushing ? this.push + dt : 0;
    if (this.push >= CONFIG.narrator.pushLimit) this.say('E14');

    // Un cadre drapé (image pas encore là) qu'on regarde avec insistance.
    const piece = e.pickPiece(0, 0);
    this.placeholder = piece && !piece.artwork && e.player.speed < 0.4 ? this.placeholder + dt : 0;
    if (this.placeholder >= 4) this.say('E11');

    if (this.visitTime >= 600) this.say('D08');
    if (this.visitTime >= 1800) this.say('E16');
    if (this.visitTime >= 3600) this.say('E17');
  }

  /** Passage d'un module à un autre : choix des portes, retours en arrière, découvertes. */
  private moved(prev: WorldModule, cur: WorldModule): void {
    const via = prev.connectors.findIndex((c) => c.neighbor?.module === cur);
    const backward = prev.connectors[0]?.neighbor?.module === cur && prev.def.kind !== 'rotonde';
    const m = this.memory;
    const sea = (mod: WorldModule) => mod.zone.wing?.theme.id === FIRST_THEME;

    // Sortie d'un module fléché : a-t-il suivi le panneau ?
    if (!backward && via >= 0 && prev.signs.length > 0) {
      const followed = prev.signs.some((s) => s.connector === via);
      const seaSign = prev.signs.some((s) => s.themeId === FIRST_THEME);
      if (prev.def.kind === 'rotonde' && seaSign && (m.sea === 'propose' || m.sea === 'refuse')) {
        this.leftRotonde = true;
        // Le choix est fait : l'accueil s'interrompt (même au milieu d'une phrase).
        this.cutIntro();
        if (followed) {
          this.say(m.sea === 'propose' ? 'B01' : 'C06');
          this.setSea('pris');
        } else if (m.sea === 'propose') {
          this.say('C01');
          this.setSea('refuse');
          // Deuxième chance, au prochain carrefour qui s'y prête.
          this.engine!.world.forcedSign = resolveTheme(FIRST_THEME);
        }
      } else if (seaSign && m.sea === 'relance') {
        if (followed) {
          this.say('C03');
          this.setSea('pris');
        } else {
          this.say('C04');
          this.setSea('retire');
          this.library.banTheme(FIRST_THEME);
        }
      } else if (prev.def.kind !== 'rotonde') {
        if (followed) this.say('D05');
        else {
          m.ignoredSigns++;
          this.say(m.ignoredSigns >= 2 && this.heard('D06') ? 'D07' : 'D06');
          this.save();
        }
      }
    }
    if (prev.def.kind === 'rotonde') this.leftRotonde = true;

    // Entrée dans un module fléché.
    if (!backward && cur.signs.length > 0 && cur.def.kind !== 'rotonde') {
      if (cur.signs.some((s) => s.themeId === FIRST_THEME) && m.sea === 'refuse') {
        this.engine!.world.forcedSign = null;
        this.setSea('relance');
        this.say('C02');
      } else if (!cur.signs.some((s) => s.themeId === FIRST_THEME)) this.say('D04');
    }

    // Demi-tours.
    this.backCount = backward ? this.backCount + 1 : 0;
    if (backward && sea(prev) && m.sea === 'pris') this.say('B03');
    if (this.backCount >= CONFIG.narrator.backtrackRooms) this.say('E12');
    if (!backward && sea(cur) && cur.zone.wing!.left === 1 && m.sea === 'pris') this.say('B04');

    // Il traverse sans rien regarder.
    if (!backward && cur.artCount > 0) {
      this.roomsSinceDwell++;
      if (this.roomsSinceDwell >= CONFIG.narrator.rushRooms) this.say('E01');
    }

    // Nouvelle ambiance (hors portes de la rotonde : on ne fait que commencer).
    const amb = AMBIANCES[cur.preset.id] ? cur.preset.id : null;
    if (amb && amb !== this.seenAmbiance) {
      if (this.seenAmbiance && prev.def.kind !== 'rotonde') this.say('D03');
      this.seenAmbiance = amb;
    }
    if (isOpenAir(cur.preset)) this.say('E13');
    if (cur.def.kind === 'deadend' || cur.def.kind === 'cap') this.say('E10');

    // Étrangetés.
    const odd = cur.zone.oddity;
    if (cur.isLoopCopy) this.say('E05');
    else if (odd === 'salle-vide' && cur.def.kind === 'room') this.say('E04');
    else if (odd === 'veste-cafe') this.say('E08');
    else if (odd === 'a-l-envers') this.say('E09');
    else if (odd === 'oeuvre-plafond') this.say('E07');
    else if (cur.sealEntrance) this.say('E06', 5);
  }

  private visibility(): void {
    if (document.hidden) {
      // (Le son du jeu est suspendu avec l'onglet : la voix reprend où elle en était.)
      this.hiddenAt = performance.now();
      return;
    }
    if (this.hiddenAt && performance.now() - this.hiddenAt > CONFIG.narrator.hiddenTab * 1000) this.say('E03', 1.5);
    this.hiddenAt = 0;
  }

  private sayReturn(now: number): void {
    const m = this.memory;
    const last = m.lastVisit ?? now;
    const hour = new Date(now).getHours();
    const day = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);
    const days = day(now) - day(last);
    let id: LineId;
    if (hour < 5 && !this.heard('R06')) id = 'R06';
    else if (days === 0) id = 'R01';
    else if (days === 1) id = 'R02';
    else if (days <= 30) id = m.returns++ % 2 === 0 ? 'R03' : 'R04';
    else id = 'R05';
    this.say(id, 2.5);
  }

  // --- Lecture ----------------------------------------------------------------------

  private heard(id: LineId): boolean {
    return this.memory.heard.includes(id);
  }

  /** Demande une réplique, jouée dès que possible (`delay` : au plus tôt dans n secondes). */
  private say(id: LineId, delay = 0): void {
    if (!this.active) return;
    const repeatable = id[0] === 'R';
    if (!repeatable && this.heard(id)) return;
    if (this.queue.some((p) => p.id === id) || this.playing?.id === id) return;
    const now = performance.now() / 1000;
    const fam = lineFamily(id);
    // Les écarts minimaux s'appliquent à la demande : une occasion manquée n'est pas reportée.
    if (fam === 'evenement' && now - this.lastEvent < CONFIG.narrator.eventGap) return;
    if (fam === 'debut' && now - this.lastDebut < CONFIG.narrator.firstVisitGap) return;
    if (fam === 'evenement') this.lastEvent = now;
    if (fam === 'debut') this.lastDebut = now;
    this.queue.push({ id, at: now + delay });
    // Marquée tout de suite : une réplique ne revient jamais, même si on quitte au milieu.
    if (!repeatable) this.memory.heard.push(id);
    this.save();
  }

  /** Coupe l'accueil (A01–A04) en cours ou en attente. */
  private cutIntro(): void {
    this.queue = this.queue.filter((p) => p.id[0] !== 'A');
    if (this.playing && this.playing.id[0] === 'A') {
      this.playing.audio?.stop();
      this.finish();
    }
  }

  private updatePlayback(now: number): void {
    const e = this.engine;
    const p = this.playing;
    if (p && (p.audio ? p.audio.ended : now >= p.until)) this.finish();
    if (this.playing || !e) return;
    // Pas pendant une pause (menu, fiche) ; une réplique trop ancienne est abandonnée.
    this.queue = this.queue.filter((p) => lineFamily(p.id) === 'scenario' || now - p.at < CONFIG.narrator.staleAfter);
    if (e.isPaused || document.hidden) return;
    const next = this.queue.find((p) => p.at <= now);
    if (!next) return;
    this.queue.splice(this.queue.indexOf(next), 1);
    this.play(next.id, now);
  }

  private play(id: LineId, now: number): void {
    const text = LINES[id];
    this.current = { id, text };
    const estimate = estimatedDuration(text);
    const ctx = this.audio.externalInputs()?.ctx;
    const audio = this.sound && ctx && lineFamily(id) !== 'texte' && this.available?.has(id) ? this.startClip(ctx, id, estimate) : null;
    this.playing = { id, until: now + estimate, audio };
  }

  /**
   * Joue le fichier de la réplique dans le contexte audio du jeu (débloqué au clic sur
   * « Entrer », y compris sur iPhone, où un simple <audio> lancé plus tard resterait muet).
   * Fichier introuvable ou illisible : la réplique reste en sous-titre, le temps de la lire.
   */
  private startClip(ctx: AudioContext, id: LineId, estimate: number): Clip {
    let source: AudioBufferSourceNode | null = null;
    const clip: Clip = {
      ended: false,
      stop: () => {
        clip.ended = true;
        source?.stop();
      },
    };
    const fallback = () => {
      const p = this.playing;
      if (p?.audio !== clip) return;
      p.audio = null;
      p.until = performance.now() / 1000 + estimate;
      this.audio.duck(false);
    };
    const timeout = window.setTimeout(fallback, 5000);
    this.buffer(ctx, id).then(
      (buf) => {
        window.clearTimeout(timeout);
        if (clip.ended || this.playing?.audio !== clip) return;
        source = ctx.createBufferSource();
        source.buffer = buf;
        source.connect(ctx.destination);
        source.onended = () => (clip.ended = true);
        source.start();
      },
      () => {
        window.clearTimeout(timeout);
        fallback();
      },
    );
    this.audio.duck(true);
    return clip;
  }

  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private buffer(ctx: AudioContext, id: LineId): Promise<AudioBuffer> {
    let b = this.buffers.get(id);
    if (!b) {
      b = fetch(`${import.meta.env.BASE_URL}voix/${id}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => ctx.decodeAudioData(data));
      // (Chaque réplique n'est jouée qu'une fois : pas besoin de garder le son décodé.)
      b.catch(() => undefined).finally(() => this.buffers.delete(id));
      this.buffers.set(id, b);
    }
    return b;
  }

  private finish(): void {
    this.playing = null;
    this.current = null;
    this.audio.duck(false);
  }

  private silence(): void {
    this.queue = [];
    this.playing?.audio?.stop();
    if (this.playing) this.finish();
  }

  private setSea(s: SeaState): void {
    this.memory.sea = s;
    if (s === 'pris' || s === 'retire') this.library.unpinTheme(FIRST_THEME);
    this.save();
  }

  private save(): void {
    writeJson(KEY, this.memory);
  }

  private async loadManifest(): Promise<void> {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}voix/index.json`, { cache: 'no-cache' });
      if (!r.ok) return;
      const ids = (await r.json()) as string[];
      this.available = new Set(ids);
    } catch {
      /* pas de voix enregistrée : sous-titres seuls */
    }
  }
}
