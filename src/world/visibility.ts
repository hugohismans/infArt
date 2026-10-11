import {
  clipSegmentToCone,
  coneFromSegment,
  pointInConvex,
  pointSegmentDistance,
  type Cone,
  type Vec2,
} from './math2d';
import type { WorldModule } from './WorldModule';

/**
 * Visibilité potentielle à 360° par « portails » (vue de dessus).
 *
 * Depuis un point, on part du (des) module(s) qui le contiennent, puis on traverse
 * les ouvertures en rétrécissant à chaque fois le cône de vision à la partie de
 * l'ouverture effectivement visible. Les murs étant pleine hauteur, c'est un
 * lancer de rayons exact en 2D, mais bien moins coûteux. On ne tient pas compte
 * de la direction du regard : un module est visible s'il peut l'être en se
 * retournant.
 */
export interface VisibilityResult {
  modules: Set<WorldModule>;
  /**
   * Ouvertures non générées qui sont visibles : à remplir d'urgence.
   * `fromFirstEye` : vue depuis le premier point (la position réelle du joueur),
   * et pas seulement depuis un point d'anticipation.
   */
  openConnectors: Array<{ module: WorldModule; connector: number; fromFirstEye: boolean }>;
}

const MAX_DEPTH = 24;
/** En deçà de cette distance d'une ouverture, l'œil est « dans » l'ouverture. */
const PORTAL_EPS = 0.05;

export function modulesContaining(p: Vec2, modules: Iterable<WorldModule>): WorldModule[] {
  const out: WorldModule[] = [];
  for (const m of modules) if (pointInConvex(p, m.footprint)) out.push(m);
  return out;
}

export function computeVisibility(eyes: Vec2[], modules: Iterable<WorldModule>, maxDistance: number, result?: VisibilityResult): VisibilityResult {
  const res = result ?? { modules: new Set(), openConnectors: [] };
  const all = Array.from(modules);
  const openSeen = new Set<string>();

  let firstEye = true;
  const markOpen = (module: WorldModule, connector: number) => {
    const key = `${module.id}:${connector}`;
    if (openSeen.has(key)) return;
    openSeen.add(key);
    res.openConnectors.push({ module, connector, fromFirstEye: firstEye });
  };

  for (let e = 0; e < eyes.length; e++) {
    const eye = eyes[e]!;
    firstEye = e === 0;
    const roots = modulesContaining(eye, all);
    const rootSet = new Set(roots);
    // Un œil posé dans une ouverture voit pleinement les deux modules.
    for (let i = 0; i < roots.length; i++) {
      for (const c of roots[i]!.connectors) {
        if (c.neighbor && !rootSet.has(c.neighbor.module) && pointSegmentDistance(eye, c.portal.a, c.portal.b) < PORTAL_EPS) {
          rootSet.add(c.neighbor.module);
          roots.push(c.neighbor.module);
        }
      }
    }

    for (const root of roots) {
      res.modules.add(root);
      root.connectors.forEach((c, idx) => {
        if (pointSegmentDistance(eye, c.portal.a, c.portal.b) > maxDistance) return;
        if (!c.neighbor) {
          markOpen(root, idx);
          return;
        }
        if (rootSet.has(c.neighbor.module)) return;
        const cone = coneFromSegment(eye, c.portal);
        if (!cone) return;
        traverse(eye, c.neighbor.module, c.neighbor.connector, cone, 1);
      });
    }
  }
  return res;

  function traverse(eye: Vec2, module: WorldModule, entered: number, cone: Cone, depth: number): void {
    res.modules.add(module);
    if (depth >= MAX_DEPTH) return;
    module.connectors.forEach((c, idx) => {
      if (idx === entered) return;
      const clipped = clipSegmentToCone(c.portal, eye, cone);
      if (!clipped) return;
      if (pointSegmentDistance(eye, clipped.a, clipped.b) > maxDistance) return;
      if (!c.neighbor) {
        markOpen(module, idx);
        return;
      }
      const sub = coneFromSegment(eye, clipped);
      if (!sub) return;
      traverse(eye, c.neighbor.module, c.neighbor.connector, sub, depth + 1);
    });
  }
}
