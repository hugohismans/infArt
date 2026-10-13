import * as THREE from 'three';

/**
 * Feu d'artifice (le bouquet final du Conservateur) : des fusées montent en laissant une
 * traînée, puis éclatent en pivoines, en saules dorés ou en anneaux. Une seule géométrie
 * de points, additive : une particule qui s'éteint devient noire, donc invisible.
 */
const MAX = 4000;
const GRAVITY = 5.5;

const PALETTES: string[][] = [
  ['#ff4a5a', '#ffb0b8'],
  ['#ffd36a', '#fff2c0'],
  ['#5ad0ff', '#d0f4ff'],
  ['#9a6aff', '#e0d0ff'],
  ['#5aff8a', '#d8ffe4'],
  ['#ff8a3a', '#ffe0c0'],
  ['#ffffff', '#ffe8b0'],
];

interface Rocket {
  x: number;
  y: number;
  z: number;
  vy: number;
  burstY: number;
  kind: 'pivoine' | 'saule' | 'anneau';
  palette: string[];
}

export class Fireworks {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  /** Par particule : vitesse (3), vie restante, vie totale, frein, couleur d'origine (3), traînée. */
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly drag = new Float32Array(MAX);
  private readonly base = new Float32Array(MAX * 3);
  private readonly sparkle = new Uint8Array(MAX);
  private count = 0;
  private rockets: Rocket[] = [];
  private readonly tmp = new THREE.Color();
  /** Une gerbe vient d'éclater (position, grosse ou non) : le moteur en fait un son. */
  onBurst: ((x: number, y: number, z: number, big: boolean) => void) | null = null;
  onLaunch: ((x: number, y: number, z: number) => void) | null = null;

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size: 0.55,
      map: spark(),
      vertexColors: true,
      // Passe opaque, juste après le ciel : les murs invisibles du plein air ne le cachent pas.
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = -7;
  }

  get active(): boolean {
    return this.count > 0 || this.rockets.length > 0;
  }

  /** Lance une fusée depuis (x, y, z), qui éclatera à `height` m au-dessus. */
  launch(x: number, y: number, z: number, height: number, soft = false): void {
    const kinds: Rocket['kind'][] = soft ? ['saule', 'pivoine'] : ['pivoine', 'pivoine', 'saule', 'anneau'];
    const vy = Math.sqrt(2 * GRAVITY * height) * 1.05;
    this.rockets.push({ x, y, z, vy, burstY: y + height, kind: kinds[Math.floor(Math.random() * kinds.length)]!, palette: PALETTES[Math.floor(Math.random() * PALETTES.length)]! });
    this.onLaunch?.(x, y, z);
  }

  clear(): void {
    this.count = 0;
    this.rockets = [];
    this.points.geometry.setDrawRange(0, 0);
  }

  update(dt: number): void {
    // Fusées : elles montent en semant quelques étincelles.
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      r.vy -= GRAVITY * dt;
      r.y += r.vy * dt;
      if (Math.random() < 0.8) this.emit(r.x, r.y, r.z, (Math.random() - 0.5) * 0.6, -1 - Math.random(), (Math.random() - 0.5) * 0.6, 0.5, 2.2, '#ffd9a0', false);
      if (r.y >= r.burstY || r.vy <= 0.5) {
        this.burst(r);
        this.rockets.splice(i, 1);
      }
    }
    // Particules.
    for (let i = 0; i < this.count; i++) {
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        this.kill(i);
        i--;
        continue;
      }
      const d = Math.exp(-this.drag[i]! * dt);
      const j = i * 3;
      this.vel[j]! *= d;
      this.vel[j + 1] = this.vel[j + 1]! * d - GRAVITY * 0.35 * dt;
      this.vel[j + 2]! *= d;
      this.pos[j]! += this.vel[j]! * dt;
      this.pos[j + 1]! += this.vel[j + 1]! * dt;
      this.pos[j + 2]! += this.vel[j + 2]! * dt;
      const t = this.life[i]! / this.maxLife[i]!;
      // Éclat qui s'éteint, avec un scintillement en fin de vie.
      let k = t < 0.35 ? t / 0.35 : 1;
      if (this.sparkle[i] && t < 0.5) k *= Math.random() < 0.5 ? 1.4 : 0.2;
      this.col[j] = this.base[j]! * k;
      this.col[j + 1] = this.base[j + 1]! * k;
      this.col[j + 2] = this.base[j + 2]! * k;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  private burst(r: Rocket): void {
    const big = r.kind !== 'anneau' && Math.random() < 0.5;
    const n = r.kind === 'anneau' ? 90 : big ? 220 : 150;
    const speed = r.kind === 'saule' ? 7 : big ? 13 : 10;
    // Anneau : un cercle incliné au hasard.
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const u = new THREE.Vector3(1, 0, 0).cross(axis).normalize();
    const w = axis.clone().cross(u);
    for (let i = 0; i < n; i++) {
      let vx: number, vy: number, vz: number;
      if (r.kind === 'anneau') {
        const a = (i / n) * Math.PI * 2;
        vx = (u.x * Math.cos(a) + w.x * Math.sin(a)) * speed;
        vy = (u.y * Math.cos(a) + w.y * Math.sin(a)) * speed;
        vz = (u.z * Math.cos(a) + w.z * Math.sin(a)) * speed;
      } else {
        // Direction uniforme sur la sphère, vitesse un peu irrégulière.
        const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z);
        const v = speed * (0.85 + Math.random() * 0.3);
        vx = s * Math.cos(a) * v;
        vy = z * v;
        vz = s * Math.sin(a) * v;
      }
      const willow = r.kind === 'saule';
      const color = willow ? (Math.random() < 0.7 ? '#ffc25a' : '#fff0c8') : r.palette[Math.random() < 0.75 ? 0 : 1]!;
      this.emit(r.x, r.y, r.z, vx, vy, vz, willow ? 3.6 + Math.random() : 1.6 + Math.random() * 0.8, willow ? 1.1 : 1.6, color, !willow && Math.random() < 0.4);
    }
    this.onBurst?.(r.x, r.y, r.z, big);
  }

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, drag: number, color: string, sparkle: boolean): void {
    if (this.count >= MAX) return;
    const i = this.count++;
    const j = i * 3;
    this.pos[j] = x;
    this.pos[j + 1] = y;
    this.pos[j + 2] = z;
    this.vel[j] = vx;
    this.vel[j + 1] = vy;
    this.vel[j + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.drag[i] = drag;
    this.sparkle[i] = sparkle ? 1 : 0;
    this.tmp.set(color);
    this.base[j] = this.tmp.r;
    this.base[j + 1] = this.tmp.g;
    this.base[j + 2] = this.tmp.b;
  }

  /** Retire la particule i (la dernière prend sa place). */
  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    const a = i * 3, b = last * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[a + k] = this.pos[b + k]!;
      this.vel[a + k] = this.vel[b + k]!;
      this.base[a + k] = this.base[b + k]!;
      this.col[a + k] = this.col[b + k]!;
    }
    this.life[i] = this.life[last]!;
    this.maxLife[i] = this.maxLife[last]!;
    this.drag[i] = this.drag[last]!;
    this.sparkle[i] = this.sparkle[last]!;
  }

  dispose(): void {
    this.points.geometry.dispose();
    const mat = this.points.material as THREE.PointsMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}

/** Étincelle : point doux et lumineux. */
function spark(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
