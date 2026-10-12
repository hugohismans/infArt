import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { Rng } from './random';

/**
 * Textures procédurales des surfaces (sol, murs, plafond), générées sur canvas.
 * Toutes opaques : pas de dégradé semi-transparent (Safari y ajoute du bruit coloré).
 * Les couleurs des murs et du plafond viennent des couleurs par sommet : leurs
 * motifs sont donc presque blancs et seulement modulés.
 */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

const hex = (c: THREE.Color) => `#${c.getHexString()}`;

/** Grain : petits points clairs et sombres. */
function noise(ctx: CanvasRenderingContext2D, rng: Rng, size: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng.chance(0.5) ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 2.5), rng.range(1, 2.5));
  }
}

// --- Sols (la texture couvre 2 m × 2 m : uv du sol = position × 0,5) -------------

function parquet(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor);
  const alt = new THREE.Color(preset.palette.floorAlt);
  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rng.range(0, size / 2);
    while (x < size) {
      const w = rng.range(size * 0.35, size * 0.7);
      ctx.fillStyle = hex(base.clone().lerp(alt, rng.next()).multiplyScalar(rng.range(0.88, 1.08)));
      ctx.fillRect(x, r * rowH, w, rowH);
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#000';
      for (let k = 0; k < 4; k++) ctx.fillRect(x, r * rowH + rng.range(2, rowH - 2), w, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, r * rowH, 1.5, rowH);
      x += w;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, r * rowH, size, 1.5);
  }
  return c;
}

function beton(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  // Nuages de teinte (ciré irrégulier).
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = hex(base.clone().lerp(new THREE.Color(preset.palette.floorAlt), rng.next()));
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(rng.range(0, size), rng.range(0, size), rng.range(20, 70), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  noise(ctx, rng, size, 2500, 0.06);
  // Quelques fissures fines.
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    let x = rng.range(0, size), y = rng.range(0, size);
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += rng.range(-25, 25);
      y += rng.range(-25, 25);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return c;
}

function moquette(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor);
  const alt = new THREE.Color(preset.palette.floorAlt);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  // Fibres.
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = hex(base.clone().lerp(alt, rng.next()).multiplyScalar(rng.range(0.8, 1.15)));
    ctx.fillRect(rng.range(0, size), rng.range(0, size), 1, rng.range(1, 2));
  }
  // Taches d'humidité.
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(40,30,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(rng.range(0, size), rng.range(0, size), rng.range(15, 45), rng.range(10, 30), rng.range(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function carrelage(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor);
  const alt = new THREE.Color(preset.palette.floorAlt);
  const n = 6; // 6 × 6 carreaux de 33 cm sur 2 m
  const t = size / n;
  ctx.fillStyle = '#6b5a4c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = hex(base.clone().lerp(alt, rng.next() * 0.7).multiplyScalar(rng.range(0.9, 1.08)));
      ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
    }
  }
  noise(ctx, rng, size, 1500, 0.07);
  return c;
}

export function makeFloorTexture(preset: AmbiancePreset): THREE.CanvasTexture {
  const rng = new Rng('sol', preset.id);
  const gen = { parquet, beton, moquette, carrelage }[preset.surfaces.floor] ?? parquet;
  return finish(gen(preset, rng), 1);
}

// --- Murs (uv en mètres) ----------------------------------------------------------

/** Papier peint presque blanc (teinté par la couleur du mur) : rayures et petits losanges. Motif de 0,5 m. */
function papierPeint(rng: Rng): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#dedede';
  ctx.fillRect(0, 0, size * 0.18, size);
  ctx.fillRect(size * 0.5, 0, size * 0.05, size);
  ctx.fillStyle = '#e6e6e6';
  for (let y = 0; y < size; y += size / 4) {
    ctx.beginPath();
    const x = size * 0.75, s = 5;
    ctx.moveTo(x, y + size / 8 - s);
    ctx.lineTo(x + s, y + size / 8);
    ctx.lineTo(x, y + size / 8 + s);
    ctx.lineTo(x - s, y + size / 8);
    ctx.fill();
  }
  noise(ctx, rng, size, 600, 0.04);
  return c;
}

export function makeWallTexture(preset: AmbiancePreset): THREE.CanvasTexture | null {
  if (preset.surfaces.wall === 'uni') return null;
  return finish(papierPeint(new Rng('mur', preset.id)), 2);
}

// --- Plafonds (uv en mètres) ------------------------------------------------------

/** Faux plafond en dalles de 60 cm. Motif de 1,2 m. */
function dalles(rng: Rng): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, size, size);
  // Dalles légèrement piquées.
  for (let i = 0; i < 800; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(rng.range(0, size), rng.range(0, size), 1, 1);
  }
  // Une dalle tachée (fuite).
  ctx.fillStyle = 'rgba(120,90,20,0.15)';
  ctx.beginPath();
  ctx.ellipse(rng.range(10, 54), rng.range(70, 118), 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ossature métallique.
  ctx.fillStyle = '#b8b8b8';
  ctx.fillRect(0, 0, size, 2);
  ctx.fillRect(0, size / 2 - 1, size, 2);
  ctx.fillRect(0, 0, 2, size);
  ctx.fillRect(size / 2 - 1, 0, 2, size);
  return c;
}

/** Verrière : carreaux de ciel pâle et montants de fer. Motif de 2 m. */
function verriere(rng: Rng): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  const panes = 4;
  const p = size / panes;
  for (let i = 0; i < panes; i++) {
    for (let j = 0; j < panes; j++) {
      const l = Math.round(rng.range(228, 246));
      ctx.fillStyle = `rgb(${l - 8},${l},${Math.min(255, l + 6)})`;
      ctx.fillRect(i * p, j * p, p, p);
    }
  }
  ctx.fillStyle = '#3d4a3a';
  for (let k = 0; k <= panes; k++) {
    ctx.fillRect(k * p - 1.5, 0, 3, size);
    ctx.fillRect(0, k * p - 1, size, 2);
  }
  return c;
}

export function makeCeilingTexture(preset: AmbiancePreset): THREE.CanvasTexture | null {
  const rng = new Rng('plafond', preset.id);
  if (preset.surfaces.ceiling === 'dalles') return finish(dalles(rng), 1 / 1.2);
  if (preset.surfaces.ceiling === 'verriere') return finish(verriere(rng), 0.5);
  return null;
}
