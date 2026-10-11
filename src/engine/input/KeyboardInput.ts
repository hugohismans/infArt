import type { InputState } from './InputState';

/**
 * Clavier. On lit `KeyboardEvent.code`, qui désigne la position PHYSIQUE de la touche :
 * KeyW/KeyA/KeyS/KeyD correspondent à ZQSD sur un clavier AZERTY et à WASD en QWERTY,
 * sans aucune détection de disposition.
 * Flèches haut/bas : avancer/reculer ; flèches gauche/droite : tourner la tête
 * (pratique sans souris).
 */
export class KeyboardInput {
  private pressed = new Set<string>();
  private readonly onDown = (e: KeyboardEvent) => this.handle(e, true);
  private readonly onUp = (e: KeyboardEvent) => this.handle(e, false);
  private readonly onBlur = () => this.pressed.clear();

  constructor(private readonly state: InputState) {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Touches gérées par le jeu (on bloque leur comportement par défaut, ex. défilement). */
  private static readonly CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight',
  ]);

  enabled = true;

  private handle(e: KeyboardEvent, down: boolean): void {
    if (!KeyboardInput.CODES.has(e.code)) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (down) this.pressed.add(e.code);
    else this.pressed.delete(e.code);
    if (this.enabled) e.preventDefault();
    this.sync();
  }

  private sync(): void {
    const p = (c: string) => (this.enabled && this.pressed.has(c) ? 1 : 0);
    this.state.forward = p('KeyW') + p('ArrowUp') > 0 ? 1 : p('KeyS') + p('ArrowDown') > 0 ? -1 : 0;
    this.state.strafe = Math.sign(p('KeyD') - p('KeyA'));
    this.state.turn = Math.sign(p('ArrowRight') - p('ArrowLeft'));
    this.state.run = p('ShiftLeft') + p('ShiftRight') > 0;
  }

  reset(): void {
    this.pressed.clear();
    this.sync();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
