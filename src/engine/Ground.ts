import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import type { ResourceCache } from '../world/resources';

/**
 * Sol continu des lieux sans murs (désert, néant, rêve…) : un grand plan centré sur
 * le visiteur, dont la texture reste ancrée au monde. Dessiné juste après le ciel et
 * sans écrire la profondeur : les murs invisibles des modules, dessinés ensuite,
 * cachent toujours ce qui est derrière eux, mais pas ce sol.
 */
export class Ground {
  readonly mesh: THREE.Mesh;
  private preset: AmbiancePreset | null = null;

  constructor(private readonly cache: ResourceCache) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo);
    this.mesh.renderOrder = -5;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** `preset` : l'ambiance à ciel ouvert visible (ou null). */
  update(preset: AmbiancePreset | null, camera: THREE.Vector3, floorY: number, size: number): void {
    if (preset?.id !== this.preset?.id) {
      if (this.preset) this.cache.releaseMaterials(this.preset);
      this.preset = preset;
      if (preset) this.mesh.material = this.cache.acquireMaterials(preset).ground!;
    }
    this.mesh.visible = !!this.preset;
    if (!this.preset) return;
    this.mesh.position.set(camera.x, floorY, camera.z);
    this.mesh.scale.set(size, 1, size);
    // Texture ancrée au monde : 2 m par motif, comme les sols des modules.
    const map = (this.mesh.material as THREE.MeshLambertMaterial).map;
    if (map) {
      map.repeat.set(size * 0.5, size * 0.5);
      map.offset.set((camera.x - size / 2) * 0.5, (-camera.z - size / 2) * 0.5);
    }
  }

  dispose(): void {
    if (this.preset) this.cache.releaseMaterials(this.preset);
    this.preset = null;
    this.mesh.geometry.dispose();
  }
}
