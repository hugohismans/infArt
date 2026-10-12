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
    near: 0.05,
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
    generationRadius: 3,
    /** Au-delà de cette distance (graphe), un module invisible est détruit. Doit être ≥ generationRadius. */
    destroyRadius: 3,
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
    visibilityMargin: 8,
    /** Une apparition est jugée perceptible quand le brouillard masque moins de cette fraction. */
    popInFogThreshold: 0.85,
    /** Recentrage du monde quand le joueur s'éloigne trop de l'origine (précision flottante). */
    floatingOriginThreshold: 256,
    /** Poids de tirage des modules (phase 1). */
    moduleWeights: {
      'straight-s': 3,
      'straight-m': 4,
      'straight-l': 2,
      'turn-left': 3,
      'turn-right': 3,
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
  },

  debug: {
    /** Fréquence de rafraîchissement du panneau de debug (ms). */
    refreshMs: 250,
  },
} as const;

export type Config = typeof CONFIG;
