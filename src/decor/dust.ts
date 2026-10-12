import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Poussière en suspension : quelques centaines de grains dans une boîte qui suit
 * la caméra (chaque grain est replacé de l'autre côté quand il en sort), dérivant
 * lentement. Un seul draw call ; l'intensité suit l'ambiance du module courant.
 */
export class DustField {
  readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly offsets: Float32Array;
  private readonly phases: Float32Array;
  private readonly box = new THREE.Vector3(14, 5, 14);
  private time = 0;
  private intensity = 0;

  constructor(count: number) {
    const geo = new THREE.BufferGeometry();
    this.offsets = new Float32Array(count * 3);
    this.phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.offsets[i * 3] = Math.random() * this.box.x;
      this.offsets[i * 3 + 1] = Math.random() * this.box.y;
      this.offsets[i * 3 + 2] = Math.random() * this.box.z;
      this.phases[i] = Math.random() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.material = new THREE.PointsMaterial({
      color: '#fff4dc',
      size: CONFIG.decor.dustSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  update(dt: number, camera: THREE.Vector3, floorY: number, target: number): void {
    this.time += dt;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.8);
    this.material.opacity = 0.55 * this.intensity;
    this.points.visible = this.intensity > 0.01;
    if (!this.points.visible) return;
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const { x: bx, y: by, z: bz } = this.box;
    const t = this.time;
    for (let i = 0; i < this.phases.length; i++) {
      const ph = this.phases[i]!;
      // Dérive lente, un peu de descente : la poussière flotte et retombe.
      const ox = this.offsets[i * 3]! + Math.sin(t * 0.13 + ph) * 0.4 + t * 0.03;
      const oy = this.offsets[i * 3 + 1]! + Math.sin(t * 0.21 + ph * 1.7) * 0.25 - t * 0.02;
      const oz = this.offsets[i * 3 + 2]! + Math.cos(t * 0.11 + ph) * 0.4;
      // Repli dans la boîte centrée sur la caméra (au sol pour la hauteur).
      arr[i * 3] = camera.x - bx / 2 + (((ox - camera.x) % bx) + bx) % bx;
      arr[i * 3 + 1] = floorY + (((oy % by) + by) % by);
      arr[i * 3 + 2] = camera.z - bz / 2 + (((oz - camera.z) % bz) + bz) % bz;
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
