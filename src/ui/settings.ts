import type { QualitySetting } from '../engine/Quality';

/** Réglages persistants du visiteur (localStorage, qui peut être indisponible). */
export interface Settings {
  reduceMotion: boolean;
  filterSensitive: boolean;
  /** Son activé (le bouton du coin de l'écran). */
  sound: boolean;
  /** Qualité de rendu (auto : détectée puis ajustée aux fps). */
  quality: QualitySetting;
  /** Regarder en bougeant le téléphone. */
  gyro: boolean;
  /** Interface en plus grands caractères. */
  largeText: boolean;
  /** Volume général (0 à 1), voix off comprise. */
  volume: number;
  /** Sensibilité de la souris (multiplie le réglage de base). */
  mouseSensitivity: number;
}

const KEY = 'galerie-infinie:settings';

export function loadSettings(): Settings {
  const defaults: Settings = {
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    filterSensitive: true,
    sound: true,
    quality: 'auto',
    gyro: false,
    largeText: false,
    volume: 1,
    mouseSensitivity: 1,
  };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) } : defaults;
  } catch {
    return defaults;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* navigation privée, stockage plein… : tant pis */
  }
}
