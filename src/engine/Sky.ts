import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';

type SkyDef = NonNullable<AmbiancePreset['sky']>;

/**
 * Ciel des lieux à ciel ouvert (plafond « ciel ») : une sphère qui suit la caméra,
 * en dégradé du zénith à l'horizon, plus quelques étoiles. Dessinée en premier,
 * derrière tout le reste ; quand l'ambiance a un plafond, elle est simplement cachée.
 * Certains ciels ont un soleil bas, et la mer en contrebas (la moitié basse de la sphère,
 * avec le reflet du soleil) : une terrasse au-dessus du vide.
 */
export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.PointsMaterial;
  private readonly colors: THREE.BufferAttribute;
  private readonly heights: Float32Array;
  /** Direction horizontale de chaque sommet (pour le halo et le reflet du soleil). */
  private readonly flat: Float32Array;
  private readonly top = new THREE.Color();
  private readonly horizon = new THREE.Color();
  private readonly seaHorizon = new THREE.Color();
  private readonly seaDeep = new THREE.Color();
  private readonly sunColor = new THREE.Color();
  private readonly tmp = new THREE.Color();
  private readonly tmp2 = new THREE.Color();
  private starAmount = 0;
  private seaAmount = 0;
  private sunAmount = 0;
  private readonly sun: THREE.Mesh;
  private readonly sunGlow: THREE.Mesh;
  /** Direction horizontale du soleil (dans le monde). */
  private readonly sunDir = new THREE.Vector2(0, -1);

  constructor() {
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const pos = geo.attributes.position!;
    this.heights = new Float32Array(pos.count);
    this.flat = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      this.heights[i] = pos.getY(i);
      const l = Math.hypot(pos.getX(i), pos.getZ(i)) || 1;
      this.flat[i * 2] = pos.getX(i) / l;
      this.flat[i * 2 + 1] = pos.getZ(i) / l;
    }
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

    // Le soleil : un disque, et un grand halo doux autour. (Dessinés juste après le ciel, dans
    // la passe opaque : les murs invisibles des lieux à ciel ouvert, dessinés ensuite, ne les
    // cachent pas.)
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, depthWrite: false }));
    this.sun.renderOrder = -8;
    this.sunGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffffff', fog: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.sunGlow.renderOrder = -8;
    this.group.add(this.dome, this.stars, this.sunGlow, this.sun);
    this.group.visible = false;
  }

  /** Le soleil se couche dans cette direction (horizontale, dans le monde). */
  setSunDirection(x: number, z: number): void {
    const l = Math.hypot(x, z) || 1;
    this.sunDir.set(x / l, z / l);
  }

  /** Suit la caméra ; les couleurs glissent vers celles de l'ambiance (k : facteur de lissage). */
  update(camera: THREE.Vector3, radius: number, sky: SkyDef | undefined, fallback: THREE.Color, k: number): void {
    this.top.lerp(this.tmp.set(sky?.top ?? fallback), k);
    this.horizon.lerp(this.tmp.set(sky?.horizon ?? fallback), k);
    this.starAmount += ((sky?.stars ? 1 : 0) - this.starAmount) * k;
    this.seaAmount += ((sky?.sea ? 1 : 0) - this.seaAmount) * k;
    this.sunAmount += ((sky?.sun ? 1 : 0) - this.sunAmount) * k;
    if (sky?.sea) {
      this.seaHorizon.set(sky.sea.horizon);
      this.seaDeep.set(sky.sea.deep);
    }
    if (sky?.sun) this.sunColor.set(sky.sun.color);
    this.group.visible = !!sky || this.starAmount > 0.01;
    if (!this.group.visible) return;
    this.group.position.copy(camera);
    this.group.scale.setScalar(radius);
    const arr = this.colors.array as Float32Array;
    const sea = this.seaAmount, sun = this.sunAmount;
    const sx = this.sunDir.x, sz = this.sunDir.y;
    for (let i = 0; i < this.heights.length; i++) {
      const h = this.heights[i]!;
      const facing = Math.max(0, this.flat[i * 2]! * sx + this.flat[i * 2 + 1]! * sz);
      if (h >= 0 || sea < 0.01) {
        // (Ciel de couchant : la bande orangée monte plus haut, le bleu de nuit attend au zénith.)
        const lin = Math.max(0, Math.min(1, h * (sun > 0.01 ? 1.1 : 1.6)));
        const t = sun > 0.01 ? (lin * lin * (3 - 2 * lin)) ** (1 + sun * 0.4) : lin;
        this.tmp.copy(this.horizon).lerp(this.top, t);
        // Le ciel s'embrase autour du soleil, surtout près de l'horizon.
        if (sun > 0.01) this.tmp.lerp(this.sunColor, sun * facing ** 6 * (1 - t) * 0.55);
      } else {
        // La mer : sombre sous les pieds, claire à l'horizon, et une traînée de lumière sous le soleil.
        const t = Math.min(1, -h / 0.45);
        this.tmp.copy(this.seaHorizon).lerp(this.seaDeep, t * t * (3 - 2 * t));
        if (sun > 0.01) this.tmp.lerp(this.sunColor, sun * facing ** 60 * (1 - t * 0.6) * 0.8);
        if (sea < 1) this.tmp.lerp(this.horizon, 1 - sea);
      }
      arr[i * 3] = this.tmp.r;
      arr[i * 3 + 1] = this.tmp.g;
      arr[i * 3 + 2] = this.tmp.b;
    }
    this.colors.needsUpdate = true;
    this.starMat.opacity = this.starAmount * 0.9;
    this.stars.visible = this.starAmount > 0.01;

    this.sun.visible = this.sunGlow.visible = sun > 0.01;
    if (this.sun.visible) {
      const e = ((sky?.sun?.elevation ?? 4) * Math.PI) / 180;
      const d = 0.9;
      this.sun.position.set(sx * Math.cos(e) * d, Math.sin(e) * d, sz * Math.cos(e) * d);
      this.sunGlow.position.copy(this.sun.position).multiplyScalar(0.99);
      this.sun.scale.setScalar(0.05);
      this.sunGlow.scale.setScalar(0.32);
      (this.sun.material as THREE.MeshBasicMaterial).color.copy(this.horizon).lerp(this.tmp.copy(this.sunColor).lerp(this.tmp2.set('#ffffff'), 0.45), sun);
      (this.sunGlow.material as THREE.MeshBasicMaterial).color.copy(this.sunColor).multiplyScalar(sun * 0.8);
      this.group.updateMatrixWorld();
      this.sun.lookAt(camera);
      this.sunGlow.lookAt(camera);
    }
  }

  dispose(): void {
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
    for (const m of [this.sun, this.sunGlow]) {
      m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  }
}

/** Halo radial (centre lumineux, bord transparent). */
function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
