import type { Artwork } from '../../shared/artwork';
import { readJson, writeJson } from './storage';

/** Une œuvre gardée dans la collection personnelle. */
export interface SavedArtwork {
  art: Artwork;
  /** Date d'ajout (ms). */
  at: number;
}

const KEY = 'galerie-infinie:collection';
/** Au-delà, les plus anciennes sortent (le localStorage est limité à quelques Mo). */
const MAX_ITEMS = 500;

/**
 * Collection personnelle : les œuvres mises en favori depuis leur fiche.
 * Gardée dans le navigateur (localStorage), sans serveur ; la plus récente en premier.
 */
class CollectionStore {
  items = $state<SavedArtwork[]>(readJson<SavedArtwork[]>(KEY, []).filter((s) => s?.art?.id));

  has(id: string): boolean {
    return this.items.some((s) => s.art.id === id);
  }

  /** Ajoute l'œuvre si elle n'y est pas (cadeau de la voix off). */
  add(art: Artwork): void {
    if (!this.has(art.id)) this.toggle(art);
  }

  /** Ajoute ou retire l'œuvre ; renvoie vrai si elle est désormais dans la collection. */
  toggle(art: Artwork): boolean {
    const added = !this.has(art.id);
    this.items = added ? [{ art: $state.snapshot(art) as Artwork, at: Date.now() }, ...this.items].slice(0, MAX_ITEMS) : this.items.filter((s) => s.art.id !== art.id);
    writeJson(KEY, $state.snapshot(this.items));
    return added;
  }
}

export const collection = new CollectionStore();
