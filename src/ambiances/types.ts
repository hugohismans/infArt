import type { ArtType } from '../../shared/artwork';

/**
 * Une ambiance est un preset de données pur : le moteur ne contient aucun code
 * spécifique à une ambiance. Ajouter une ambiance = ajouter un preset (et l'inscrire
 * dans le registre).
 */
export type Rarity = 'commune' | 'rare' | 'tres-rare';

export type FloorPattern = 'parquet' | 'beton' | 'moquette' | 'carrelage';
export type WallPattern = 'uni' | 'papier-peint';
export type CeilingStyle = 'uni' | 'dalles' | 'verriere';
/** Mobilier des salles : banc, cimaise, jardinières, rien. */
export type Furniture = 'banc' | 'cimaise' | 'jardinieres' | 'aucun';
/** Style de cadres privilégié. */
export type FrameBias = 'classique' | 'moderne' | 'bon-marche';

export interface AmbiancePreset {
  id: string;
  /** Nom affiché à l'entrée de la zone (absent pour les zones liminales). */
  name?: string;
  rarity: Rarity;
  /** 0 = calme et rassurant, 1 = étrange et inquiétant (courbe de tension du Directeur). */
  tension: number;
  /** Ambiances qui peuvent lui succéder, avec un multiplicateur (absente = 1). */
  affinities?: Partial<Record<string, number>>;

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

  /** Motif des murs, du plafond, du sol. */
  surfaces: {
    wall: WallPattern;
    ceiling: CeilingStyle;
    floor: FloorPattern;
    /** Plinthes et corniches. */
    trims: boolean;
  };

  fog: { color: string; near: number; far: number };

  lighting: {
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    /** Intensité du halo « spot » au-dessus des œuvres (0 = aucun). */
    artGlow: number;
    /** Néons qui grésillent : probabilité de vacillement (0 = jamais). */
    flicker: number;
  };

  furniture: { small: Furniture; large: Furniture };

  art: {
    /** Multiplicateur de la densité d'œuvres. */
    density: number;
    frames: FrameBias;
    /** Types d'œuvres privilégiés quand il y a le choix. */
    prefer?: ArtType[];
  };

  /** Multiplicateurs des poids de tirage des modules (voir CONFIG.world.moduleWeights). */
  modules?: Partial<Record<string, number>>;
}
