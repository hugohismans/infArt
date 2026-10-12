import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { Rng } from './random';
import { makeCeilingTexture, makeFloorTexture, makeWallTexture } from './textures';
import { buildModuleGeometries, type ModuleGeometries } from './modules/build';
import type { ModuleDef } from './modules/defs';

/**
 * Ressources partagées (géométries, matériaux, textures communes) avec compteur
 * de références : elles sont créées à la première utilisation et libérées
 * (`dispose()`) quand plus aucun module ne s'en sert.
 *
 * Seules les ressources propres à une œuvre (sa texture, son matériau) sont
 * détenues par le module lui-même.
 */

export interface PresetMaterials {
  /** Murs (couleurs par sommet, motif éventuel : papier peint). */
  walls: THREE.MeshLambertMaterial;
  /** Plinthes, corniches, obstacles (couleurs par sommet). */
  trims: THREE.MeshLambertMaterial;
  /** Plafond (dalles, verrière lumineuse…). */
  ceiling: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
  floor: THREE.MeshLambertMaterial;
  lights: THREE.MeshBasicMaterial;
  /** Couleurs de cadres du preset (œuvres factices du mode hors ligne). */
  frames: THREE.MeshLambertMaterial[];
  /** Cadres des vraies œuvres, par style (voir art/frames.ts). */
  frameKinds: Record<FrameMaterialKey, THREE.MeshLambertMaterial>;
  /** Passe-partout. */
  mat: THREE.MeshLambertMaterial;
  /** Drap posé sur une toile dont l'image n'est pas encore arrivée. */
  drape: THREE.MeshLambertMaterial;
  /** Plaque de cartel vierge (avant que le texte soit généré, ou de loin). */
  cartelBlank: THREE.MeshLambertMaterial;
  glow: THREE.MeshBasicMaterial;
  /** Géométries unitaires partagées pour les œuvres (mises à l'échelle par mesh). */
  unitBox: THREE.BoxGeometry;
  unitPlane: THREE.PlaneGeometry;
  /** Disque de rayon 0,5 et d'épaisseur 1 (vinyles). */
  unitDisc: THREE.CylinderGeometry;
}

export type FrameMaterialKey = 'gold' | 'goldDark' | 'wood' | 'black' | 'white' | 'alu' | 'vinyl';

interface Counted<T> {
  value: T;
  refs: number;
}

interface PresetEntry extends Counted<PresetMaterials> {
  preset: AmbiancePreset;
  /** Néons : temps restant de la baisse de tension en cours (s). */
  dip: number;
  baseLight: THREE.Color;
}

/** Drap à plis verticaux (toile couverte, « œuvre en restauration »). */
function makeDrapeTexture(): THREE.CanvasTexture {
  const w = 128, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rng = new Rng('drap');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  let x = 0;
  while (x <= 1) {
    const l = Math.round(rng.range(178, 228));
    g.addColorStop(x, `rgb(${l},${l - 4},${l - 12})`);
    x += rng.range(0.05, 0.14);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Ombre douce en bas, là où le tissu retombe.
  const shade = ctx.createLinearGradient(0, h * 0.7, 0, h);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Halo d'un spot : tache de lumière plus intense en haut, qui s'évase vers le bas.
 *
 * Calculée pixel par pixel plutôt que dessinée avec un dégradé du canvas : Safari
 * ajoute du bruit (tramage) aux dégradés semi-transparents, ce qui donnait des
 * confettis colorés sur iPhone. L'intensité est codée dans la couleur (opaque) et
 * ajoutée au mur par mélange additif.
 */
function makeGlowTexture(): THREE.DataTexture {
  const w = 64, h = 128;
  const data = new Uint8Array(w * h * 4);
  // Décroissance douce jusqu'à zéro (pente nulle au bord) : aucun contour visible.
  const profile = (d: number): number => (d >= 1 ? 0 : 0.8 * Math.pow(1 - d * d, 2.2));
  const r = w / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // La ligne 0 d'une DataTexture est en BAS de l'image. Centre à 42 % du haut et
      // ellipse étirée ×1,6 : elle tient entière dans la texture (aucun bord coupé).
      const dx = x + 0.5 - w / 2;
      const dy = (h - 1 - y + 0.5 - h * 0.42) / 1.6;
      const v = Math.round(255 * profile(Math.hypot(dx, dy) / r));
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export class ResourceCache {
  private presets = new Map<string, PresetEntry>();
  private geometries = new Map<string, Counted<ModuleGeometries>>();

  acquireMaterials(preset: AmbiancePreset): PresetMaterials {
    let entry = this.presets.get(preset.id);
    if (!entry) {
      const pal = preset.palette;
      const glowTex = makeGlowTexture();
      entry = {
        refs: 0,
        preset,
        dip: 0,
        baseLight: new THREE.Color(pal.lightStrip),
        value: {
          walls: new THREE.MeshLambertMaterial({ vertexColors: true, map: makeWallTexture(preset) }),
          trims: new THREE.MeshLambertMaterial({ vertexColors: true }),
          // La verrière laisse passer le jour : elle n'est pas éclairée, elle éclaire.
          ceiling:
            preset.surfaces.ceiling === 'verriere'
              ? new THREE.MeshBasicMaterial({ vertexColors: true, map: makeCeilingTexture(preset) })
              : new THREE.MeshLambertMaterial({ vertexColors: true, map: makeCeilingTexture(preset) }),
          floor: new THREE.MeshLambertMaterial({ map: makeFloorTexture(preset) }),
          lights: new THREE.MeshBasicMaterial({ color: pal.lightStrip }),
          frames: pal.frame.map((c) => new THREE.MeshLambertMaterial({ color: c })),
          frameKinds: {
            gold: new THREE.MeshLambertMaterial({ color: '#c49a3e', emissive: '#3a2808' }),
            goldDark: new THREE.MeshLambertMaterial({ color: '#8c6a24', emissive: '#1e1404' }),
            wood: new THREE.MeshLambertMaterial({ color: '#4a3320' }),
            black: new THREE.MeshLambertMaterial({ color: '#1a1816' }),
            white: new THREE.MeshLambertMaterial({ color: '#ebe7df' }),
            alu: new THREE.MeshLambertMaterial({ color: '#b9bcc1', emissive: '#1c1d20' }),
            vinyl: new THREE.MeshLambertMaterial({ color: '#111113' }),
          },
          mat: new THREE.MeshLambertMaterial({ color: '#f3eee3' }),
          drape: new THREE.MeshLambertMaterial({ map: makeDrapeTexture() }),
          cartelBlank: new THREE.MeshLambertMaterial({ color: '#efe9dc' }),
          glow: new THREE.MeshBasicMaterial({
            map: glowTex,
            color: pal.lightStrip,
            transparent: true,
            opacity: preset.lighting.artGlow,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            // Toujours devant le mur qu'il éclaire, même avec une précision de profondeur faible (mobiles).
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -4,
          }),
          unitBox: new THREE.BoxGeometry(1, 1, 1),
          unitPlane: new THREE.PlaneGeometry(1, 1),
          unitDisc: new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
        },
      };
      this.presets.set(preset.id, entry);
    }
    entry.refs++;
    return entry.value;
  }

  releaseMaterials(preset: AmbiancePreset): void {
    const entry = this.presets.get(preset.id);
    if (!entry) return;
    if (--entry.refs > 0) return;
    const m = entry.value;
    m.floor.map?.dispose();
    m.walls.map?.dispose();
    m.ceiling.map?.dispose();
    m.glow.map?.dispose();
    m.drape.map?.dispose();
    for (const mat of [m.walls, m.trims, m.ceiling, m.floor, m.lights, m.glow, m.mat, m.drape, m.cartelBlank, ...m.frames, ...Object.values(m.frameKinds)]) mat.dispose();
    m.unitBox.dispose();
    m.unitPlane.dispose();
    m.unitDisc.dispose();
    this.presets.delete(preset.id);
  }

  acquireGeometries(def: ModuleDef, preset: AmbiancePreset): ModuleGeometries {
    const key = `${preset.id}:${def.id}`;
    let entry = this.geometries.get(key);
    if (!entry) {
      entry = { refs: 0, value: buildModuleGeometries(def, preset) };
      this.geometries.set(key, entry);
    }
    entry.refs++;
    return entry.value;
  }

  releaseGeometries(def: ModuleDef, preset: AmbiancePreset): void {
    const key = `${preset.id}:${def.id}`;
    const entry = this.geometries.get(key);
    if (!entry) return;
    if (--entry.refs > 0) return;
    entry.value.walls?.dispose();
    entry.value.trims?.dispose();
    entry.value.ceiling?.dispose();
    entry.value.floor?.dispose();
    entry.value.lights?.dispose();
    this.geometries.delete(key);
  }

  /**
   * Néons qui grésillent : de brèves baisses de tension, aléatoires, sur les ambiances
   * dont `lighting.flicker` > 0 (tous les modules de l'ambiance vacillent ensemble).
   */
  animate(dt: number): void {
    for (const e of this.presets.values()) {
      const f = e.preset.lighting.flicker;
      if (f <= 0) continue;
      if (e.dip > 0) e.dip -= dt;
      else if (Math.random() < f * dt * 60) e.dip = 0.04 + Math.random() * 0.18;
      e.value.lights.color.copy(e.baseLight).multiplyScalar(e.dip > 0 ? 0.25 + Math.random() * 0.3 : 1);
    }
  }

  /** Statistiques pour le panneau de debug. */
  stats(): { presets: number; moduleGeometries: number } {
    return { presets: this.presets.size, moduleGeometries: this.geometries.size };
  }
}
