import type { Artwork } from '../../shared/artwork';
import { resolveTheme } from '../../shared/themes';
import type { Director, Oddity, TransitionKind, Zone, ZoneState } from '../director/Director';
import { applyTransform, type Vec2 } from '../world/math2d';
import type { ModuleSpec, World } from '../world/World';
import type { WorldModule } from '../world/WorldModule';

/**
 * Visite à deux : un module tel qu'il est stocké dans l'atlas partagé. Tout ce qu'il faut
 * pour le reconstruire à l'identique chez l'autre visiteur (forme, ambiance, graine du
 * décor, zone du Directeur), dans le repère absolu commun. Les œuvres murales sont
 * publiées à part, au fil de leur arrivée.
 */
export interface ModuleRecord {
  /** Type de module (catalogue de l'ambiance). */
  d: string;
  /** Ambiance, ou étape de transition (« a>b@0.25 »). */
  p: string;
  /** Repère absolu et hauteur du sol à l'entrée. */
  x: number;
  z: number;
  a: number;
  y: number;
  /** Graine (décor, emplacements accrochés). */
  s: string;
  zn: ZoneRecord;
  /** Visiteur qui l'a créé (il publie ses œuvres). */
  by: string;
  /** Sculptures sur socle (connues dès la création). */
  ped?: Array<{ p: number; art: Artwork }>;
}

interface ZoneRecord {
  id: number;
  amb: string;
  from?: string;
  tr: TransitionKind;
  len: number;
  bl: number;
  te: number;
  st: number;
  w?: { id: number; th: string; left: number };
  od?: Oddity;
}

/** Lien de l'atlas : l'ouverture d'un module donne sur l'ouverture `c` du module `m`. */
export interface LinkRecord {
  m: string;
  c: number;
}

/** Firebase refuse les `undefined` : on ne garde que des données JSON propres. */
export function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function toRecord(m: WorldModule, world: World, owner: string): ModuleRecord {
  const z = m.zone;
  const zone: ZoneRecord = {
    id: z.zone.id,
    amb: z.zone.ambiance.id,
    ...(z.zone.from ? { from: z.zone.from.id } : {}),
    tr: z.zone.transition,
    len: z.zone.length,
    bl: z.zone.blendSteps,
    te: z.zone.tension,
    st: z.step,
    ...(z.wing ? { w: { id: z.wing.id, th: z.wing.theme.id, left: z.wing.left } } : {}),
    ...(z.oddity ? { od: z.oddity } : {}),
  };
  const ped = m.pedestalPieces.filter((x) => x.piece.artwork).map((x) => ({ p: x.p, art: x.piece.artwork! }));
  return clean({
    d: m.def.id,
    p: m.preset.id,
    x: m.transform.x - world.offset.x,
    z: m.transform.z - world.offset.z,
    a: m.transform.angle,
    y: m.baseY,
    s: m.seed,
    zn: zone,
    by: owner,
    ...(ped.length > 0 ? { ped } : {}),
  });
}

/** Zones reconstruites, partagées entre les modules d'une même zone. */
const zones = new Map<number, Zone>();

function toZone(r: ZoneRecord, director: Director): ZoneState | null {
  const ambiance = director.presetByKey(r.amb);
  if (!ambiance) return null;
  let zone = zones.get(r.id);
  if (!zone) {
    zone = {
      id: r.id,
      ambiance,
      from: r.from ? director.presetByKey(r.from) : null,
      transition: r.tr,
      length: r.len,
      blendSteps: r.bl,
      tension: r.te,
    };
    zones.set(r.id, zone);
    if (zones.size > 400) zones.delete(zones.keys().next().value!);
  }
  const theme = r.w ? resolveTheme(r.w.th) : null;
  return {
    zone,
    step: r.st,
    ...(r.w && theme ? { wing: { id: r.w.id, theme, left: r.w.left } } : {}),
    ...(r.od ? { oddity: r.od } : {}),
  };
}

/** Description à instancier (repère local du visiteur), ou null si l'ambiance est inconnue. */
export function toSpec(uid: string, r: ModuleRecord, world: World, walls: Map<number, Artwork>): ModuleSpec | null {
  const preset = world.director.presetByKey(r.p);
  const zone = preset && toZone(r.zn, world.director);
  if (!preset || !zone) return null;
  return {
    uid,
    defId: r.d,
    preset,
    transform: { x: r.x + world.offset.x, z: r.z + world.offset.z, angle: r.a },
    baseY: r.y,
    zone,
    seed: r.s,
    remote: { walls, pedestals: r.ped ?? [] },
  };
}

/** Empreinte au sol (repère absolu) et étendue verticale d'un module de l'atlas. */
export function recordFootprint(r: ModuleRecord, world: World): { poly: Vec2[]; y0: number; y1: number } | null {
  const preset = world.director.presetByKey(r.p);
  const def = preset && world.defById(preset, r.d);
  if (!preset || !def) return null;
  const t = { x: r.x, z: r.z, angle: r.a };
  const H = def.ceilingHeight ?? preset.geometry.ceilingHeight * def.ceilingScale;
  return {
    poly: def.footprint.map((p) => applyTransform(t, p)),
    y0: r.y + Math.min(0, def.rise),
    y1: r.y + Math.max(0, def.rise) + H,
  };
}

/** Ouvertures d'un module de l'atlas (repère absolu) : position, normale, hauteur. */
export function recordConnectors(r: ModuleRecord, world: World): Array<{ pos: Vec2; normal: Vec2; y: number }> {
  const preset = world.director.presetByKey(r.p);
  const def = preset && world.defById(preset, r.d);
  if (!preset || !def) return [];
  const t = { x: r.x, z: r.z, angle: r.a };
  return def.connectors.map((c) => {
    const n = applyTransform({ x: 0, z: 0, angle: r.a }, c.normal);
    return { pos: applyTransform(t, c.pos), normal: n, y: r.y + c.y };
  });
}
