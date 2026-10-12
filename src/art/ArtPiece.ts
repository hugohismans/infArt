import * as THREE from 'three';
import type { Artwork } from '../../shared/artwork';
import type { AmbiancePreset } from '../ambiances/types';
import { CONFIG } from '../config';
import type { ArtSlotDef } from '../world/modules/defs';
import type { Rng } from '../world/random';
import type { PresetMaterials } from '../world/resources';
import type { ArtClient } from './ArtClient';
import type { ArtLibrary, ReadyArt } from './ArtLibrary';
import { CARTEL_H, CARTEL_W, makeCartelTexture } from './cartel';
import { chooseFrame, type FrameStyle } from './frames';
import type { ImageLoader } from './ImageLoader';
import { makePlaceholderTexture } from './placeholder';

/** Tout ce dont une œuvre a besoin pour se procurer et afficher son image. */
export interface ArtContext {
  library: ArtLibrary;
  loader: ImageLoader;
  client: ArtClient;
  /** Nombre de textures haute résolution en cours (partagé). */
  budget: { highRes: number };
  textureSizeHigh: number;
  /** Ce que voit réellement la caméra (renseigné par le moteur). */
  viewer: { watching(object: THREE.Object3D): boolean } | null;
}

/** Formats courants (largeur / hauteur) pour les toiles en attente. */
const PLACEHOLDER_ASPECTS = [0.75, 0.8, 1, 1.25, 1.33];

interface Layout {
  w: number;
  h: number;
  style: FrameStyle;
  totalW: number;
  totalH: number;
  centerY: number;
  /** Profondeur de la face avant (où se pose la toile). */
  frontZ: number;
}

/**
 * Une œuvre accrochée : cadre (selon type et époque), passe-partout, toile, halo, cartel.
 *
 * Possède sa texture d'image (et éventuellement une version haute résolution et la
 * texture du cartel) : tout est libéré dans `dispose()`.
 */
export class ArtPiece {
  readonly object = new THREE.Group();
  artwork: Artwork | null = null;
  /** Maillage cliquable (la toile). */
  canvasMesh: THREE.Mesh | null = null;

  private layout: Layout | null = null;
  private baseTexture: THREE.Texture | null = null;
  private highTexture: THREE.Texture | null = null;
  private highCancel: (() => void) | null = null;
  private holdsBudget = false;
  private canvasMaterial: THREE.MeshBasicMaterial | null = null;
  private cartelMesh: THREE.Mesh | null = null;
  private cartelMaterial: THREE.MeshBasicMaterial | null = null;
  private cancelWait: (() => void) | null = null;
  private fadeT = 1;
  private disposed = false;

  constructor(
    private readonly slot: ArtSlotDef,
    private readonly rng: Rng,
    private readonly preset: AmbiancePreset,
    private readonly mats: PresetMaterials,
    private readonly wallHeight: number,
    private readonly ctx: ArtContext | null,
    /** Le module est-il potentiellement visible ? (sinon on peut tout reconstruire) */
    private readonly isVisible: () => boolean,
  ) {
    this.object.position.set(slot.pos.x, slot.y, slot.pos.z);
    this.object.rotation.y = Math.atan2(slot.normal.x, slot.normal.z);

    const ready = ctx?.library.take() ?? null;
    if (ready) this.hang(ready);
    else if (!ctx || ctx.library.offline) this.hangProcedural();
    else {
      this.hangPlaceholder();
      this.cancelWait = ctx.library.request((r) => this.arrive(r));
    }
  }

  /** Avance les animations (fondu). */
  animate(dt: number): void {
    if (this.fadeT >= 1 || !this.canvasMaterial) return;
    this.fadeT = Math.min(1, this.fadeT + dt / CONFIG.art.fadeDuration);
    const k = this.fadeT * this.fadeT * (3 - 2 * this.fadeT);
    this.canvasMaterial.color.setScalar(0.92 * k);
  }

  /** Niveaux de détail selon la distance du visiteur (cartel, haute résolution). */
  updateLod(px: number, pz: number): void {
    if (this.disposed) return;
    const e = this.object.matrixWorld.elements;
    const d = Math.hypot(e[12]! - px, e[14]! - pz);

    // Texte du cartel.
    if (this.cartelMesh) {
      if (d < CONFIG.art.cartelDistance && !this.cartelMaterial) {
        const tex = makeCartelTexture(this.artwork);
        this.cartelMaterial = new THREE.MeshBasicMaterial({ map: tex, color: 0xe6e2da });
        this.cartelMesh.material = this.cartelMaterial;
      } else if (d > CONFIG.art.cartelRelease && this.cartelMaterial) {
        this.releaseCartel();
      }
    }

    // Haute résolution (sources IIIF).
    const ctx = this.ctx;
    if (!ctx || !this.artwork || !this.canvasMaterial) return;
    if (d < CONFIG.art.highResDistance && !this.holdsBudget && ctx.client.supportsHighRes(this.artwork) && ctx.budget.highRes < CONFIG.art.maxHighRes) {
      ctx.budget.highRes++;
      this.holdsBudget = true;
      const size = ctx.textureSizeHigh;
      const { promise, cancel } = ctx.loader.load(ctx.client.imageUrls(this.artwork, size), size, 1);
      this.highCancel = cancel;
      promise.then(
        (img) => {
          this.highCancel = null;
          if (this.disposed || !this.holdsBudget || !this.canvasMaterial) {
            img.texture.dispose();
            return;
          }
          this.highTexture = img.texture;
          this.canvasMaterial.map = img.texture;
        },
        () => {
          this.highCancel = null;
        },
      );
    } else if (d > CONFIG.art.highResRelease && this.holdsBudget) {
      this.releaseHigh();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelWait?.();
    this.cancelWait = null;
    this.releaseHigh();
    this.releaseCartel();
    this.baseTexture?.dispose();
    this.baseTexture = null;
    this.canvasMaterial?.dispose();
    this.canvasMaterial = null;
    this.object.removeFromParent();
  }

  // --- Accrochage -----------------------------------------------------------

  /** Accroche une œuvre prête, à sa taille réelle. */
  private hang(ready: ReadyArt): void {
    this.artwork = ready.artwork;
    this.baseTexture = ready.texture;
    const { w, h } = this.physicalSize(ready.artwork, ready.aspect);
    const style = chooseFrame(ready.artwork, w, h, this.rng);
    this.build(this.fit(w, h, style), ready.texture);
  }

  /** Toile drapée en attendant l'image. */
  private hangPlaceholder(): void {
    const aspect = this.rng.pick(PLACEHOLDER_ASPECTS);
    const w = this.rng.range(0.55, 1.05);
    const style: FrameStyle = { border: 0.06, depth: 0.065, mat: 0, material: 'gold', lip: true };
    this.build(this.fit(w, w / aspect, style), null);
  }

  /** Hors ligne : composition abstraite générée (comme en phase 1). */
  private hangProcedural(): void {
    const aspect = this.rng.pick(PLACEHOLDER_ASPECTS);
    const w = this.rng.range(0.5, 1.4);
    this.baseTexture = makePlaceholderTexture(this.rng, aspect);
    const style: FrameStyle = { border: 0.045, depth: 0.05, mat: 0, material: 'gold', lip: false };
    this.build(this.fit(w, w / aspect, style), this.baseTexture);
  }

  /** L'image attendue est arrivée. */
  private arrive(ready: ReadyArt): void {
    this.cancelWait = null;
    if (this.disposed) {
      ready.texture.dispose();
      return;
    }
    const watched = this.isVisible() && (this.ctx?.viewer?.watching(this.object) ?? true);
    if (!watched || !this.layout) {
      // Personne ne regarde : on raccroche à la bonne taille.
      this.clear();
      this.hang(ready);
      return;
    }
    // Sous les yeux du visiteur : on garde le cadre, l'image apparaît en fondu sur un passe-partout.
    this.artwork = ready.artwork;
    this.baseTexture = ready.texture;
    const L = this.layout;
    const margin = Math.min(L.w, L.h) * 0.08;
    let w = L.w - 2 * margin;
    let h = w / ready.aspect;
    if (h > L.h - 2 * margin) {
      h = L.h - 2 * margin;
      w = h * ready.aspect;
    }
    if (this.canvasMesh) this.canvasMesh.material = this.mats.mat;
    const canvas = this.makeCanvas(ready.texture, w, h, L.centerY, L.frontZ + 0.009);
    this.fadeT = 0;
    this.canvasMaterial!.color.setScalar(0);
    this.object.add(canvas);
    this.object.updateMatrixWorld(true);
    if (this.cartelMaterial) this.releaseCartel(); // le texte sera régénéré
  }

  /** Taille physique (m) : dimensions réelles si connues, sinon plausible selon le type. */
  private physicalSize(art: Artwork, aspect: number): { w: number; h: number } {
    let w: number, h: number;
    if (art.dimensions) {
      // On garde la surface donnée par la source et le format de l'image (les deux
      // ne concordent pas toujours : cadre inclus, orientation inversée…).
      const area = (art.dimensions.w / 100) * (art.dimensions.h / 100);
      w = Math.sqrt(area * aspect);
      h = w / aspect;
    } else {
      const longSide =
        art.type === 'peinture' ? this.rng.range(0.45, 1.3) : art.type === 'photographie' ? this.rng.range(0.18, 0.35) : this.rng.range(0.22, 0.5);
      if (aspect >= 1) {
        w = longSide;
        h = w / aspect;
      } else {
        h = longSide;
        w = h * aspect;
      }
    }
    const min = CONFIG.art.minSize;
    if (Math.min(w, h) < min) {
      const k = min / Math.min(w, h);
      w *= k;
      h *= k;
    }
    return { w, h };
  }

  /** Réduit l'œuvre si l'ensemble encadré dépasse le mur disponible. */
  private fit(w: number, h: number, style: FrameStyle): Layout {
    const pad = 2 * (style.mat + style.border);
    const maxW = Math.max(0.3, this.slot.maxWidth) - pad;
    const maxH = this.wallHeight - 1.25 - pad;
    const k = Math.min(1, maxW / w, maxH / h);
    w *= k;
    h *= k;
    const totalW = w + pad, totalH = h + pad;
    // Ligne d'accrochage : centre à hauteur d'yeux, mais jamais trop près du sol.
    const centerY = Math.max(CONFIG.art.hangHeight, totalH / 2 + 0.55);
    const frontZ = style.depth + (style.lip ? 0.012 : 0);
    return { w, h, style, totalW, totalH, centerY, frontZ };
  }

  private makeCanvas(texture: THREE.Texture | null, w: number, h: number, y: number, z: number): THREE.Mesh {
    let material: THREE.Material;
    if (texture) {
      this.canvasMaterial = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color().setScalar(0.92) });
      material = this.canvasMaterial;
    } else {
      material = this.mats.drape;
    }
    const canvas = new THREE.Mesh(this.mats.unitPlane, material);
    canvas.scale.set(w, h, 1);
    canvas.position.set(0, y, z);
    canvas.userData.artPiece = this;
    this.canvasMesh = canvas;
    return canvas;
  }

  private build(L: Layout, texture: THREE.Texture | null): void {
    this.layout = L;
    const { w, h, style, totalW, totalH, centerY } = L;
    const m = this.mats;
    const box = (mat: THREE.Material, sx: number, sy: number, sz: number, z: number) => {
      const mesh = new THREE.Mesh(m.unitBox, mat);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(0, centerY, z);
      this.object.add(mesh);
      return mesh;
    };

    if (style.border > 0) {
      box(m.frameKinds[style.material], totalW, totalH, style.depth, style.depth / 2);
      if (style.lip) {
        // Ressaut intérieur, légèrement en avant : donne du relief au cadre doré.
        const lw = w + 2 * style.mat + style.border * 0.7;
        const lh = h + 2 * style.mat + style.border * 0.7;
        box(m.frameKinds.goldDark, lw, lh, style.depth + 0.012, (style.depth + 0.012) / 2);
      }
    } else {
      // Toile sur châssis, sans cadre : on voit la tranche.
      box(m.frameKinds.white, w, h, style.depth, style.depth / 2);
    }
    if (style.mat > 0) {
      const mat = new THREE.Mesh(m.unitPlane, m.mat);
      mat.scale.set(w + 2 * style.mat, h + 2 * style.mat, 1);
      mat.position.set(0, centerY, L.frontZ + 0.003);
      this.object.add(mat);
    }
    this.object.add(this.makeCanvas(texture, w, h, centerY, L.frontZ + 0.006));

    // Pas de halo sur une cimaise : il déborderait au-dessus de la cloison.
    if (this.preset.lighting.artGlow > 0 && this.wallHeight > 3.2) {
      // Halo additif sur le mur : simule un spot sans lumière dynamique.
      const glow = new THREE.Mesh(m.unitPlane, m.glow);
      const gw = totalW * 1.5 + 0.6;
      const gh = Math.max(totalH * 2.2, 2.2);
      glow.scale.set(gw, gh, 1);
      // Le point le plus lumineux (42 % du haut du halo) se trouve 35 cm au-dessus du cadre.
      glow.position.set(0, centerY + totalH / 2 + 0.35 - gh * 0.08, 0.012);
      glow.renderOrder = 1;
      this.object.add(glow);
    }

    this.addCartel(L);
    this.object.updateMatrixWorld(true);
  }

  /** Plaque du cartel : à droite de l'œuvre si la place le permet, sinon dessous. */
  private addCartel(L: Layout): void {
    const side = (this.slot.maxWidth - L.totalW) / 2;
    let x: number, y: number;
    if (side >= CARTEL_W + 0.16) {
      x = L.totalW / 2 + 0.1 + CARTEL_W / 2;
      y = Math.min(1.45, Math.max(1.1, L.centerY - L.totalH / 2 + CARTEL_H / 2));
    } else {
      x = L.totalW / 2 - CARTEL_W / 2;
      y = L.centerY - L.totalH / 2 - 0.1 - CARTEL_H / 2;
      if (y < 0.5) return;
    }
    const plate = new THREE.Mesh(this.mats.unitBox, this.mats.cartelBlank);
    plate.scale.set(CARTEL_W, CARTEL_H, 0.008);
    plate.position.set(x, y, 0.006);
    this.cartelMesh = plate;
    this.object.add(plate);
  }

  private releaseCartel(): void {
    if (!this.cartelMaterial) return;
    this.cartelMaterial.map?.dispose();
    this.cartelMaterial.dispose();
    this.cartelMaterial = null;
    if (this.cartelMesh) this.cartelMesh.material = this.mats.cartelBlank;
  }

  private releaseHigh(): void {
    this.highCancel?.();
    this.highCancel = null;
    if (this.highTexture) {
      if (this.canvasMaterial) this.canvasMaterial.map = this.baseTexture;
      this.highTexture.dispose();
      this.highTexture = null;
    }
    if (this.holdsBudget && this.ctx) this.ctx.budget.highRes--;
    this.holdsBudget = false;
  }

  /** Vide le groupe (sans toucher aux ressources partagées). */
  private clear(): void {
    this.releaseHigh();
    this.releaseCartel();
    this.canvasMaterial?.dispose();
    this.canvasMaterial = null;
    this.baseTexture?.dispose();
    this.baseTexture = null;
    this.canvasMesh = null;
    this.cartelMesh = null;
    this.object.clear();
  }
}
