import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Rot = { x?: number; y?: number; z?: number };

/** Primitives partagées (gabarits) : chaque pièce en est une copie transformée. */
const BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const PLANE = new THREE.PlaneGeometry(1, 1).toNonIndexed();
const cylinders = new Map<string, THREE.BufferGeometry>();
const blobs = new Map<number, THREE.BufferGeometry>();

function cylinderTemplate(sides: number, taper: number): THREE.BufferGeometry {
  const key = `${sides}:${taper.toFixed(2)}`;
  let g = cylinders.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(0.5 * taper, 0.5, 1, sides).toNonIndexed();
    cylinders.set(key, g);
  }
  return g;
}

function blobTemplate(detail: number): THREE.BufferGeometry {
  let g = blobs.get(detail);
  if (!g) {
    g = new THREE.IcosahedronGeometry(1, detail);
    blobs.set(detail, g);
  }
  return g;
}

/**
 * Atelier de décors : assemble des primitives low-poly (boîtes, cylindres, boules,
 * plans) à couleur par sommet, dans le repère courant `base` (l'emplacement de
 * l'objet dans le module). `build()` fusionne tout en trois géométries : opaque
 * éclairée, lumineuse (non éclairée) et rayons de lumière (additifs).
 */
export class Kit {
  /** Repère de l'objet en cours (dans le repère du module). */
  readonly base = new THREE.Matrix4();
  private readonly solid: THREE.BufferGeometry[] = [];
  private readonly glow: THREE.BufferGeometry[] = [];
  private readonly shafts: THREE.BufferGeometry[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly color = new THREE.Color();

  /** Place le repère de l'objet : au sol en (x, y, z), axe +Z tourné vers `angle`. */
  place(x: number, y: number, z: number, angle: number): void {
    this.base.makeRotationY(angle).setPosition(x, y, z);
  }

  private push(template: THREE.BufferGeometry, sx: number, sy: number, sz: number, x: number, y: number, z: number, rot: Rot | undefined, color: THREE.ColorRepresentation | ((i: number) => THREE.Color), target: THREE.BufferGeometry[]): void {
    const g = template.clone();
    this.e.set(rot?.x ?? 0, rot?.y ?? 0, rot?.z ?? 0);
    this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(this.m.premultiply(this.base));
    const n = g.attributes.position!.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = typeof color === 'function' ? color(Math.floor(i / 3)) : this.color.set(color);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    target.push(g);
  }

  /** Boîte de dimensions (sx, sy, sz) centrée en (x, y, z). */
  box(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rot?: Rot): void {
    this.push(BOX, sx, sy, sz, x, y, z, rot, color, this.solid);
  }

  /** Boîte lumineuse (non éclairée : panneaux, voyants). */
  glowBox(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rot?: Rot): void {
    this.push(BOX, sx, sy, sz, x, y, z, rot, color, this.glow);
  }

  /** Cylindre vertical de rayon r (bas) et hauteur h, centré en (x, y, z). `taper` : rayon du haut / rayon du bas. */
  cyl(r: number, h: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, sides = 10, taper = 1, rot?: Rot): void {
    this.push(cylinderTemplate(sides, taper), r * 2, h, r * 2, x, y, z, rot, color, this.solid);
  }

  /** Boule irrégulière à facettes (feuillage), une couleur par facette. */
  blob(r: number, x: number, y: number, z: number, palette: THREE.Color[], seed: number, squash = 0.85): void {
    const pick = (i: number) => palette[(((i * 7 + seed) % palette.length) + palette.length) % palette.length]!;
    const g = blobTemplate(1).clone();
    // Facettes cabossées, de façon déterministe.
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + 0.2 * Math.sin(seed * 12.9898 + pos.getX(i) * 7.1 + pos.getY(i) * 3.7 + pos.getZ(i) * 5.3);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    this.push(g, r, r * squash, r, x, y, z, undefined, pick, this.solid);
    g.dispose();
  }

  /** Plan horizontal posé au sol (feuilles, taches), tourné de `angle` autour de la verticale. */
  flat(w: number, d: number, x: number, y: number, z: number, angle: number, color: THREE.ColorRepresentation): void {
    this.push(PLANE, w, d, 1, x, y, z, { x: -Math.PI / 2, z: angle }, color, this.solid);
  }

  /** Disque plat irrégulier (taches) : un polygone aplati, ovale, tourné de `angle`. */
  disc(rx: number, rz: number, x: number, y: number, z: number, angle: number, color: THREE.ColorRepresentation, facingDown = false): void {
    this.push(cylinderTemplate(9, 1), rx * 2, 0.001, rz * 2, x, y, z, { y: angle, ...(facingDown ? { x: Math.PI } : {}) }, color, this.solid);
  }

  /** Tache organique : quelques disques qui se chevauchent. */
  splotch(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, seed: number, facingDown = false): void {
    for (let i = 0; i < 3; i++) {
      const a = seed * 1.7 + i * 2.1;
      const d = r * 0.45 * (i === 0 ? 0 : 1);
      this.disc(r * (0.6 + 0.25 * Math.sin(a)), r * (0.45 + 0.2 * Math.cos(a * 1.3)), x + Math.cos(a) * d, y + i * 0.0005 * (facingDown ? -1 : 1), z + Math.sin(a) * d, a, color, facingDown);
    }
  }

  /** Plan horizontal tourné vers le bas (taches au plafond). */
  ceilingFlat(w: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation): void {
    this.push(PLANE, w, d, 1, x, y, z, { x: Math.PI / 2 }, color, this.solid);
  }

  /**
   * Rayon de lumière : plan vertical incliné, brillant en haut et transparent en bas
   * (mélange additif : le noir n'ajoute rien).
   */
  shaft(w: number, h: number, x: number, yTop: number, z: number, angle: number, tilt: number, color: THREE.ColorRepresentation): void {
    const top = new THREE.Color(color);
    const black = new THREE.Color(0, 0, 0);
    const g = PLANE.clone();
    const pos = g.attributes.position!;
    this.e.set(tilt, angle, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    // Le plan est accroché par son bord supérieur.
    const offset = new THREE.Vector3(0, -h / 2, 0).applyQuaternion(this.q);
    this.m.compose(new THREE.Vector3(x + offset.x, yTop + offset.y, z + offset.z), this.q, new THREE.Vector3(w, h, 1));
    g.applyMatrix4(this.m.premultiply(this.base));
    const colors = new Float32Array(pos.count * 3);
    // Couleur selon la hauteur d'origine du sommet (l'ordre des sommets ne change pas).
    const ref = PLANE.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const c = ref.getY(i) > 0 ? top : black;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.shafts.push(g);
  }

  /** Fusionne et libère les pièces. */
  build(): { solid: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null; shafts: THREE.BufferGeometry | null } {
    const merge = (parts: THREE.BufferGeometry[]) => {
      if (parts.length === 0) return null;
      const g = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      parts.length = 0;
      g?.computeBoundingSphere();
      return g;
    };
    return { solid: merge(this.solid), glow: merge(this.glow), shafts: merge(this.shafts) };
  }
}
