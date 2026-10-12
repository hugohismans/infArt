import * as THREE from 'three';
import type { Artwork } from '../../shared/artwork';
import { ADAPTERS_BY_ID } from '../../shared/adapters';

/** Dimensions physiques du cartel (m). */
export const CARTEL_W = 0.24;
export const CARTEL_H = 0.15;
const PX = 512;
const PY = Math.round((PX * CARTEL_H) / CARTEL_W);

/** Découpe un texte en lignes d'au plus `maxWidth` px, en `maxLines` lignes (avec « … »). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  const consumed = lines.join(' ').length;
  if (consumed < text.length && lines.length > 0) {
    let last = lines[lines.length - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.replace(/[\s,;:]+$/, '')}…`;
  }
  return lines;
}

/**
 * Texture du cartel : titre, auteur, date, technique, source.
 * Générée seulement quand le visiteur s'approche, et libérée quand il s'éloigne.
 */
export function makeCartelTexture(art: Artwork | null): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = PX;
  canvas.height = PY;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2ece0';
  ctx.fillRect(0, 0, PX, PY);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, PX - 3, PY - 3);

  const pad = 26;
  const maxW = PX - pad * 2;
  const serif = 'Georgia, "Times New Roman", serif';
  let y = pad;
  const line = (text: string, font: string, color: string, lh: number, maxLines = 1) => {
    ctx.font = font;
    ctx.fillStyle = color;
    for (const l of wrap(ctx, text, maxW, maxLines)) {
      y += lh;
      ctx.fillText(l, pad, y);
    }
  };

  ctx.textBaseline = 'alphabetic';
  if (!art) {
    line('Œuvre en restauration', `italic 30px ${serif}`, '#2a2622', 34);
    line('Merci de votre compréhension.', `22px ${serif}`, '#6a625a', 30);
  } else {
    if (art.creator) line(art.creator, `bold 26px ${serif}`, '#1f1b17', 28, 1);
    line(art.title, `italic 28px ${serif}`, '#1f1b17', 31, 2);
    const meta = [art.date, art.medium].filter(Boolean).join(' · ');
    if (meta) line(meta, `20px ${serif}`, '#4a443d', 25, 2);
    // Crédit de la source en pied de cartel (obligation d'attribution).
    ctx.font = `16px ${serif}`;
    ctx.fillStyle = '#7a7268';
    const source = ADAPTERS_BY_ID[art.source]?.name ?? art.source;
    const credit = wrap(ctx, source, maxW, 1)[0] ?? '';
    ctx.fillText(credit, pad, PY - pad + 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Le texte est petit : les mipmaps restent utiles pour la lecture de biais.
  tex.onUpdate = () => {
    canvas.width = canvas.height = 1;
    tex.onUpdate = null;
  };
  return tex;
}
