import * as THREE from 'three';
import { CONFIG } from '../config';
import type { AmbiancePreset } from '../ambiances/types';
import type { PresetMaterials } from '../world/resources';
import type { Rng } from '../world/random';
import type { ArtSlotDef } from '../world/modules/defs';
import { makePlaceholderTexture } from './placeholder';

/** Formats courants (largeur / hauteur). */
const ASPECTS = [0.62, 0.7, 0.75, 0.8, 1, 1, 1.25, 1.33, 1.5, 1.78];

/**
 * Une œuvre accrochée : cadre + toile + halo de lumière.
 * Possède sa texture et son matériau de toile, à libérer via `dispose()`.
 */
export class ArtPiece {
  readonly object = new THREE.Group();
  readonly width: number;
  readonly height: number;
  private texture: THREE.Texture;
  private canvasMaterial: THREE.MeshBasicMaterial;

  constructor(slot: ArtSlotDef, rng: Rng, preset: AmbiancePreset, mats: PresetMaterials, wallHeight: number) {
    const aspect = rng.pick(ASPECTS);
    const maxW = Math.max(CONFIG.art.minWidth, Math.min(CONFIG.art.maxWidth, slot.maxWidth));
    // Les grands formats sont plus rares : tirage biaisé vers les petites tailles.
    let w = CONFIG.art.minWidth + (maxW - CONFIG.art.minWidth) * Math.pow(rng.next(), 1.6);
    let h = w / aspect;
    const maxH = Math.min(CONFIG.art.maxHeight, wallHeight - 1.4);
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    this.width = w;
    this.height = h;

    const border = 0.035 + 0.05 * Math.min(w, h);
    const depth = 0.045 + 0.02 * Math.min(w, h);
    const centerY = Math.max(CONFIG.art.hangHeight, h / 2 + border + 0.45);

    this.texture = makePlaceholderTexture(rng, aspect);
    this.canvasMaterial = new THREE.MeshBasicMaterial({ map: this.texture, color: 0xe8e8e8 });

    const frame = new THREE.Mesh(mats.unitBox, rng.pick(mats.frames));
    frame.scale.set(w + border * 2, h + border * 2, depth);
    frame.position.set(0, centerY, depth / 2);

    const canvas = new THREE.Mesh(mats.unitPlane, this.canvasMaterial);
    canvas.scale.set(w, h, 1);
    canvas.position.set(0, centerY, depth + 0.002);

    this.object.add(frame, canvas);

    if (preset.lighting.artGlow > 0) {
      // Halo additif sur le mur : simule un spot sans lumière dynamique.
      const glow = new THREE.Mesh(mats.unitPlane, mats.glow);
      const gw = w * 1.5 + 0.7;
      const gh = Math.max(h * 2.2, 2.2);
      glow.scale.set(gw, gh, 1);
      // Le haut du halo (zone la plus intense) se trouve au-dessus de l'œuvre.
      glow.position.set(0, centerY + h / 2 + 0.35 - gh * 0.2, 0.004);
      glow.renderOrder = 1;
      this.object.add(glow);
    }

    // Orientation : l'axe local +Z de l'œuvre suit la normale du mur.
    this.object.position.set(slot.pos.x, 0, slot.pos.z);
    this.object.rotation.y = Math.atan2(slot.normal.x, slot.normal.z);
  }

  dispose(): void {
    this.texture.dispose();
    this.canvasMaterial.dispose();
    this.object.removeFromParent();
  }
}
