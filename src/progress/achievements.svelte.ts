import type { ArtType } from '../../shared/artwork';
import { collection, type SavedArtwork } from './collection.svelte';
import { readJson, writeJson } from './storage';

/** Ce que le visiteur a vécu, toutes visites confondues (localStorage). */
export interface Stats {
  visits: number;
  /** Jours distincts de visite (AAAA-MM-JJ), les plus récents. */
  days: string[];
  /** Fiches d'œuvres ouvertes. */
  sheets: number;
  /** Distance parcourue (m). */
  distance: number;
  ambiances: string[];
  /** Thèmes d'ailes traversées (les chats, la mer…). */
  themes: string[];
  oddities: string[];
  /** Moments des histoires de la voix off (la sortie trouvée…). */
  found?: string[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Valeur à atteindre (affichage de la progression). */
  target: number;
  progress: (s: Stats, c: SavedArtwork[]) => number;
  /** Description cachée tant que le succès n'est pas obtenu. */
  secret?: boolean;
}

const typeCount = (c: SavedArtwork[], t: ArtType) => c.filter((s) => s.art.type === t).length;
const distinct = <T>(xs: T[]) => new Set(xs).size;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'premier-pas', title: 'Premier pas', description: 'Entrer dans la galerie.', target: 1, progress: (s) => s.visits },
  { id: 'habitue', title: 'Habitué des lieux', description: 'Revenir visiter trois jours différents.', target: 3, progress: (s) => s.days.length },
  { id: 'curieux', title: 'Curieux', description: 'Ouvrir la fiche de 25 œuvres.', target: 25, progress: (s) => s.sheets },
  { id: 'erudit', title: 'Érudit', description: 'Ouvrir la fiche de 200 œuvres.', target: 200, progress: (s) => s.sheets },
  { id: 'coup-de-coeur', title: 'Coup de cœur', description: 'Ajouter une œuvre à sa collection.', target: 1, progress: (_, c) => c.length },
  { id: 'collectionneur', title: 'Collectionneur', description: 'Réunir 10 œuvres dans sa collection.', target: 10, progress: (_, c) => c.length },
  { id: 'conservateur', title: 'Conservateur', description: 'Réunir 50 œuvres dans sa collection.', target: 50, progress: (_, c) => c.length },
  { id: 'disquaire', title: 'Disquaire', description: 'Collectionner une pochette de disque.', target: 1, progress: (_, c) => typeCount(c, 'pochette-disque') },
  { id: 'bibliophile', title: 'Bibliophile', description: 'Collectionner une couverture de livre.', target: 1, progress: (_, c) => typeCount(c, 'couverture-livre') },
  { id: 'cinephile', title: 'Cinéphile', description: 'Collectionner une affiche de film.', target: 1, progress: (_, c) => typeCount(c, 'affiche-film') },
  { id: 'joueur', title: 'Joueur', description: 'Collectionner une jaquette de jeu vidéo.', target: 1, progress: (_, c) => typeCount(c, 'jaquette-jeu') },
  { id: 'eclectique', title: 'Éclectique', description: 'Collectionner des œuvres de 6 types différents.', target: 6, progress: (_, c) => distinct(c.map((s) => s.art.type)) },
  { id: 'tour-du-monde', title: 'Tour des musées', description: 'Collectionner des œuvres venues de 5 collections différentes.', target: 5, progress: (_, c) => distinct(c.map((s) => s.art.source)) },
  { id: 'voyageur', title: 'Voyageur', description: 'Traverser 5 ambiances différentes.', target: 5, progress: (s) => s.ambiances.length },
  { id: 'arpenteur', title: 'Arpenteur des mondes', description: 'Traverser 15 ambiances différentes.', target: 15, progress: (s) => s.ambiances.length },
  { id: 'thematiques', title: 'Esprit de suite', description: 'Visiter 10 salles à thème différentes.', target: 10, progress: (s) => s.themes.length },
  { id: 'ca-alors', title: 'Ça alors', description: 'Remarquer une première étrangeté.', target: 1, progress: (s) => s.oddities.length, secret: true },
  { id: 'chasseur', title: 'Chasseur d’étrangetés', description: 'Croiser 5 étrangetés différentes.', target: 5, progress: (s) => s.oddities.length, secret: true },
  { id: 'la-sortie', title: 'La sortie', description: 'Trouver la sortie du musée.', target: 1, progress: (s) => ((s.found ?? []).includes('sortie') ? 1 : 0), secret: true },
  { id: 'recreation', title: 'Récréation', description: 'Gagner au 1, 2, 3, soleil du Conservateur.', target: 1, progress: (s) => ((s.found ?? []).includes('recre') ? 1 : 0), secret: true },
  { id: 'bouquet-final', title: 'Bouquet final', description: 'Assister au feu d’artifice du Conservateur.', target: 1, progress: (s) => ((s.found ?? []).includes('bouquet') ? 1 : 0), secret: true },
  { id: 'promeneur', title: 'Promeneur', description: 'Marcher 1 km dans la galerie.', target: 1000, progress: (s) => s.distance },
  { id: 'infini', title: 'L’infini à pied', description: 'Marcher 10 km dans la galerie.', target: 10000, progress: (s) => s.distance },
];

const STATS_KEY = 'galerie-infinie:stats';
const UNLOCKED_KEY = 'galerie-infinie:achievements';
const EMPTY: Stats = { visits: 0, days: [], sheets: 0, distance: 0, ambiances: [], themes: [], oddities: [] };

/**
 * Succès : statistiques cumulées et succès obtenus (date), gardés dans le localStorage.
 * Les succès nouvellement obtenus attendent dans `toasts` d'être annoncés.
 */
class ProgressStore {
  stats = $state<Stats>({ ...EMPTY, ...readJson<Partial<Stats>>(STATS_KEY, {}) });
  unlocked = $state<Record<string, number>>(readJson(UNLOCKED_KEY, {}));
  toasts = $state<Achievement[]>([]);
  private saveTimer = 0;

  /** Début d'une visite. */
  visit(): void {
    const day = new Date().toISOString().slice(0, 10);
    this.stats.visits++;
    if (!this.stats.days.includes(day)) this.stats.days = [...this.stats.days, day].slice(-30);
    this.commit(true);
  }

  openedSheet(): void {
    this.stats.sheets++;
    this.commit(true);
  }

  /** Relevé régulier pendant la visite. */
  observe(o: { ambiance?: string; theme?: string; oddity?: string; walked: number }): void {
    const s = this.stats;
    let changed = false;
    const add = (list: 'ambiances' | 'themes' | 'oddities', v: string | undefined) => {
      if (v && !s[list].includes(v)) {
        s[list] = [...s[list], v];
        changed = true;
      }
    };
    add('ambiances', o.ambiance);
    add('themes', o.theme);
    add('oddities', o.oddity);
    if (o.walked > 0) s.distance += o.walked;
    this.commit(changed);
  }

  /** Un moment d'histoire vécu (voix off). */
  found(id: string): void {
    const f = this.stats.found ?? [];
    if (f.includes(id)) return;
    this.stats.found = [...f, id];
    this.commit(true);
  }

  /** La collection a changé : certains succès en dépendent. */
  collectionChanged(): void {
    this.commit(true);
  }

  progressOf(a: Achievement): number {
    return Math.min(a.target, Math.floor(a.progress(this.stats, collection.items)));
  }

  dismissToast(): void {
    this.toasts = this.toasts.slice(1);
  }

  /** Vérifie les succès et enregistre (tout de suite, ou groupé pour la distance). */
  private commit(now: boolean): void {
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked[a.id] || this.progressOf(a) < a.target) continue;
      this.unlocked[a.id] = Date.now();
      this.toasts = [...this.toasts, a];
      now = true;
    }
    if (now) this.save();
    else if (!this.saveTimer) this.saveTimer = window.setTimeout(() => this.save(), 5000);
  }

  private save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    writeJson(STATS_KEY, $state.snapshot(this.stats));
    writeJson(UNLOCKED_KEY, $state.snapshot(this.unlocked));
  }
}

export const progress = new ProgressStore();
