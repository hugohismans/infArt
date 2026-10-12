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
  /** Taille des textures d'affichage. */
  textureSize: number;
  /** Ce que voit réellement la caméra (renseigné par le moteur). */
  viewer: { watching(object: THREE.Object3D): boolean } | null;
}

/** Options d'une œuvre, dont les étrangetés du Directeur. */
export interface ArtOptions {
  /** Aile thématique du module : on y accroche en priorité des œuvres du thème. */
  themeId?: string;
  /** Cartel écrit dans une langue inventée. */
  scrambled?: boolean;
  /** L'œuvre change dès qu'on ne la regarde plus. */
  changeling?: boolean;
  /** Accrochée à l'envers. */
  upsideDown?: boolean;
  /** Œuvre imposée (la même trois fois de suite)… */
  ready?: ReadyArt;
  /** … dont la texture appartient à une autre pièce (elle ne la libère pas). */
  borrowed?: boolean;
  /** Œuvre imposée, dont l'image est à charger (couloir qui revient sur lui-même). */
  artwork?: Artwork;
  /** Accrochée au plafond, face vers le bas. */
  ceiling?: boolean;
  /** Sculpture sur socle, au milieu de la salle (photo debout, visible des deux côtés). */
  pedestal?: boolean;
  /** Visite à deux : l'œuvre sera choisie par l'autre visiteur (voile en attendant). */
  awaitRemote?: boolean;
}

/** Une langue inventée : chaque lettre devient un glyphe, les mots gardent leur longueur. */
const GLYPHS = 'ȝþðæœŋħłøʒɛɔʃǝʊɣχɮƛϟ';
function scramble(text: string): string {
  return text.replace(/[\p{L}\d]/gu, (ch) => GLYPHS[(ch.toLowerCase().codePointAt(0)! * 7) % GLYPHS.length]!);
}
function scrambleArtwork(art: Artwork | null): Artwork | null {
  if (!art) return null;
  return {
    ...art,
    title: scramble(art.title),
    ...(art.creator ? { creator: scramble(art.creator) } : {}),
    ...(art.date ? { date: scramble(art.date) } : {}),
    ...(art.medium ? { medium: scramble(art.medium) } : {}),
    credit: scramble(art.credit),
  };
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
  /** Contenu de l'œuvre (cadre, toile, cartel) : déplacé selon le support (chevalet, flottant…). */
  private readonly holder = new THREE.Group();
  /** Luminosité de la toile (caisson lumineux : rétroéclairée). */
  private readonly brightness: number;
  private readonly phase: number;
  private time = 0;
  artwork: Artwork | null = null;
  /** Maillage cliquable (la toile). */
  canvasMesh: THREE.Mesh | null = null;
  /** Revers de la photo d'une sculpture (cliquable aussi). */
  backMesh: THREE.Mesh | null = null;

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
    private readonly opts: ArtOptions = {},
  ) {
    this.object.position.set(slot.pos.x, slot.y, slot.pos.z);
    this.object.rotation.y = Math.atan2(slot.normal.x, slot.normal.z);
    if (slot.offset) this.object.translateX(slot.offset);
    // Forêt : accrochée sur la face avant du tronc (rayon un peu réduit à hauteur d'yeux, le tronc s'affine).
    if (!opts.pedestal) this.object.translateZ(CONFIG.world.wallGap + (preset.decor.trunksBehindArt && !slot.hangY ? CONFIG.decor.trunkRadius * 1.9 : 0));
    if (opts.ceiling) {
      // Étrangeté : au plafond, à un peu plus d'un mètre du mur, face vers le bas.
      const d = Math.min(1.3, preset.geometry.corridorWidth / 2 - 0.4);
      this.object.position.set(slot.pos.x + slot.normal.x * d, slot.y + wallHeight - 0.03, slot.pos.z + slot.normal.z * d);
      this.object.rotation.order = 'YXZ';
      this.object.rotation.set(Math.PI / 2, Math.atan2(slot.normal.x, slot.normal.z), 0);
    }
    this.object.add(this.holder);
    this.brightness = preset.art.mount === 'caisson' ? 1.25 : preset.art.mount === 'projection' ? 1.05 : 0.92;
    this.phase = rng.range(0, Math.PI * 2);
    // Les œuvres flottantes bougent : leur matrice est recalculée à chaque image.
    if (preset.art.mount === 'flottant') this.holder.userData.animated = true;

    // Musée en travaux : certaines œuvres restent emballées.
    if (preset.art.wrapped && rng.chance(preset.art.wrapped)) {
      this.hangPlaceholder();
      return;
    }
    if (opts.artwork && ctx) {
      // Une œuvre précise (déjà vue ailleurs, ou choisie par l'autre visiteur) : on charge son image.
      if (!opts.pedestal) this.hangPlaceholder();
      this.loadArtwork(opts.artwork);
      return;
    }
    if (opts.awaitRemote && ctx) {
      this.hangPlaceholder();
      return;
    }
    const ready = opts.ready ?? ctx?.library.take(preset.art.prefer, opts.themeId) ?? null;
    if (ready) this.hang(ready);
    else if (!ctx || ctx.library.offline) this.hangProcedural();
    else {
      this.hangPlaceholder();
      this.cancelWait = ctx.library.request((r) => this.arrive(r));
    }
  }

  /** Charge l'image d'une œuvre donnée, puis l'accroche. */
  private loadArtwork(art: Artwork): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.cancelWait?.();
    const { promise, cancel } = ctx.loader.load(ctx.client.imageUrls(art, ctx.textureSize), ctx.textureSize, 2);
    this.cancelWait = cancel;
    promise.then(
      (img) => {
        this.cancelWait = null;
        this.arrive({ artwork: art, texture: img.texture, aspect: img.naturalWidth / img.naturalHeight });
      },
      () => {
        this.cancelWait = null;
      },
    );
  }

  /** Visite à deux : l'autre visiteur a accroché cette œuvre ici. */
  assignArtwork(art: Artwork): void {
    if (this.disposed || this.artwork?.id === art.id || this.pendingId === art.id) return;
    this.pendingId = art.id;
    this.loadArtwork(art);
  }
  private pendingId: string | null = null;

  /** Visite à deux : l'œuvre attendue n'arrive pas (l'autre est parti) : on pioche dans sa réserve. */
  fallbackToLibrary(): void {
    const ctx = this.ctx;
    if (this.disposed || this.artwork || this.pendingId || !ctx) return;
    this.pendingId = 'local';
    const ready = ctx.library.take(this.preset.art.prefer, this.opts.themeId);
    if (ready) this.arrive(ready);
    else this.cancelWait = ctx.library.request((r) => this.arrive(r));
  }

  /** Le texte du cartel est affiché (une texture). */
  get hasCartelTexture(): boolean {
    return this.cartelMaterial !== null;
  }

  /** Textures d'image détenues (ou empruntées) : pour le comptage des fuites. */
  collectTextures(out: Set<THREE.Texture>): void {
    if (this.baseTexture) out.add(this.baseTexture);
    if (this.highTexture) out.add(this.highTexture);
  }

  /** Avance les animations (fondu). */
  animate(dt: number): void {
    if (this.preset.art.mount === 'flottant' && this.layout) {
      // Le cadre flotte et pivote lentement, sans jamais toucher le mur.
      this.time += dt;
      const t = this.time;
      this.holder.position.y = Math.sin(t * 0.6 + this.phase) * 0.08;
      this.holder.rotation.y = Math.sin(t * 0.23 + this.phase) * 0.3;
      this.holder.rotation.z = Math.sin(t * 0.31 + this.phase * 2) * 0.05;
    }
    // Projecteur : l'image papillote légèrement.
    if (this.preset.art.mount === 'projection' && this.canvasMaterial && this.fadeT >= 1) {
      this.canvasMaterial.color.setScalar(this.brightness * (0.93 + Math.random() * 0.07));
    }
    if (this.fadeT >= 1 || !this.canvasMaterial) return;
    this.fadeT = Math.min(1, this.fadeT + dt / CONFIG.art.fadeDuration);
    const k = this.fadeT * this.fadeT * (3 - 2 * this.fadeT);
    this.canvasMaterial.color.setScalar(this.brightness * k);
  }

  /** Niveaux de détail selon la distance du visiteur (cartel, haute résolution). */
  updateLod(px: number, pz: number): void {
    if (this.disposed) return;
    const e = this.object.matrixWorld.elements;
    const d = Math.hypot(e[12]! - px, e[14]! - pz);

    // Texte du cartel.
    if (this.cartelMesh) {
      if (d < CONFIG.art.cartelDistance && !this.cartelMaterial) {
        const tex = makeCartelTexture(this.opts.scrambled ? scrambleArtwork(this.artwork) : this.artwork);
        this.cartelMaterial = new THREE.MeshBasicMaterial({ map: tex, color: 0xe6e2da });
        this.cartelMesh.material = this.cartelMaterial;
      } else if (d > CONFIG.art.cartelRelease && this.cartelMaterial) {
        this.releaseCartel();
      }
    }

    if (this.opts.changeling) this.changeWhenUnseen(d);

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

  /** Étrangeté : vue, puis quittée des yeux un instant, l'œuvre n'est plus la même. */
  private seen = false;
  private unseenTicks = 0;
  private changes = 0;
  private changeWhenUnseen(d: number): void {
    const ctx = this.ctx;
    if (!ctx?.viewer || !this.artwork || this.changes >= 3) return;
    const watched = d < 12 && ctx.viewer.watching(this.object);
    if (watched) {
      this.seen = true;
      this.unseenTicks = 0;
      return;
    }
    // Le visiteur doit être encore tout près : il verra le changement en se retournant.
    if (!this.seen || d > 9 || ++this.unseenTicks < 5) return;
    const next = ctx.library.take(this.preset.art.prefer);
    if (!next) return;
    this.clear();
    this.hang(next);
    this.object.updateMatrixWorld(true);
    this.seen = false;
    this.unseenTicks = 0;
    this.changes++;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelWait?.();
    this.cancelWait = null;
    this.releaseHigh();
    this.releaseCartel();
    if (!this.opts.borrowed) this.baseTexture?.dispose();
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
    // Projection : pas de cadre, l'image est projetée sur le mur.
    const style: FrameStyle =
      this.preset.art.mount === 'projection'
        ? { border: 0, depth: 0.002, mat: 0, material: 'white', lip: false }
        : chooseFrame(ready.artwork, w, h, this.rng, this.preset.art.frames);
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
    // (Une œuvre déjà accrochée qu'on remplace : on raccroche, sans garder l'ancienne texture.)
    if (!watched || !this.layout || this.artwork) {
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
    this.holder.add(canvas);
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
      const [lo, hi] = CONFIG.art.longSide[art.type] ?? CONFIG.art.longSide.autre!;
      const longSide = this.rng.range(lo, hi);
      if (aspect >= 1) {
        w = longSide;
        h = w / aspect;
      } else {
        h = longSide;
        w = h * aspect;
      }
    }
    if (art.type === 'couverture-livre') {
      w *= CONFIG.art.bookScale;
      h *= CONFIG.art.bookScale;
    }
    // Échelle déréglée, écran de cinéma.
    const scale = this.preset.art.scale ?? 1;
    w *= scale;
    h *= scale;
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
    // Une pochette de disque prend plus de place : le vinyle dépasse, la tablette déborde.
    const extra = style.mount === 'record' ? 0.52 * w : style.mount === 'book' ? 0.1 : 0;
    const pad = 2 * (style.mat + style.border);
    const maxW = Math.max(0.3, this.slot.maxWidth) - pad - extra;
    const maxH = (this.slot.maxHeight ?? this.wallHeight - 1.25) - pad;
    const k = Math.min(1, maxW / w, maxH / h);
    w *= k;
    h *= k;
    const totalW = w + pad + (style.mount === 'record' ? 0.52 * w : style.mount === 'book' ? 0.1 : 0);
    const totalH = h + pad;
    // Ligne d'accrochage : centre à hauteur d'yeux, mais jamais trop près du sol.
    // (Accrochage serré : chaque rang a sa propre hauteur.)
    // (À l'échelle du visiteur : un visiteur minuscule accroche plus bas.)
    const e = this.preset.visitor?.eyeScale ?? 1;
    const centerY = this.slot.hangY ?? Math.max(CONFIG.art.hangHeight * e, totalH / 2 + 0.55 * e);
    const frontZ = style.depth + (style.lip ? 0.012 : 0);
    return { w, h, style, totalW, totalH, centerY, frontZ };
  }

  private makeCanvas(texture: THREE.Texture | null, w: number, h: number, y: number, z: number): THREE.Mesh {
    let material: THREE.Material;
    if (texture) {
      this.canvasMaterial = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color().setScalar(this.brightness) });
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
      this.holder.add(mesh);
      return mesh;
    };

    if (this.opts.pedestal) {
      this.buildPedestal(L, texture);
      this.object.updateMatrixWorld(true);
      return;
    }
    if (style.mount === 'record' || style.mount === 'book') {
      this.buildOnLedge(L, texture);
    } else {
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
        this.holder.add(mat);
      }
      this.holder.add(this.makeCanvas(texture, w, h, centerY, L.frontZ + 0.006));
      if (style.mount === 'clip') {
        // Affiche tenue par quatre pinces métalliques, qui mordent sur les coins.
        const cw = Math.min(0.05, w * 0.12), ch = 0.014;
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            const clip = new THREE.Mesh(m.unitBox, m.frameKinds.alu);
            clip.scale.set(cw, ch, 0.006);
            clip.position.set(sx * (w / 2 - cw / 2 + 0.004), centerY + sy * (h / 2 - ch / 2 + 0.004), L.frontZ + 0.009);
            this.holder.add(clip);
          }
        }
      }
    }

    // Pas de halo sur une cimaise (il déborderait au-dessus de la cloison), ni loin du mur.
    const onWall = ((this.preset.art.mount ?? 'mur') === 'mur' && !this.preset.art.rotations) || this.preset.art.mount === 'caisson';
    if (this.preset.lighting.artGlow > 0 && this.wallHeight > 3.2 && onWall && !this.slot.hangY) {
      // Halo additif sur le mur : simule un spot sans lumière dynamique.
      const glow = new THREE.Mesh(m.unitPlane, m.glow);
      const gw = totalW * 1.5 + 0.6;
      const gh = Math.max(totalH * 2.2, 2.2);
      glow.scale.set(gw, gh, 1);
      // Le point le plus lumineux (42 % du haut du halo) se trouve 35 cm au-dessus du cadre.
      glow.position.set(0, centerY + totalH / 2 + 0.35 - gh * 0.08, 0.012);
      glow.renderOrder = 1;
      this.holder.add(glow);
    }

    if (!this.slot.hangY) this.addCartel(L);
    this.applyMount(L);
    if (this.preset.art.rotations && (this.preset.art.mount ?? 'mur') === 'mur') {
      // Escher : un quart de tour au hasard, autour du centre de l'œuvre.
      const a = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      this.holder.rotation.z = a;
      this.holder.position.set(L.centerY * Math.sin(a), L.centerY - L.centerY * Math.cos(a), 0);
    }
    if (this.opts.upsideDown && (this.preset.art.mount ?? 'mur') === 'mur') {
      // Étrangeté : tête en bas (le cartel aussi).
      this.holder.position.y = 2 * L.centerY;
      this.holder.rotation.z = Math.PI;
    }
    this.object.updateMatrixWorld(true);
  }

  /** Dos du tableau en bois brut : un cadre vu de derrière (chevalet, flottant) n'est pas doré. */
  private addBackBoard(L: Layout): void {
    const board = new THREE.Mesh(this.mats.unitBox, this.mats.frameKinds.wood);
    board.scale.set(L.totalW - 0.01, L.totalH - 0.01, 0.006);
    board.position.set(0, L.centerY, -0.004);
    this.holder.add(board);
  }

  /**
   * Sculpture : socle blanc, photo debout dessus (visible des deux côtés), cartel sur la
   * face avant du socle. Pas de modèle 3D : la photo de musée tient lieu de volume.
   */
  private buildPedestal(L: Layout, texture: THREE.Texture | null): void {
    const m = this.mats;
    const ph = CONFIG.art.pedestalHeight, pd = CONFIG.art.pedestalDepth;
    // Une statuette de 15 cm serait invisible : la photo garde une présence (55 cm à 1,3 m).
    const k = Math.min(Math.max(1, 0.55 / L.h), 1.3 / L.h, 1.2 / L.w);
    L = { ...L, w: L.w * k, h: L.h * k };
    const pw = Math.max(pd, Math.min(L.w + 0.12, 1.1));
    const plinth = new THREE.Mesh(m.unitBox, m.frameKinds.white);
    plinth.scale.set(pw, ph, pd);
    plinth.position.set(0, ph / 2, 0);
    this.holder.add(plinth);
    // Tranche sombre entre les deux faces de la photo.
    const edge = new THREE.Mesh(m.unitBox, m.frameKinds.black);
    edge.scale.set(L.w + 0.02, L.h + 0.02, 0.012);
    edge.position.set(0, ph + L.h / 2 + 0.01, 0);
    this.holder.add(edge);
    const canvas = this.makeCanvas(texture, L.w, L.h, ph + L.h / 2 + 0.01, 0.0075);
    this.holder.add(canvas);
    const back = new THREE.Mesh(m.unitPlane, canvas.material);
    back.scale.set(L.w, L.h, 1);
    back.position.set(0, ph + L.h / 2 + 0.01, -0.0075);
    back.rotation.y = Math.PI;
    back.userData.artPiece = this;
    this.backMesh = back;
    this.holder.add(back);
    const plate = new THREE.Mesh(m.unitBox, m.cartelBlank);
    plate.scale.set(CARTEL_W, CARTEL_H, 0.008);
    plate.position.set(0, ph - CARTEL_H / 2 - 0.08, pd / 2 + 0.005);
    this.cartelMesh = plate;
    this.holder.add(plate);
  }

  /**
   * Support de l'ambiance : chevalet devant le mur, cadre flottant, posé au sol contre
   * le mur, ou caisson lumineux. (Les pochettes et les livres gardent leur tablette.)
   */
  private applyMount(L: Layout): void {
    const mount = this.preset.art.mount ?? 'mur';
    if (mount === 'mur' || L.style.mount === 'record' || L.style.mount === 'book') return;
    const m = this.mats;
    const bottom = L.centerY - L.totalH / 2;
    const top = L.centerY + L.totalH / 2;
    const bar = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0) => {
      const mesh = new THREE.Mesh(m.unitBox, mat);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      mesh.rotation.x = rx;
      this.object.add(mesh);
    };
    switch (mount) {
      case 'chevalet': {
        // Le tableau repose sur la traverse, devant les pieds et le mât, le tout incliné
        // vers l'arrière ; un montant arrière part du haut du chevalet jusqu'au sol.
        const z = CONFIG.art.easelDistance;
        const tilt = 0.1;
        this.holder.position.set(0, 0, z);
        this.holder.rotation.x = -tilt;
        const legTop = top + 0.18;
        const wood = m.frameKinds.wood;
        const half = Math.min(L.totalW / 2 - 0.05, 0.45);
        // Dans le repère incliné du tableau : pieds et mât juste derrière le dos du cadre.
        const back = -0.04;
        const inHolder = (sx: number, sy: number, sz: number, x: number, y: number, zz: number) => {
          const mesh = new THREE.Mesh(m.unitBox, wood);
          mesh.scale.set(sx, sy, sz);
          mesh.position.set(x, y, zz);
          this.holder.add(mesh);
        };
        for (const x of [-half, half]) inHolder(0.035, legTop, 0.035, x, legTop / 2, back);
        inHolder(0.04, legTop + 0.1, 0.035, 0, (legTop + 0.1) / 2, back);
        // Traverse qui porte le tableau (elle dépasse devant).
        inHolder(Math.max(L.totalW, 0.5) + 0.08, 0.04, 0.14, 0, bottom - 0.02, 0.02);
        // Montant arrière : du haut du mât (repère du tableau) jusqu'au sol, en arrière.
        const ty = legTop * 0.92;
        const topY = ty * Math.cos(tilt) + back * Math.sin(tilt);
        const topZ = z - ty * Math.sin(tilt) + back * Math.cos(tilt);
        const footZ = z - 0.75;
        const len = Math.hypot(topY, topZ - footZ);
        bar(wood, 0.035, len, 0.035, 0, topY / 2, (topZ + footZ) / 2, Math.atan2(topZ - footZ, topY));
        this.addBackBoard(L);
        break;
      }
      case 'flottant':
        this.holder.position.set(0, 0, CONFIG.art.floatDistance);
        this.addBackBoard(L);
        break;
      case 'sol': {
        // Posé par terre, appuyé contre le mur.
        const tilt = 0.12;
        this.holder.position.set(0, -bottom + 0.02, top * Math.sin(tilt) + 0.02);
        this.holder.rotation.x = -tilt;
        break;
      }
      case 'caisson': {
        // Caisson lumineux : coffre profond, liseré lumineux autour de l'image.
        bar(m.frameKinds.black, L.totalW + 0.05, L.totalH + 0.05, 0.12, 0, L.centerY, 0.06);
        const z = L.frontZ + 0.004;
        const t = 0.012;
        bar(m.lights, L.w + 2 * t, t, 0.004, 0, L.centerY + L.h / 2 + t / 2, z);
        bar(m.lights, L.w + 2 * t, t, 0.004, 0, L.centerY - L.h / 2 - t / 2, z);
        bar(m.lights, t, L.h, 0.004, L.w / 2 + t / 2, L.centerY, z);
        bar(m.lights, t, L.h, 0.004, -L.w / 2 - t / 2, L.centerY, z);
        break;
      }
    }
  }

  /**
   * Pochette de disque ou livre : posé sur une petite tablette, légèrement incliné contre
   * le mur. Le vinyle dépasse de sa pochette ; le livre montre la tranche de ses pages.
   */
  private buildOnLedge(L: Layout, texture: THREE.Texture | null): void {
    const { w, h, centerY } = L;
    const m = this.mats;
    const record = L.style.mount === 'record';
    const thickness = record ? 0.004 : L.style.depth;
    // Le vinyle dépasse à droite : on décale l'ensemble pour rester centré.
    const overhang = record ? w * 0.42 : 0;
    const x0 = -overhang / 2;
    const ledgeDepth = thickness + 0.09;
    const bottom = centerY - h / 2;

    const ledge = new THREE.Mesh(m.unitBox, m.frameKinds.wood);
    ledge.scale.set(w + overhang + 0.1, 0.022, ledgeDepth);
    ledge.position.set(0, bottom - 0.011, ledgeDepth / 2);
    this.holder.add(ledge);

    // Pivot au bas de l'objet, côté avant de la tablette ; le haut s'appuie vers le mur.
    const lean = new THREE.Group();
    lean.position.set(x0, bottom, ledgeDepth - 0.035);
    lean.rotation.x = -CONFIG.art.leanAngle;
    this.holder.add(lean);

    const body = new THREE.Mesh(m.unitBox, record ? m.frameKinds.white : m.mat);
    body.scale.set(w, h, thickness);
    body.position.set(0, h / 2, -thickness / 2);
    lean.add(body);
    if (record) {
      const disc = new THREE.Mesh(m.unitDisc, m.frameKinds.vinyl);
      disc.scale.set(w * 0.96, 0.002, w * 0.96);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(overhang, h / 2, -thickness - 0.003);
      lean.add(disc);
    } else {
      // Dos du livre : une bande sombre sur la tranche gauche.
      const spine = new THREE.Mesh(m.unitBox, m.frameKinds.black);
      spine.scale.set(0.006, h + 0.004, thickness + 0.004);
      spine.position.set(-w / 2 - 0.002, h / 2, -thickness / 2);
      lean.add(spine);
    }
    const cover = this.makeCanvas(texture, w, h, h / 2, 0.0015);
    lean.add(cover);
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
    this.holder.add(plate);
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
    if (!this.opts.borrowed) this.baseTexture?.dispose();
    this.baseTexture = null;
    this.canvasMesh = null;
    this.backMesh = null;
    this.cartelMesh = null;
    this.holder.clear();
    this.holder.position.set(0, 0, 0);
    this.holder.rotation.set(0, 0, 0);
    this.object.clear();
    this.object.add(this.holder);
  }
}
