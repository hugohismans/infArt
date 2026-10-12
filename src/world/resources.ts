import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { Rng } from './random';
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
  structure: THREE.MeshLambertMaterial;
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
}

export type FrameMaterialKey = 'gold' | 'goldDark' | 'wood' | 'black' | 'white';

interface Counted<T> {
  value: T;
  refs: number;
}

function makeParquetTexture(preset: AmbiancePreset): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new Rng('parquet', preset.id);
  const base = new THREE.Color(preset.palette.floor);
  const alt = new THREE.Color(preset.palette.floorAlt);
  // Lames de parquet en quinconce.
  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rng.range(0, size / 2);
    while (x < size) {
      const w = rng.range(size * 0.35, size * 0.7);
      const c = base.clone().lerp(alt, rng.next()).multiplyScalar(rng.range(0.88, 1.08));
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(x, r * rowH, w, rowH);
      // Veinage discret.
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#000';
      for (let k = 0; k < 4; k++) ctx.fillRect(x, r * rowH + rng.range(2, rowH - 2), w, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, r * rowH, 1.5, rowH);
      x += w;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, r * rowH, size, 1.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Halo d'un spot : une tache de lumière plus intense en haut, qui s'évase vers le bas. */
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

function makeGlowTexture(): THREE.CanvasTexture {
  const w = 64, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(w / 2, h * 0.3);
  ctx.scale(1, 1.9);
  const r = w / 2;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -h, w, h * 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ResourceCache {
  private presets = new Map<string, Counted<PresetMaterials>>();
  private geometries = new Map<string, Counted<ModuleGeometries>>();

  acquireMaterials(preset: AmbiancePreset): PresetMaterials {
    let entry = this.presets.get(preset.id);
    if (!entry) {
      const pal = preset.palette;
      const glowTex = makeGlowTexture();
      entry = {
        refs: 0,
        value: {
          structure: new THREE.MeshLambertMaterial({ vertexColors: true }),
          floor: new THREE.MeshLambertMaterial({ map: makeParquetTexture(preset) }),
          lights: new THREE.MeshBasicMaterial({ color: pal.lightStrip }),
          frames: pal.frame.map((c) => new THREE.MeshLambertMaterial({ color: c })),
          frameKinds: {
            gold: new THREE.MeshLambertMaterial({ color: '#c49a3e', emissive: '#3a2808' }),
            goldDark: new THREE.MeshLambertMaterial({ color: '#8c6a24', emissive: '#1e1404' }),
            wood: new THREE.MeshLambertMaterial({ color: '#4a3320' }),
            black: new THREE.MeshLambertMaterial({ color: '#1a1816' }),
            white: new THREE.MeshLambertMaterial({ color: '#ebe7df' }),
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
    m.glow.map?.dispose();
    m.drape.map?.dispose();
    for (const mat of [m.structure, m.floor, m.lights, m.glow, m.mat, m.drape, m.cartelBlank, ...m.frames, ...Object.values(m.frameKinds)]) mat.dispose();
    m.unitBox.dispose();
    m.unitPlane.dispose();
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
    entry.value.structure?.dispose();
    entry.value.floor?.dispose();
    entry.value.lights?.dispose();
    this.geometries.delete(key);
  }

  /** Statistiques pour le panneau de debug. */
  stats(): { presets: number; moduleGeometries: number } {
    return { presets: this.presets.size, moduleGeometries: this.geometries.size };
  }
}
