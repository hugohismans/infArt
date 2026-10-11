import { CONFIG } from '../../config';
import type { InputState } from './InputState';

/**
 * Tactile : joystick virtuel dynamique sur la moitié gauche de l'écran
 * (il apparaît là où le doigt se pose), glisser sur la moitié droite pour regarder.
 */
export class TouchInput {
  enabled = true;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  private readonly onDown = (e: PointerEvent) => {
    if (!this.enabled || e.pointerType !== 'touch') return;
    const leftSide = e.clientX < window.innerWidth / 2;
    if (leftSide && this.joyId === null) {
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.showJoystick(e.clientX, e.clientY);
    } else if (!leftSide && this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  };

  private readonly onMove = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) {
      const r = CONFIG.touch.joystickRadius;
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > r) {
        dx = (dx / len) * r;
        dy = (dy / len) * r;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / r, ny = dy / r;
      const mag = Math.hypot(nx, ny);
      const dz = CONFIG.touch.joystickDeadZone;
      const k = mag < dz ? 0 : (mag - dz) / (1 - dz) / (mag || 1);
      this.state.strafe = nx * k;
      this.state.forward = -ny * k;
      // Pousser le joystick au bout = marcher plus vite.
      this.state.run = mag > 0.97;
    } else if (e.pointerId === this.lookId) {
      const s = CONFIG.look.touchSensitivity;
      this.state.lookYaw -= (e.clientX - this.lookLast.x) * s;
      this.state.lookPitch -= (e.clientY - this.lookLast.y) * s * (CONFIG.look.invertY ? -1 : 1);
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  };

  private readonly onUp = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.state.forward = 0;
      this.state.strafe = 0;
      this.state.run = false;
      this.hideJoystick();
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  };

  constructor(
    private readonly element: HTMLElement,
    private readonly state: InputState,
    overlay: HTMLElement,
  ) {
    this.base = document.createElement('div');
    this.base.className = 'joystick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    overlay.appendChild(this.base);
    this.hideJoystick();

    element.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  private showJoystick(x: number, y: number): void {
    const r = CONFIG.touch.joystickRadius;
    this.base.style.display = 'block';
    this.base.style.left = `${x - r}px`;
    this.base.style.top = `${y - r}px`;
    this.base.style.width = this.base.style.height = `${r * 2}px`;
    this.knob.style.transform = 'translate(0px, 0px)';
  }

  private hideJoystick(): void {
    this.base.style.display = 'none';
  }

  reset(): void {
    this.joyId = null;
    this.lookId = null;
    this.hideJoystick();
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.base.remove();
  }
}
