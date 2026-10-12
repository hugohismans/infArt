import * as THREE from 'three';

/**
 * Ciel des lieux à ciel ouvert (plafond « ciel ») : une sphère qui suit la caméra,
 * en dégradé du zénith à l'horizon, plus quelques étoiles. Dessinée en premier,
 * derrière tout le reste ; quand l'ambiance a un plafond, elle est simplement cachée.
 */
export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.PointsMaterial;
  private readonly colors: THREE.BufferAttribute;
  private readonly heights: Float32Array;
  private readonly top = new THREE.Color();
  private readonly horizon = new THREE.Color();
  private readonly tmp = new THREE.Color();
  private starAmount = 0;

  constructor() {
    const geo = new THREE.SphereGeometry(1, 24, 12);
    const pos = geo.attributes.position!;
    this.heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) this.heights[i] = pos.getY(i);
    this.colors = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', this.colors);
    this.dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.dome.renderOrder = -10;

    const n = 500;
    const sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Hémisphère supérieur seulement.
      const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95);
      sp.set([Math.sin(v) * Math.cos(u) * 0.98, Math.cos(v) * 0.98, Math.sin(v) * Math.sin(u) * 0.98], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.group.add(this.dome, this.stars);
    this.group.visible = false;
  }

  /** Suit la caméra ; les couleurs glissent vers celles de l'ambiance (k : facteur de lissage). */
  update(camera: THREE.Vector3, radius: number, sky: { top: string; horizon: string; stars?: boolean } | undefined, fallback: THREE.Color, k: number): void {
    this.top.lerp(this.tmp.set(sky?.top ?? fallback), k);
    this.horizon.lerp(this.tmp.set(sky?.horizon ?? fallback), k);
    this.starAmount += ((sky?.stars ? 1 : 0) - this.starAmount) * k;
    this.group.visible = !!sky || this.starAmount > 0.01;
    if (!this.group.visible) return;
    this.group.position.copy(camera);
    this.group.scale.setScalar(radius);
    const arr = this.colors.array as Float32Array;
    for (let i = 0; i < this.heights.length; i++) {
      const t = Math.max(0, Math.min(1, this.heights[i]! * 1.6));
      this.tmp.copy(this.horizon).lerp(this.top, t);
      arr[i * 3] = this.tmp.r;
      arr[i * 3 + 1] = this.tmp.g;
      arr[i * 3 + 2] = this.tmp.b;
    }
    this.colors.needsUpdate = true;
    this.starMat.opacity = this.starAmount * 0.9;
    this.stars.visible = this.starAmount > 0.01;
  }

  dispose(): void {
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
  }
}
