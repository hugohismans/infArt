import * as THREE from 'three';
import { CONFIG } from '../config';

export interface LoadedImage {
  texture: THREE.Texture;
  /** Dimensions de l'image d'origine (avant réduction). */
  naturalWidth: number;
  naturalHeight: number;
}

interface Job {
  urls: string[];
  maxSize: number;
  priority: number;
  resolve: (img: LoadedImage) => void;
  reject: (e: Error) => void;
  cancelled: boolean;
}

/** Octets GPU estimés (mipmaps comprises) d'une texture créée ici. */
export function textureBytes(t: THREE.Texture): number {
  const ud = t.userData as { bytes?: number };
  return ud.bytes ?? 0;
}

/**
 * Chargement d'images en file d'attente (nombre de téléchargements simultanés limité,
 * priorités), avec essais successifs (direct puis relais) et réduction à la taille utile.
 *
 * L'image est redessinée sur un canvas à la taille voulue ; une fois la texture envoyée
 * au GPU, le canvas est vidé pour ne pas garder une seconde copie en mémoire vive.
 */
export class ImageLoader {
  private queue: Job[] = [];
  private active = 0;
  /** Mémoire GPU estimée des textures vivantes créées par ce chargeur. */
  liveBytes = 0;
  liveTextures = 0;
  failures = 0;

  constructor(private readonly maxConcurrent = CONFIG.art.maxConcurrentLoads) {}

  /** Charge la première URL qui fonctionne. `priority` : plus petit = plus urgent. */
  load(urls: string[], maxSize: number, priority = 10): { promise: Promise<LoadedImage>; cancel: () => void } {
    let job!: Job;
    const promise = new Promise<LoadedImage>((resolve, reject) => {
      job = { urls, maxSize, priority, resolve, reject, cancelled: false };
    });
    this.queue.push(job);
    this.queue.sort((a, b) => a.priority - b.priority);
    this.pump();
    return {
      promise,
      cancel: () => {
        job.cancelled = true;
      },
    };
  }

  get pending(): number {
    return this.queue.length + this.active;
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
      if (job.cancelled) {
        job.reject(new Error('annulé'));
        continue;
      }
      this.active++;
      this.run(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async run(job: Job): Promise<void> {
    let lastError: Error = new Error('aucune URL');
    for (const url of job.urls) {
      if (job.cancelled) break;
      try {
        // Décodage et réduction hors du fil principal quand le navigateur le permet (téléphones).
        const img = BITMAPS ? await loadBitmap(url, job.maxSize, CONFIG.art.loadTimeoutMs) : await loadImage(url, CONFIG.art.loadTimeoutMs);
        if (job.cancelled) {
          if ('close' in img.source) img.source.close();
          break;
        }
        job.resolve(this.toTexture(img, job.maxSize));
        return;
      } catch (e) {
        lastError = e as Error;
      }
    }
    this.failures++;
    job.reject(job.cancelled ? new Error('annulé') : lastError);
  }

  private toTexture(img: Decoded, maxSize: number): LoadedImage {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const scale = Math.min(1, maxSize / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, 0, 0, w, h);
    if ('close' in img.source) img.source.close();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const bytes = Math.round(w * h * 4 * 1.33);
    texture.userData = { bytes };
    // Après l'envoi au GPU, on vide le canvas : la texture reste en mémoire vidéo.
    texture.onUpdate = () => {
      canvas.width = 1;
      canvas.height = 1;
      texture.onUpdate = null;
    };
    this.liveBytes += bytes;
    this.liveTextures++;
    texture.addEventListener('dispose', () => {
      this.liveBytes -= bytes;
      this.liveTextures--;
    });
    return { texture, naturalWidth: nw, naturalHeight: nh };
  }
}

/** Image décodée : la source à dessiner (déjà réduite si possible) et ses dimensions d'origine. */
interface Decoded {
  source: HTMLImageElement | ImageBitmap;
  naturalWidth: number;
  naturalHeight: number;
}

const BITMAPS = typeof createImageBitmap === 'function' && typeof AbortController === 'function';

/**
 * Téléchargement, puis décodage et réduction par le navigateur en tâche de fond
 * (createImageBitmap) : le fil principal ne fait plus que poser une petite image.
 */
async function loadBitmap(url: string, maxSize: number, timeoutMs: number): Promise<Decoded> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: 'cors', signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith('image/') && blob.type !== '' && blob.type !== 'application/octet-stream') throw new Error(`pas une image (${blob.type})`);
    const full = await createImageBitmap(blob);
    const nw = full.width, nh = full.height;
    const scale = Math.min(1, maxSize / Math.max(nw, nh));
    if (scale >= 1) return { source: full, naturalWidth: nw, naturalHeight: nh };
    try {
      const small = await createImageBitmap(full, { resizeWidth: Math.max(1, Math.round(nw * scale)), resizeHeight: Math.max(1, Math.round(nh * scale)), resizeQuality: 'high' });
      full.close();
      return { source: small, naturalWidth: nw, naturalHeight: nh };
    } catch {
      // (Réduction non prise en charge : la toile la fera.)
      return { source: full, naturalWidth: nw, naturalHeight: nh };
    }
  } catch (e) {
    throw new Error(`chargement impossible : ${url} (${(e as Error).message})`);
  } finally {
    clearTimeout(timer);
  }
}

function loadImage(url: string, timeoutMs: number): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`délai dépassé : ${url}`));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      // decode() évite un décodage synchrone au moment de l'envoi au GPU.
      const done = () => resolve({ source: img, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
      img.decode().then(done, done);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`chargement impossible : ${url}`));
    };
    img.src = url;
  });
}
