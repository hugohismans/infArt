import { CONFIG } from '../config';

export type QualityLevel = keyof typeof CONFIG.quality.levels;
export type QualitySetting = QualityLevel | 'auto';

/** Niveau de départ selon l'appareil (mémoire, cœurs, écran tactile). */
export function detectQuality(mobile: boolean): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  if (memory <= 2 || cores <= 2) return 'bas';
  if (mobile || memory <= 4 || cores <= 4) return 'moyen';
  return 'haut';
}

/**
 * Qualité adaptative : fixe la résolution de rendu et la densité des particules.
 * En mode auto, la résolution suit les fps mesurés : elle baisse par paliers quand
 * l'appareil peine, et remonte (jusqu'au plafond du niveau) quand il a de la marge.
 */
export class QualityGovernor {
  level: QualityLevel;
  pixelRatio: number;
  private auto: boolean;
  private frames = 0;
  private time = 0;
  /** Fenêtres consécutives avec beaucoup de marge (on remonte prudemment). */
  private calm = 0;

  constructor(
    setting: QualitySetting,
    private readonly mobile: boolean,
    private readonly apply: (pixelRatio: number, particles: number) => void,
  ) {
    this.auto = setting === 'auto';
    this.level = setting === 'auto' ? detectQuality(mobile) : setting;
    this.pixelRatio = this.maxRatio;
    this.push();
  }

  get setting(): QualitySetting {
    return this.auto ? 'auto' : this.level;
  }

  set(setting: QualitySetting): void {
    this.auto = setting === 'auto';
    this.level = setting === 'auto' ? detectQuality(this.mobile) : setting;
    this.pixelRatio = this.maxRatio;
    this.calm = 0;
    this.push();
  }

  /** À chaque image (temps réel, en s). */
  update(realDt: number): void {
    if (!this.auto) return;
    this.frames++;
    this.time += realDt;
    const q = CONFIG.quality;
    if (this.time < q.window) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    const target = q.targetFps[this.mobile ? 'mobile' : 'desktop'];
    if (fps < target * 0.9 && this.pixelRatio > q.minPixelRatio) {
      this.pixelRatio = Math.max(q.minPixelRatio, this.pixelRatio - q.pixelRatioStep);
      this.calm = 0;
      this.push();
    } else if (fps > target * 1.2 && this.pixelRatio < this.maxRatio) {
      // Trois mesures confortables d'affilée avant de remonter : pas de va-et-vient.
      if (++this.calm >= 3) {
        this.pixelRatio = Math.min(this.maxRatio, this.pixelRatio + q.pixelRatioStep);
        this.calm = 0;
        this.push();
      }
    } else this.calm = 0;
  }

  private get maxRatio(): number {
    return Math.min(window.devicePixelRatio || 1, CONFIG.quality.levels[this.level].pixelRatio);
  }

  private push(): void {
    this.apply(this.pixelRatio, CONFIG.quality.levels[this.level].particles);
  }
}
