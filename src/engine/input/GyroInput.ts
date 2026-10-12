import * as THREE from 'three';
import type { InputState } from './InputState';

/**
 * Regarder en bougeant le téléphone (option) : l'orientation de l'appareil est convertie
 * en direction de regard, et ses variations s'ajoutent au regard tactile (on peut donc
 * toujours recadrer au doigt). La méthode suit celle de DeviceOrientationControls (three.js).
 */
export class GyroInput {
  private readonly q = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly zee = new THREE.Vector3(0, 0, 1);
  private readonly q0 = new THREE.Quaternion();
  // La caméra regarde le long de -Z ; l'appareil, à plat, regarde vers le bas : quart de tour.
  private readonly q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  private readonly v = new THREE.Vector3();
  private last: { yaw: number; pitch: number } | null = null;
  private enabled = false;
  /** En pause (menu, fiche) : on ignore l'appareil, et on repart de sa position à la reprise. */
  paused = false;

  constructor(private readonly input: InputState) {}

  /** iOS exige une autorisation, demandée pendant un geste du visiteur. */
  static async requestPermission(): Promise<boolean> {
    const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (!D) return false;
    if (typeof D.requestPermission !== 'function') return true;
    try {
      return (await D.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  static get supported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.last = null;
    if (on) window.addEventListener('deviceorientation', this.onOrientation);
    else window.removeEventListener('deviceorientation', this.onOrientation);
  }

  dispose(): void {
    this.setEnabled(false);
  }

  private readonly onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    if (this.paused) {
      this.last = null;
      return;
    }
    const rad = Math.PI / 180;
    const orient = (screen.orientation?.angle ?? 0) * rad;
    this.euler.set(e.beta * rad, e.alpha * rad, -e.gamma * rad, 'YXZ');
    this.q.setFromEuler(this.euler).multiply(this.q1).multiply(this.q0.setFromAxisAngle(this.zee, -orient));
    this.v.set(0, 0, -1).applyQuaternion(this.q);
    // Même convention que le joueur : l'avant au sol est (-sin(yaw), -cos(yaw)).
    const cur = { yaw: Math.atan2(-this.v.x, -this.v.z), pitch: Math.asin(Math.max(-1, Math.min(1, this.v.y))) };
    if (this.last) {
      let dy = cur.yaw - this.last.yaw;
      if (dy > Math.PI) dy -= 2 * Math.PI;
      if (dy < -Math.PI) dy += 2 * Math.PI;
      // Près de la verticale, le cap devient instable : on ignore les sauts.
      if (Math.abs(dy) < 0.5) this.input.lookYaw += dy;
      this.input.lookPitch += cur.pitch - this.last.pitch;
    }
    this.last = cur;
  };
}
