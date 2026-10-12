import type { Artwork } from '../../shared/artwork';
import type { FrameMaterialKey } from '../world/resources';
import type { Rng } from '../world/random';
import type { FrameBias } from '../ambiances/types';

/**
 * Style d'encadrement, choisi selon le type d'œuvre, l'époque et le format.
 * Toutes les mesures sont en mètres.
 */
export interface FrameStyle {
  /** Largeur de la baguette (0 = pas de cadre). */
  border: number;
  /** Profondeur du cadre (ou épaisseur du châssis s'il n'y a pas de cadre). */
  depth: number;
  /** Largeur du passe-partout (0 = aucun). */
  mat: number;
  material: FrameMaterialKey;
  /** Ressaut intérieur plus sombre (cadres dorés anciens). */
  lip: boolean;
}

const PAPER = new Set(['estampe', 'dessin', 'photographie']);

export function chooseFrame(art: Artwork, w: number, h: number, rng: Rng, bias: FrameBias = 'classique'): FrameStyle {
  const size = Math.max(w, h);
  const year = art.year;

  if (bias === 'moderne') {
    // Galerie contemporaine : toile nue ou baguette noire fine, papier sous passe-partout blanc.
    if (PAPER.has(art.type)) return { border: 0.015, depth: 0.03, mat: Math.min(0.14, 0.06 + size * 0.2), material: rng.chance(0.7) ? 'black' : 'white', lip: false };
    return rng.chance(0.6) ? { border: 0, depth: 0.04, mat: 0, material: 'white', lip: false } : { border: 0.014, depth: 0.04, mat: 0, material: 'black', lip: false };
  }
  if (bias === 'bon-marche') {
    // Cadres de bazar : baguette fine, parfois un passe-partout jauni.
    return { border: 0.018, depth: 0.025, mat: PAPER.has(art.type) && rng.chance(0.5) ? 0.04 : 0, material: rng.chance(0.5) ? 'wood' : 'black', lip: false };
  }

  if (PAPER.has(art.type)) {
    // Œuvres sur papier : passe-partout blanc et baguette fine.
    const mat = Math.min(0.16, Math.max(0.05, 0.05 + size * 0.22));
    const old = year !== undefined && year < 1850;
    const material: FrameMaterialKey =
      art.type === 'photographie' ? (rng.chance(0.75) ? 'black' : 'white') : old ? (rng.chance(0.5) ? 'wood' : 'gold') : rng.chance(0.6) ? 'black' : 'wood';
    return { border: 0.022 + size * 0.015, depth: 0.03, mat, material, lip: false };
  }

  // Peintures.
  if (year === undefined || year < 1800) {
    // Ancien (ou date inconnue) : grand cadre doré mouluré.
    return { border: 0.05 + size * 0.07, depth: 0.07, mat: 0, material: rng.chance(0.85) ? 'gold' : 'wood', lip: true };
  }
  if (year < 1900) {
    return { border: 0.04 + size * 0.05, depth: 0.06, mat: 0, material: rng.chance(0.7) ? 'gold' : 'wood', lip: rng.chance(0.6) };
  }
  if (year < 1950 && rng.chance(0.6)) {
    return { border: 0.025 + size * 0.02, depth: 0.045, mat: 0, material: rng.chance(0.5) ? 'wood' : 'black', lip: false };
  }
  // Moderne : baguette noire fine, ou toile nue sur châssis.
  return rng.chance(0.5)
    ? { border: 0.018, depth: 0.04, mat: 0, material: 'black', lip: false }
    : { border: 0, depth: 0.035, mat: 0, material: 'white', lip: false };
}
