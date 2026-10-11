import { CONFIG } from '../../config';
import type { InputState } from './InputState';

/**
 * Souris : « pointer lock » au clic sur le canvas. Si le verrouillage est refusé,
 * on se rabat sur un glisser-pour-regarder.
 */
export class MouseInput {
  private dragging = false;
  enabled = true;
  /** Appelé quand le verrouillage est perdu (Échap) : le jeu ouvre le menu. */
  onUnlock: (() => void) | null = null;

  private readonly onMove = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (document.pointerLockElement === this.element || this.dragging) {
      const s = CONFIG.look.mouseSensitivity;
      this.state.lookYaw -= e.movementX * s;
      this.state.lookPitch -= e.movementY * s * (CONFIG.look.invertY ? -1 : 1);
    }
  };
  private readonly onDown = (e: PointerEvent) => {
    if (!this.enabled || e.pointerType === 'touch') return;
    if (document.pointerLockElement !== this.element) {
      this.lock();
      this.dragging = true;
    }
  };
  private readonly onUp = () => (this.dragging = false);
  private readonly onLockChange = () => {
    if (document.pointerLockElement !== this.element) {
      this.dragging = false;
      if (this.wasLocked) this.onUnlock?.();
      this.wasLocked = false;
    } else {
      this.wasLocked = true;
      this.dragging = false;
    }
  };
  private wasLocked = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly state: InputState,
  ) {
    element.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('mousemove', this.onMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  lock(): void {
    if (!this.element.requestPointerLock) return;
    try {
      const r = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      // Chrome renvoie une promesse qui échoue si on re-verrouille trop vite après Échap.
      r?.catch?.(() => undefined);
    } catch {
      /* verrouillage indisponible : le glisser-pour-regarder prend le relais */
    }
  }

  unlock(): void {
    this.wasLocked = false;
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  dispose(): void {
    this.unlock();
    this.element.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }
}
