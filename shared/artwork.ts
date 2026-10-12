/**
 * Format commun d'une œuvre, quelle que soit la source.
 * Les adaptateurs (shared/adapters) normalisent chaque API vers ce schéma.
 */
export type ArtType =
  | 'peinture'
  | 'dessin'
  | 'estampe'
  | 'sculpture'
  | 'photographie'
  | 'affiche'
  | 'affiche-film'
  | 'jaquette-jeu'
  | 'pochette-disque'
  | 'couverture-livre'
  | 'objet'
  | 'textile'
  | 'autre';

export interface Artwork {
  /** « source:idOriginal » */
  id: string;
  /** Identifiant de la source (voir shared/adapters). */
  source: string;
  type: ArtType;
  title: string;
  creator?: string;
  date?: string;
  /** Année approximative (pour le style du cadre). */
  year?: number;
  medium?: string;
  dimensions?: { w: number; h: number; d?: number; unit: string };
  culture?: string;
  movement?: string;
  description?: string;
  /** Époque, pays, mouvement, genre… */
  tags: string[];
  /** Image en résolution d'affichage raisonnable. */
  imageUrl: string;
  /** Image haute définition, pour la fiche détaillée. */
  imageUrlHigh?: string;
  /** Base IIIF : permet de demander la taille voulue. */
  iiif?: string;
  /** Largeur / hauteur de l'image. */
  aspectRatio?: number;
  model3dUrl?: string;
  /** Page de l'œuvre sur le site de la source. */
  sourceUrl: string;
  /** Licence / conditions. */
  license: string;
  /** Attribution à afficher. */
  credit: string;
}

/** Types présentés au mur (cadres). */
export const WALL_TYPES: ArtType[] = ['peinture', 'estampe', 'dessin', 'photographie'];

/** Types gérés par la galerie (phase 5 : culture populaire comprise). */
export const SUPPORTED_TYPES: ArtType[] = [...WALL_TYPES, 'affiche', 'affiche-film', 'jaquette-jeu', 'pochette-disque', 'couverture-livre'];

/** Pondération des types dans un lot (mode mélange). */
export type TypeWeights = Partial<Record<ArtType, number>>;

/** « peinture:0.5,affiche:0.1 » ⇄ pondération (paramètre d'URL du Worker). */
export function formatWeights(w: TypeWeights): string {
  return Object.entries(w)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${k}:${Math.round(v! * 1000) / 1000}`)
    .join(',');
}

export function parseWeights(s: string | null | undefined): TypeWeights {
  const out: TypeWeights = {};
  for (const part of (s ?? '').split(',')) {
    const [k, v] = part.split(':');
    const n = Number(v);
    if (k && (SUPPORTED_TYPES as string[]).includes(k) && Number.isFinite(n) && n > 0) out[k as ArtType] = Math.min(n, 100);
  }
  return out;
}

/** Retire les balises HTML et normalise les espaces. */
export function stripHtml(html: string | null | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || undefined;
}

/** Première année plausible trouvée dans un texte de date (« c. 1765 », « 1884–86 »…). */
export function parseYear(...candidates: Array<string | number | null | undefined>): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c !== 0) return c;
    if (typeof c === 'string') {
      const m = c.match(/(-?\d{3,4})/);
      if (m) return Number(m[1]);
    }
  }
  return undefined;
}

/** Dimensions plausibles (cm) ou undefined. */
export function dimsCm(w: unknown, h: unknown, d?: unknown): Artwork['dimensions'] {
  const nw = Number(w), nh = Number(h);
  if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw <= 0 || nh <= 0) return undefined;
  // Garde-fou contre les valeurs aberrantes (unités mal renseignées).
  if (nw > 2000 || nh > 2000) return undefined;
  const nd = Number(d);
  const r = (x: number) => Math.round(x * 10) / 10;
  return { w: r(nw), h: r(nh), ...(Number.isFinite(nd) && nd > 0 ? { d: r(nd) } : {}), unit: 'cm' };
}

export function clean(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.replace(/\s+/g, ' ').trim();
  return t || undefined;
}
