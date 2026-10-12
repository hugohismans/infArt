/**
 * Statistiques du Directeur : part de chaque ambiance (en zones et en modules) sur
 * une longue promenade simulée. `npx tsx scripts/director-stats.ts [graine] [zones]`
 */
import { AMBIANCES, DEFAULT_AMBIANCE } from '../src/ambiances';
import { Director, type ZoneState } from '../src/director/Director';

const [seed = 'stats', count = '3000'] = process.argv.slice(2);
const d = new Director(seed, AMBIANCES, DEFAULT_AMBIANCE);
let s: ZoneState = d.initial();
const zones: Record<string, number> = {};
const modules: Record<string, number> = {};
const transitions: Record<string, number> = {};
let n = 0, z = 0;
while (z < Number(count)) {
  const id = s.zone.ambiance.id;
  modules[id] = (modules[id] ?? 0) + 1;
  const next = d.next(s, `k${n++}`, false);
  if (next.zone !== s.zone) {
    z++;
    zones[next.zone.ambiance.id] = (zones[next.zone.ambiance.id] ?? 0) + 1;
    transitions[next.zone.transition] = (transitions[next.zone.transition] ?? 0) + 1;
  }
  s = next;
}
const pct = (o: Record<string, number>) => {
  const t = Object.values(o).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${((100 * v) / t).toFixed(0)} %`]));
};
console.log('zones   ', pct(zones));
console.log('modules ', pct(modules));
console.log('transitions', pct(transitions));
