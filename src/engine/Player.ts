import { CONFIG } from '../config';
import type { Segment, Vec2 } from '../world/math2d';
import { moveWithCollisions } from './collision';

const DEG = Math.PI / 180;

/**
 * Le visiteur : position au sol, orientation (lacet / tangage), vitesse lissée
 * et balancement de tête.
 * Convention : yaw = rotation.y de la caméra ; la caméra regarde vers -Z local,
 * donc la direction avant au sol est (-sin(yaw), -cos(yaw)).
 */
export class Player {
  position: Vec2 = { x: 0, z: 0 };
  /** Hauteur du sol sous les pieds (escaliers, étages), lissée. */
  floorY = 0;
  yaw = 0;
  pitch = 0;
  private velocity: Vec2 = { x: 0, z: 0 };
  private bobDistance = 0;
  private bobAmount = 0;
  /** Option « réduire les mouvements » : coupe le balancement de tête. */
  reduceMotion = false;

  get forwardDir(): Vec2 {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Hauteur des yeux, balancement compris. */
  /** Nombre de demi-foulées parcourues (un pas sonore à chaque incrément). */
  get steps(): number {
    return Math.floor(this.bobDistance / (CONFIG.headBob.strideLength / 2));
  }

  get eyeY(): number {
    if (this.reduceMotion || !CONFIG.headBob.enabled) return CONFIG.player.eyeHeight;
    const phase = (this.bobDistance / CONFIG.headBob.strideLength) * Math.PI * 2;
    // Un creux à chaque pas (deux pas par foulée).
    return CONFIG.player.eyeHeight - CONFIG.headBob.amplitude * this.bobAmount * Math.abs(Math.sin(phase));
  }

  /**
   * @param move vecteur souhaité en repère joueur (x = droite, z = avant), longueur ≤ 1
   * @param speed vitesse cible (m/s)
   */
  update(dt: number, move: { strafe: number; forward: number }, speed: number, walls: readonly Segment[]): void {
    const f = this.forwardDir;
    const right = { x: -f.z, z: f.x };
    let mx = right.x * move.strafe + f.x * move.forward;
    let mz = right.z * move.strafe + f.z * move.forward;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const target = { x: mx * speed, z: mz * speed };
    // Lissage exponentiel de la vitesse (démarrage et arrêt doux).
    if (!(dt > 0)) return;
    const k = 1 - Math.exp(-dt / CONFIG.player.acceleration);
    this.velocity.x += (target.x - this.velocity.x) * k;
    this.velocity.z += (target.z - this.velocity.z) * k;
    // Garde-fou : jamais plus vite que la course.
    const v = Math.hypot(this.velocity.x, this.velocity.z);
    if (v > CONFIG.player.runSpeed) {
      this.velocity.x *= CONFIG.player.runSpeed / v;
      this.velocity.z *= CONFIG.player.runSpeed / v;
    }

    const before = this.position;
    this.position = moveWithCollisions(before, { x: this.velocity.x * dt, z: this.velocity.z * dt }, CONFIG.player.radius, walls);
    const moved = Math.hypot(this.position.x - before.x, this.position.z - before.z);
    this.bobDistance += moved;
    const bobTarget = Math.min(1, this.speed / CONFIG.player.walkSpeed);
    this.bobAmount += (bobTarget - this.bobAmount) * Math.min(1, dt * 6);
  }

  applyLook(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    const max = CONFIG.camera.maxPitch * DEG;
    this.pitch = Math.max(-max, Math.min(max, this.pitch + dPitch));
  }
}
