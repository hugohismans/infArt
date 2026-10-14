import { resolveTheme, themesFor } from '../../shared/themes';
import type { Artwork } from '../../shared/artwork';
import type { ArtLibrary } from '../art/ArtLibrary';
import type { ArtPiece } from '../art/ArtPiece';
import { LOCAL_SOURCE } from '../art/ArtClient';
import type { AudioEngine } from '../audio/AudioEngine';
import { AMBIANCES, DEFAULT_AMBIANCE } from '../ambiances';
import { CONFIG } from '../config';
import { isTouchDevice, type Engine } from '../engine/Engine';
import { collection } from '../progress/collection.svelte';
import { progress } from '../progress/achievements.svelte';
import { applyTransform } from '../world/math2d';
import { isOpenAir } from '../world/resources';
import type { HubOptions, SignPlan, World } from '../world/World';
import type { ModuleSign, WorldModule } from '../world/WorldModule';
import { loadMemory, MEMORY_KEY, saveMemory, type Memory, type SeaState } from './memory';
import { applyEssai } from './essais'; // TESTS : à retirer
import { estimatedDuration, LINES, lineFamily, type LineId } from './script';

/** Le thème proposé à la première visite. */
const FIRST_THEME = 'mer';

/** La toile blanche du Conservateur (histoire 1), quand le visiteur la garde. */
export const SANS_TITRE: Artwork = {
  id: `${LOCAL_SOURCE}:sans-titre`,
  source: LOCAL_SOURCE,
  type: 'peinture',
  title: 'Sans titre',
  creator: 'le Conservateur',
  date: 'jamais terminé',
  medium: 'Toile blanche, sur châssis',
  description: 'Le seul tableau du Conservateur. Il n’a jamais su peindre, seulement accrocher. Personne ne l’avait regardé avant vous.',
  tags: ['atelier'],
  imageUrl: 'oeuvres/sans-titre.jpg',
  aspectRatio: 900 / 1150,
  sourceUrl: '',
  license: 'Ailleurs',
  credit: 'Le Conservateur',
};

/** La salle punition de la visite guidée : une seule toile, et son cartel. */
const PUNITION: Artwork = {
  id: `${LOCAL_SOURCE}:autre-porte`,
  source: LOCAL_SOURCE,
  type: 'peinture',
  title: 'Vous auriez dû prendre l’autre porte',
  creator: 'le Conservateur',
  date: 'tout à l’heure',
  medium: 'Toile blanche, sur châssis',
  description: 'Accrochée exprès pour vous, pendant que vous preniez la mauvaise porte.',
  tags: [],
  imageUrl: 'oeuvres/sans-titre.jpg',
  aspectRatio: 900 / 1150,
  sourceUrl: '',
  license: 'Ailleurs',
  credit: 'Le Conservateur',
};

/** Variantes des événements : jouées, une fois chacune, quand l'original a déjà été entendu. */
const VARIANTS: Record<string, string[]> = Object.fromEntries(
  Array.from({ length: 18 }, (_, i) => {
    const n = (k: number) => `E${String(k).padStart(2, '0')}`;
    return [n(i + 1), [n(19 + 2 * i), n(20 + 2 * i)]];
  }),
);

/** Les mondes : première rencontre, puis retour lors d'une visite suivante. */
const WORLDS: Record<string, [string, string]> = {
  'beaux-arts': ['W01', 'W02'], 'white-cube': ['W03', 'W04'], serre: ['W05', 'W06'], baroque: ['W07', 'W08'],
  'galerie-japonaise': ['W09', 'W10'], bibliotheque: ['W11', 'W12'], cabinet: ['W13', 'W14'], disquaire: ['W15', 'W16'],
  videoclub: ['W17', 'W18'], arcade: ['W19', 'W20'], cinema: ['W21', 'W22'], ruines: ['W23', 'W24'],
  travaux: ['W25', 'W26'], givre: ['W27', 'W28'], foret: ['W29', 'W30'], desert: ['W31', 'W32'],
  neant: ['W33', 'W34'], 'reve-pastel': ['W35', 'W36'], vaporwave: ['W37', 'W38'], englouti: ['W39', 'W40'],
  station: ['W41', 'W42'], 'musee-nuit': ['W43', 'W44'], 'bureaux-nuit': ['W45', 'W46'], hopital: ['W47', 'W48'],
  parking: ['W49', 'W50'], 'back-rooms': ['W51', 'W52'], poolrooms: ['W53', 'W54'], escher: ['W55', 'W56'],
  miroirs: ['W57', 'W58'], inverse: ['W59', 'W60'], geant: ['W61', 'W62'], miniature: ['W61', 'W62'], respire: ['W63', 'W64'],
};

/** Histoire 5 : les fragments, dans l'ordre ; un par visite (avec sa suite). L'index 10 est la question. */
const FRAGMENTS: string[][] = [
  ['H01'], ['H02'], ['H03'], ['H04'], ['H05'], ['H06'], ['H07'], ['H08'], ['H09'], ['H10'], ['H11'],
  ['H18', 'H19'], ['H20'], ['H21', 'H22'], ['H23'], ['H24', 'H25'], ['H26'], ['H27', 'H28'], ['H29'],
  ['H30', 'H31'], ['H32', 'H33'], ['H34', 'H35'], ['H36', 'H37'], ['H38', 'H39'], ['H40'],
];
const QUESTION = 10;

/** Dates du calendrier (mois 1-12, jour). */
function calendarLine(d: Date, m: Memory): LineId | null {
  const mo = d.getMonth() + 1, day = d.getDate(), dow = d.getDay(), h = d.getHours();
  const fixed: Record<string, LineId> = { '1-1': 'N01', '2-14': 'N02', '4-1': 'N03', '6-21': 'N04', '7-14': 'N05', '10-31': 'N06', '12-24': 'N07', '12-25': 'N08', '12-31': 'N09', '5-18': 'N19', '2-29': 'N20' };
  const f = fixed[`${mo}-${day}`];
  if (f) return f;
  if (m.firstVisit) {
    const first = new Date(m.firstVisit);
    if (first.getMonth() === d.getMonth() && first.getDate() === day && first.getFullYear() < d.getFullYear()) return 'N17';
  }
  if (dow === 5 && day === 13) return 'N10';
  if (h >= 3 && h < 4) return 'N16';
  // Dernier dimanche de mars ou d'octobre : changement d'heure.
  if (dow === 0 && (mo === 3 || mo === 10) && day + 7 > new Date(d.getFullYear(), mo, 0).getDate()) return 'N18';
  if (dow === 0 && h >= 7 && h < 12) return 'N11';
  if (dow === 1 && h >= 6 && h < 11) return 'N12';
  if (mo === 9 && day <= 7) return 'N15';
  if (mo === 7 || mo === 8) return 'N14';
  return null;
}

/** Une réplique en cours de lecture. */
interface Clip {
  ended: boolean;
  stop(): void;
}

interface Pending {
  id: LineId;
  at: number;
  after?: () => void;
  /** Au moment où elle commence (le « soleil ! » fige tout). */
  onStart?: () => void;
  /** Demandée par la fin de la réplique précédente : c'est la suite, elle passe avant le reste. */
  chained?: boolean;
}

/** La récréation : les morceaux du comptage (rejoués à chaque manche) et les « je vous ai vu ». */
const COUNT_LINES = new Set(['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10']);
const CAUGHT_LINES = ['L18', 'L19', 'L20', 'L21', 'L22'];
/** Ses commentaires de partie : périmés dès qu'il vous voit bouger (ou que vous gagnez). */
const RECRE_COMMENTS = new Set(['L26', 'L27', 'L28', 'L29', 'L30']);
/** Durées des morceaux de comptage sans voix enregistrée (sous-titres seuls), en secondes. */
const COUNT_FALLBACK: Record<string, number> = { L01: 0.6, L02: 0.6, L03: 0.7, L04: 0.5, L05: 0.6, L06: 0.5, L07: 1.3, L08: 1.4, L09: 3.2, L10: 1.8 };

/**
 * La voix off : le Conservateur. Il commente la visite en solo (jamais à deux), d'après
 * ce que fait le visiteur, et raconte cinq histoires sur plusieurs visites (voir le doc
 * « Trame de la voix off, saison 2 »). Chaque réplique est un fichier audio
 * (voix/<ID>.mp3, listés dans voix/index.json) ; tant qu'il manque, sous-titre seul.
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
  /** Le visiteur a demandé le silence (histoire 5, ou porte de la finale) : plus rien jusqu'à la fin. */
  private silent = false;
  private queue: Pending[] = [];
  private playing: { id: LineId; until: number; audio: Clip | null; after?: () => void } | null = null;
  private available: Set<string> | null = null;
  private sound = true;
  private lastEvent = -Infinity;
  private lastDebut = -Infinity;
  private lastMonde = -Infinity;
  private lastStory = -Infinity;
  /** Fin de la dernière réplique d'histoire (s) : un commentaire laisse un temps avant de parler. */
  private storyEnd = -Infinity;
  private visitTime = 0;
  private walkedAtStart = 0;
  private idle = 0;
  private push = 0;
  private placeholder = 0;
  private prev: WorldModule | null = null;
  private backCount = 0;
  private roomsSinceDwell = 0;
  private hiddenAt = 0;
  private leftRotonde = false;
  private seenAmbiance: string | null = null;
  /** Cette visite : étrangetés croisées, escaliers, ruptures, pauses, fiches… */
  private v = {
    oddities: new Set<string>(),
    stairs: 0,
    ruptures: 0,
    pauses: 0,
    sheetAt: 0,
    collectionOpens: 0,
    removed: 0,
    favsAdded: 0,
    sheetsByArt: new Map<string, number>(),
    gazeArt: '' as string,
    gaze: 0,
    lookDown: 0,
    lookUp: 0,
    spin: [] as Array<{ t: number; d: number }>,
    lastYaw: 0,
    run: 0,
    autoWalk: 0,
    lastWing: -1,
    aspect: 0,
    fragmentDone: false,
    suitePending: null as string | null,
    suiteAt: 0,
    roundDone: false,
    question: false,
    sortieStarted: false,
    signGapModules: 0,
    rappel: false,
    /** Une histoire a commencé ou s'est terminée pendant cette visite. */
    storyMoment: false,
    /** Rappel du jeu des consignes déjà fait cette visite. */
    guideRappel: false,
    /** Il s'est arrêté devant une œuvre pendant cette visite. */
    dwelled: false,
  };
  private readonly onVisibility = () => this.visibility();
  private readonly onResize = () => this.resized();
  private readonly onFullscreen = () => this.fullscreenChanged();
  readonly disabled: boolean;

  constructor(
    private readonly library: ArtLibrary,
    private readonly audio: AudioEngine,
  ) {
    const q = new URLSearchParams(window.location.search).get('narrateur');
    this.disabled = q === '0';
    this.visitTime = applyEssai(MEMORY_KEY); // TESTS : à retirer
    this.memory = loadMemory(q === 'reset');
    if (this.memory.sea === 'retire') library.banTheme(FIRST_THEME);
    void this.loadManifest();
  }

  private get m(): Memory {
    return this.memory;
  }

  /**
   * Avant la visite : comment préparer la salle ronde. Première visite, la porte « LA MER »
   * (son aile se prépare tout de suite) ; quand toutes les histoires sont finies, la salle
   * ronde à cinq portes de la finale.
   */
  hubOptions(): HubOptions {
    if (this.disabled) return {};
    if (this.m.story === 6 && !this.m.finaleDone) return { finale: true, prepare: (mod, world) => this.prepareFinale(mod, world) };
    if (this.m.sea !== 'propose') return {};
    const t = resolveTheme(FIRST_THEME);
    if (t) this.library.openTheme(t);
    return { firstTheme: t };
  }

  /** Début de la visite (solo). `hub` : départ dans la salle ronde. */
  start(engine: Engine, hub: boolean): void {
    this.engine = engine;
    this.active = !this.disabled;
    const m = this.m;
    const now = Date.now();
    const first = m.firstVisit === null;
    if (first) m.firstVisit = now;
    const lastVisit = m.lastVisit;
    m.visits++;
    const dayKey = new Date(now).toDateString();
    m.day = m.day.key === dayKey ? { key: dayKey, n: m.day.n + 1 } : { key: dayKey, n: 1 };
    const device = isTouchDevice() ? 'mobile' : 'pc';
    const deviceChanged = m.device !== null && m.device !== device;
    m.device = device;
    // Visite guidée laissée en plan la dernière fois : reprise au début si le noir n'était
    // pas encore tombé ; sinon c'est fini (et il le fera savoir).
    const g = m.guide;
    if (g.stage === 'jeu') m.guide = { stage: 'attente', round: 0, obeyed: 0, choices: [] };
    else if (g.stage === 'noir' || g.stage === 'bouquet') {
      g.stage = 'fin';
      g.left = true;
    }
    // Récréation laissée en pleine partie : finie (il le fera savoir) ; pas encore commencée : à refaire.
    if (m.recre.stage === 'jeu') m.recre = { ...m.recre, stage: 'fin', left: true };
    else if (m.recre.stage === 'invite') m.recre = { stage: 'attente', fails: 0 };
    engine.world.signPlanner = (mod, exits) => this.plan(mod, exits);
    engine.world.avoidDeadEnds = () => {
      const m = this.m;
      return this.active && (m.sortie.stage === 'chemin' || m.sortie.stage === 'ignore' || m.atelier.stage === 'quete' || m.autre.stage === 'poursuite' || m.recre.stage === 'invite');
    };
    this.walkedAtStart = m.walked;
    if (this.active) {
      if (hub && m.story === 6 && !m.finaleDone) {
        this.say('X07', 2);
        this.say('X08', 2);
      } else if (hub && m.sea === 'propose') {
        this.say('A01', 2);
        this.say('A02', 2);
      } else if (!first) this.sayReturn(now, lastVisit, deviceChanged);
    }
    // Ce qu'on retient de la visite qui commence (mis à jour au fil de l'eau).
    m.lastVisit = now;
    m.lastDuration = 0;
    m.lastFavsAdded = 0;
    m.lastWasDuo = false;
    this.save();
    this.prev = engine.world.currentModule;
    this.seenAmbiance = this.prev?.preset.id ?? null;
    this.v.aspect = window.innerWidth / window.innerHeight;
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(0.25), 250);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onFullscreen);
  }

  stop(): void {
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    this.silence();
    this.guideRestore();
    this.recreRestore();
    this.engine = null;
  }

  /** Visite à deux : pas de narrateur. À la fin, il se réjouit d'être de nouveau seul avec vous. */
  setDuo(duo: boolean): void {
    if (this.disabled) return;
    this.active = !duo;
    if (duo) {
      // Pas de visite guidée à deux : on rallume, elle attendra une visite en solo.
      const g = this.m.guide;
      if (g.stage === 'jeu' || g.stage === 'noir' || g.stage === 'bouquet') {
        this.m.guide = { stage: 'attente', round: 0, obeyed: 0, choices: [] };
        this.guideRestore();
      }
      // Pas de récréation à deux non plus : on rouvre, elle attendra.
      if (this.m.recre.stage === 'invite' || this.m.recre.stage === 'jeu') {
        this.m.recre = { stage: 'attente', fails: 0 };
        this.recreRestore();
      }
      this.m.lastWasDuo = true;
      this.save();
      this.silence();
    } else this.sayEvent('E18', 3);
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
        p.until = performance.now() / 1000 + estimatedDuration(LINES[p.id] ?? '') / 2;
        this.audio.duck(false);
      }
      this.say('T01', 0.5);
    } else if (this.heard('T01')) this.say('T02', 0.5);
  }

  // --- Ce que l'interface lui signale ------------------------------------------------

  /** Arrêt prolongé devant une œuvre. */
  dwell(art: Artwork): void {
    if (!this.live) return;
    this.roomsSinceDwell = 0;
    this.v.dwelled = true;
    const m = this.m;
    const cur = this.engine?.world.currentModule;
    const sea = themesFor(art).some((t) => t.theme.id === FIRST_THEME);
    // Histoires en cours d'abord.
    if (m.atelier.stage === 'quete') this.say(cur?.zone.oddity === 'salle-vide' && cur.def.kind === 'room' && !this.heard('P02') ? 'P02' : 'P09');
    else if (m.sortie.stage === 'chemin' && m.sortie.step > 0) this.say('S10');
    else if (m.autre.stage === 'poursuite') this.say(collection.has(art.id) ? 'V14' : 'V13');
    else if (cur?.special === 'favoris') this.say('V19');
    else if (m.sea === 'retire' && sea) this.say('C05');
    else if (cur?.zone.wing?.theme.id === FIRST_THEME && m.sea === 'pris') this.say(this.heard('B02') ? 'M01' : 'B02');
    else if (m.sea === 'pris' && sea && m.visits >= 2) this.say('M01');
    else if (collection.has(art.id)) this.say('K10');
    else {
      const byType: Record<string, LineId> = { sculpture: 'E89', 'affiche-film': 'E90', 'jaquette-jeu': 'E91', 'pochette-disque': 'E92', 'couverture-livre': 'E93' };
      const t = byType[art.type];
      if (t && !this.heard(t)) this.say(t);
      else this.say('D01');
    }
    this.calmMoment();
  }

  /** Un favori ajouté (`added`) ou retiré. */
  favorite(art: Artwork, added: boolean): void {
    if (!this.live) return;
    const n = collection.items.length;
    const cur = this.engine?.world.currentModule;
    if (!added) {
      this.v.removed++;
      if (performance.now() - this.v.sheetAt < 8000 && this.v.favsAdded > 0) this.say('K18');
      else this.say(this.v.removed >= 3 ? 'K07' : 'K06');
      return;
    }
    this.v.favsAdded++;
    this.m.lastFavsAdded = this.v.favsAdded;
    this.save();
    if (cur?.special === 'favoris') return this.say('V29');
    if (themesFor(art).some((t) => t.theme.id === FIRST_THEME) && this.m.sea === 'pris') return this.say('M08');
    const milestones: Record<number, LineId> = { 5: 'K01', 10: this.m.story === 3 && this.m.autre.stage !== 'fin' ? 'K19' : 'K02', 25: 'K03', 50: 'K04', 100: 'K05' };
    if (milestones[n]) return this.say(milestones[n]!);
    const firstOfType: Record<string, LineId> = { 'affiche-film': 'K12', 'jaquette-jeu': 'K13', 'pochette-disque': 'K14', 'couverture-livre': 'K15', sculpture: 'K16' };
    const t = firstOfType[art.type];
    if (t && collection.items.filter((s) => s.art.type === art.type).length === 1) return this.say(t);
    this.say('D02');
  }

  /** La collection est ouverte. */
  collectionOpened(): void {
    if (!this.live) return;
    this.v.collectionOpens++;
    if (this.m.atelier.canvas && collection.has(SANS_TITRE.id)) {
      if (!this.heard('P24')) return this.say('P24');
      if (this.m.visits > 1) this.say(this.heard('P25') ? 'K20' : 'P25');
      return;
    }
    if (this.v.collectionOpens >= 5) return this.say('K09');
    this.say('K08');
  }

  /** Fiche d'une œuvre ouverte, puis fermée. */
  sheetOpened(art: Artwork): void {
    this.v.sheetAt = performance.now();
    this.m.sheets++;
    this.save();
    if (!this.live) return;
    const k = (this.v.sheetsByArt.get(art.id) ?? 0) + 1;
    this.v.sheetsByArt.set(art.id, k);
    if (k === 3) return this.say('K17');
    if (this.m.sheets === 10) return this.say('E71');
    if (this.m.sheets === 1) this.say('E70');
  }

  sheetClosed(): void {
    if (this.live && performance.now() - this.v.sheetAt < 2000) this.say('E72', 0.5);
  }

  /** Menu de pause refermé. */
  resumed(): void {
    if (!this.live) return;
    if (this.m.guide.stage === 'noir') return this.say('J45', 0.5);
    if (this.m.recre.stage === 'jeu') return this.say('L31', 0.5);
    this.v.pauses++;
    if (this.v.pauses === 5) this.say('E74', 1);
    else if (this.v.pauses === 1) this.say('E73', 1);
  }

  autoWalkChanged(on: boolean): void {
    if (!this.live) return;
    if (on) this.say('E75', 1);
    else if (this.v.autoWalk > 20) this.say('E77', 0.5);
    this.v.autoWalk = 0;
  }

  /** Changement d'ambiance brutal (noir, parasites). */
  rupture(): void {
    if (!this.live || this.quietRupture) return;
    this.v.ruptures++;
    const id = (['E60', 'E61', 'E62'] as const)[Math.min(2, this.v.ruptures - 1)]!;
    this.say(id, 2);
  }

  /** Succès débloqué (hors « premier pas », obtenu à l'entrée). */
  achievement(id: string): void {
    if (!this.live || id === 'premier-pas') return;
    if (id === 'la-sortie') this.say('S34', 4);
    else if (id === 'bouquet-final' || id === 'recreation') return;
    else this.sayEvent('E15');
  }

  // --- Déroulement ------------------------------------------------------------------

  private get live(): boolean {
    return this.active && !this.silent && !!this.engine;
  }

  private tick(dt: number): void {
    const e = this.engine;
    if (!e) return;
    const now = performance.now() / 1000;
    this.updatePlayback(now);
    if (!this.active || e.isPaused) return;
    this.visitTime += dt;
    // Mémoire de la visite (au cas où elle s'arrête brutalement).
    this.m.walked = this.walkedAtStart + e.walked;
    this.m.lastDuration = this.visitTime;
    if (Math.floor(this.visitTime * 4) % 20 === 0) this.save();
    if (this.silent) return;
    const cur = e.world.currentModule;
    if (cur && cur !== this.prev) {
      const prev = this.prev;
      this.prev = cur;
      if (prev) this.moved(prev, cur);
    }

    // Immobile (le temps passé à l'écouter ne compte pas).
    const still = e.player.speed < 0.05 && !e.input.hasMoveIntent && !this.playing && this.queue.length === 0;
    this.idle = still ? this.idle + dt : 0;
    this.idleTriggers(cur);

    // Il pousse contre la limite d'un monde à ciel ouvert.
    const pushing = e.input.hasMoveIntent && e.player.speed < 0.15 && !!cur && isOpenAir(cur.preset);
    this.push = pushing ? this.push + dt : 0;
    if (this.push >= CONFIG.narrator.pushLimit) this.sayEvent('E14');

    // Ce qu'il regarde : un cadre drapé, la même œuvre longtemps, le sol, le plafond.
    const piece = e.pickPiece(0, 0);
    const slow = e.player.speed < 0.4;
    this.placeholder = piece && !piece.artwork && slow ? this.placeholder + dt : 0;
    if (this.placeholder >= 4) this.sayEvent('E11');
    const id = piece?.artwork?.id ?? '';
    this.v.gaze = id && id === this.v.gazeArt && slow ? this.v.gaze + dt : 0;
    this.v.gazeArt = id;
    if (this.v.gaze >= 60) this.say('E69');
    else if (this.v.gaze >= 30) this.say(this.heard('E67') ? 'E68' : 'E67');
    this.v.lookDown = e.player.pitch < -0.9 ? this.v.lookDown + dt : 0;
    this.v.lookUp = e.player.pitch > 0.9 ? this.v.lookUp + dt : 0;
    if (this.v.lookDown >= 10) this.say('E95');
    if (this.v.lookUp >= 10) this.say('E96');
    // Il tourne sur lui-même (deux tours en quelques secondes).
    let d = e.player.yaw - this.v.lastYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.v.lastYaw = e.player.yaw;
    this.v.spin.push({ t: now, d: Math.abs(d) });
    this.v.spin = this.v.spin.filter((s) => now - s.t < 6);
    if (this.v.spin.reduce((a, s) => a + s.d, 0) > Math.PI * 4) this.say('E97');
    // Course, auto-marche.
    this.v.run = e.input.run && e.player.speed > CONFIG.player.walkSpeed * 1.2 ? this.v.run + dt : 0;
    if (this.v.run > 1) this.say(this.m.sortie.stage === 'chemin' && this.m.sortie.step > 0 ? 'S36' : 'E78');
    if (this.v.run > 60) this.say('E79');
    if (e.autoWalkActive) {
      this.v.autoWalk += dt;
      if (this.v.autoWalk > 300) this.say('E76');
    }

    // Distance totale, durée de la visite.
    const walked = this.m.walked;
    if (walked > 42195) this.say('E83');
    else if (walked > 10000) this.say('E82');
    else if (walked > 5000) this.say('E81');
    else if (walked > 1000) this.say('E80');
    if (this.visitTime >= 600) this.say('D08');
    if (this.visitTime >= 1800) this.sayEvent('E16');
    if (this.visitTime >= 3600) this.sayEvent('E17');
    if (this.visitTime >= 45 && this.m.visits >= 2) this.say(this.m.device === 'mobile' ? 'E84' : 'E85');

    this.specialRooms(cur);
    this.dropDeadSigns();
    this.guideTick(cur, dt);
    this.recreTick();
    this.storyTick(cur);
  }

  /** Immobile : salle ronde de la première visite, quête, sortie, banc… */
  private idleTriggers(cur: WorldModule | null): void {
    const [r1, r2] = CONFIG.narrator.idleRotonde;
    const m = this.m;
    if (cur?.def.kind === 'rotonde' && !this.leftRotonde && m.sea === 'propose') {
      if (this.idle >= r1 && !this.heard('A03')) {
        this.say('A03');
        this.idle = 0;
      } else if (this.idle >= r2 - r1 && this.heard('A03')) this.say('A04');
      return;
    }
    const g = m.guide;
    if (g.stage === 'jeu' && this.idle >= 20 && cur?.signs.some((s) => s.tag === `guide${g.round + 1}`)) this.say('J43');
    if (g.stage === 'noir' && this.gl.phase === 'torche' && this.idle >= 15) this.say('J27');
    if (g.stage === 'noir' || g.stage === 'bouquet' || m.recre.stage === 'jeu') return;
    // Aux visites suivantes, immobile longtemps : « Vous faites encore la statue ? »
    if (m.recre.stage === 'fin' && m.recre.visit !== undefined && m.recre.visit < m.visits && this.idle >= 25) this.say('L41');
    if (this.idle < 6) return;
    const tags = new Set(cur?.signs.map((s) => s.tag ?? ''));
    if (tags.has('sortie1')) this.say(this.heard('S02') ? 'S03' : 'S02');
    else if (tags.has('sortie3')) this.say('S13');
    else if (tags.has('silence')) this.say('H15');
    else if (tags.has('g-star')) this.say('G03');
    if (this.idle < 12) return;
    if (m.atelier.stage === 'quete') this.say('P15');
    else if (m.autre.stage === 'traces' && m.autre.traces > 0) this.say('V06');
    else if (cur?.zone.zone.special === 'sortie' && cur.special === 'sortie') this.say('S22');
    else if (cur?.def.kind === 'room' && (cur.def.id === 'room-s' || cur.def.id === 'room-s-side')) this.say('E88');
    if (this.idle >= 15) this.calmMoment();
    if (this.idle >= CONFIG.narrator.idle) this.sayEvent('E02');
  }

  /** Passage d'un module à un autre : choix des portes, retours en arrière, découvertes. */
  private moved(prev: WorldModule, cur: WorldModule): void {
    const via = prev.connectors.findIndex((c) => c.neighbor?.module === cur);
    const backward = prev.connectors[0]?.neighbor?.module === cur && prev.def.kind !== 'rotonde';
    const m = this.m;
    const sea = (mod: WorldModule) => mod.zone.wing?.theme.id === FIRST_THEME;

    if (!backward && via >= 0 && prev.signs.length > 0) this.leftSigned(prev, via);
    if (prev.def.kind === 'rotonde') this.leftRotonde = true;
    if (!backward && cur.signs.length > 0) this.enteredSigned(cur);
    this.guideMoved(prev, cur, backward);
    this.recreMoved(cur, backward);

    // Demi-tours.
    this.backCount = backward ? this.backCount + 1 : 0;
    if (backward) {
      if (sea(prev) && m.sea === 'pris') this.say('B03');
      if (m.atelier.stage === 'quete') this.say('P13');
      // Il repart par où il est venu, depuis le carrefour « SORTIE » qu'il avait suivi.
      // (Un demi-tour au fond d'une impasse ne compte pas.)
      if (m.sortie.stage === 'chemin' && m.sortie.step > 0 && prev.signs.some((sg) => sg.tag === `sortie${m.sortie.step}`)) this.sortieRenonce('S15');
    }
    if (this.backCount >= CONFIG.narrator.backtrackRooms) this.sayEvent('E12');
    if (!backward && sea(cur) && cur.zone.wing!.left === 1 && m.sea === 'pris') this.say('B04');

    // Il traverse sans rien regarder.
    if (!backward && cur.artCount > 0) {
      this.roomsSinceDwell++;
      if (this.roomsSinceDwell >= CONFIG.narrator.rushRooms) this.sayEvent('E01');
    }

    // Ailes à thème (hors histoires) : entrée, sortie.
    const wing = cur.zone.wing;
    if (wing && wing.id !== this.v.lastWing && wing.theme.id !== FIRST_THEME && this.m.visits >= 2) this.say(this.heard('E63') ? 'E64' : 'E63');
    else if (!wing && this.v.lastWing >= 0 && prev.zone.wing && prev.zone.wing.theme.id !== FIRST_THEME) this.say(this.heard('E65') ? 'E66' : 'E65');
    this.v.lastWing = wing?.id ?? -1;

    // Nouvelle ambiance (hors portes de la rotonde : on ne fait que commencer).
    const amb = AMBIANCES[cur.preset.id] ? cur.preset.id : null;
    if (amb && amb !== this.seenAmbiance) {
      if (m.sortie.stage === 'chemin' && m.sortie.step > 0) this.say('S11');
      else if (this.seenAmbiance && prev.def.kind !== 'rotonde') this.say('D03');
      this.seenAmbiance = amb;
      this.worldLine(amb);
    }
    if (isOpenAir(cur.preset)) this.sayEvent('E13');
    if (cur.def.kind === 'deadend' && !cur.special) this.sayEvent('E10');
    if (cur.def.kind === 'stairs') {
      this.v.stairs++;
      this.say(this.v.stairs >= 3 ? 'E57' : cur.def.rise > 0 ? 'E55' : 'E56');
    }
    if (cur.def.id === 'sas') this.say(cur.zone.zone.special === 'sortie' ? 'S19' : this.heard('E58') ? 'E59' : 'E58');
    if (cur.def.kind === 'rotonde' && this.leftRotonde) this.say('E98');

    // Étrangetés (celles que les histoires ont demandées d'abord).
    const odd = cur.zone.oddity;
    if (odd) this.v.oddities.add(odd);
    if (this.v.oddities.size >= 3) this.say('E94');
    if (odd === 'salle-vide' && cur.def.kind === 'room') {
      if (m.atelier.stage === 'appel') this.atelierAppel();
      else if (m.atelier.stage === 'quete') this.say(this.heard('P10') ? 'P14' : 'P10');
      else this.sayEvent('E04');
    } else if (odd === 'veste-cafe' && (m.autre.stage === 'traces' || m.autre.stage === 'poursuite')) this.autreVeste();
    else if (cur.isLoopCopy) this.sayEvent('E05');
    else if (odd === 'veste-cafe') this.sayEvent('E08');
    else if (odd === 'a-l-envers') this.sayEvent('E09');
    else if (odd === 'oeuvre-plafond') this.sayEvent('E07');
    else if (cur.sealEntrance) this.sayEvent('E06', 5);

    // Salles mises en scène.
    if (cur.special === 'atelier') this.atelierEntered();
    if (cur.special === 'favoris') this.favorisEntered();
    if (prev.special === 'favoris' && !backward) this.say('V22');
    if (prev.special === 'favoris' && backward) this.say('V22');
    if (prev.special === 'atelier' && m.atelier.stage === 'atelier') this.atelierLeft();
    if (cur.zone.zone.special === 'sortie' && cur.special === 'sortie') this.say('S21');
  }

  /** Il entre dans un module fléché. */
  private enteredSigned(cur: WorldModule): void {
    const m = this.m;
    const tags = cur.signs.map((s) => s.tag ?? '');
    const has = (t: string) => tags.includes(t);
    if (cur.def.kind === 'rotonde') return;
    if (has('mer-relance') && m.sea === 'refuse') {
      this.setSea('relance');
      return this.say('C02');
    }
    if (has('mer-retour')) return this.say('M05');
    // Plusieurs carrefours ont pu recevoir le même panneau d'avance : celui-ci est le bon,
    // les autres sont décrochés. (Seul celui de l'étape en cours compte.)
    const family = (t: string) => t.replace(/\d+$/, '').replace('continuez', 'silence').replace('g-star', 'g');
    const mine = new Set(tags.filter(Boolean).map(family));
    if (mine.size > 0) {
      for (const other of this.engine!.world.modules) {
        if (other === cur) continue;
        const hadGuide = other.signs.some((sg) => sg.tag?.startsWith('guide') || sg.tag === 'recre');
        other.clearSigns((sg) => !sg.tag || !mine.has(family(sg.tag)));
        // (Leurs salles récompense et punition n'ont plus lieu d'être.)
        if (hadGuide && (mine.has('guide') || mine.has('recre')) && other.exitSpecial) {
          for (const k of Object.keys(other.exitSpecial)) {
            const kind = other.exitSpecial[Number(k)]?.kind;
            if (kind === 'recompense' || kind === 'punition' || kind === 'galerie') delete other.exitSpecial[Number(k)];
          }
        }
      }
    }
    const num = (prefix: string) => Number(tags.find((t) => t.startsWith(prefix))?.slice(prefix.length) || 0);
    const gn = num('guide');
    if (m.guide.stage === 'jeu' && gn === m.guide.round + 1) {
      // La porte du panneau a été murée (rien ne tenait derrière) : la consigne attendra le
      // carrefour suivant.
      const sign = cur.signs.find((sg) => sg.tag === `guide${gn}`)!;
      if (cur.connectors[sign.connector]?.neighbor?.module.def.kind === 'cap') {
        cur.clearSigns((sg) => !sg.tag?.startsWith('guide'));
        return;
      }
      return this.say(gn === 1 ? 'J03' : gn === 2 ? 'J08' : 'J15');
    }
    if (m.atelier.stage === 'quete' && num('atelier') === m.atelier.signs + 1) {
      m.atelier.signs++;
      this.save();
      return this.say(m.atelier.signs === 1 ? 'P03' : m.atelier.signs === 2 ? 'P06' : 'P11');
    }
    if (m.sortie.stage === 'chemin' && num('sortie') === m.sortie.step + 1) return this.say(m.sortie.step === 0 ? 'S01' : m.sortie.step === 1 ? 'S07' : 'S12');
    if (m.sortie.stage === 'ignore' && has('sortie-petit')) return this.say(m.sortie.small === 0 ? 'S25' : 'S28');
    if (m.autre.stage === 'poursuite' && num('autre') === m.autre.signs + 1) {
      m.autre.signs++;
      this.save();
      return this.say(m.autre.signs === 1 ? 'V10' : m.autre.signs === 2 ? 'V12' : 'V16');
    }
    if (has('silence')) return this.say('H12');
    if (has('g-star')) {
      const p = m.portes;
      if (p.rounds === 9) return this.say('G22');
      return this.say(p.rounds === 0 ? 'G01' : 'G11', 0, p.rounds === 0 ? () => this.say('G02') : undefined);
    }
    if (cur.signs.some((s) => s.themeId && !s.tag)) {
      // Aux visites suivantes, il se souvient du jeu des consignes.
      const g = m.guide;
      if (g.stage === 'fin' && !g.left && g.visit !== undefined && g.visit < m.visits && !this.v.guideRappel && Math.random() < 0.35) {
        const id = g.obeyed >= 2 ? 'J41' : 'J42';
        if (!this.heard(id)) {
          this.v.guideRappel = true;
          return this.say(id);
        }
      }
      if (cur.signs.some((s) => s.themeId === FIRST_THEME) && m.sea === 'pris') this.say('M02');
      else this.say('D04');
    }
  }

  /** Il quitte un module fléché par l'ouverture `via` : a-t-il suivi un panneau ? */
  private leftSigned(prev: WorldModule, via: number): void {
    const m = this.m;
    const followed: ModuleSign | undefined = prev.signs.find((s) => s.connector === via);
    const tags = prev.signs.map((s) => s.tag ?? '');
    const has = (t: string) => tags.includes(t);
    const seaSign = prev.signs.some((s) => s.themeId === FIRST_THEME);

    // Acte I : la porte de la mer, dans la salle ronde.
    if (prev.def.kind === 'rotonde' && seaSign && !has('finale') && (m.sea === 'propose' || m.sea === 'refuse')) {
      this.leftRotonde = true;
      this.cutIntro();
      if (followed?.themeId === FIRST_THEME) {
        if (m.sea === 'refuse') m.seaChangedMind = true;
        this.say(m.sea === 'propose' ? 'B01' : 'C06');
        this.setSea('pris');
      } else if (m.sea === 'propose') {
        this.say('C01');
        this.setSea('refuse');
      }
      return;
    }
    if (has('finale')) return this.finaleChoice(followed);
    if (has('mer-relance') && m.sea === 'relance') {
      if (followed?.tag === 'mer-relance') {
        m.seaChangedMind = true;
        this.say('C03');
        this.setSea('pris');
      } else {
        this.say('C04');
        m.seaRetiredAt = m.visits;
        this.setSea('retire');
        this.library.banTheme(FIRST_THEME);
      }
      return;
    }
    if (has('mer-retour')) {
      if (followed?.tag === 'mer-retour') {
        this.say('M06');
        this.setSea('pris');
      } else {
        this.say('M07');
        this.library.banTheme(FIRST_THEME);
      }
      return;
    }
    const gs = prev.signs.find((s) => s.tag === `guide${m.guide.round + 1}`);
    if (gs && m.guide.stage === 'jeu') return this.guideChoice(m.guide.round + 1, followed === gs);
    // Panneaux des histoires : seulement celui de l'étape en cours (voir enteredSigned).
    const atelierSign = prev.signs.find((s) => s.tag === `atelier${m.atelier.signs}`);
    if (atelierSign && m.atelier.stage === 'quete') return this.atelierChoice(followed === atelierSign, m.atelier.signs);
    // Revenu au carrefour déjà suivi, il prend une autre porte : il renonce.
    const suivi = m.sortie.stage === 'chemin' && m.sortie.step > 0 ? prev.signs.find((s) => s.tag === `sortie${m.sortie.step}`) : undefined;
    if (suivi && followed !== suivi) return this.sortieRenonce('S16');
    const sortieSign = prev.signs.find((s) => (m.sortie.stage === 'chemin' && s.tag === `sortie${m.sortie.step + 1}`) || (m.sortie.stage === 'ignore' && s.tag === 'sortie-petit'));
    if (sortieSign) return this.sortieChoice(sortieSign.tag!, followed === sortieSign);
    const autreSign = prev.signs.find((s) => s.tag === `autre${m.autre.signs}`);
    if (autreSign && m.autre.stage === 'poursuite') return this.autreChoice(followed === autreSign);
    if (has('silence')) return this.raconteChoice(followed?.tag);
    if (has('g-star') || has('g')) return this.portesChoice(prev, followed);
    // Panneaux ordinaires (thème prêt) : suivis ou ignorés.
    if (prev.def.kind !== 'rotonde' && prev.signs.some((s) => s.themeId)) {
      if (followed) this.say('D05');
      else {
        m.ignoredSigns++;
        this.say(m.ignoredSigns >= 2 && this.heard('D06') ? 'D07' : 'D06');
        this.save();
      }
    }
  }

  private worldLine(amb: string): void {
    const pair = WORLDS[amb];
    const m = this.m;
    // Pas pendant l'acte I : la première visite parle déjà assez.
    if (!pair || m.visits < 2) return;
    if (amb === 'englouti' && m.sea === 'pris') this.say('M10');
    if ((amb === 'englouti' || amb === 'poolrooms') && m.sea === 'retire') this.say('M04');
    if (amb === 'givre') {
      const mo = new Date().getMonth() + 1;
      if (mo === 11 || mo === 12) this.say('N13');
    }
    const seen = m.worlds[amb];
    if (seen === undefined) this.say(pair[0]);
    else if (seen < m.visits) this.say(pair[1]);
    m.worlds[amb] = m.visits;
    this.save();
  }

  /**
   * Un panneau d'histoire dont la porte ne mène nulle part (bouchée faute de place, impasse,
   * ou la salle mise en scène n'a pas tenu) : décroché. Le carrefour suivant le recevra.
   */
  private dropDeadSigns(): void {
    for (const mod of this.engine!.world.modules) {
      if (!mod.signs.some((sg) => sg.tag)) continue;
      const dead = (sg: ModuleSign) => {
        if (!sg.tag || sg.tag === 'finale' || sg.tag === 'arrivee') return false;
        const n = mod.connectors[sg.connector]?.neighbor?.module;
        if (!n) return false;
        if (n.def.kind === 'cap' || (n.def.kind === 'deadend' && !n.special)) return true;
        const want = mod.exitSpecial?.[sg.connector]?.kind;
        return (want === 'atelier' || want === 'favoris' || want === 'galerie') && n.special !== want;
      };
      if (mod.signs.some(dead)) mod.clearSigns((sg) => !dead(sg));
    }
  }

  /** Salles mises en scène : la toile de l'atelier, l'encadrement au bout de la sortie. */
  private specialRooms(cur: WorldModule | null): void {
    const e = this.engine!;
    const pos = e.player.position;
    // Juste avant l'atelier : l'odeur de térébenthine.
    const a3 = cur?.signs.find((sg) => sg.tag === 'atelier3');
    const c3 = a3 && cur!.connectors[a3.connector];
    if (c3 && this.m.atelier.stage === 'quete' && Math.hypot(c3.pos.x - pos.x, c3.pos.z - pos.z) < 3.5) this.say('P16');
    const p = cur?.specialPoint;
    if (!cur || !p) return;
    const dist = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (cur.special === 'atelier' && this.m.atelier.stage === 'atelier') {
      const f = e.player.forwardDir;
      const facing = (f.x * (p.x - pos.x) + f.z * (p.z - pos.z)) / Math.max(0.01, dist) > 0.8;
      if (!facing && !this.heard('P20')) this.atelierLook += 0.25;
      else this.atelierLook = 0;
      if (this.atelierLook > 4) this.say('P18');
      if (facing && dist < 3.2) {
        if (!this.heard('P20')) {
          // (Le temps passé devant la toile ne compte qu'une fois l'aveu entendu.)
          this.say('P19', 0, () =>
            this.say('P20', 0, () => {
              this.canvasReady = true;
              this.say('P21');
            }),
          );
          this.canvasTime = 0;
        } else if (this.canvasReady && e.player.speed < 0.3) {
          this.canvasTime += 0.25;
          if (this.canvasTime > 5) this.say('P22');
          if (this.canvasTime > 10 && !this.m.atelier.canvas) {
            this.m.atelier.canvas = true;
            collection.add(SANS_TITRE);
            progress.collectionChanged();
            this.m.atelier.result = 'reste';
            this.endAtelier();
            this.say('P23');
          }
        }
      }
    }
    if (cur.special === 'sortie' && this.m.sortie.stage === 'chemin') {
      if (dist < 3.5) this.say('S18');
      if (dist < 0.7 || cur.reachedSpecial(pos)) this.sortieTraversee();
    }
  }
  private atelierLook = 0;
  private quietRupture = false;
  private canvasTime = 0;
  private canvasReady = false;

  // --- La visite guidée --------------------------------------------------------------
  // Première visite, après la mer : trois consignes (respectées ou non), le noir, la lampe,
  // la lampe qui meurt, une porte sous laquelle passe de la lumière, et derrière, une
  // terrasse au soleil couchant et un feu d'artifice. Puis retour à la salle ronde.

  /** Déroulé de la scène en cours (cette visite). */
  private gl = {
    phase: '' as '' | 'extinction' | 'noir' | 'attente-torche' | 'torche' | 'fin-torche' | 'meurt' | 'noir-total' | 'porte' | 'ouverture' | 'show' | 'salut',
    t: 0,
    step: 0,
    rooms: 0,
    seaSeen: false,
    lastLit: null as ArtPiece | null,
    lastLitAt: 0,
    vanished: null as { x: number; y: number; z: number } | null,
    fav: null as ArtPiece | null,
    stepsDone: false,
    nextLaunch: 0,
    lookDown: 0,
    sun: { x: 0, z: 1 },
  };

  private guidePhase(phase: Narrator['gl']['phase']): void {
    this.gl.phase = phase;
    this.gl.t = 0;
    this.gl.step = 0;
  }

  /** Lumières rallumées, lampe rendue à l'ambiance, plus de feu d'artifice. */
  private guideRestore(): void {
    const e = this.engine;
    if (!e) return;
    e.setLight(1);
    e.torch = null;
    e.fireworks.clear();
    e.world.director.calm = false;
  }

  /** La scène commence-t-elle ? (Une fois la question de la mer réglée, hors des ailes.) */
  private guideMaybeStart(cur: WorldModule | null): void {
    const m = this.m;
    if (this.v.storyMoment || !cur || cur.def.kind === 'rotonde' || cur.zone.wing || isOpenAir(cur.preset)) return;
    if (m.sea === 'propose' || m.sea === 'refuse' || m.sea === 'relance') return;
    if (m.atelier.stage === 'appel' || m.atelier.stage === 'quete' || m.sortie.stage === 'chemin' || m.sortie.stage === 'ignore' || m.autre.stage === 'poursuite') return;
    const ready = m.visits === 1 ? (this.gl.seaSeen || m.sea === 'retire') && this.visitTime > 20 : this.visitTime > 45;
    if (!ready) return;
    m.guide = { stage: 'jeu', round: 0, obeyed: 0, choices: [], visit: m.visits };
    this.v.storyMoment = true;
    this.engine!.world.director.calm = true;
    this.save();
    this.say(m.sea === 'retire' ? 'J02' : 'J01');
  }

  /**
   * Au prochain carrefour : « Par ici » sur une des sorties (derrière, la salle récompense ;
   * derrière les autres, la salle punition), puis « NE PAS ENTRER ».
   */
  private guidePlan(exits: number[]): SignPlan | null {
    const g = this.m.guide;
    if (g.round >= 3 || exits.length < 2) return null;
    const n = g.round + 1;
    const x = exits[Math.floor(Math.random() * exits.length)]!;
    if (n === 3) return { signs: [{ connector: x, title: 'NE PAS ENTRER', tag: 'guide3' }] };
    const specials: NonNullable<SignPlan['specials']> = {};
    for (const c of exits) specials[c] = c === x ? { kind: 'recompense' } : { kind: 'punition', variant: n === 1 ? 1 : 2, ...(n === 2 ? { art: PUNITION } : {}) };
    return { signs: [{ connector: x, title: 'Par ici', tag: `guide${n}` }], specials };
  }

  /** Il a tranché la consigne `n` : `followed`, il a pris la porte du panneau. */
  private guideChoice(n: number, followed: boolean): void {
    const g = this.m.guide;
    // (Manche 3 : obéir, c'est ne pas entrer.)
    const obey = n === 3 ? !followed : followed;
    g.choices.push(obey);
    g.round = n;
    if (obey) g.obeyed++;
    this.save();
    if (n === 1) return this.say(obey ? 'J04' : 'J05');
    if (n === 2) {
      const before = g.choices[0];
      return this.say(obey ? (before ? 'J09' : 'J10') : before ? 'J11' : 'J12');
    }
    this.say(followed ? 'J16' : 'J17', 0, () => this.say(g.obeyed >= 2 ? 'J18' : 'J19', 1.2, () => this.say('J20', 0.6, () => this.guideBlackout())));
  }

  /** Les néons s'éteignent, banc par banc. */
  private guideBlackout(): void {
    if (!this.engine || this.m.guide.stage !== 'jeu') return;
    this.m.guide.stage = 'noir';
    this.save();
    this.guidePhase('extinction');
  }

  /** Passage d'un module à l'autre pendant la scène. */
  private guideMoved(prev: WorldModule, cur: WorldModule, backward: boolean): void {
    const g = this.m.guide;
    if (cur.zone.wing?.theme.id === FIRST_THEME) this.gl.seaSeen = true;
    if (g.stage === 'jeu') {
      if (backward && prev.signs.some((s) => s.tag === `guide${g.round + 1}`)) this.say('J44');
      // La salle derrière la porte qu'il vient de choisir (pas celle d'à côté, visitée ensuite).
      const chose = g.choices[g.round - 1];
      if (!backward && cur.special === 'recompense' && chose === true) this.say(g.round <= 1 ? 'J06' : 'J13');
      if (!backward && cur.special === 'punition' && chose === false && cur.specialVariant === g.round) this.say(g.round === 1 ? 'J07' : 'J14');
    }
    // Sur la terrasse, la porte se referme derrière lui : c'est le Conservateur qui le ramènera.
    if (g.stage === 'bouquet' && prev.special === 'porte' && !backward) prev.closeDoor();
    if (g.stage === 'noir' && this.gl.phase === 'torche') {
      this.gl.rooms++;
      this.say(backward ? 'J28' : 'J23');
    }
  }

  private guideTick(cur: WorldModule | null, dt: number): void {
    const m = this.m;
    const g = m.guide;
    const e = this.engine!;
    if (g.stage === 'attente') return this.guideMaybeStart(cur);
    if (g.stage !== 'noir' && g.stage !== 'bouquet') return;
    const gl = this.gl;
    gl.t += dt;
    switch (gl.phase) {
      case 'extinction': {
        // Quatre bancs de néons, l'un après l'autre.
        const at = [0, 0.9, 1.7, 2.4];
        const level = [0.55, 0.3, 0.12, 0.025];
        while (gl.step < at.length && gl.t >= at[gl.step]!) {
          e.setLight(level[gl.step]!);
          this.audio.clack();
          gl.step++;
        }
        if (gl.step >= at.length) this.guidePhase('noir');
        break;
      }
      case 'noir':
        if (gl.t >= 3) {
          this.guidePhase('attente-torche');
          this.say('J21', 0, () =>
            this.say('J22', 0.8, () => {
              if (!this.engine) return;
              this.engine.torch = 1;
              this.guidePhase('torche');
              this.guideFavourite();
            }),
          );
        }
        break;
      case 'torche':
        this.guideVanish();
        if (gl.fav?.artwork && !this.heard('J26') && e.pickPiece(0, 0) === gl.fav) this.say('J26');
        if (!gl.stepsDone && gl.t >= 25) {
          gl.stepsDone = true;
          this.audio.footsteps();
          this.say('J25', 2.5);
        }
        if ((gl.t >= 45 && gl.rooms >= 2) || gl.t >= 75) {
          this.guidePhase('fin-torche');
          this.say('J29', 0, () => {
            this.engine?.flickerTorch(1.4);
            this.guidePhase('meurt');
          });
        }
        break;
      case 'meurt':
        if (gl.t >= 1.6) {
          e.setLight(0);
          this.guidePhase('noir-total');
        }
        break;
      case 'noir-total':
        // Dans le noir complet, le musée se refait autour de lui : un couloir, un sas, une porte.
        if (gl.step === 0 && gl.t >= 1) {
          gl.step = 1;
          const exit = e.world.director.makeZone('couchant', DEFAULT_AMBIANCE, 'seuil', 40, 'bouquet');
          this.quietRupture = true;
          e.rebuildAround({ start: { defId: 'straight-m', preset: DEFAULT_AMBIANCE, exit } });
          this.quietRupture = false;
          this.prev = e.world.currentModule;
          e.torch = 0;
        }
        if (gl.t >= 3) {
          this.guidePhase('porte');
          this.say('J30');
        }
        break;
      case 'porte': {
        const door = [...e.world.modules].find((x) => x.special === 'porte');
        const p = door?.specialPoint;
        const pos = e.player.position;
        if (door && p && Math.hypot(p.x - pos.x, p.z - pos.z) < 2.6) {
          door.openDoor();
          // Le soleil se couche droit devant, dans l'axe de la porte.
          const c = applyTransform(door.transform, { x: 0, z: 0 });
          const l = Math.hypot(p.x - c.x, p.z - c.z) || 1;
          gl.sun = { x: (p.x - c.x) / l, z: (p.z - c.z) / l };
          e.setSunDirection(gl.sun.x, gl.sun.z);
          e.setLight(1, 2.5);
          e.torch = null;
          g.stage = 'bouquet';
          this.save();
          this.guidePhase('ouverture');
          this.say('J32', 0.6);
        } else if (gl.t >= 15) this.say('J31');
        break;
      }
      case 'ouverture':
        if (gl.t >= 4) {
          this.guidePhase('show');
          gl.nextLaunch = 0;
        }
        break;
      case 'show': {
        const reduce = e.player.reduceMotion;
        gl.nextLaunch -= dt;
        // Le final : une salve serrée.
        const finale = gl.t > 27 && gl.t < 30;
        if (gl.nextLaunch <= 0 && gl.t < 33) {
          this.guideRocket(reduce);
          gl.nextLaunch = finale && !reduce ? 0.25 : reduce ? 2.2 : 0.55 + Math.random() * 0.9;
        }
        if (gl.step < 1 && gl.t >= 2) {
          gl.step = 1;
          this.say(g.obeyed >= 2 ? 'J33' : 'J34');
        }
        if (gl.step < 2 && gl.t >= 13) {
          gl.step = 2;
          this.say(m.sea === 'retire' ? 'J36' : 'J35');
        }
        gl.lookDown = e.player.pitch < -0.1 ? gl.lookDown + dt : 0;
        if (gl.lookDown >= 10 && gl.t > 6) this.say('J37');
        if (gl.step < 3 && gl.t >= 34) {
          gl.step = 3;
          this.say('J38', 0, () => this.guideFinish());
        }
        // (Filet de sécurité : si la réplique n'a pas pu être jouée, le bouquet finit quand même.)
        if (gl.t >= 70) this.guideFinish();
        break;
      }
      default:
        break;
    }
  }

  /** Une fusée, tirée d'en bas (la plage), droit devant, un peu sur les côtés. */
  private guideRocket(soft: boolean): void {
    const e = this.engine;
    if (!e) return;
    const pos = e.player.position;
    const s = this.gl.sun;
    // (Assez près pour rester en deçà du plan lointain de la caméra.)
    const dist = 30 + Math.random() * 12;
    const side = (Math.random() - 0.5) * 34;
    e.fireworks.launch(pos.x + s.x * dist - s.z * side, e.player.floorY - 10, pos.z + s.z * dist + s.x * side, 24 + Math.random() * 12, soft);
  }

  /** Le bouquet est fini : retour à la salle ronde (« Revenons-en au musée »). */
  private guideFinish(): void {
    const e = this.engine;
    const g = this.m.guide;
    if (!e || g.stage !== 'bouquet') return;
    g.stage = 'fin';
    this.save();
    this.guidePhase('salut');
    this.quietRupture = true;
    e.returnToStart();
    this.quietRupture = false;
    this.guideRestore();
    this.prev = e.world.currentModule;
    this.leftRotonde = false;
    progress.found('bouquet');
    this.say('J39', 1.5);
  }

  /**
   * À la lampe : un tableau éclairé un instant disparaît dès qu'il n'est plus dans le
   * faisceau ; quand le visiteur repasse la lampe à sa place, le Conservateur nie tout.
   */
  private guideVanish(): void {
    const e = this.engine!;
    const gl = this.gl;
    const piece = e.pickPiece(0, 0);
    if (piece?.artwork && piece.object.visible) {
      gl.lastLit = piece;
      gl.lastLitAt = gl.t;
    }
    const { position: cam, forward } = e.eye;
    const angleTo = (p: { x: number; y: number; z: number }) => {
      const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      return { cos: (dx * forward.x + dy * forward.y + dz * forward.z) / d, d };
    };
    if (!gl.vanished && gl.lastLit && gl.t > 6 && gl.t - gl.lastLitAt > 2 && gl.lastLit !== gl.fav) {
      const w = gl.lastLit.object.matrixWorld.elements;
      const p = { x: w[12]!, y: w[13]! + 1.5, z: w[14]! };
      if (angleTo(p).cos < 0.4) {
        gl.lastLit.object.visible = false;
        gl.vanished = p;
      }
    }
    if (gl.vanished && !this.heard('J24')) {
      const a = angleTo(gl.vanished);
      if (a.cos > 0.95 && a.d < 9) this.say('J24');
    }
  }

  /** À la lampe : une de ses œuvres favorites, accrochée un peu plus loin. */
  private guideFavourite(): void {
    const e = this.engine;
    const fav = collection.items[0]?.art;
    if (!e || !fav) return;
    const { position: cam, forward } = e.eye;
    let best: ArtPiece | null = null;
    let bestScore = -Infinity;
    for (const mod of e.world.modules) {
      if (mod.graphDistance < 1 || mod.graphDistance > 2) continue;
      for (const piece of mod.artPieces) {
        if (!piece.artwork) continue;
        const w = piece.object.matrixWorld.elements;
        const dx = w[12]! - cam.x, dz = w[14]! - cam.z;
        const score = (dx * forward.x + dz * forward.z) / (Math.hypot(dx, dz) || 1) - mod.graphDistance * 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = piece;
        }
      }
    }
    if (!best) return;
    best.assignArtwork(fav);
    this.gl.fav = best;
  }

  // --- La récréation -----------------------------------------------------------------
  // Entre l'atelier et la sortie : 1, 2, 3, soleil dans la galerie des plâtres. Il compte,
  // le visiteur avance ; au « soleil », plus un pas, sinon retour au début. Les portes de la
  // galerie restent fermées jusqu'à la fin de la partie.

  /** Déroulé de la partie en cours (cette visite). */
  private rc = {
    state: '' as '' | 'entree' | 'regles' | 'pause' | 'compte' | 'controle' | 'pris' | 'libre' | 'fin',
    t: 0,
    /** Change à chaque manche annulée : les suites de comptage en attente s'arrêtent. */
    token: 0,
    round: 0,
    pauseLen: 1,
    /** Il compte plus lentement (après trois échecs), il ne regarde plus (après cinq). */
    slow: 1,
    eyesClosed: false,
    soleilAt: 0,
    countStartZ: 0,
    gag: '' as string,
    falseStart: false,
    half: false,
    roomsAfter: -1,
    /** Il a couru pendant le dernier comptage : le suivant sera souvent express. */
    ran: false,
    module: null as WorldModule | null,
    /** Position au tick précédent (pour voir s'il avance vraiment, ou pousse contre un mur). */
    last: { x: 0, z: 0 },
  };

  private recreState(state: Narrator['rc']['state']): void {
    this.rc.state = state;
    this.rc.t = 0;
  }

  /** La galerie se rouvre (fin, visite à deux, arrêt). */
  private recreRestore(): void {
    this.rc.token++;
    this.rc.module?.setGalleryGates(false);
    if (this.rc.module?.gallery) this.rc.module.gallery.phase = 'fin';
  }

  /** Le visiteur, au départ de la galerie, face au fond. */
  private recreToStart(): void {
    const e = this.engine;
    const mod = this.rc.module;
    if (!e || !mod?.gallery) return;
    this.quietRupture = true;
    e.onRupture?.('noir');
    this.quietRupture = false;
    const p = mod.toWorld({ x: 0, z: mod.gallery.startZ });
    const ahead = mod.toWorld({ x: 0, z: mod.gallery.startZ + 1 });
    e.player.position = p;
    e.player.yaw = Math.atan2(-(ahead.x - p.x), -(ahead.z - p.z));
    e.player.pitch = 0;
  }

  /** Il entre dans la galerie : quand il est bien dedans, les portes se ferment. */
  private recreEnter(cur: WorldModule): void {
    Object.assign(this.rc, { round: 0, slow: 1, eyesClosed: false, gag: '', falseStart: false, half: false, roomsAfter: -1, ran: false });
    this.rc.module = cur;
    this.recreState('entree');
    this.say('L13');
  }

  private recreTick(): void {
    const m = this.m;
    const r = m.recre;
    const rc = this.rc;
    const e = this.engine!;
    const mod = rc.module;
    const g = mod?.gallery;
    if (!mod || !g || (r.stage !== 'invite' && r.stage !== 'jeu')) return;
    if (!mod.alive) {
      // (La galerie a disparu : on n'enferme personne, et le panneau pourra revenir.)
      rc.module = null;
      if (rc.state === 'entree') this.recreState('');
      return;
    }
    rc.t += 0.25;
    const local = mod.toLocal(e.player.position);
    const now = performance.now() / 1000;

    if (rc.state === 'entree') {
      // (Bien dedans : ni sur le seuil, ni déjà ressorti.)
      if (e.world.currentModule !== mod || local.z < g.startZ + 1.2 || local.z > g.startZ + 8) return;
      mod.setGalleryGates(true);
      r.stage = 'jeu';
      // (Les commentaires qui attendaient encore n'ont plus leur place : il n'y a plus que le jeu.)
      this.queue = this.queue.filter((q) => q.id[0] === 'L' || lineFamily(q.id) === 'texte');
      r.visit = m.visits;
      this.save();
      if (e.autoWalkActive) {
        e.setAutoWalk(false);
        e.onAutoWalkChange?.(false);
      }
      this.recreState('regles');
      const token = rc.token;
      this.say('L14', 0.4, () =>
        this.say('L15', 0.3, () =>
          this.say('L16', 0.3, () =>
            this.say('L17', 0.4, () => {
              if (token === rc.token) this.recreCount();
            }),
          ),
        ),
      );
      return;
    }
    if (r.stage !== 'jeu' || rc.state === 'fin') return;
    // Il pousse contre la porte d'entrée, fermée.
    const p = e.player.position;
    const stuck = Math.hypot(p.x - rc.last.x, p.z - rc.last.z) < 0.05;
    rc.last = { x: p.x, z: p.z };
    // (Seulement s'il ne parle pas déjà : dit en retard, ça n'aurait plus de sens.)
    if (local.z < 1.4 && e.input.hasMoveIntent && stuck && !this.playing && !this.queue.length) this.say('L30');
    // Pendant les règles, on ne part pas en avance : retour sur la ligne de départ.
    if (rc.state === 'regles') {
      if (local.z > g.startZ + 3) this.recreToStart();
      return;
    }

    // Pendant un « je vous ai vu », rien ne compte : il retourne au début d'abord.
    if (rc.state === 'pris') return;
    // Arrivé au fond : gagné.
    if (local.z >= g.finishZ) return this.recreWin(local);

    // Commentaires selon l'avancée (une fois chacun), entre deux manches : jamais pendant
    // qu'il regarde, sinon le « je vous ai vu » arriverait après.
    const progress = (local.z - g.startZ) / (g.finishZ - g.startZ);
    const between = rc.state === 'pause';
    if (between && progress > 0.8) this.say('L29');
    else if (between && progress > 0.5 && !this.heard('L28')) {
      // « Je vais devoir compter plus vite » : et il le fait.
      this.say('L28');
      rc.slow *= 0.7;
    }

    if (rc.state === 'compte' && e.player.speed > CONFIG.player.walkSpeed * 1.2) rc.ran = true;

    switch (rc.state) {
      case 'pause':
        // (Il recompte quand il a fini de parler.)
        if (rc.t >= rc.pauseLen && !this.playing && !this.queue.length) this.recreCount();
        break;
      case 'controle': {
        const since = now - rc.soleilAt;
        // Un peu de marge après « soleil » (le temps de s'arrêter), puis plus un pas.
        const { soleilGrace, soleilWatch, soleilSpeed } = CONFIG.narrator;
        if (since > soleilGrace && since < soleilWatch && e.player.speed > soleilSpeed) return this.recreCaught();
        if (since >= soleilWatch) {
          // Manche réussie : un mot, parfois.
          if (rc.gag) this.say(rc.gag);
          else if (rc.round >= 2 && Math.abs(local.z - rc.countStartZ) < 0.8) this.say('L26');
          else this.say('L27');
          rc.gag = '';
          this.recreState('pause');
          rc.pauseLen = (0.8 + Math.random() * 1.4) * rc.slow;
        }
        break;
      }
      default:
        break;
    }
  }

  /** Une manche : « un… deux… trois… soleil ! », à un rythme chaque fois différent. */
  private recreCount(): void {
    const rc = this.rc;
    const g = rc.module?.gallery;
    const e = this.engine;
    if (!g || !e) return;
    const token = ++rc.token;
    rc.round++;
    this.recreState(rc.eyesClosed ? 'libre' : 'compte');
    g.phase = 'compte';
    rc.countStartZ = rc.module!.toLocal(e.player.position).z;
    // Les yeux fermés : il ne compte plus, les statues filent, le visiteur aussi.
    if (rc.eyesClosed) return;
    const gap = () => (0.25 + Math.random() * 0.5) * rc.slow;
    const roll = Math.random();
    let seq: LineId[] = ['L01', 'L02', 'L03'];
    let pattern: 'normal' | 'rapide' | 'faux' = 'normal';
    const ran = rc.ran;
    rc.ran = false;
    // Vous courez ? Il compte d'une traite.
    if (ran && rc.round >= 2 && rc.slow <= 1 && Math.random() < 0.6) pattern = 'rapide';
    else if (rc.round >= 2 && rc.slow <= 1) {
      if (!rc.falseStart && roll < 0.15) pattern = 'faux';
      else if (roll < 0.35) pattern = 'rapide';
      else if (!rc.half && roll < 0.5) {
        seq = ['L01', 'L10', 'L03'];
        rc.half = true;
      } else if (roll < 0.65) seq = ['L08', 'L02', 'L03'];
    }
    if (pattern === 'faux') {
      rc.falseStart = true;
      this.say('L09', 0, () => {
        if (token !== rc.token) return;
        this.recreState('pause');
        rc.pauseLen = 0.4;
      });
      return;
    }
    if (pattern === 'rapide') {
      // D'un seul tenant : le « soleil » est à la fin.
      this.say('L07', 0, () => this.recreSoleil(token));
      return;
    }
    const soleil: LineId = Math.random() < 0.7 ? 'L04' : Math.random() < 0.65 ? 'L05' : 'L06';
    const next = (i: number) => {
      if (token !== rc.token) return;
      if (i < seq.length) this.say(seq[i]!, i === 0 ? 0 : gap(), () => next(i + 1));
      else this.say(soleil, gap() * 1.3, undefined, () => this.recreSoleil(token));
    };
    next(0);
  }

  /** « Soleil ! » : tout se fige. (Parfois, une statue triche.) */
  private recreSoleil(token: number): void {
    const rc = this.rc;
    const g = rc.module?.gallery;
    if (token !== rc.token || !g) return;
    rc.soleilAt = performance.now() / 1000;
    g.phase = 'soleil';
    this.recreState('controle');
    if (rc.round === 2 || rc.round === 4) {
      g.cheat();
      rc.gag = rc.round === 2 ? 'L23' : 'L25';
    }
  }

  /** Vu ! Retour au début. */
  private recreCaught(): void {
    const m = this.m;
    const r = m.recre;
    const rc = this.rc;
    const e = this.engine!;
    const g = rc.module!.gallery!;
    rc.token++;
    this.queue = this.queue.filter((q) => !COUNT_LINES.has(q.id) && !RECRE_COMMENTS.has(q.id));
    r.fails++;
    this.save();
    this.recreState('pris');
    const running = e.player.speed > CONFIG.player.walkSpeed * 1.2;
    const line = r.fails <= 3 ? CAUGHT_LINES[r.fails - 1]! : running ? 'L22' : r.fails % 2 ? 'L21' : 'L20';
    rc.gag = '';
    this.sayFirst(line, () => {
      if (rc.state !== 'pris') return;
      this.recreToStart();
      const local = rc.module!.toLocal(e.player.position);
      let extra: LineId | null = null;
      if (r.fails === 1 && g.meanZ > local.z + 3) extra = 'L24';
      if (r.fails === 3) {
        rc.slow = 1.8;
        extra = 'L32';
      }
      if (r.fails >= 5 && !rc.eyesClosed) {
        rc.eyesClosed = true;
        extra = 'L33';
      }
      const resume = () => {
        if (rc.state !== 'pris') return;
        this.recreState('pause');
        rc.pauseLen = 1.2;
      };
      if (extra) this.say(extra, 0.8, resume);
      else resume();
    });
  }

  /** Arrivé au fond : gagné. Les statues sont toutes juste derrière lui. */
  private recreWin(local: { x: number; z: number }): void {
    const m = this.m;
    const r = m.recre;
    const rc = this.rc;
    const mod = rc.module!;
    const g = mod.gallery!;
    rc.token++;
    // (Plus de comptage ni de commentaire de partie en attente : c'est fini.)
    this.queue = this.queue.filter((q) => q.id[0] !== 'L');
    this.recreState('fin');
    g.phase = 'soleil';
    r.won = rc.eyesClosed ? 'triche' : 'honnete';
    this.save();
    this.sayFirst(rc.eyesClosed ? 'L35' : 'L34', () => {
      g.gatherBehind(local.x, local.z);
      this.say('L36', 0.8, () => {
        mod.setGalleryGates(false);
        r.stage = 'fin';
        this.save();
        progress.found('recre');
        rc.roomsAfter = 0;
        this.say('L37', 0.6);
      });
    });
  }

  /** Passage d'un module à l'autre : l'entrée dans la galerie, le souvenir de la partie. */
  private recreMoved(cur: WorldModule, backward: boolean): void {
    const m = this.m;
    const r = m.recre;
    if (r.stage === 'invite' && cur.special === 'galerie' && !backward && this.rc.state !== 'entree') this.recreEnter(cur);
    if (r.stage === 'fin' && this.rc.roomsAfter >= 0 && ++this.rc.roomsAfter >= 3) {
      this.rc.roomsAfter = -1;
      this.say('L38');
    }
    // Aux visites suivantes : une sculpture sur socle, l'air de rien.
    if (r.stage === 'fin' && r.visit !== undefined && r.visit < m.visits && cur.pedestalPieces.length > 0 && Math.random() < 0.3) this.say('L40', 1.5);
  }

  // --- Histoires ---------------------------------------------------------------------

  /** Où en sont les histoires : ce qui démarre ou se poursuit dans cette visite. */
  private storyTick(cur: WorldModule | null): void {
    const m = this.m;
    const t = this.visitTime;
    // Histoire 1 : le cadre vide est demandé après un premier arrêt devant une œuvre.
    // (Une seule histoire commence ou se termine par visite.)
    // (La visite guidée d'abord : les histoires attendent qu'elle ait été jouée.)
    const free = !this.v.storyMoment && m.guide.stage === 'fin';
    // (Juste après un arrêt devant une œuvre ; sinon, au bout de quatre minutes quand même :
    // un visiteur qui ne s'arrête jamais n'en reste pas à l'histoire 1 pour toujours.)
    const afterDwell = this.v.dwelled && this.roomsSinceDwell === 0;
    if (free && m.story === 1 && m.visits >= 2 && m.sea !== 'propose' && m.atelier.stage === 'attente' && t > 90 && (afterDwell || t > 240)) {
      this.v.storyMoment = true;
      m.atelier.stage = 'appel';
      this.save();
    }
    const director = this.engine!.world.director;
    director.requestedOddity =
      m.atelier.stage === 'appel' || (m.atelier.stage === 'quete' && m.atelier.signs < 2)
        ? 'salle-vide'
        : (m.autre.stage === 'traces' && m.autre.traces >= 2) || m.autre.stage === 'poursuite'
          ? 'veste-cafe'
          : null;
    // Après l'abandon de la quête, il insiste encore un peu.
    if (m.atelier.result === 'abandon' && m.atelier.stage === 'fin' && t - this.abandonAt > 120) this.say(this.heard('P28') ? 'P29' : 'P28');

    // La récréation (après l'atelier, avant la sortie) : une minute après le début, au calme.
    if (free && m.story === 2 && m.visits >= 3 && m.recre.stage === 'attente' && t > 60 && cur && cur.def.kind !== 'rotonde' && !cur.zone.wing) {
      this.v.storyMoment = true;
      m.recre = { stage: 'invite', fails: 0 };
      this.save();
      this.say('L11', 0, () => this.say('L12', 0.4));
    }
    // Histoire 2 : le panneau de la sortie apparaît une minute après le début.
    if (free && m.story === 2 && m.visits >= 3 && m.recre.stage === 'fin' && m.sortie.stage === 'attente' && t > 60) {
      this.v.storyMoment = true;
      m.sortie.stage = 'chemin';
      m.sortie.step = 0;
      this.save();
    }
    if (m.sortie.stage === 'chemin' && m.sortie.step > 0) {
      m.sortie.inPath = true;
      if (t - this.sortieAt > 25) this.say('S05');
      if (t - this.sortieAt > 60) this.say('S06');
    }
    if (m.sortie.result === 'retour' && t - this.sortieAt > 120 && this.heard('S20')) this.say('S23');
    if (m.sortie.result === 'renonce' && t - this.sortieAt > 120) this.say('S17');

    // Histoire 3 : des pas au loin, de temps en temps.
    if (free && m.story === 3 && m.visits >= 4 && m.autre.stage === 'attente' && t > 60) {
      this.v.storyMoment = true;
      m.autre.stage = 'traces';
      this.save();
    }
    // (La poursuite attend dix favoris : en attendant, plus de pas.)
    const waiting = m.autre.traces >= 4 && collection.items.length < 10;
    if (((m.autre.stage === 'traces' && !waiting) || (m.autre.result === 'ignore' && m.story > 3 && !this.heard('V26'))) && t - this.stepsAt > 100 && !this.playing) {
      this.stepsAt = t;
      this.audio.footsteps();
      if (m.autre.result === 'ignore') this.say('V26', 4);
      else this.autreTrace();
    }

    // Histoire 5 : un fragment par visite, au calme.
    if (this.v.suitePending && t > this.v.suiteAt && !this.playing && this.queue.length === 0) {
      const id = this.v.suitePending;
      this.v.suitePending = null;
      this.say(id);
    }
    if (cur && m.story === 6 && m.finaleDone && !this.v.rappel && t > 60) this.rappel();
  }
  private abandonAt = 0;
  private sortieAt = 0;
  private stepsAt = 0;

  /** Moment calme (arrêt devant une œuvre, immobile) : un fragment de l'histoire 5, un rappel. */
  private calmMoment(): void {
    const m = this.m;
    const r = m.raconte;
    const t = this.visitTime;
    if (t < 90 || this.playing || this.queue.length > 0 || t - this.lastStory < 60) return;
    const started = m.story === 5 || (m.story === 4 && m.portes.rounds >= 3);
    if (started && !r.done && !this.v.fragmentDone && r.lastVisit !== m.visits && r.next < FRAGMENTS.length) {
      const frag = FRAGMENTS[r.next]!;
      this.v.fragmentDone = true;
      r.lastVisit = m.visits;
      this.lastStory = t;
      if (r.next === QUESTION) this.v.question = true;
      this.say(frag[0]!);
      if (frag[1]) {
        this.v.suitePending = frag[1];
        this.v.suiteAt = t + 120;
      }
      if (r.next !== QUESTION) r.next++;
      if (r.next >= FRAGMENTS.length) {
        r.done = true;
        if (r.choice === 'silence') this.v.suitePending = 'H42';
        m.epilogue.push('H41');
        this.storyDone(5);
      }
      this.save();
      return;
    }
    if (!this.v.rappel && m.visits >= 3) this.rappel();
  }

  /** Les répliques qui relient les histoires (une par visite au plus). */
  private rappel(): void {
    const m = this.m;
    const opts: Array<[LineId, boolean]> = [
      ['X01', m.sea === 'pris' && m.sortie.result === 'retour'],
      ['X02', m.sea === 'retire' && (m.sortie.result === 'disparu' || m.sortie.result === 'renonce')],
      ['X03', !!m.atelier.canvas && m.autre.result === 'vu'],
      ['X04', !!m.portes.done && m.portes.him > m.portes.me],
      ['X05', !!m.portes.done && m.portes.me > m.portes.him],
      ['X06', m.atelier.result !== undefined && m.atelier.result !== 'abandon' && m.sortie.result === 'retour'],
      ['X18', m.abandoned >= 3],
      ['X19', m.sortie.result === 'retour' && m.raconte.choice === 'silence'],
      ['X20', m.sea === 'pris' && m.portes.him >= 5 && m.portes.him > m.portes.me * 2],
      ['X16', m.finaleDone && m.visits % 5 === 0],
      ['X17', m.finaleDone && Math.random() < 0.1],
    ];
    const pick = opts.find(([id, ok]) => ok && !this.heard(id));
    if (!pick) return;
    this.v.rappel = true;
    this.say(pick[0], 3);
  }

  private storyDone(n: number): void {
    const m = this.m;
    this.v.storyMoment = true;
    if (n === 1) m.story = Math.max(m.story, 2);
    else if (n === 2) m.story = Math.max(m.story, 3);
    else if (n === 3) m.story = Math.max(m.story, 4);
    if (m.portes.done && m.raconte.done) m.story = 6;
    else if (n === 4 && m.story < 5) m.story = 5;
    this.save();
  }

  // Histoire 1 : le tableau manquant.

  private atelierAppel(): void {
    this.m.atelier.stage = 'quete';
    this.save();
    this.lastStory = this.visitTime;
    this.say('P01');
  }

  private atelierChoice(followed: boolean, n: number): void {
    const a = this.m.atelier;
    if (followed) {
      this.say(n === 1 ? 'P04' : n === 2 ? 'P07' : 'P12');
      if (n >= 3) a.stage = 'atelier';
    } else {
      a.ignored++;
      if (a.ignored >= 2) {
        a.stage = 'fin';
        a.result = 'abandon';
        this.abandonAt = this.visitTime;
        this.m.abandoned++;
        this.m.epilogue.push('P30');
        this.say('P27');
        this.storyDone(1);
      } else this.say(n === 1 ? 'P05' : 'P08');
    }
    this.save();
  }

  private atelierEntered(): void {
    if (this.m.atelier.stage === 'atelier') this.say('P17');
  }

  private atelierLeft(): void {
    const a = this.m.atelier;
    if (a.canvas) return;
    if (this.heard('P20')) {
      a.result = 'parti';
      this.say('P26');
      this.endAtelier();
    }
  }

  private endAtelier(): void {
    const a = this.m.atelier;
    a.stage = 'fin';
    this.m.epilogue.push(a.result === 'reste' ? 'P31' : 'P32');
    this.storyDone(1);
  }

  // Histoire 2 : la sortie.

  private sortieChoice(tag: string, followed: boolean): void {
    const s = this.m.sortie;
    if (tag === 'sortie-petit') {
      if (followed) {
        this.say('S27');
        s.stage = 'chemin';
        s.step = 1;
        this.sortieAt = this.visitTime;
      } else {
        s.small++;
        if (s.small >= 3) {
          s.stage = 'fin';
          s.result = 'disparu';
          this.m.epilogue.push('S32');
          this.say('S30');
          this.storyDone(2);
        } else this.say(s.small === 1 ? 'S26' : 'S29');
      }
      this.save();
      return;
    }
    const n = Number(tag.slice(-1));
    if (s.stage !== 'chemin') return;
    if (followed) {
      s.step = n;
      this.sortieAt = this.visitTime;
      this.say(n === 1 ? 'S04' : n === 2 ? 'S08' : 'S14', 0, n === 2 ? () => this.say('S09') : undefined);
    } else if (n === 1) {
      s.stage = 'ignore';
      s.step = 0;
      this.v.signGapModules = 0;
      this.say('S24');
    } else this.sortieRenonce('S16');
    this.save();
  }

  private sortieRenonce(id: LineId): void {
    const s = this.m.sortie;
    if (s.stage !== 'chemin') return;
    s.stage = 'fin';
    s.result = 'renonce';
    s.inPath = false;
    this.sortieAt = this.visitTime;
    this.m.abandoned++;
    this.say(id);
    this.storyDone(2);
  }

  /** Il franchit l'encadrement : retour dans la salle ronde. */
  private sortieTraversee(): void {
    const s = this.m.sortie;
    s.stage = 'fin';
    s.result = 'retour';
    s.inPath = false;
    this.sortieAt = this.visitTime;
    this.m.epilogue.push('S31');
    progress.found('sortie');
    this.storyDone(2);
    // (Le passage au noir qui accompagne le retour n'est pas une « rupture » à commenter.)
    this.quietRupture = true;
    this.engine!.returnToStart();
    this.quietRupture = false;
    this.prev = this.engine!.world.currentModule;
    this.leftRotonde = false;
    this.say('S20', 1.5);
  }

  // Histoire 3 : l'autre visiteur.

  private autreTrace(): void {
    const a = this.m.autre;
    a.traces++;
    const id = a.traces === 1 ? 'V01' : a.traces === 2 ? 'V02' : a.traces === 3 ? 'V07' : a.traces === 4 ? 'V08' : null;
    if (id) this.say(id, 3);
    if (a.traces >= 4) {
      // L'aveu ; la poursuite attend que la collection soit assez fournie.
      if (collection.items.length >= 10) {
        a.stage = 'poursuite';
        this.say('V09', 10);
      } else this.say('V27', 10);
    }
    this.save();
  }

  private autreVeste(): void {
    const a = this.m.autre;
    if (a.stage === 'poursuite') return this.say('V15');
    this.say(this.heard('V03') ? 'V05' : 'V03', 0, () => this.say('V04'));
  }

  private autreChoice(followed: boolean): void {
    const a = this.m.autre;
    if (followed) {
      this.say(a.signs === 1 ? 'V11' : a.signs >= 3 ? 'V17' : 'V12');
    } else {
      a.ignored++;
      this.say(a.ignored >= 2 ? 'V25' : 'V24');
      if (a.ignored >= 2) {
        a.stage = 'fin';
        a.result = 'ignore';
        this.m.abandoned++;
        this.storyDone(3);
      }
    }
    this.save();
  }

  private favorisEntered(): void {
    const a = this.m.autre;
    this.say('V18');
    if (a.stage !== 'poursuite') return;
    a.stage = 'fin';
    a.result = 'vu';
    this.m.epilogue.push('V23');
    this.say(this.m.lastWasDuo || this.heard('E18') ? 'V28' : 'V20', 6, () => this.say('V21'));
    this.storyDone(3);
  }

  // Histoire 4 : le jeu des trois portes.

  private portesChoice(prev: WorldModule, followed: ModuleSign | undefined): void {
    const p = this.m.portes;
    for (const s of prev.signs) if (s.themeId) this.library.unpinTheme(s.themeId);
    if (!followed) return this.say('G21');
    p.rounds++;
    p.lastVisit = this.m.visits;
    if (followed.star) {
      p.him++;
      p.streakHim++;
      p.streakMe = 0;
      const wasAvoiding = p.avoid >= 3;
      p.avoid = 0;
      if (wasAvoiding) this.say('G20');
      else if (p.streakHim === 4) this.say('G13');
      else if (p.streakHim === 3) this.say('G12');
      else this.say(p.him === 1 ? 'G04' : p.him === 2 ? 'G05' : 'G06');
    } else {
      p.me++;
      p.streakMe++;
      p.streakHim = 0;
      p.avoid++;
      if (p.avoid === 5) this.say('G18');
      else if (p.avoid >= 4) this.say('G19');
      else if (p.streakMe === 3) this.say('G14');
      else if (p.me >= p.him + 3) this.say('G15');
      else this.say(p.me === 1 ? 'G07' : p.me === 2 ? 'G08' : 'G09');
    }
    if (p.me === p.him) this.say('G10');
    if (p.rounds === 5) this.say(p.him >= p.me ? 'G16' : 'G17');
    if (p.rounds >= 10) {
      p.done = true;
      this.m.epilogue.push(p.him > p.me ? 'G24' : 'G23');
      this.storyDone(4);
    }
    this.save();
  }

  // Histoire 5 : le Conservateur se raconte.

  private raconteChoice(tag: string | undefined): void {
    const r = this.m.raconte;
    if (r.choice) return;
    r.next = QUESTION + 1;
    if (tag === 'silence') {
      r.choice = 'silence';
      r.silenceVisit = this.m.visits;
      this.m.epilogue.push('H43');
      this.say('H13', 0, () => {
        this.silent = true;
      });
    } else if (tag === 'continuez') {
      r.choice = 'continuez';
      this.say('H17');
      this.v.suitePending = 'H16';
      this.v.suiteAt = this.visitTime + 120;
    } else {
      r.choice = 'continuez';
      this.say('H14');
    }
    this.save();
  }

  // Finale.

  /** La salle ronde à cinq portes : une par histoire. */
  private prepareFinale(mod: WorldModule, world: World): void {
    const zones = mod.exitZones ?? [];
    const d = world.director;
    const c = mod.def.connectors;
    // Face au visiteur : la mer. Derrière lui : la sortie. Sur les côtés : l'atelier, l'autre, le silence.
    const idx = (nx: number, nz: number) => c.reduce((best, k, i) => (k.normal.x * nx + k.normal.z * nz > c[best]!.normal.x * nx + c[best]!.normal.z * nz ? i : best), 0);
    const mer = idx(0, 1), sortie = idx(0, -1), atelier = idx(1, 0), autre = idx(-1, 0);
    const silence = c.findIndex((_, i) => ![mer, sortie, atelier, autre].includes(i));
    const sea = resolveTheme(FIRST_THEME);
    if (sea) {
      this.library.unbanTheme(FIRST_THEME);
      this.library.openTheme(sea);
      zones[mer] = { ...zones[mer]!, wing: d.makeWing(sea, 5) };
    }
    zones[sortie] = d.makeZone('neant', mod.preset, 'seuil', 3, 'sortie');
    mod.exitZones = zones;
    const fav = collection.items.slice(0, 14).map((s) => s.art);
    mod.exitSpecial = { [atelier]: { kind: 'atelier' }, ...(fav.length >= 3 ? { [autre]: { kind: 'favoris' as const, art: fav } } : {}) };
    mod.signs = [
      { connector: mer, title: 'La mer', themeId: FIRST_THEME, tag: 'finale' },
      { connector: atelier, title: 'Atelier', tag: 'finale' },
      { connector: autre, title: 'L’autre', tag: 'finale' },
      { connector: sortie, title: 'Sortie', style: 'vert', tag: 'finale' },
      ...(silence >= 0 ? [{ connector: silence, title: 'Silence', tag: 'finale' }] : []),
    ];
    this.finaleDoors = { mer, atelier, autre, sortie, silence };
  }
  private finaleDoors: Record<string, number> = {};

  private finaleChoice(followed: ModuleSign | undefined): void {
    const m = this.m;
    if (m.finaleDone) return;
    m.finaleDone = true;
    const d = this.finaleDoors;
    const c = followed?.connector ?? -1;
    if (c === d['mer']) this.say('X09');
    else if (c === d['atelier']) {
      this.say('X10');
      m.atelier.stage = 'atelier';
    } else if (c === d['sortie']) {
      this.say('X11');
      m.sortie.stage = 'chemin';
      m.sortie.step = 3;
    } else if (c === d['autre']) this.say('X12');
    else if (c === d['silence']) {
      return this.say('X13', 0, () => {
        this.silent = true;
        this.save();
      });
    } else this.say('X14');
    this.v.suitePending = 'X15';
    this.v.suiteAt = this.visitTime + 120;
    this.save();
  }

  /**
   * Panneaux des histoires au carrefour qui vient d'être créé (devant le visiteur, sur
   * n'importe quelle branche : tant qu'il n'en a pas croisé un, chaque nouveau carrefour
   * en reçoit).
   */
  private plan(mod: WorldModule, exits: number[]): SignPlan | null | undefined {
    if (!this.active || this.silent || !this.engine) return undefined;
    const m = this.m;
    const world = this.engine.world;
    // Le visiteur se tient dans un carrefour d'histoire : on attend son choix avant d'en poser d'autres.
    if (world.currentModule?.signs.some((sg) => sg.tag)) return undefined;
    const rng = () => exits[Math.floor(Math.random() * exits.length)]!;
    // La visite guidée passe avant tout ; dans le noir et sur la terrasse, aucun panneau.
    const gs = m.guide.stage;
    if (gs === 'noir' || gs === 'bouquet') return null;
    if (gs === 'jeu') return this.guidePlan(exits);
    // La récréation : le panneau qui mène à la galerie des plâtres ; pendant la partie, rien.
    if (m.recre.stage === 'jeu') return null;
    if (m.recre.stage === 'invite' && this.rc.state !== 'entree') {
      const x = rng();
      return {
        signs: [{ connector: x, title: 'Récréation', tag: 'recre' }],
        specials: { [x]: { kind: 'galerie' } },
        zones: { [x]: world.director.makeZone('platres', mod.preset, 'progressive', 1) },
      };
    }
    const sea = resolveTheme(FIRST_THEME);
    // Acte I : la mer, reproposée après un refus.
    if (m.sea === 'refuse' && sea) {
      const x = rng();
      return { signs: [{ connector: x, title: sea.title, themeId: sea.id, tag: 'mer-relance' }], wings: { [x]: sea } };
    }
    // Dix visites après l'avoir retirée, la mer revient une fois.
    if (m.sea === 'retire' && sea && m.seaRetiredAt !== undefined && m.visits - m.seaRetiredAt >= 10 && !this.heard('M05')) {
      this.library.unbanTheme(FIRST_THEME);
      this.library.openTheme(sea);
      const x = rng();
      return { signs: [{ connector: x, title: 'La mer ?', themeId: sea.id, tag: 'mer-retour' }], wings: { [x]: sea } };
    }
    if (m.atelier.stage === 'quete') {
      const n = Math.min(3, m.atelier.signs + 1);
      const x = rng();
      return { signs: [{ connector: x, title: 'Atelier', tag: `atelier${n}` }], ...(n === 3 ? { specials: { [x]: { kind: 'atelier' } } } : {}) };
    }
    if (m.sortie.stage === 'chemin' && m.sortie.step < 3) {
      const n = m.sortie.step + 1;
      const x = rng();
      return {
        signs: [{ connector: x, title: 'Sortie', style: 'vert', tag: `sortie${n}` }],
        ...(n === 3 ? { zones: { [x]: world.director.makeZone('neant', mod.preset, 'seuil', 3, 'sortie') } } : {}),
      };
    }
    if (m.sortie.stage === 'ignore') {
      this.v.signGapModules++;
      if (this.v.signGapModules < 3) return undefined;
      const x = rng();
      return { signs: [{ connector: x, title: 'Sortie', style: 'petit', tag: 'sortie-petit' }] };
    }
    if (m.autre.stage === 'poursuite') {
      const n = Math.min(3, m.autre.signs + 1);
      const x = rng();
      const fav = collection.items.slice(0, 14).map((s) => s.art);
      return { signs: [{ connector: x, title: 'L’autre', tag: `autre${n}` }], ...(n === 3 ? { specials: { [x]: { kind: 'favoris', art: fav } } } : {}) };
    }
    // La question de l'histoire 5 : deux panneaux, deux réponses.
    if (this.v.question && !m.raconte.choice && exits.length >= 2) {
      const [a, b] = exits.slice().sort(() => Math.random() - 0.5);
      return { signs: [{ connector: a!, title: 'Silence', tag: 'silence' }, { connector: b!, title: 'Continuez', tag: 'continuez' }] };
    }
    // Le jeu des trois portes : une manche par visite, dans une salle à trois sorties.
    if (m.story >= 4 && !m.portes.done && m.portes.lastVisit !== m.visits && !this.v.roundDone && exits.length >= 3 && this.visitTime > 60) {
      const star = this.library.topInterest() ?? this.library.pickThemes(1)[0];
      if (!star) return undefined;
      const others = this.library.pickThemes(2, [star.id]);
      if (others.length < 2) return undefined;
      this.v.roundDone = true;
      const themes = [star, ...others];
      const doors = exits.slice().sort(() => Math.random() - 0.5).slice(0, 3);
      // (Pas épinglés : un carrefour jamais atteint ne retient pas leurs œuvres.)
      for (const t of themes) this.library.openTheme(t, false);
      return {
        signs: doors.map((c, i) => ({ connector: c, title: themes[i]!.title, themeId: themes[i]!.id, tag: i === 0 ? 'g-star' : 'g', star: i === 0 })),
        wings: Object.fromEntries(doors.map((c, i) => [c, themes[i]!])),
      };
    }
    return undefined;
  }

  // --- Retours, calendrier, épilogues ----------------------------------------------------

  private sayReturn(now: number, last: number | null, deviceChanged: boolean): void {
    const m = this.m;
    const hour = new Date(now).getHours();
    const day = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);
    const days = last ? day(now) - day(last) : 0;
    const milestones: Record<number, LineId> = { 2: 'R07', 5: 'R08', 10: 'R09', 25: 'R10', 50: 'R11', 100: 'R12' };
    const once: Array<[LineId, boolean]> = [
      [milestones[m.visits] ?? '', !!milestones[m.visits]],
      ['R06', hour < 5],
      ['R30', hour < 5 && this.heard('R06')],
      ['R28', days > 182],
      ['R16', m.lastDuration > 0 && m.lastDuration < 120],
      ['R17', m.lastDuration > 3600],
      ['R18', m.lastFavsAdded >= 5],
      ['R21', m.day.n === 3],
      ['R22', m.lastWasDuo],
      ['R23', m.atelier.stage === 'quete' || (m.autre.stage === 'poursuite') || (m.sortie.stage === 'chemin' && m.sortie.step > 0)],
      ['R29', deviceChanged],
      ['R13', hour >= 6 && hour < 10],
      ['R14', hour >= 12 && hour < 14],
      ['R15', hour >= 19 && hour < 23],
      ['R20', days >= 8 && days <= 30],
    ];
    let id: LineId | undefined = once.find(([i, ok]) => ok && i && !this.heard(i))?.[0];
    if (!id) {
      if (days === 0) id = 'R01';
      else if (days === 1) id = 'R02';
      else if (days > 30) id = 'R05';
      else {
        const pool = ['R03', 'R04', 'R19', 'R24', 'R25', 'R26', 'R27'];
        id = pool[m.returns++ % pool.length]!;
      }
    }
    this.say(id, 2.5);
    // Ce qui s'est passé la dernière fois : silence, sortie quittée en chemin, épilogues.
    if (m.raconte.silenceVisit === m.visits - 1) {
      m.epilogue = m.epilogue.filter((e) => e !== 'H43');
      this.say('H43', 4, () => {
        this.v.suitePending = 'H44';
        this.v.suiteAt = this.visitTime + 60;
      });
    }
    if (m.sortie.inPath && m.sortie.stage === 'chemin') {
      m.sortie.inPath = false;
      m.sortie.stage = 'fin';
      m.sortie.result = 'parti';
      this.say('S33', 4);
      this.storyDone(2);
    }
    if (m.sea === 'retire' && !this.heard('M03')) this.say('M03', 4);
    if (m.guide.left && !this.heard('J40')) this.say('J40', 4);
    if (m.recre.left && !this.heard('L39')) this.say('L39', 5);
    if (m.seaChangedMind && m.sea === 'pris' && !this.heard('M09')) this.say('M09', 30);
    for (const e of m.epilogue.splice(0)) this.say(e, 6);
    if (m.visits >= 6 && collection.items.length === 0) this.say('K11', 40);
    const cal = calendarLine(new Date(now), m);
    if (cal) this.say(cal, 25);
    this.save();
  }

  // --- Lecture ----------------------------------------------------------------------

  private heard(id: LineId): boolean {
    return this.memory.heard.includes(id);
  }

  /** Un événement : l'original, ou sa prochaine variante pas encore entendue. */
  private sayEvent(base: LineId, delay = 0): void {
    const chain = [base, ...(VARIANTS[base] ?? [])];
    const id = chain.find((i) => !this.heard(i));
    if (id) this.say(id, delay);
  }

  /** Demande une réplique, jouée dès que possible (`delay` : au plus tôt dans n secondes). */
  private say(id: LineId, delay = 0, after?: () => void, onStart?: () => void): void {
    if (!this.active || this.silent || !LINES[id]) return;
    // Dans le noir et sur la terrasse, il n'y a plus que lui et sa visite guidée.
    const gs = this.m.guide.stage;
    if ((gs === 'noir' || gs === 'bouquet') && id[0] !== 'J' && lineFamily(id) !== 'texte') return;
    // Pendant la récréation, il ne parle que du jeu.
    if (this.m.recre.stage === 'jeu' && id[0] !== 'L' && lineFamily(id) !== 'texte') return;
    const repeatable = ['R01', 'R02', 'R03', 'R04', 'R05', 'R19', 'R24', 'R25', 'R26', 'R27'].includes(id) || COUNT_LINES.has(id) || CAUGHT_LINES.includes(id);
    if (!repeatable && this.heard(id)) return;
    if (this.queue.some((p) => p.id === id) || this.playing?.id === id) return;
    const now = performance.now() / 1000;
    const fam = lineFamily(id);
    // Les écarts minimaux s'appliquent à la demande : une occasion manquée n'est pas reportée.
    if (fam === 'evenement' && now - this.lastEvent < CONFIG.narrator.eventGap) return;
    if (fam === 'debut' && now - this.lastDebut < CONFIG.narrator.firstVisitGap) return;
    if (fam === 'monde' && now - this.lastMonde < 90) return;
    if (fam === 'evenement') this.lastEvent = now;
    if (fam === 'debut') this.lastDebut = now;
    if (fam === 'monde') this.lastMonde = now;
    this.queue.push({ id, at: now + delay, ...(after ? { after } : {}), ...(onStart ? { onStart } : {}), ...(this.chaining ? { chained: true } : {}) });
    // Marquée tout de suite : une réplique ne revient jamais, même si on quitte au milieu.
    if (!repeatable) this.memory.heard.push(id);
    this.save();
  }

  /** Comme say, mais avant tout ce qui attend déjà (la réplique en cours va jusqu'au bout). */
  private sayFirst(id: LineId, after?: () => void): void {
    this.say(id, 0, after);
    const i = this.queue.findIndex((q) => q.id === id);
    if (i < 0) return;
    const [p] = this.queue.splice(i, 1);
    this.queue.unshift({ ...p!, chained: true });
  }

  /** Abandonne l'accueil (A01–A04) en attente ; celui en cours va jusqu'au bout. */
  private cutIntro(): void {
    this.queue = this.queue.filter((p) => p.id[0] !== 'A');
  }

  private updatePlayback(now: number): void {
    const e = this.engine;
    const p = this.playing;
    if (p && (p.audio ? p.audio.ended : now >= p.until)) this.finish();
    if (this.playing || !e) return;
    // Pas pendant une pause (menu, fiche) ; une réplique trop ancienne est abandonnée
    // (et pourra revenir plus tard : elle n'a pas été entendue).
    const story = (q: Pending) => ['scenario', 'texte'].includes(lineFamily(q.id));
    this.queue = this.queue.filter((q) => {
      if (story(q) || now - q.at < CONFIG.narrator.staleAfter) return true;
      this.memory.heard = this.memory.heard.filter((h) => h !== q.id);
      return false;
    });
    if (e.isPaused || document.hidden) return;
    // L'histoire d'abord : un commentaire ne s'intercale pas dans une suite de répliques
    // (ni juste avant une réplique d'histoire attendue sous peu).
    const storyNext = this.queue.some((q) => story(q) && q.at <= now + CONFIG.narrator.storyHold);
    // La suite d'une réplique qui vient de finir passe avant tout ce qui attendait déjà.
    const chained = this.queue.find((q) => q.chained);
    if (chained && chained.at > now) return;
    const next = chained ?? this.queue.find((q) => q.at <= now && (story(q) || (!storyNext && now - this.storyEnd >= CONFIG.narrator.storyHold)));
    if (!next) return;
    this.queue.splice(this.queue.indexOf(next), 1);
    this.play(next, now);
  }

  private play(next: Pending, now: number): void {
    const id = next.id;
    const text = LINES[id] ?? '';
    this.current = { id, text };
    const estimate = COUNT_FALLBACK[id] ?? estimatedDuration(text);
    const ctx = this.audio.externalInputs()?.ctx;
    const audio = this.sound && ctx && lineFamily(id) !== 'texte' && this.available?.has(id) ? this.startClip(ctx, id, estimate) : null;
    this.playing = { id, until: now + estimate, audio, ...(next.after ? { after: next.after } : {}) };
    next.onStart?.();
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
        source.connect(this.audio.voiceOutput() ?? ctx.destination);
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

  /** Vrai pendant le rappel de fin d'une réplique : ce qu'il demande est sa suite. */
  private chaining = false;

  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private buffer(ctx: AudioContext, id: LineId): Promise<AudioBuffer> {
    let b = this.buffers.get(id);
    if (!b) {
      b = fetch(`${import.meta.env.BASE_URL}voix/${id}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => ctx.decodeAudioData(data));
      // (Chaque réplique n'est jouée qu'une fois : pas besoin de garder le son décodé. Sauf le
      // comptage de la récréation, rejoué à chaque manche, au rythme près.)
      if (!COUNT_LINES.has(id)) b.catch(() => undefined).finally(() => this.buffers.delete(id));
      else b.catch(() => this.buffers.delete(id));
      this.buffers.set(id, b);
    }
    return b;
  }

  private finish(): void {
    const after = this.playing?.after;
    if (this.playing && lineFamily(this.playing.id) === 'scenario') this.storyEnd = performance.now() / 1000;
    this.playing = null;
    this.current = null;
    this.audio.duck(false);
    this.chaining = true;
    try {
      after?.();
    } finally {
      this.chaining = false;
    }
  }

  private silence(): void {
    this.queue = [];
    this.playing?.audio?.stop();
    if (this.playing) {
      this.playing.after = undefined;
      this.finish();
    }
  }

  private visibility(): void {
    if (document.hidden) {
      // (Le son du jeu est suspendu avec l'onglet : la voix reprend où elle en était.)
      this.hiddenAt = performance.now();
      return;
    }
    if (this.hiddenAt && performance.now() - this.hiddenAt > CONFIG.narrator.hiddenTab * 1000) this.sayEvent('E03', 1.5);
    this.hiddenAt = 0;
  }

  /** Téléphone tourné (portrait ↔ paysage). */
  private resized(): void {
    const a = window.innerWidth / window.innerHeight;
    if (this.live && this.m.device === 'mobile' && (a > 1) !== (this.v.aspect > 1)) this.say('E86', 1);
    this.v.aspect = a;
  }

  private fullscreenChanged(): void {
    if (this.live && !document.fullscreenElement && this.m.device === 'mobile') this.say('E87', 1);
  }

  private setSea(s: SeaState): void {
    this.memory.sea = s;
    if (s === 'pris' || s === 'retire') this.library.unpinTheme(FIRST_THEME);
    this.save();
  }

  private save(): void {
    saveMemory(this.memory);
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
