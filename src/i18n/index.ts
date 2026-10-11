import { fr, type MessageKey } from './fr';

type Dictionary = Record<MessageKey, string>;

const dictionaries: Record<string, Dictionary> = { fr };
let current: Dictionary = fr;

/** Change la langue de l'interface (seul le français existe pour l'instant). */
export function setLocale(locale: string): void {
  current = dictionaries[locale] ?? fr;
}

/** Traduit une clé ; `{nom}` est remplacé par `params.nom`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text = current[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
