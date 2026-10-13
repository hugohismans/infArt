import type { TypeWeights } from '../shared/artwork';

/**
 * Constantes de « ressenti » regroupées ici pour être ajustées facilement.
 * Toutes les distances sont en mètres, les durées en secondes, les angles en degrés
 * sauf mention contraire.
 */
export const CONFIG = {
  player: {
    /** Hauteur des yeux. */
    eyeHeight: 1.62,
    /** Rayon du cercle de collision. */
    radius: 0.32,
    walkSpeed: 1.7,
    runSpeed: 3.6,
    /** Temps pour atteindre la vitesse cible (lissage du mouvement). */
    acceleration: 0.18,
    /** Vitesse de l'auto-marche contemplative. */
    autoWalkSpeed: 1.25,
    /** Vitesse de rotation max de l'auto-marche (degrés/s). */
    autoWalkTurnRate: 70,
  },

  headBob: {
    enabled: true,
    /** Amplitude verticale. */
    amplitude: 0.035,
    /** Longueur d'une foulée (un cycle complet = deux pas). */
    strideLength: 1.5,
  },

  camera: {
    /** Champ de vision vertical en paysage. */
    fovLandscape: 70,
    /** Champ horizontal minimum garanti en portrait. */
    minHorizontalFov: 62,
    maxVerticalFov: 92,
    /** Plan proche : trop petit, il dégrade la précision de profondeur (scintillement des décors plaqués au mur). */
    near: 0.1,
    /** Inclinaison verticale max (haut/bas). */
    maxPitch: 85,
  },

  look: {
    mouseSensitivity: 0.0022,
    /** Radians par pixel glissé sur mobile. */
    touchSensitivity: 0.0045,
    invertY: false,
  },

  touch: {
    /** Rayon du joystick virtuel (px). */
    joystickRadius: 56,
    /** Zone morte du joystick (fraction du rayon). */
    joystickDeadZone: 0.12,
  },

  world: {
    /** Nombre de modules générés en avance (distance dans le graphe). */
    generationRadius: 2,
    /** Au-delà de cette distance (graphe), un module invisible est détruit. Doit être ≥ generationRadius. */
    destroyRadius: 2,
    /** Temps max par frame consacré à la génération / destruction (ms). */
    frameBudgetMs: 3,
    /** Nombre de vérifications consécutives « invisible » avant destruction. */
    hiddenChecksBeforeDestroy: 8,
    /** Délai avant de retenter une impasse restée invisible (ms). */
    capRetryDelayMs: 2500,
    /**
     * Visibilité à 360° : on teste la ligne de vue depuis la position du joueur
     * et depuis des points autour de lui (rayon en m), pour anticiper ses déplacements.
     */
    visibilitySampleRings: [1.6, 3.4] as readonly number[],
    visibilitySampleCount: 8,
    /** Marge ajoutée au brouillard pour la distance de visibilité potentielle. */
    visibilityMargin: 12,
    /** Écart minimal (m) entre deux modules non voisins : rien ne doit traverser les murs. */
    moduleClearance: 0.02,
    /**
     * Décollement (m) des œuvres et objets accrochés au mur. Deux salles voisines partagent
     * le même plan de mur (épaisseur nulle) : sans cet écart, le dos d'un cadre d'un côté
     * scintille contre le mur de l'autre côté.
     */
    wallGap: 0.015,
    /** Une apparition est jugée perceptible quand le brouillard masque moins de cette fraction. */
    popInFogThreshold: 0.85,
    /** Recentrage du monde quand le joueur s'éloigne trop de l'origine (précision flottante). */
    floatingOriginThreshold: 256,
    /** Poids de tirage des modules (la future « ambiance » pourra les moduler). */
    moduleWeights: {
      'straight-s': 3,
      'straight-m': 3.5,
      'straight-l': 1.5,
      'turn-left': 2.5,
      'turn-right': 2.5,
      tee: 0.9,
      'tee-left': 0.7,
      'tee-right': 0.7,
      cross: 0.45,
      'room-s': 1.1,
      'room-s-side': 0.6,
      'room-l': 0.7,
      'stairs-up': 0.45,
      'stairs-down': 0.45,
      deadend: 0.35,
    } as Record<string, number>,
  },

  art: {
    /** Espacement moyen entre deux œuvres sur un mur. */
    spacing: 3.6,
    /** Probabilité qu'un emplacement soit occupé. */
    density: 0.85,
    /** Hauteur du centre des œuvres (ligne d'accrochage). */
    hangHeight: 1.55,
    minWidth: 0.5,
    maxWidth: 2.0,
    maxHeight: 2.0,
    /** Taille max (px) des textures factices (mode hors ligne). */
    placeholderTextureSize: 128,
    /** Taille max (px) des textures d'œuvres affichées. */
    textureSize: { desktop: 768, mobile: 512 },
    /** Taille max (px) quand on s'approche (sources IIIF uniquement). */
    textureSizeHigh: { desktop: 1686, mobile: 1024 },
    /** Distance (m) sous laquelle on charge la haute résolution, et au-delà de laquelle on la libère. */
    highResDistance: 3.2,
    highResRelease: 6,
    /** Nombre max de textures haute résolution simultanées. */
    maxHighRes: 3,
    /** Distance (m) d'affichage du texte des cartels, et de libération. */
    cartelDistance: 7,
    cartelRelease: 10,
    /** Écran de chargement : œuvres prêtes avant d'entrer, et attente maximale (ms). */
    startReady: 20,
    startTimeoutMs: 12000,
    /** Réserve d'œuvres préchargées (images prêtes) visée. */
    bufferTarget: 10,
    /** Nombre d'œuvres demandées par lot à l'API. */
    batchSize: 24,
    maxConcurrentLoads: 4,
    /** Délai max de chargement d'une image (ms). */
    loadTimeoutMs: 20000,
    /** Images trop petites ou trop allongées ignorées. */
    minImageSize: 120,
    maxAspect: 4.2,
    /** Plus petit côté visible d'une œuvre (m) : une miniature reste petite mais visible. */
    minSize: 0.09,
    /** Durée du fondu d'apparition d'une œuvre (s). */
    fadeDuration: 0.9,
    /** Distance max (m) pour ouvrir la fiche d'une œuvre. */
    pickDistance: 7,
    /** Distance au mur d'un chevalet, d'un cadre flottant (m). */
    easelDistance: 0.95,
    floatDistance: 0.75,
    /** Accrochage serré : rangs supérieurs (hauteur du centre, hauteur max), si le mur est assez haut. */
    /** Probabilité qu'une place d'un rang supérieur soit occupée. */
    salonFill: 0.6,
    salonRows: [
      [2.95, 1.1],
      [4.15, 0.95],
    ] as Array<[number, number]>,
    /** Grand côté (m) tiré au hasard quand la source ne donne pas les dimensions. */
    longSide: {
      peinture: [0.45, 1.3],
      photographie: [0.18, 0.35],
      affiche: [0.7, 1.2],
      // Jaquettes exposées en grand format, comme des tirages.
      'jaquette-jeu': [0.5, 0.72],
      'couverture-livre': [0.2, 0.26],
      sculpture: [0.45, 1.0],
      autre: [0.22, 0.5],
    } as Record<string, [number, number]>,
    /** Agrandissement des livres (une couverture de 13 cm serait illisible au mur). */
    bookScale: 1.3,
    /** Inclinaison (rad) des pochettes et livres posés sur une tablette. */
    leanAngle: 0.1,
    /**
     * Mode mélange : part de chaque type d'œuvre dans les lots (majorité de beaux-arts).
     * Un type sans source disponible (clé manquante, mode direct) est simplement ignoré.
     */
    mix: {
      peinture: 0.42,
      estampe: 0.14,
      dessin: 0.1,
      photographie: 0.08,
      affiche: 0.06,
      'affiche-film': 0.05,
      'jaquette-jeu': 0.05,
      'pochette-disque': 0.05,
      'couverture-livre': 0.05,
      // Pour les socles (jamais au mur).
      sculpture: 0.06,
    } as TypeWeights,
    /** Socles : probabilité qu'un emplacement de socle reçoive une sculpture, réserve maximale. */
    pedestalChance: 0.7,
    sculptureStock: 4,
    /** Socle : hauteur et profondeur (m). */
    pedestalHeight: 0.9,
    pedestalDepth: 0.5,
    /** Ailes thématiques : œuvres prêtes avant d'ouvrir une aile, et réserve visée. */
    themeMinReady: 8,
    themeBufferTarget: 10,
    /** Lots tentés pour un thème avant de l'abandonner. */
    themeMaxBatches: 8,
    /** Œuvres du thème encore disponibles pour prolonger l'aile d'un module. */
    themeModuleMin: 4,
  },

  audio: {
    /** Volume général. */
    volume: 0.8,
    /** Durée des fondus d'ambiance aux transitions (s). */
    crossfade: 3,
    /** Niveau de chaque nappe pour une intensité 1 dans le profil de l'ambiance. */
    layers: { roomTone: 0.32, hvac: 0.1, hum: 0.05, rain: 0.08, wind: 0.22, water: 0.12, crackle: 0.18 },
    footsteps: 0.22,
    drips: 0.35,
    birds: 0.05,
    bleeps: 0.03,
  },

  lighting: {
    /** Intensité de la lampe torche (multipliée par `lighting.flashlight` de l'ambiance). */
    flashlight: 9,
  },

  decor: {
    /** Multiplicateur global du nombre d'objets de décor (0 = aucun). */
    density: 1,
    /** Poussière en suspension : nombre de grains (PC / mobile) et taille (m). */
    dustCount: { desktop: 420, mobile: 220 },
    dustSize: 0.022,
    /** Forêt : rayon (m) des troncs auxquels les œuvres sont accrochées. */
    trunkRadius: 0.32,
    /** Fuites : intervalle entre deux gouttes (s) et durée de chute. */
    dripInterval: [1.4, 3.2] as [number, number],
  },

  /**
   * Intérêts du visiteur : une œuvre qui l'a retenu rend plus probables, un peu plus loin,
   * des ailes à thème apparenté (même artiste, dans la lignée d'un film, même décennie…).
   */
  interest: {
    /** Regard prolongé (s) sur une œuvre pour qu'il compte. */
    dwellSeconds: 3.5,
    /** Force de chaque interaction. */
    strength: { regard: 1, fiche: 2.5, favori: 5 },
    /** Demi-vie (s) d'un intérêt : il s'estompe si rien ne le ravive. */
    halfLife: 300,
    /** Score total à partir duquel le prochain thème vient presque sûrement des intérêts. */
    saturation: 3,
    /** Probabilité maximale de choisir le prochain thème parmi les intérêts. */
    maxChance: 0.9,
    /** Score qui fait abandonner le thème quelconque en préparation, au profit d'un intérêt. */
    preempt: 4,
    /** Quand un thème apparenté est prêt, les ailes arrivent d'autant plus vite. */
    wingBoost: 3,
  },

  /** Panneaux d'orientation aux carrefours (« LA MER → ») : un thème prêt derrière une sortie. */
  signs: {
    /** Largeur (m) et hauteur du centre (m) d'un panneau peint au mur. */
    width: 3.4,
    height: 2.1,
    /** Modules entre deux carrefours fléchés, chance à chaque carrefour au-delà. */
    gap: 6,
    chance: 0.6,
    /** Longueur de l'aile derrière un panneau (modules). */
    wingLength: [4, 6] as [number, number],
  },

  /** Voix off (le Conservateur) : écarts minimaux entre deux répliques (s), seuils des événements. */
  narrator: {
    eventGap: 180,
    firstVisitGap: 40,
    idleRotonde: [25, 60] as [number, number],
    idle: 120,
    hiddenTab: 60,
    rushRooms: 4,
    backtrackRooms: 3,
    pushLimit: 3,
    /** Une réplique attendue (pause, fiche ouverte) au-delà de ce délai est abandonnée. */
    staleAfter: 12,
    /** Après une réplique d'histoire (ou juste avant), les commentaires attendent (s). */
    storyHold: 4,
  },

  director: {
    /** Durée de la zone de départ (musée classique), en modules. */
    firstZoneLength: [9, 13] as [number, number],
    /** Durée des ailes qui partent de la rotonde de départ, en modules. */
    hubZoneLength: [6, 10] as [number, number],
    /** Durée des zones suivantes. */
    zoneLength: [3, 15] as [number, number],
    /** Nombre de modules d'une transition progressive. */
    blendSteps: [2, 4] as [number, number],
    /** Probabilité qu'une sortie latérale d'embranchement mène à une autre zone. */
    branchNewZone: 0.35,
    /** Poids des types de transition. */
    transitionWeights: { progressive: 0.6, seuil: 0.28, rupture: 0.12 },
    /** Vitesse d'interpolation de l'environnement (brouillard, lumière) quand l'ambiance change. */
    envLerpRate: 1.4,
    /** Durée d'affichage du nom d'une aile thématique (s). */
    titleDuration: 4.5,
    /** Aile thématique (les œuvres suivent un sujet) : chance par module, durée, écart minimal. */
    wingChance: 0.15,
    wingLength: [3, 5] as [number, number],
    wingGap: 10,
    /** Densité d'œuvres minimale de l'ambiance pour y ouvrir une aile. */
    wingMinDensity: 0.3,
    /** Étrangetés : probabilité par module (× 0,4 + tension), écart minimal, poids de chacune. */
    oddityChance: 0.07,
    oddityGap: 6,
    /** Porte murée : distance (m) à l'entrée avant qu'elle ne se referme, hors de la vue. */
    sealDistance: 3.5,
    oddities: {
      'cartel-illisible': 1,
      'oeuvre-changeante': 1.2,
      triple: 1,
      'porte-muree': 0.8,
      'veste-cafe': 1,
      'salle-vide': 0.9,
      'a-l-envers': 1,
      'oeuvre-plafond': 0.8,
      'couloir-boucle': 0.9,
    } as Record<string, number>,
  },

  quality: {
    /**
     * Niveaux de qualité : résolution de rendu max (multiple des pixels CSS) et part des
     * particules affichées. « auto » part du niveau détecté puis ajuste la résolution aux fps.
     */
    levels: {
      bas: { pixelRatio: 1, particles: 0.35 },
      moyen: { pixelRatio: 1.5, particles: 0.7 },
      haut: { pixelRatio: 2, particles: 1 },
    },
    /** Fps visés par le mode auto (en deçà, la résolution baisse ; bien au-delà, elle remonte). */
    targetFps: { desktop: 55, mobile: 30 },
    /** Durée (s) d'une mesure de fps du mode auto. */
    window: 2.5,
    /** Résolution minimale et pas d'ajustement du mode auto. */
    minPixelRatio: 0.75,
    pixelRatioStep: 0.25,
  },

  debug: {
    /** Fréquence de rafraîchissement du panneau de debug (ms). */
    refreshMs: 250,
  },
} as const;

export type Config = typeof CONFIG;
