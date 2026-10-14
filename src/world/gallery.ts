import * as THREE from 'three';
import type { ModuleDef } from './modules/defs';
import { Rng } from './random';

/**
 * La galerie des plâtres (la récréation du Conservateur) : des moulages en plâtre qui
 * jouent à 1, 2, 3, soleil. Ils glissent vers le fond pendant qu'il compte, se figent sur
 * « soleil » (sauf quand l'un d'eux triche), et à la fin se retrouvent tous juste derrière
 * le visiteur. Les portes de la salle se ferment pendant la partie. Repère du module : on
 * entre par z = 0, l'arrivée est au fond.
 */
export type GalleryPhase = 'attente' | 'compte' | 'soleil' | 'fin';

interface Statue {
  object: THREE.Group;
  /** Position (repère du module) et vitesse propre (m/s pendant le comptage). */
  x: number;
  z: number;
  speed: number;
  phase: number;
  /** Pas de tricheur en cours : départ, arrivée, avancement (0..1). */
  cheat: { from: number; to: number; t: number } | null;
}

interface Gate {
  hinge: THREE.Group;
  open: number;
  target: number;
}

export class Gallery {
  readonly group = new THREE.Group();
  phase: GalleryPhase = 'attente';
  /** Ligne d'arrivée (z, repère du module) et point de départ du visiteur. */
  readonly finishZ: number;
  readonly startZ = 1.6;
  private readonly statues: Statue[] = [];
  private readonly gates: Gate[] = [];
  private readonly owned: Array<{ dispose(): void }> = [];
  private readonly halfWidth: number;
  private time = 0;

  constructor(def: ModuleDef, height: number, seed: string) {
    const xs = def.footprint.map((p) => p.x);
    const zs = def.footprint.map((p) => p.z);
    this.halfWidth = (Math.max(...xs) - Math.min(...xs)) / 2;
    const depth = Math.max(...zs);
    this.finishZ = depth - 2.6;
    const rng = new Rng(seed, 'platres');
    const plaster = new THREE.MeshLambertMaterial({ color: '#ebe6dc', emissive: '#ebe6dc', emissiveIntensity: 0.06 });
    const shade = new THREE.MeshLambertMaterial({ color: '#d9d2c4' });
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
    const cone = new THREE.CylinderGeometry(0.35, 1, 1, 12);
    const ball = new THREE.SphereGeometry(1, 14, 10);
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.owned.push(plaster, shade, cyl, cone, ball, box);

    // Les statues : en rangs serrés près de l'entrée, prêtes à jouer.
    const n = 12;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      g.userData.animated = true;
      this.buildStatue(g, rng, plaster, shade, { cyl, cone, ball, box });
      const x = (((i % 4) + 0.5) / 4 - 0.5) * (this.halfWidth * 2 - 2.4) + rng.range(-0.3, 0.3);
      const z = 3 + Math.floor(i / 4) * 1.8 + rng.range(-0.3, 0.3);
      // (Presque aussi vite que vous en marchant : elles vous distancent si vous traînez.)
      const s: Statue = { object: g, x, z, speed: rng.range(0.9, 1.7), phase: rng.range(0, Math.PI * 2), cheat: null };
      this.statues.push(s);
      this.group.add(g);
      this.place(s);
    }

    // La ligne d'arrivée : un ruban peint au sol, et deux plots.
    const tape = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: '#b8322a' }));
    this.owned.push(tape.material as THREE.Material);
    tape.scale.set(this.halfWidth * 2 - 0.6, 0.012, 0.18);
    tape.position.set(0, 0.006, this.finishZ);
    this.group.add(tape);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(box, shade);
      post.scale.set(0.25, 0.9, 0.25);
      post.position.set(sx * (this.halfWidth - 0.6), 0.45, this.finishZ);
      this.group.add(post);
    }

    // Les portes : un grand battant par ouverture, ouvert pour l'instant.
    const wood = new THREE.MeshLambertMaterial({ color: '#d6cfc0' });
    this.owned.push(wood);
    for (const c of def.connectors) {
      const w = c.width, h = Math.min(height, c.top ?? height);
      const hinge = new THREE.Group();
      hinge.userData.animated = true;
      // Le gond à gauche de l'ouverture (vu de l'intérieur), le battant dans le plan de l'ouverture.
      const t = { x: -c.normal.z, z: c.normal.x };
      hinge.position.set(c.pos.x - (t.x * w) / 2 - c.normal.x * 0.06, 0, c.pos.z - (t.z * w) / 2 - c.normal.z * 0.06);
      // (Repère du gond : +X le long de l'ouverture.)
      hinge.userData.base = Math.atan2(t.x, t.z) - Math.PI / 2;
      const leaf = new THREE.Mesh(box, wood);
      leaf.scale.set(w - 0.04, h - 0.04, 0.08);
      leaf.position.set((w - 0.04) / 2, h / 2, 0);
      hinge.add(leaf);
      this.group.add(hinge);
      const gate: Gate = { hinge, open: 1, target: 1 };
      this.gates.push(gate);
      this.applyGate(gate);
    }
  }

  /** Les portes de la galerie se ferment (true) ou se rouvrent. */
  setGates(closed: boolean): void {
    for (const g of this.gates) g.target = closed ? 0 : 1;
  }

  /** Les portes sont-elles fermées (ou en train de se fermer) ? */
  get gatesClosed(): boolean {
    return this.gates.some((g) => g.target === 0);
  }

  /** Une statue au hasard fait un grand pas pendant « soleil » (le Conservateur ne voit rien). */
  cheat(): void {
    const free = this.statues.filter((s) => !s.cheat && s.z < this.finishZ - 4);
    const s = free[Math.floor(Math.random() * free.length)];
    if (s) s.cheat = { from: s.z, to: s.z + 1.6, t: 0 };
  }

  /** Avance moyenne des statues (repère du module). */
  get meanZ(): number {
    return this.statues.reduce((a, s) => a + s.z, 0) / this.statues.length;
  }

  /** Fin de partie : toutes les statues, juste derrière le visiteur (repère du module). */
  gatherBehind(px: number, pz: number): void {
    this.phase = 'fin';
    this.statues.forEach((s, i) => {
      const a = ((i / (this.statues.length - 1)) - 0.5) * 2.4;
      const r = 1.1 + (i % 3) * 0.55;
      s.x = Math.max(-this.halfWidth + 0.7, Math.min(this.halfWidth - 0.7, px + Math.sin(a) * r));
      s.z = pz - Math.cos(a) * r;
      s.cheat = null;
      this.place(s);
    });
  }

  update(dt: number): void {
    this.time += dt;
    for (const g of this.gates) {
      if (g.open === g.target) continue;
      g.open += Math.sign(g.target - g.open) * Math.min(Math.abs(g.target - g.open), dt / 1.2);
      this.applyGate(g);
    }
    if (this.phase === 'fin' || this.phase === 'attente') return;
    for (const s of this.statues) {
      if (s.cheat) {
        s.cheat.t = Math.min(1, s.cheat.t + dt / 0.6);
        s.z = s.cheat.from + (s.cheat.to - s.cheat.from) * s.cheat.t;
        if (s.cheat.t >= 1) s.cheat = null;
      } else if (this.phase === 'compte') {
        // Elles glissent vers le fond, sans jamais franchir la ligne (ce n'est pas leur partie).
        s.z = Math.min(this.finishZ - 1.2, s.z + s.speed * dt);
      }
      this.place(s, this.phase === 'compte' || !!s.cheat);
    }
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.group.removeFromParent();
  }

  private place(s: Statue, moving = false): void {
    // En marche, un léger balancement ; figées, plus rien.
    const sway = moving ? Math.sin(this.time * 7 + s.phase) * 0.05 : 0;
    s.object.position.set(s.x, moving ? Math.abs(Math.sin(this.time * 7 + s.phase)) * 0.03 : 0, s.z);
    s.object.rotation.set(0, 0, sway);
  }

  private applyGate(g: Gate): void {
    const e = g.open * g.open * (3 - 2 * g.open);
    // Ouvert : le battant rabattu contre le mur, à l'intérieur de la salle.
    g.hinge.rotation.y = (g.hinge.userData.base as number) - 1.75 * e;
  }

  /** Un moulage en plâtre (1,8 m), sur un petit socle : drapé, bras dans une pose classique. */
  private buildStatue(
    g: THREE.Group,
    rng: Rng,
    plaster: THREE.Material,
    shade: THREE.Material,
    geo: { cyl: THREE.BufferGeometry; cone: THREE.BufferGeometry; ball: THREE.BufferGeometry; box: THREE.BufferGeometry },
  ): void {
    const part = (geom: THREE.BufferGeometry, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geom, m);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      g.add(mesh);
      return mesh;
    };
    const k = rng.range(0.92, 1.08);
    // Socle.
    part(geo.box, shade, 0.62, 0.16, 0.62, 0, 0.08, 0);
    // Jambes et drapé.
    part(geo.cyl, plaster, 0.08, 0.8, 0.08, -0.11, 0.56, 0);
    part(geo.cyl, plaster, 0.08, 0.8, 0.08, 0.11, 0.56, 0);
    part(geo.cone, plaster, 0.3 * k, 0.75, 0.24 * k, 0, 0.86, 0);
    // Torse, épaules, tête.
    part(geo.cyl, plaster, 0.2 * k, 0.55, 0.14, 0, 1.38, 0);
    part(geo.ball, plaster, 0.26 * k, 0.08, 0.15, 0, 1.64, 0);
    part(geo.cyl, plaster, 0.055, 0.12, 0.055, 0, 1.72, 0);
    part(geo.ball, plaster, 0.11, 0.13, 0.115, 0, 1.86, 0.01);
    // Bras : chacun sa pose (levé, sur la hanche, tendu, au menton).
    const poses = [
      [-2.6, 0.2],
      [-0.4, 0.5],
      [-1.4, 0.2],
      [-2.0, -0.6],
      [-0.2, 0.15],
    ];
    for (const side of [-1, 1]) {
      const [rx, rz] = rng.pick(poses);
      const arm = new THREE.Group();
      arm.position.set(side * 0.25 * k, 1.62, 0);
      arm.rotation.set(rx!, 0, side * rz!);
      g.add(arm);
      const upper = new THREE.Mesh(geo.cyl, plaster);
      upper.scale.set(0.05, 0.62, 0.05);
      upper.position.set(0, -0.31, 0);
      arm.add(upper);
    }
    // Tous face au fond de la galerie (ils jouent, eux aussi).
    g.rotation.y = 0;
  }
}
