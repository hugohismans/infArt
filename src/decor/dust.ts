import * as THREE from 'three';
import type { Particles } from '../ambiances/types';
import { CONFIG } from '../config';

/** Comportement d'un type de particules. */
interface ParticleStyle {
  color: string;
  /** Taille relative (× CONFIG.decor.dustSize). */
  size: number;
  /** Chute (m/s, positive vers le bas). */
  fall: number;
  /** Amplitude de la dérive latérale (m). */
  sway: number;
  /** Clignotement (lucioles, paillettes). */
  blink: boolean;
  additive: boolean;
}

const STYLES: Record<Particles, ParticleStyle> = {
  poussiere: { color: '#fff4dc', size: 1, fall: 0.02, sway: 0.4, blink: false, additive: true },
  neige: { color: '#ffffff', size: 2.6, fall: 0.55, sway: 0.5, blink: false, additive: false },
  lucioles: { color: '#d8ff6a', size: 2.8, fall: 0, sway: 1.2, blink: true, additive: true },
  paillettes: { color: '#ffd6f2', size: 1.8, fall: -0.04, sway: 0.6, blink: true, additive: true },
  bulles: { color: '#d8f4ff', size: 1.6, fall: -0.35, sway: 0.15, blink: false, additive: true },
};

/**
 * Particules en suspension : quelques centaines de grains dans une boîte qui suit la
 * caméra (chaque grain est replacé de l'autre côté quand il en sort). Un champ par
 * type (poussière, neige, lucioles, paillettes) ; chacun suit l'intensité voulue
 * par l'ambiance courante et ne coûte rien quand il est éteint.
 */
export class ParticleField {
  readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly offsets: Float32Array;
  private readonly phases: Float32Array;
  private readonly colors: Float32Array;
  private readonly base: THREE.Color;
  private readonly box = new THREE.Vector3(14, 5, 14);
  private time = 0;
  private intensity = 0;

  constructor(
    readonly kind: Particles,
    count: number,
  ) {
    const style = STYLES[kind];
    const geo = new THREE.BufferGeometry();
    this.offsets = new Float32Array(count * 3);
    this.phases = new Float32Array(count);
    this.colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.offsets[i * 3] = Math.random() * this.box.x;
      this.offsets[i * 3 + 1] = Math.random() * this.box.y;
      this.offsets[i * 3 + 2] = Math.random() * this.box.z;
      this.phases[i] = Math.random() * Math.PI * 2;
    }
    this.base = new THREE.Color(style.color);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: CONFIG.decor.dustSize * style.size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: style.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(dt: number, camera: THREE.Vector3, floorY: number, target: number): void {
    const style = STYLES[this.kind];
    this.time += dt;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.8);
    this.material.opacity = (style.additive ? 0.55 : 0.85) * Math.min(1, this.intensity);
    this.points.visible = this.intensity > 0.01;
    if (!this.points.visible) return;
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const { x: bx, y: by, z: bz } = this.box;
    const t = this.time;
    for (let i = 0; i < this.phases.length; i++) {
      const ph = this.phases[i]!;
      const ox = this.offsets[i * 3]! + Math.sin(t * 0.13 + ph) * style.sway + t * 0.03;
      const oy = this.offsets[i * 3 + 1]! + Math.sin(t * 0.21 + ph * 1.7) * style.sway * 0.6 - t * (style.fall + 0.02 * Math.sin(ph));
      const oz = this.offsets[i * 3 + 2]! + Math.cos(t * 0.11 + ph) * style.sway;
      arr[i * 3] = camera.x - bx / 2 + ((((ox - camera.x) % bx) + bx) % bx);
      arr[i * 3 + 1] = floorY + (((oy % by) + by) % by);
      arr[i * 3 + 2] = camera.z - bz / 2 + ((((oz - camera.z) % bz) + bz) % bz);
      // Clignotement : chaque grain s'allume et s'éteint à son rythme.
      const k = style.blink ? Math.max(0, Math.sin(t * (0.8 + (ph % 1)) + ph * 3)) ** 3 : 1;
      this.colors[i * 3] = this.base.r * k;
      this.colors[i * 3 + 1] = this.base.g * k;
      this.colors[i * 3 + 2] = this.base.b * k;
    }
    pos.needsUpdate = true;
    if (style.blink || i0(this.colors)) (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** Les couleurs fixes ne sont envoyées qu'une fois. */
const sent = new WeakSet<Float32Array>();
function i0(colors: Float32Array): boolean {
  if (sent.has(colors)) return false;
  sent.add(colors);
  return true;
}

/** Tous les champs de particules, un par type. */
export class ParticleSystem {
  readonly fields: ParticleField[];

  constructor(count: number) {
    this.fields = (Object.keys(STYLES) as Particles[]).map((k) => new ParticleField(k, k === 'poussiere' ? count : Math.round(count * 0.7)));
  }

  update(dt: number, camera: THREE.Vector3, floorY: number, kind: Particles, amount: number): void {
    for (const f of this.fields) f.update(dt, camera, floorY, f.kind === kind ? amount : 0);
  }

  dispose(): void {
    for (const f of this.fields) f.dispose();
  }
}
