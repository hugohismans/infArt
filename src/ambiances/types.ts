import type { ArtType } from '../../shared/artwork';

/**
 * Une ambiance est un preset de données pur : le moteur ne contient aucun code
 * spécifique à une ambiance. Ajouter une ambiance = ajouter un preset (et l'inscrire
 * dans le registre).
 */
export type Rarity = 'commune' | 'rare' | 'tres-rare';

export type FloorPattern =
  | 'parquet'
  | 'beton'
  | 'moquette'
  | 'carrelage'
  | 'marbre'
  | 'tatami'
  | 'lino'
  | 'eau'
  | 'sable'
  | 'grille'
  | 'nuages'
  | 'herbe'
  | 'neige';
/**
 * Motif des murs. « brume » : mur non éclairé, de la couleur du brouillard (lieux sans
 * murs : désert, néant, rêve…). Il continue de cacher ce qui est derrière, si bien que la
 * génération reste invisible.
 */
export type WallPattern = 'uni' | 'papier-peint' | 'damas' | 'shoji' | 'faience' | 'rayonnages' | 'boiserie' | 'pierre' | 'miroir' | 'hublots' | 'panneaux' | 'brume';
/** Plafond. « ciel » : pas de plafond, le ciel de l'ambiance (voir `sky`). */
export type CeilingStyle = 'uni' | 'dalles' | 'verriere' | 'ciel' | 'peint' | 'beton';
/** Support des œuvres : au mur (défaut), sur chevalet, flottantes, en caisson lumineux, posées au sol. */
export type ArtMount = 'mur' | 'chevalet' | 'flottant' | 'caisson' | 'sol' | 'projection';
/** Particules en suspension. */
export type Particles = 'poussiere' | 'neige' | 'lucioles' | 'paillettes' | 'bulles';
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
  | 'seau'
  | 'etagere'
  | 'echelle'
  | 'bureau'
  | 'pilier'
  | 'cone'
  | 'echafaudage'
  | 'bache'
  | 'arbre'
  | 'palmier'
  | 'statue'
  | 'brancard'
  | 'presentoir-vhs'
  | 'lanterne'
  | 'bonsai'
  | 'stalactite'
  | 'vitrine'
  | 'bac-vinyles'
  | 'borne'
  | 'sieges'
  | 'colonne'
  | 'lierre'
  | 'console';

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
  /** Vent (désert, givre). */
  wind: number;
  /** Grillons (forêt la nuit). */
  crickets: number;
  /** Clapotis (eau au sol). */
  water: number;
  /** Crépitement de vinyle. */
  crackle: number;
  /** Bips de bornes d'arcade. */
  bleeps: number;
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

  /** Le visiteur lui-même : hauteur des yeux et vitesse relatives (échelle déréglée, sous l'eau). */
  visitor?: { eyeScale?: number; speed?: number };

  /** Monde inversé : chaque module est retourné, on marche au plafond. */
  inverted?: boolean;

  /** Transition imposée pour entrer dans cette ambiance. */
  transition?: 'progressive' | 'seuil' | 'rupture';

  /** Ciel visible (plafond « ciel ») : dégradé du zénith à l'horizon, étoiles. */
  sky?: { top: string; horizon: string; stars?: boolean };

  lighting: {
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    /** Intensité du halo « spot » au-dessus des œuvres (0 = aucun). */
    artGlow: number;
    /** Néons qui grésillent : probabilité de vacillement (0 = jamais). */
    flicker: number;
    /** Lampe torche du visiteur (intensité, 0 = aucune). */
    flashlight?: number;
    /** Bandes lumineuses de couleur changeante (néons RVB). */
    rgb?: boolean;
    /** Le musée respire : amplitude de la pulsation de la lumière et de l'ondulation des murs. */
    breath?: number;
  };

  furniture: { small: Furniture; large: Furniture };

  art: {
    /** Multiplicateur de la densité d'œuvres. */
    density: number;
    frames: FrameBias;
    /** Types d'œuvres privilégiés quand il y a le choix. */
    prefer?: ArtType[];
    /** Support (défaut : au mur). */
    mount?: ArtMount;
    /** Accrochage serré, en plusieurs rangs jusqu'au plafond (palais baroque). */
    salon?: boolean;
    /** Couleur de la matière des cadres (givre : cadres pris dans la glace). */
    frameTint?: string;
    /** Part des œuvres emballées sous une bâche (musée en travaux). */
    wrapped?: number;
    /** Taille des œuvres (× ; échelle déréglée, projection de cinéma). */
    scale?: number;
    /** Œuvres tournées d'un quart de tour au hasard (Escher). */
    rotations?: boolean;
    /** Toutes les œuvres d'un module sont la même, comme des reflets (labyrinthe de miroirs). */
    mirror?: boolean;
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
    /** Nature des particules (défaut : poussière). */
    particles?: Particles;
    /** Un tronc d'arbre derrière chaque œuvre (forêt de cadres). */
    trunksBehindArt?: boolean;
    /** Ciel ouvert : lisière visible là où se tient le mur invisible (arbres, dunes…). */
    boundary?: import('../decor/boundary').Boundary;
  };

  sound: SoundProfile;

  /** Multiplicateurs des poids de tirage des modules (voir CONFIG.world.moduleWeights). */
  modules?: Partial<Record<string, number>>;
}
