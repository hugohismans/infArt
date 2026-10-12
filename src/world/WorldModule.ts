import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { ArtPiece, type ArtContext } from '../art/ArtPiece';
import { CONFIG } from '../config';
import { applyTransform, inverseTransform, rotate, type Segment, type Transform2, type Vec2 } from './math2d';
import type { ModuleDef } from './modules/defs';
import { Rng } from './random';
import type { ResourceCache } from './resources';

export interface Connector {
  /** Centre de l'ouverture (monde). */
  pos: Vec2;
  /** Hauteur du sol à l'ouverture (monde). */
  y: number;
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
  /** Points libres pour l'itinéraire de l'auto-marche (monde). */
  readonly navPoints: Vec2[];
  /** Étendue verticale occupée [bas, haut] : deux modules peuvent se superposer s'ils ne se recoupent pas. */
  readonly yRange: [number, number];
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
    /** Hauteur du sol à l'entrée du module (étages). */
    readonly baseY: number,
    readonly preset: AmbiancePreset,
    readonly seed: string,
    private readonly cache: ResourceCache,
  ) {
    const t = transform;
    this.footprint = def.footprint.map((p) => applyTransform(t, p));
    this.walls = def.walls.map((w) => ({ a: applyTransform(t, w.seg.a), b: applyTransform(t, w.seg.b) }));
    this.navPoints = def.navPoints.map((p) => applyTransform(t, p));
    const H = preset.geometry.ceilingHeight * def.ceilingScale;
    this.yRange = [baseY + Math.min(0, def.rise), baseY + Math.max(0, def.rise) + H];
    this.connectors = def.connectors.map((c) => {
      const pos = applyTransform(t, c.pos);
      const normal = rotate(c.normal, t.angle);
      const tangent = { x: -normal.z, z: normal.x };
      const hw = c.width / 2;
      return {
        pos,
        y: baseY + c.y,
        normal,
        portal: {
          a: { x: pos.x - tangent.x * hw, z: pos.z - tangent.z * hw },
          b: { x: pos.x + tangent.x * hw, z: pos.z + tangent.z * hw },
        },
        neighbor: null,
      };
    });
  }

  /** Potentiellement visible lors de la dernière vérification (mis à jour par World). */
  visible = true;

  /** Hauteur du sol (monde) en un point du plan. */
  floorAt(p: Vec2): number {
    return this.baseY + this.def.floorAt(inverseTransform(this.transform, p));
  }

  /** Crée les meshes (partagés) et les œuvres (propres au module). */
  build(artCtx: ArtContext | null): void {
    const mats = this.cache.acquireMaterials(this.preset);
    const geos = this.cache.acquireGeometries(this.def, this.preset);
    if (geos.structure) this.group.add(new THREE.Mesh(geos.structure, mats.structure));
    if (geos.floor) this.group.add(new THREE.Mesh(geos.floor, mats.floor));
    if (geos.lights) this.group.add(new THREE.Mesh(geos.lights, mats.lights));

    const rng = new Rng(this.seed, 'art');
    const density = CONFIG.art.density * this.preset.art.density;
    for (const slot of this.def.artSlots) {
      // Une impasse (ou un bouchon) expose toujours son œuvre unique.
      const always = this.def.kind === 'cap' || this.def.kind === 'deadend';
      if (!always && !rng.chance(density)) continue;
      const wallHeight = slot.wallHeight ?? this.preset.geometry.ceilingHeight * this.def.ceilingScale;
      const art = new ArtPiece(slot, rng, this.preset, mats, wallHeight, artCtx, () => this.visible);
      this.arts.push(art);
      this.group.add(art.object);
    }

    this.group.position.set(this.transform.x, this.baseY, this.transform.z);
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
    const a = this.def.connectors[from], b = this.def.connectors[to];
    if (!a || !b || from === to) return 0;
    // Direction d'arrivée = opposée de la normale sortante de l'entrée.
    const c = -a.normal.x * b.normal.z + a.normal.z * b.normal.x;
    return c < -0.5 ? 1 : c > 0.5 ? -1 : 0;
  }

  get artPieces(): readonly ArtPiece[] {
    return this.arts;
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
    this.navPoints.forEach(mv);
    for (const w of this.walls) {
      mv(w.a);
      mv(w.b);
    }
    for (const c of this.connectors) {
      mv(c.pos);
      mv(c.portal.a);
      mv(c.portal.b);
    }
    this.group.position.set(this.transform.x, this.baseY, this.transform.z);
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
