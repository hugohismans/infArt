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

/** Dallage de marbre en damier, veiné. Carreaux de 50 cm. */
function marbre(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const a = new THREE.Color(preset.palette.floor), b = new THREE.Color(preset.palette.floorAlt);
  const n = 4, t = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = hex(((i + j) % 2 ? a : b).clone().multiplyScalar(rng.range(0.95, 1.05)));
      ctx.fillRect(i * t, j * t, t, t);
    }
  }
  // Veines.
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 14; k++) {
    ctx.strokeStyle = `rgba(${rng.chance(0.5) ? '255,255,255' : '0,0,0'},0.12)`;
    ctx.beginPath();
    let x = rng.range(0, size), y = rng.range(0, size);
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += rng.range(-30, 30);
      y += rng.range(-12, 12);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let k = 0; k <= n; k++) {
    ctx.fillRect(k * t - 0.5, 0, 1, size);
    ctx.fillRect(0, k * t - 0.5, size, 1);
  }
  return c;
}

/** Tatamis de 90 × 180 cm, bordés d'un galon sombre. */
function tatami(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor), alt = new THREE.Color(preset.palette.floorAlt);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  // Trame de jonc.
  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = hex(base.clone().lerp(alt, rng.next() * 0.6));
    ctx.fillRect(0, y, size, 1);
  }
  // Deux tatamis côte à côte (2 m de texture ≈ 2 × 1 m), galon noir.
  ctx.fillStyle = '#2b2a22';
  ctx.fillRect(0, 0, size, 5);
  ctx.fillRect(0, size / 2 - 2, size, 5);
  ctx.fillRect(0, 0, 5, size);
  ctx.fillRect(size / 2 - 2, 0, 5, size);
  return c;
}

/** Lino moucheté (hôpital, bureaux). */
function lino(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor), alt = new THREE.Color(preset.palette.floorAlt);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = hex(base.clone().lerp(alt, rng.next()).multiplyScalar(rng.range(0.85, 1.15)));
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 3), rng.range(1, 2));
  }
  // Joints des lés.
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, size, 1);
  return c;
}

/** Eau turquoise sur carrelage : reflets clairs en réseau (la texture dérive lentement). */
function eau(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor), alt = new THREE.Color(preset.palette.floorAlt);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  // Carrelage du fond, déformé par l'eau.
  ctx.strokeStyle = hex(alt);
  ctx.lineWidth = 2;
  for (let k = 0; k <= 8; k++) {
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) ctx.lineTo(x, (k * size) / 8 + Math.sin(x * 0.05 + k) * 3);
    ctx.stroke();
    ctx.beginPath();
    for (let y = 0; y <= size; y += 8) ctx.lineTo((k * size) / 8 + Math.sin(y * 0.05 + k * 2) * 3, y);
    ctx.stroke();
  }
  // Caustiques.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(8, 22);
    ctx.ellipse(x, y, r, r * rng.range(0.5, 0.9), rng.range(0, Math.PI), 0, Math.PI * rng.range(0.8, 1.6));
    ctx.stroke();
  }
  return c;
}

/** Sable : rides du vent et grains. */
function sable(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor), alt = new THREE.Color(preset.palette.floorAlt);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 6) {
    ctx.strokeStyle = hex(base.clone().lerp(alt, 0.5 + 0.5 * rng.next()));
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 4 + y * 0.3) * 2.5);
    ctx.stroke();
  }
  noise(ctx, rng, size, 3000, 0.08);
  return c;
}

/** Grille néon sur fond sombre (vaporwave). Lumineuse : voir FLOOR_EMISSIVE. */
function grille(preset: AmbiancePreset): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = preset.palette.floorAlt;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = preset.palette.floor;
  ctx.fillRect(0, 0, size, 3);
  ctx.fillRect(0, 0, 3, size);
  ctx.fillRect(0, size / 2, size, 2);
  ctx.fillRect(size / 2, 0, 2, size);
  return c;
}

/** Sol de nuages : volutes douces. */
function nuages(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor), alt = new THREE.Color(preset.palette.floorAlt);
  ctx.fillStyle = hex(alt);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = hex(base.clone().lerp(alt, rng.next() * 0.5));
    ctx.beginPath();
    // Les bords se répètent : on dessine aussi les copies décalées.
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(14, 40);
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      ctx.moveTo(x + dx + r, y + dy);
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  return c;
}

/** Herbe sombre (forêt la nuit). */
function herbe(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor), alt = new THREE.Color(preset.palette.floorAlt);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = hex(base.clone().lerp(alt, rng.next()).multiplyScalar(rng.range(0.7, 1.3)));
    ctx.fillRect(rng.range(0, size), rng.range(0, size), 1, rng.range(2, 5));
  }
  return c;
}

/** Neige tassée, quelques paillettes. */
function neige(preset: AmbiancePreset, rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const base = new THREE.Color(preset.palette.floor), alt = new THREE.Color(preset.palette.floorAlt);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = hex(base.clone().lerp(alt, rng.next()));
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.ellipse(rng.range(0, size), rng.range(0, size), rng.range(20, 60), rng.range(8, 20), rng.range(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rng.range(0, size), rng.range(0, size), 1, 1);
  }
  return c;
}

/** Sols lumineux (non affectés par l'éclairage). */
export const FLOOR_EMISSIVE = new Set(['grille', 'nuages']);

export function makeFloorTexture(preset: AmbiancePreset): THREE.CanvasTexture {
  const rng = new Rng('sol', preset.id);
  const gens: Record<string, (p: AmbiancePreset, r: Rng) => HTMLCanvasElement> = { parquet, beton, moquette, carrelage, marbre, tatami, lino, eau, sable, grille, nuages, herbe, neige };
  const gen = gens[preset.surfaces.floor] ?? parquet;
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

/** Damas : médaillons répétés, ton sur ton. Motif de 0,5 m. */
function damas(rng: Rng): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#dcdcdc';
  const medal = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - 26);
    ctx.bezierCurveTo(x + 18, y - 14, x + 18, y + 14, x, y + 26);
    ctx.bezierCurveTo(x - 18, y + 14, x - 18, y - 14, x, y - 26);
    ctx.fill();
  };
  medal(size / 2, size / 2);
  for (const [x, y] of [[0, 0], [size, 0], [0, size], [size, size]] as const) medal(x, y);
  ctx.fillStyle = '#ececec';
  for (const [x, y] of [[size / 2, 6], [6, size / 2], [size - 6, size / 2], [size / 2, size - 6]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  noise(ctx, rng, size, 400, 0.03);
  return c;
}

/** Shoji : papier clair dans un quadrillage de bois. Panneau de 1 m. */
function shoji(rng: Rng): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#fbfaf4';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, rng, size, 500, 0.025);
  ctx.fillStyle = '#9b7e58';
  for (let i = 0; i <= 4; i++) ctx.fillRect((i * size) / 4 - 1, 0, 2, size);
  for (let j = 0; j <= 6; j++) ctx.fillRect(0, (j * size) / 6 - 1, size, 2);
  ctx.fillRect(0, 0, 5, size);
  return c;
}

/** Faïence blanche de 15 cm, joints gris. Motif de 0,6 m. */
function faience(rng: Rng): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#b9bfc2';
  ctx.fillRect(0, 0, size, size);
  const n = 4, t = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const l = Math.round(rng.range(238, 252));
      ctx.fillStyle = `rgb(${l},${l},${l})`;
      ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
    }
  }
  return c;
}

/** Rayonnages de livres : dos colorés sur des étagères. Motif de 1 m. Pleines couleurs (mur blanc). */
function rayonnages(rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const shelf = size / 3;
  const spines = ['#7a2a24', '#2d4a6b', '#3d5a35', '#8a6a2c', '#5a3a5c', '#2a2a2a', '#9c8a6a', '#6b2f2f', '#334455', '#a8853f', '#4e3b2a'];
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(0, 0, size, size);
  for (let r = 0; r < 3; r++) {
    let x = 0;
    const y1 = (r + 1) * shelf - 8;
    while (x < size) {
      const w = rng.range(5, 13);
      const h = rng.range(shelf * 0.62, shelf * 0.88);
      ctx.fillStyle = rng.pick(spines);
      ctx.fillRect(x, y1 - h, w - 0.8, h);
      // Filets dorés.
      ctx.fillStyle = 'rgba(230,200,120,0.6)';
      ctx.fillRect(x + 1, y1 - h + 6, w - 3, 1.2);
      ctx.fillRect(x + 1, y1 - 8, w - 3, 1.2);
      x += w;
      if (rng.chance(0.04)) x += rng.range(6, 20);
    }
    ctx.fillStyle = '#5b3d25';
    ctx.fillRect(0, y1, size, 8);
  }
  return c;
}

/** Boiserie : panneaux de bois verticaux à moulures. Panneau de 0,8 m. */
function boiserie(rng: Rng): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.05)})`;
    ctx.fillRect(rng.range(0, size), 0, rng.range(1, 3), size);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, size - 24, size - 24);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(15, 15, size - 30, size - 30);
  return c;
}

export function makeWallTexture(preset: AmbiancePreset): THREE.CanvasTexture | null {
  const rng = new Rng('mur', preset.id);
  switch (preset.surfaces.wall) {
    case 'papier-peint':
      return finish(papierPeint(rng), 2);
    case 'damas':
      return finish(damas(rng), 2);
    case 'shoji':
      return finish(shoji(rng), 1);
    case 'faience':
      return finish(faience(rng), 1 / 0.6);
    case 'rayonnages':
      return finish(rayonnages(rng), 1);
    case 'boiserie':
      return finish(boiserie(rng), 1.25);
    default:
      return null;
  }
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

/** Plafond peint : ciel et nuages, comme une fresque. Motif de 4 m. */
function peint(rng: Rng): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#c9dcf0';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rng.chance(0.3) ? '#f6e3d8' : '#fbfbf7';
    ctx.globalAlpha = 0.5;
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(12, 34);
    ctx.beginPath();
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      ctx.moveTo(x + dx + r, y + dy);
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

/** Béton banché : planches de coffrage et trous de banche. Motif de 2,4 m. */
function betonPlafond(rng: Rng): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += size / 8) {
    ctx.fillStyle = `rgba(0,0,0,${rng.range(0.03, 0.08)})`;
    ctx.fillRect(0, y, size, size / 8);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, size, 1);
  }
  noise(ctx, rng, size, 700, 0.05);
  return c;
}

export function makeCeilingTexture(preset: AmbiancePreset): THREE.CanvasTexture | null {
  const rng = new Rng('plafond', preset.id);
  switch (preset.surfaces.ceiling) {
    case 'dalles':
      return finish(dalles(rng), 1 / 1.2);
    case 'verriere':
      return finish(verriere(rng), 0.5);
    case 'peint':
      return finish(peint(rng), 0.25);
    case 'beton':
      return finish(betonPlafond(rng), 1 / 2.4);
    default:
      return null;
  }
}
