/**
 * Une ambiance est un preset de données pur : le moteur ne contient aucun code
 * spécifique à une ambiance. Ajouter une ambiance = ajouter un preset.
 * (Phase 1 : seul un sous-ensemble des champs est utilisé.)
 */
export type Rarity = 'commune' | 'rare' | 'tres-rare';

export type FloorPattern = 'parquet' | 'beton' | 'moquette' | 'carrelage';

export interface AmbiancePreset {
  id: string;
  /** Nom affiché à l'entrée de la zone (absent pour les zones liminales). */
  name?: string;
  rarity: Rarity;

  geometry: {
    ceilingHeight: number;
    corridorWidth: number;
  };

  palette: {
    background: string;
    wall: string;
    /** Couleur multiplicative au pied des murs (fausse occlusion ambiante). */
    wallShade: string;
    ceiling: string;
    skirting: string;
    floor: string;
    floorAlt: string;
    lightStrip: string;
    frame: string[];
  };

  fog: { color: string; near: number; far: number };

  lighting: {
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    /** Intensité du halo « spot » au-dessus des œuvres (0 = aucun). */
    artGlow: number;
  };

  floorPattern: FloorPattern;

  art: {
    /** Multiplicateur de la densité d'œuvres. */
    density: number;
  };
}
