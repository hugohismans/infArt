/** Réglages persistants du visiteur (localStorage, qui peut être indisponible). */
export interface Settings {
  reduceMotion: boolean;
  filterSensitive: boolean;
}

const KEY = 'galerie-infinie:settings';

export function loadSettings(): Settings {
  const defaults: Settings = {
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    filterSensitive: true,
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
