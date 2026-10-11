import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Rng } from '../world/random';

/**
 * Œuvres factices de la phase 1 : petites compositions abstraites générées
 * sur canvas (aplats façon Rothko, cercles, rayures, paysage minimal).
 * Chaque texture est propre à une œuvre et doit être libérée avec elle.
 */

const PALETTES = [
  ['#1d3557', '#457b9d', '#a8dadc', '#f1faee', '#e63946'],
  ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429'],
  ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
  ['#3d0c02', '#8c2f0b', '#d9822b', '#f2c14e', '#f7f3e3'],
  ['#0b132b', '#1c2541', '#3a506b', '#5bc0be', '#fafafa'],
  ['#4a1942', '#893168', '#c33c54', '#ee8434', '#f9d56e'],
  ['#2f3e46', '#354f52', '#52796f', '#84a98c', '#cad2c5'],
  ['#5f0f40', '#9a031e', '#fb8b24', '#e36414', '#0f4c5c'],
  ['#222222', '#444444', '#888888', '#d4c9b0', '#b8860b'],
];

function hsl(rng: Rng, base: string, jitter = 0.06): string {
  const c = new THREE.Color(base);
  const h = { h: 0, s: 0, l: 0 };
  c.getHSL(h);
  c.setHSL((h.h + rng.range(-jitter, jitter) + 1) % 1, h.s, Math.min(1, Math.max(0, h.l + rng.range(-0.08, 0.08))));
  return `#${c.getHexString()}`;
}

export function makePlaceholderTexture(rng: Rng, aspect: number): THREE.CanvasTexture {
  const max = CONFIG.art.placeholderTextureSize;
  const w = aspect >= 1 ? max : Math.max(16, Math.round(max * aspect));
  const h = aspect >= 1 ? Math.max(16, Math.round(max / aspect)) : max;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const pal = rng.pick(PALETTES);
  const style = rng.int(0, 3);

  ctx.fillStyle = hsl(rng, rng.pick(pal));
  ctx.fillRect(0, 0, w, h);

  if (style === 0) {
    // Aplats horizontaux aux bords flous.
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      ctx.filter = 'blur(2px)';
      ctx.fillStyle = hsl(rng, rng.pick(pal));
      const y = h * (0.08 + (i / n) * 0.86);
      ctx.fillRect(w * 0.1, y, w * 0.8, (h * 0.86) / n - h * 0.05);
    }
    ctx.filter = 'none';
  } else if (style === 1) {
    // Cercles concentriques ou dispersés.
    const n = rng.int(3, 9);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = hsl(rng, rng.pick(pal));
      ctx.globalAlpha = rng.range(0.6, 1);
      ctx.beginPath();
      ctx.arc(rng.range(0, w), rng.range(0, h), rng.range(4, Math.min(w, h) * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (style === 2) {
    // Rayures géométriques.
    const n = rng.int(4, 12);
    const vertical = rng.chance(0.5);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = hsl(rng, rng.pick(pal));
      if (vertical) ctx.fillRect((i / n) * w, 0, w / n + 1, h);
      else ctx.fillRect(0, (i / n) * h, w, h / n + 1);
    }
    ctx.fillStyle = hsl(rng, rng.pick(pal));
    ctx.fillRect(rng.range(0, w * 0.6), rng.range(0, h * 0.6), rng.range(w * 0.1, w * 0.4), rng.range(h * 0.1, h * 0.4));
  } else {
    // Paysage minimal : ciel en dégradé, horizon, astre.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, hsl(rng, pal[0]!));
    sky.addColorStop(1, hsl(rng, pal[3]!));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hsl(rng, pal[4]!);
    ctx.beginPath();
    ctx.arc(rng.range(w * 0.2, w * 0.8), h * rng.range(0.2, 0.5), Math.min(w, h) * rng.range(0.05, 0.15), 0, Math.PI * 2);
    ctx.fill();
    const horizon = h * rng.range(0.55, 0.75);
    ctx.fillStyle = hsl(rng, pal[1]!);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 8) ctx.lineTo(x, horizon + rng.range(-h * 0.08, h * 0.08));
    ctx.lineTo(w, h);
    ctx.fill();
  }

  // Grain de toile.
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < (w * h) / 40; i++) {
    ctx.fillStyle = rng.chance(0.5) ? '#000' : '#fff';
    ctx.fillRect(rng.range(0, w), rng.range(0, h), 1, 1);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}
