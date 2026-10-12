import data from './repliques.json';

/**
 * Le texte de la voix off (le Conservateur). La source est repliques.json, le fichier qui
 * sert aussi à générer les voix (Eleven v3) : un identifiant par réplique, qui est aussi
 * le nom du fichier audio (voix/A01.mp3). Pour les sous-titres, on retire les indications
 * de jeu (« [whispers] ») et les silences ({p}) deviennent des points de suspension.
 * Les répliques T ne sont jamais enregistrées : sous-titres seulement.
 */
export type LineId = string;

const TEXT_ONLY: Record<string, string> = {
  T01: 'Vous m’avez coupé le son… Très bien. J’écrirai.',
  T02: 'Ah. Vous m’entendez de nouveau. Je n’ai rien dit d’important pendant ce temps… Si, un peu.',
};

function subtitle(texte: string): string {
  return texte
    .replace(/\[[^\]]*\]\s*/g, '')
    .replace(/\s*\{p\}\s*/g, '… ')
    .replace(/\.\.\./g, '…')
    .replace(/([.!?…])… /g, '$1 ')
    .replace(/'/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
}

export const LINES: Record<LineId, string> = {
  ...Object.fromEntries((data.repliques as Array<{ id: string; texte: string }>).map((r) => [r.id, subtitle(r.texte)])),
  ...TEXT_ONLY,
};

/**
 * Familles de répliques : le scénario (acte I, histoires, retours) s'enchaîne sans délai ;
 * les commentaires de début de partie et des mondes, et les événements, respectent un
 * écart minimal (voir CONFIG.narrator).
 */
export type Family = 'scenario' | 'debut' | 'monde' | 'evenement' | 'texte';

export function lineFamily(id: LineId): Family {
  const c = id[0];
  if (c === 'T') return 'texte';
  if (c === 'D' || c === 'K' || c === 'N') return 'debut';
  if (c === 'W') return 'monde';
  if (c === 'E') return 'evenement';
  return 'scenario';
}

/** Durée de lecture estimée (sous-titres sans audio) : ~2,6 mots/s, plus les silences. */
export function estimatedDuration(text: string): number {
  const words = text.split(/\s+/).length;
  const pauses = (text.match(/…/g) ?? []).length;
  return 1.2 + words / 2.6 + pauses * 0.8;
}
