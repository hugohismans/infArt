import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { ArtPiece } from '../art/ArtPiece';
import { CONFIG } from '../config';
import { applyTransform, rotate, type Segment, type Transform2, type Vec2 } from './math2d';
import type { ModuleDef } from './modules/defs';
import { Rng } from './random';
import type { ResourceCache } from './resources';

export interface Connector {
  /** Centre de l'ouverture (monde). */
  pos: Vec2;
  /** Normale sortante (monde). */
  normal: Vec2;
  /** Segment de l'ouverture (monde), utilisé pour la visibilité. */
  portal: Segment;
  /** Module voisin raccordé à cette ouverture (null = ouverture non générée). */
  neighbor: { module: WorldModule; connector: number } | null;
  /** Debug : module qui occupait cette ouverture avant d'être détruit. */
  detachedFrom?: string;
}

/**
 * Instance d'un module dans le monde. Ne connaît que ses voisins directs :
 * il n'existe pas de plan global.
 */
export class WorldModule {
  readonly group = new THREE.Group();
  readonly footprint: Vec2[];
  readonly connectors: Connector[];
  readonly walls: Segment[];
  readonly waypoints: Vec2[];
  private arts: ArtPiece[] = [];
  private disposed = false;
  /** Instant de création (ms), pour temporiser les nouvelles tentatives sur les impasses. */
  readonly createdAt = performance.now();

  /** Distance (en modules) au module du joueur, recalculée à chaque frame. */
  graphDistance = Infinity;
  /** Nombre de vérifications consécutives où le module était invisible. */
  hiddenChecks = 0;

  constructor(
    readonly id: number,
    readonly def: ModuleDef,
    readonly transform: Transform2,
    readonly preset: AmbiancePreset,
    readonly seed: string,
    private readonly cache: ResourceCache,
  ) {
    const t = transform;
    this.footprint = def.footprint.map((p) => applyTransform(t, p));
    this.walls = def.walls.map((w) => ({ a: applyTransform(t, w.seg.a), b: applyTransform(t, w.seg.b) }));
    this.waypoints = def.waypoints.map((p) => applyTransform(t, p));
    this.connectors = def.connectors.map((c) => {
      const pos = applyTransform(t, c.pos);
      const normal = rotate(c.normal, t.angle);
      const tangent = { x: -normal.z, z: normal.x };
      const hw = c.width / 2;
      return {
        pos,
        normal,
        portal: {
          a: { x: pos.x - tangent.x * hw, z: pos.z - tangent.z * hw },
          b: { x: pos.x + tangent.x * hw, z: pos.z + tangent.z * hw },
        },
        neighbor: null,
      };
    });
  }

  /** Crée les meshes (partagés) et les œuvres (propres au module). */
  build(): void {
    const mats = this.cache.acquireMaterials(this.preset);
    const geos = this.cache.acquireGeometries(this.def, this.preset);
    if (geos.structure) this.group.add(new THREE.Mesh(geos.structure, mats.structure));
    if (geos.floor) this.group.add(new THREE.Mesh(geos.floor, mats.floor));
    if (geos.lights) this.group.add(new THREE.Mesh(geos.lights, mats.lights));

    const rng = new Rng(this.seed, 'art');
    const density = CONFIG.art.density * this.preset.art.density;
    for (const slot of this.def.artSlots) {
      // Une impasse expose toujours son œuvre.
      if (this.def.kind !== 'cap' && !rng.chance(density)) continue;
      const art = new ArtPiece(slot, rng, this.preset, mats, this.preset.geometry.ceilingHeight);
      this.arts.push(art);
      this.group.add(art.object);
    }

    this.group.position.set(this.transform.x, 0, this.transform.z);
    this.group.rotation.y = this.transform.angle;
    this.group.updateMatrixWorld(true);
    // Le module ne bouge jamais (sauf recentrage) : inutile de recalculer ses matrices à chaque frame.
    this.group.matrixAutoUpdate = false;
    this.group.traverse((o) => (o.matrixAutoUpdate = false));
  }

  get alive(): boolean {
    return !this.disposed;
  }

  /**
   * Sens du virage quand on traverse ce module de l'ouverture `from` vers `to`
   * (+1 gauche, -1 droite, 0 tout droit).
   */
  turnSign(from: number, to: number): number {
    if (this.def.turn === 0 || from === to) return 0;
    return to === 1 ? this.def.turn : -this.def.turn;
  }

  get artCount(): number {
    return this.arts.length;
  }

  /** Déplace tout le module (recentrage de l'origine flottante). */
  shift(dx: number, dz: number): void {
    const mv = (p: Vec2) => {
      p.x += dx;
      p.z += dz;
    };
    this.transform.x += dx;
    this.transform.z += dz;
    this.footprint.forEach(mv);
    this.waypoints.forEach(mv);
    for (const w of this.walls) {
      mv(w.a);
      mv(w.b);
    }
    for (const c of this.connectors) {
      mv(c.pos);
      mv(c.portal.a);
      mv(c.portal.b);
    }
    this.group.position.set(this.transform.x, 0, this.transform.z);
    this.group.updateMatrix();
    this.group.updateMatrixWorld(true);
  }

  /** Libère explicitement tout ce que le module possède, puis rend les ressources partagées. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const art of this.arts) art.dispose();
    this.arts = [];
    this.group.removeFromParent();
    this.group.clear();
    this.cache.releaseGeometries(this.def, this.preset);
    this.cache.releaseMaterials(this.preset);
    // Détache le module du graphe.
    for (const c of this.connectors) {
      if (c.neighbor) {
        const other = c.neighbor.module.connectors[c.neighbor.connector];
        if (other) {
          other.neighbor = null;
          other.detachedFrom = `#${this.id} ${this.def.id}`;
        }
        c.neighbor = null;
      }
    }
  }
}
