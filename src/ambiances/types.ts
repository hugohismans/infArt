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
/** Objets de décor posés ou accrochés (voir src/decor/catalog.ts). */
export type DecorKind =
  | 'chaise'
  | 'poubelle'
  | 'extincteur'
  | 'radiateur'
  | 'plante'
  | 'socle'
  | 'escabeau'
  | 'caisse'
  | 'cartons'
  | 'seau';

/** Profil sonore d'une ambiance (intensités de 0 à 1, interpolées aux transitions). */
export interface SoundProfile {
  /** Souffle grave de la pièce (« silence de musée »). */
  roomTone: number;
  /** Ventilation, climatisation. */
  hvac: number;
  /** Bourdonnement électrique des néons. */
  hum: number;
  /** Pluie et vent sur une verrière. */
  rain: number;
  /** Oiseaux au loin. */
  birds: number;
  /** Pas d'autres visiteurs, au loin. */
  distantSteps: number;
  /** Réverbération (taille et dureté du lieu). */
  reverb: number;
}

/** Style de cadres privilégié. */
export type FrameBias = 'classique' | 'moderne' | 'bon-marche';

export interface AmbiancePreset {
  id: string;
  /** Nom lisible de l'ambiance (panneau de debug, documentation). */
  name?: string;
  rarity: Rarity;
  /** 0 = calme et rassurant, 1 = étrange et inquiétant (courbe de tension du Directeur). */
  tension: number;
  /** Ambiances qui peuvent lui succéder, avec un multiplicateur (absente = 1). */
  affinities?: Partial<Record<string, number>>;
  /** Durée d'une zone de cette ambiance, en modules (sinon : CONFIG.director.zoneLength). */
  zoneLength?: [number, number];

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

  /** Décors procéduraux tirés dans le pool de l'ambiance, avec la graine du module. */
  decor: {
    /** Nombre moyen d'objets par couloir (le double dans une salle). */
    density: number;
    /** Objets possibles et leurs poids. */
    pool: Partial<Record<DecorKind, number>>;
    /** Probabilité qu'une œuvre soit protégée par un cordon. */
    ropes: number;
    /** Panneaux « sortie » suspendus près des ouvertures (probabilité par ouverture). */
    exitSigns: number;
    /** Feuilles mortes au sol (nombre moyen par module). */
    leaves: number;
    /** Taches au sol (nombre moyen par module). */
    stains: number;
    /** Rayons de lumière (nombre moyen par module). */
    lightShafts: number;
    /** Poussière en suspension (0 à 1). */
    dust: number;
  };

  sound: SoundProfile;

  /** Multiplicateurs des poids de tirage des modules (voir CONFIG.world.moduleWeights). */
  modules?: Partial<Record<string, number>>;
}
