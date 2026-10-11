import { CONFIG } from '../config';
import { dist, type Vec2 } from '../world/math2d';
import { Rng } from '../world/random';
import type { World } from '../world/World';
import type { WorldModule } from '../world/WorldModule';
import type { Player } from './Player';

const DEG = Math.PI / 180;

/**
 * Marche contemplative automatique : le visiteur avance seul, suit les couloirs
 * et choisit les embranchements au hasard. Fait demi-tour dans les impasses.
 */
export class AutoWalk {
  private module: WorldModule | null = null;
  private previous: WorldModule | null = null;
  private targets: Vec2[] = [];
  private exitIndex = -1;
  private rng: Rng;

  constructor(
    private readonly world: World,
    seed: string,
  ) {
    this.rng = new Rng(seed, 'autowalk');
  }

  /** Recentrage de l'origine : les points de passage suivent le monde. */
  shift(dx: number, dz: number): void {
    for (const t of this.targets) {
      t.x += dx;
      t.z += dz;
    }
  }

  reset(): void {
    this.module = null;
    this.previous = null;
    this.targets = [];
    this.exitIndex = -1;
  }

  /** Calcule la commande de la frame : rotation à appliquer et vitesse d'avance (0..1). */
  step(player: Player, dt: number): { dYaw: number; dPitch: number; forward: number } {
    const cur = this.world.currentModule;
    if (cur && cur !== this.module) {
      this.previous = this.module;
      this.module = cur;
      this.plan(cur, player);
    }

    // La sortie choisie s'est révélée être une impasse : on change d'avis.
    if (this.module && this.module.connectors[this.exitIndex]?.neighbor?.module.def.kind === 'cap') {
      this.plan(this.module, player);
    }

    // Avance dans la liste de points de passage.
    while (this.targets.length > 0 && dist(player.position, this.targets[0]!) < 0.7) this.targets.shift();
    if (this.targets.length === 0 && this.module) this.plan(this.module, player);
    const target = this.targets[0];
    if (!target) return { dYaw: 0, dPitch: -player.pitch * Math.min(1, dt * 2), forward: 0 };

    const dir = { x: target.x - player.position.x, z: target.z - player.position.z };
    const desiredYaw = Math.atan2(-dir.x, -dir.z);
    let diff = desiredYaw - player.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const maxTurn = CONFIG.player.autoWalkTurnRate * DEG * dt;
    const dYaw = Math.max(-maxTurn, Math.min(maxTurn, diff * Math.min(1, dt * 3)));
    // Ralentit pendant les virages serrés.
    const forward = Math.max(0, Math.cos(diff)) ** 2;
    return { dYaw, dPitch: (-0.04 - player.pitch) * Math.min(1, dt * 1.5), forward };
  }

  private plan(m: WorldModule, player: Player): void {
    // Par où est-on entré ? L'ouverture reliée au module précédent, sinon celle
    // qui est derrière le visiteur (on continue dans la direction du regard).
    let entered = m.connectors.findIndex((c) => c.neighbor?.module === this.previous);
    if (entered < 0) {
      const f = player.forwardDir;
      let best = Infinity;
      m.connectors.forEach((c, i) => {
        const d = c.normal.x * f.x + c.normal.z * f.z;
        if (d < best) {
          best = d;
          entered = i;
        }
      });
    }
    // Sorties possibles : pas celle d'entrée, ni une impasse.
    const exits = m.connectors
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => i !== entered && c.neighbor?.module.def.kind !== 'cap');
    const choice = exits.length > 0 ? this.rng.pick(exits) : { c: m.connectors[entered]!, i: entered };
    this.exitIndex = choice.i;

    this.targets = [];
    if (m.def.kind === 'turn' && m.waypoints[0]) this.targets.push({ ...m.waypoints[0] });
    const exit = choice.c;
    this.targets.push({ x: exit.pos.x + exit.normal.x * 1.2, z: exit.pos.z + exit.normal.z * 1.2 });
  }
}
