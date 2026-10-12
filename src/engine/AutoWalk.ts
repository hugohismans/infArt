import { CONFIG } from '../config';
import { dist, segmentDistance, type Vec2 } from '../world/math2d';
import { Rng } from '../world/random';
import type { World } from '../world/World';
import type { WorldModule } from '../world/WorldModule';
import type { Player } from './Player';

const DEG = Math.PI / 180;
/** Distance libre exigée entre un trajet et les murs (rayon du visiteur + marge). */
const CLEARANCE = 0.55;

interface Target {
  p: Vec2;
  /** Temps d'arrêt (s) une fois arrivé : contempler l'œuvre d'une impasse. */
  wait?: number;
}

/**
 * Marche contemplative automatique : le visiteur avance seul, choisit les
 * embranchements au hasard, contourne bancs et cimaises, s'arrête devant l'œuvre
 * d'une impasse puis fait demi-tour.
 */
export class AutoWalk {
  private module: WorldModule | null = null;
  private previous: WorldModule | null = null;
  private targets: Target[] = [];
  private exitIndex = -1;
  private waiting = 0;
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
      t.p.x += dx;
      t.p.z += dz;
    }
  }

  reset(): void {
    this.module = null;
    this.previous = null;
    this.targets = [];
    this.exitIndex = -1;
    this.waiting = 0;
  }

  /** Calcule la commande de la frame : rotation à appliquer et vitesse d'avance (0..1). */
  step(player: Player, dt: number): { dYaw: number; dPitch: number; forward: number } {
    const cur = this.world.currentModule;
    if (cur && cur !== this.module) {
      this.previous = this.module;
      this.module = cur;
      this.plan(cur, player);
    }

    // La sortie choisie s'est révélée être un bouchon : on change d'avis.
    if (this.module && this.module.connectors[this.exitIndex]?.neighbor?.module.def.kind === 'cap') {
      this.plan(this.module, player);
    }

    const idle = { dYaw: 0, dPitch: -player.pitch * Math.min(1, dt * 2), forward: 0 };
    if (this.waiting > 0) {
      this.waiting -= dt;
      return idle;
    }

    // Avance dans la liste de points de passage.
    while (this.targets.length > 0 && dist(player.position, this.targets[0]!.p) < 0.7) {
      const reached = this.targets.shift()!;
      if (reached.wait) {
        this.waiting = reached.wait;
        return idle;
      }
    }
    if (this.targets.length === 0 && this.module) this.plan(this.module, player);
    const target = this.targets[0];
    if (!target) return idle;

    const dir = { x: target.p.x - player.position.x, z: target.p.z - player.position.z };
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
    // Sorties possibles : pas celle d'entrée, ni un bouchon.
    const exits = m.connectors.map((c, i) => ({ c, i })).filter(({ c, i }) => i !== entered && c.neighbor?.module.def.kind !== 'cap');
    this.targets = [];

    if (exits.length === 0 && m.def.kind === 'deadend' && m.navPoints[0]) {
      // Impasse : on va contempler l'œuvre du fond, puis on repart.
      this.targets.push({ p: { ...m.navPoints[0] }, wait: this.rng.range(3, 6) });
    }
    const choice = exits.length > 0 ? this.rng.pick(exits) : { c: m.connectors[entered]!, i: entered };
    this.exitIndex = choice.i;
    const exit = choice.c;
    const inner = { x: exit.pos.x - exit.normal.x * 0.8, z: exit.pos.z - exit.normal.z * 0.8 };
    const from = this.targets[0]?.p ?? player.position;
    for (const p of this.route(m, from, inner)) this.targets.push({ p });
    this.targets.push({ p: { x: exit.pos.x + exit.normal.x * 1.2, z: exit.pos.z + exit.normal.z * 1.2 } });
  }

  /**
   * Itinéraire dans un module (graphe de visibilité sur ses points libres) :
   * plus court chemin qui ne frôle aucun mur ni obstacle. Renvoie les points à suivre.
   */
  private route(m: WorldModule, start: Vec2, goal: Vec2): Vec2[] {
    const nodes = [start, ...m.navPoints, goal];
    // Depuis le point de départ, le visiteur peut déjà frôler un mur : marge réduite.
    const clear = (a: Vec2, b: Vec2) => {
      const r = a === start || b === start ? 0.3 : CLEARANCE;
      return !m.walls.some((w) => segmentDistance(a, b, w.a, w.b) < r) && !m.decorWalls.some((w) => segmentDistance(a, b, w.a, w.b) < r);
    };
    const goalIndex = nodes.length - 1;
    if (clear(start, goal)) return [goal];
    // Dijkstra sur une poignée de nœuds.
    const distTo = nodes.map(() => Infinity);
    const prev = nodes.map(() => -1);
    const done = nodes.map(() => false);
    distTo[0] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || distTo[i]! < distTo[u]!)) u = i;
      if (u < 0 || distTo[u] === Infinity || u === goalIndex) break;
      done[u] = true;
      for (let v = 0; v < nodes.length; v++) {
        if (done[v] || v === u || !clear(nodes[u]!, nodes[v]!)) continue;
        const d = distTo[u]! + dist(nodes[u]!, nodes[v]!);
        if (d < distTo[v]!) {
          distTo[v] = d;
          prev[v] = u;
        }
      }
    }
    if (distTo[goalIndex] === Infinity) return [goal]; // pas d'itinéraire : on tente tout droit
    const path: Vec2[] = [];
    for (let i = goalIndex; i > 0; i = prev[i]!) path.unshift({ ...nodes[i]! });
    return path;
  }
}
