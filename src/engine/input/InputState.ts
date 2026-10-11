/** État d'entrée agrégé (clavier, souris, tactile), consommé par le joueur à chaque frame. */
export class InputState {
  /** Avance (+1) / recule (-1). */
  forward = 0;
  /** Pas de côté : +1 = droite. */
  strafe = 0;
  /** Rotation continue au clavier (flèches gauche/droite), en -1..1. */
  turn = 0;
  run = false;
  /** Rotations accumulées depuis la dernière frame (radians). */
  lookYaw = 0;
  lookPitch = 0;

  /** Vrai si l'utilisateur demande activement un déplacement (coupe l'auto-marche). */
  get hasMoveIntent(): boolean {
    return Math.abs(this.forward) > 0.05 || Math.abs(this.strafe) > 0.05;
  }

  consumeLook(): { yaw: number; pitch: number } {
    const out = { yaw: this.lookYaw, pitch: this.lookPitch };
    this.lookYaw = 0;
    this.lookPitch = 0;
    return out;
  }
}
