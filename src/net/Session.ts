import type { Database, DataSnapshot, Unsubscribe } from 'firebase/database';
import type { Artwork } from '../../shared/artwork';
import type { Engine } from '../engine/Engine';
import { angleOf, applyTransform, convexOverlap, rotate, type Vec2 } from '../world/math2d';
import type { WorldNet } from '../world/World';
import type { WorldModule } from '../world/WorldModule';
import type { DatabaseApi } from './firebase';
import { clean, recordConnectors, recordFootprint, toRecord, toSpec, type LinkRecord, type ModuleRecord } from './records';

/** Position publiée de chaque visiteur (repère absolu commun). */
export interface PlayerState {
  /** Module où il se trouve. */
  m: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
}

type Footprint = { poly: Vec2[]; y0: number; y1: number; minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Visite à deux : l'atlas partagé.
 *
 * Chaque visiteur génère son monde autour de lui, comme en solo, mais tout module créé est
 * publié (forme, ambiance, graine, zone), et chaque ouverture est « réclamée » par une
 * transaction : le premier qui la remplit gagne, l'autre importe son module. Un module de
 * l'atlas se reconstruit à l'identique chez l'autre (mêmes emplacements, même décor) ;
 * les œuvres murales sont publiées par son créateur au fil de leur arrivée.
 *
 * Les salles de l'atlas non chargées ici sont des obstacles pour la génération : les deux
 * mondes restent cohérents. L'hôte fait le ménage : un module que personne n'a chargé
 * depuis un moment et qui n'est pas sur le chemin entre les deux visiteurs disparaît,
 * et l'espace redevient libre (l'impossible reste possible). Le chemin, lui, est gardé :
 * on peut toujours se rejoindre.
 *
 * Jonction (côté invité) : on choisit une ouverture libre et invisible de chaque côté, on
 * déplace tout le monde de l'invité d'un bloc pour qu'elles se fassent face, et on les relie.
 * Rien ne bouge à l'écran : le monde de l'ami s'ouvre simplement un peu plus loin.
 *
 * Base : sessions/{sid}/ { members, host, ready, modules/{uid}, links/{uid}/{c},
 * art/{uid}/{i}, players/{uid}, holds/{uid}, ended }.
 */
export class Session implements WorldNet {
  readonly records = new Map<string, ModuleRecord>();
  private readonly links = new Map<string, Map<number, LinkRecord>>();
  private readonly art = new Map<string, Map<number, Artwork>>();
  private readonly footprints = new Map<string, Footprint>();
  friend: PlayerState | null = null;
  /** Chemin (modules) de mon module à celui de l'ami, dans l'atlas. */
  path: string[] = [];
  state: 'joining' | 'active' | 'ended' = 'joining';
  /** Message d'état pour l'interface. */
  onState: ((s: Session['state']) => void) | null = null;

  private readonly base: string;
  private readonly unsubs: Unsubscribe[] = [];
  private readonly publishedArt = new Map<string, Set<number>>();
  private friendHolds = new Set<string>();
  private lastHolds = '';
  private readonly strikes = new Map<string, number>();
  private readonly remoteSince = new Map<string, number>();
  private timers = { player: 0, holds: 0, art: 0, path: 0, gc: 0, join: 0 };
  private hostReady = false;
  private joining = false;

  constructor(
    private readonly F: DatabaseApi,
    private readonly db: Database,
    readonly sid: string,
    readonly me: string,
    readonly friendUid: string,
    readonly role: 'host' | 'guest',
    private readonly engine: Engine,
  ) {
    this.base = `sessions/${sid}`;
  }

  private ref(path: string) {
    return this.F.ref(this.db, `${this.base}/${path}`);
  }

  private get world() {
    return this.engine.world;
  }

  async start(): Promise<void> {
    const { onChildAdded, onChildChanged, onChildRemoved, onValue, onDisconnect } = this.F;
    const mods = this.ref('modules');
    const onRecord = (s: DataSnapshot) => {
      const r = s.val() as ModuleRecord;
      this.records.set(s.key!, r);
      const fp = recordFootprint(r, this.world);
      if (fp) {
        const xs = fp.poly.map((p) => p.x), zs = fp.poly.map((p) => p.z);
        this.footprints.set(s.key!, { ...fp, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
      }
    };
    const onLinks = (s: DataSnapshot) => {
      const map = new Map<number, LinkRecord>();
      for (const [k, v] of Object.entries((s.val() ?? {}) as Record<string, LinkRecord | null>)) if (v) map.set(Number(k), v);
      this.links.set(s.key!, map);
    };
    const onArt = (s: DataSnapshot) => {
      const map = this.art.get(s.key!) ?? new Map<number, Artwork>();
      for (const [k, v] of Object.entries((s.val() ?? {}) as Record<string, Artwork | null>)) if (v) map.set(Number(k), v);
      this.art.set(s.key!, map);
      // Module chargé ici et créé par l'autre : ses œuvres arrivent.
      const m = this.world.byUid(s.key!);
      if (m?.remote) for (const [i, a] of map) m.wallPieces[i]?.assignArtwork(a);
    };
    this.unsubs.push(
      onChildAdded(mods, onRecord),
      onChildChanged(mods, onRecord),
      onChildRemoved(mods, (s) => {
        this.records.delete(s.key!);
        this.footprints.delete(s.key!);
      }),
      onChildAdded(this.ref('links'), onLinks),
      onChildChanged(this.ref('links'), onLinks),
      onChildRemoved(this.ref('links'), (s) => this.links.delete(s.key!)),
      onChildAdded(this.ref('art'), onArt),
      onChildChanged(this.ref('art'), onArt),
      onChildRemoved(this.ref('art'), (s) => this.art.delete(s.key!)),
      onValue(this.ref(`players/${this.friendUid}`), (s) => {
        const v = s.val() as PlayerState | null;
        this.friend = v;
      }),
      onValue(this.ref(`holds/${this.friendUid}`), (s) => (this.friendHolds = new Set(Object.keys(s.val() ?? {})))),
      onValue(this.ref('ready'), (s) => (this.hostReady = s.val() === true)),
      onValue(this.ref('ended'), (s) => {
        if (s.val() === true && this.state !== 'ended') this.end(false);
      }),
    );
    await onDisconnect(this.ref(`players/${this.me}`)).remove();
    await onDisconnect(this.ref(`holds/${this.me}`)).remove();
    if (this.role === 'host') {
      // L'hôte publie son monde tel quel, puis signale qu'il est prêt.
      this.world.net = this;
      await this.publishLoaded();
      await this.F.set(this.ref('ready'), true);
      this.setState('active');
    }
  }

  /** À chaque image (temps réel, s). */
  update(dt: number): void {
    if (this.state === 'ended') return;
    for (const k of Object.keys(this.timers) as Array<keyof Session['timers']>) this.timers[k] -= dt;
    if (this.state === 'joining') {
      if (this.role === 'guest' && this.hostReady && this.friend && !this.joining && this.timers.join <= 0) {
        this.timers.join = 2;
        void this.tryJoin();
      }
      return;
    }
    const cur = this.world.currentModule;
    if (this.timers.player <= 0 && cur) {
      this.timers.player = 0.2;
      const p = this.engine.player;
      const off = this.world.offset;
      void this.F.set(this.ref(`players/${this.me}`), { m: cur.uid, x: p.position.x - off.x, z: p.position.z - off.z, y: p.floorY, yaw: p.yaw });
    }
    if (this.timers.holds <= 0) {
      this.timers.holds = 2;
      const held = [...this.world.modules].map((m) => m.uid).filter((u) => this.records.has(u)).sort();
      const key = held.join(',');
      if (key !== this.lastHolds) {
        this.lastHolds = key;
        void this.F.set(this.ref(`holds/${this.me}`), Object.fromEntries(held.map((u) => [u, true])));
      }
    }
    if (this.timers.art <= 0) {
      this.timers.art = 1;
      this.publishArt();
      this.fallbackArt();
    }
    if (this.timers.path <= 0) {
      this.timers.path = 0.5;
      this.path = cur && this.friend ? this.findPath(cur.uid, this.friend.m) : [];
    }
    if (this.role === 'host' && this.timers.gc <= 0) {
      this.timers.gc = 5;
      this.collectGarbage();
    }
  }

  // --- WorldNet -----------------------------------------------------------------------

  linked(parent: WorldModule, connector: number): boolean {
    const l = this.links.get(parent.uid)?.get(connector);
    if (!l) return false;
    const rec = this.records.get(l.m);
    // Raccordé, mais le module n'est pas encore arrivé : on attend (l'ouverture reste fermée).
    if (!rec) return true;
    this.importModule(l.m, rec, { module: parent, connector, entry: l.c });
    return true;
  }

  blocked(poly: Vec2[], y0: number, y1: number): boolean {
    const off = this.world.offset;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const abs = poly.map((p) => ({ x: p.x - off.x, z: p.z - off.z }));
    for (const p of abs) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    for (const [uid, fp] of this.footprints) {
      if (fp.maxX < minX || fp.minX > maxX || fp.maxZ < minZ || fp.minZ > maxZ) continue;
      if (fp.y1 <= y0 || fp.y0 >= y1) continue;
      if (this.world.byUid(uid)) continue;
      if (convexOverlap(abs, fp.poly, -0.003)) return true;
    }
    return false;
  }

  created(parent: WorldModule, connector: number, child: WorldModule): void {
    if (this.state !== 'active') return;
    void this.claim(parent, connector, child);
  }

  destroyed(): void {
    this.timers.holds = Math.min(this.timers.holds, 0.3);
  }

  // --- Publication -------------------------------------------------------------------

  private record(m: WorldModule): ModuleRecord {
    return toRecord(m, this.world, this.me);
  }

  /** Publie tous les modules chargés et leurs liens (début de session). */
  private async publishLoaded(extraLinks: Record<string, LinkRecord> = {}): Promise<void> {
    const updates: Record<string, unknown> = {};
    for (const m of this.world.modules) {
      if (this.records.has(m.uid)) continue;
      updates[`modules/${m.uid}`] = this.record(m);
      m.connectors.forEach((c, i) => {
        if (c.neighbor) updates[`links/${m.uid}/${i}`] = { m: c.neighbor.module.uid, c: c.neighbor.connector };
      });
    }
    for (const [k, v] of Object.entries(extraLinks)) updates[k] = v;
    await this.F.update(this.F.ref(this.db, this.base), updates);
  }

  /** Nouveau module généré ici : on le publie et on réclame l'ouverture. */
  private async claim(parent: WorldModule, connector: number, child: WorldModule): Promise<void> {
    if (!this.records.has(parent.uid)) await this.F.set(this.ref(`modules/${parent.uid}`), this.record(parent));
    await this.F.set(this.ref(`modules/${child.uid}`), this.record(child));
    const res = await this.F.runTransaction(this.ref(`links/${parent.uid}/${connector}`), (cur: LinkRecord | null) => (cur ? undefined : { m: child.uid, c: 0 }));
    if (res.committed) {
      await this.F.set(this.ref(`links/${child.uid}/0`), { m: parent.uid, c: connector });
      return;
    }
    // L'autre visiteur a été plus rapide : on retire notre module, le sien sera importé.
    await this.F.remove(this.ref(`modules/${child.uid}`));
    if (child.alive) this.world.remove(child);
  }

  private publishArt(): void {
    const updates: Record<string, unknown> = {};
    for (const m of this.world.modules) {
      const rec = this.records.get(m.uid);
      if (!rec || rec.by !== this.me) continue;
      let done = this.publishedArt.get(m.uid);
      m.wallPieces.forEach((p, i) => {
        if (!p.artwork || done?.has(i)) return;
        if (!done) this.publishedArt.set(m.uid, (done = new Set()));
        done.add(i);
        updates[`art/${m.uid}/${i}`] = clean(p.artwork);
      });
    }
    if (Object.keys(updates).length > 0) void this.F.update(this.F.ref(this.db, this.base), updates);
  }

  /** Œuvres jamais publiées (l'autre est parti, ou trop lent) : on pioche dans sa réserve. */
  private fallbackArt(): void {
    const now = performance.now();
    for (const m of this.world.modules) {
      if (!m.remote) continue;
      const since = this.remoteSince.get(m.uid) ?? now;
      this.remoteSince.set(m.uid, since);
      if (now - since < 12000) continue;
      for (const p of m.wallPieces) if (!p.artwork) p.fallbackToLibrary();
    }
    if (this.remoteSince.size > 300) for (const k of this.remoteSince.keys()) if (!this.world.byUid(k)) this.remoteSince.delete(k);
  }

  /** Importe un module de l'atlas et le raccorde aux modules déjà chargés. */
  private importModule(uid: string, rec: ModuleRecord, parent?: { module: WorldModule; connector: number; entry: number }): WorldModule | null {
    const art = this.art.get(uid) ?? new Map<number, Artwork>();
    if (!this.art.has(uid)) this.art.set(uid, art);
    const spec = toSpec(uid, rec, this.world, art);
    if (!spec) return null;
    const m = this.world.instantiate(spec, parent);
    if (!m) return null;
    for (const [i, l] of this.links.get(uid) ?? []) {
      const other = this.world.byUid(l.m);
      if (other) this.world.linkModules(m, i, other, l.c);
    }
    return m;
  }

  // --- Chemin et ménage --------------------------------------------------------------

  /** Plus court chemin dans l'atlas (modules), ou [] si l'un des deux est inconnu. */
  findPath(from: string, to: string): string[] {
    if (from === to) return [from];
    const prev = new Map<string, string>([[from, '']]);
    const queue = [from];
    for (let i = 0; i < queue.length && queue.length < 5000; i++) {
      const u = queue[i]!;
      for (const l of this.links.get(u)?.values() ?? []) {
        if (prev.has(l.m)) continue;
        prev.set(l.m, u);
        if (l.m === to) {
          const out = [to];
          let cur = u;
          while (cur) {
            out.push(cur);
            cur = prev.get(cur)!;
          }
          return out.reverse();
        }
        queue.push(l.m);
      }
    }
    return [];
  }

  /** Ouverture qui mène de `a` à `b` (voisins dans l'atlas). */
  linkBetween(a: string, b: string): number {
    for (const [i, l] of this.links.get(a) ?? []) if (l.m === b) return i;
    return -1;
  }

  /** Hôte : efface de l'atlas ce que personne ne tient et qui n'est pas sur le chemin. */
  private collectGarbage(): void {
    const needed = new Set<string>([...this.friendHolds, ...this.path]);
    for (const m of this.world.modules) needed.add(m.uid);
    // (Le chemin vu depuis l'ami passe par les mêmes modules : un seul calcul suffit.)
    const updates: Record<string, null> = {};
    const doomed = new Set<string>();
    for (const uid of this.records.keys()) {
      if (needed.has(uid)) {
        this.strikes.delete(uid);
        continue;
      }
      const n = (this.strikes.get(uid) ?? 0) + 1;
      this.strikes.set(uid, n);
      if (n < 3) continue;
      this.strikes.delete(uid);
      doomed.add(uid);
    }
    for (const uid of doomed) {
      updates[`modules/${uid}`] = null;
      updates[`art/${uid}`] = null;
      updates[`links/${uid}`] = null;
      // Les liens des voisins qui restent pointent vers lui : on les retire aussi
      // (pas ceux d'un voisin effacé dans le même lot : chemins imbriqués refusés).
      for (const l of this.links.get(uid)?.values() ?? []) if (!doomed.has(l.m)) updates[`links/${l.m}/${l.c}`] = null;
    }
    if (Object.keys(updates).length > 0) void this.F.update(this.F.ref(this.db, this.base), updates);
  }

  // --- Jonction (invité) -------------------------------------------------------------

  /**
   * Cherche une ouverture libre et invisible de chaque côté, telle qu'en plaçant mon monde
   * contre celui de l'hôte, aucune salle que je vois ne chevauche les siennes ; réclame
   * l'ouverture de l'hôte, déplace mon monde d'un bloc et relie les deux.
   */
  private async tryJoin(): Promise<void> {
    this.joining = true;
    try {
      const world = this.world;
      const friend = this.friend!;
      // Distances (dans l'atlas) au module de l'hôte.
      const hostDist = new Map<string, number>([[friend.m, 0]]);
      const queue = [friend.m];
      for (let i = 0; i < queue.length; i++) {
        const u = queue[i]!;
        for (const l of this.links.get(u)?.values() ?? []) {
          if (hostDist.has(l.m)) continue;
          hostDist.set(l.m, hostDist.get(u)! + 1);
          queue.push(l.m);
        }
      }
      // Ouvertures libres de l'hôte, hors de sa vue.
      const hostOpen: Array<{ uid: string; c: number; d: number; pos: Vec2; normal: Vec2; y: number }> = [];
      for (const [uid, rec] of this.records) {
        const d = hostDist.get(uid);
        if (d === undefined || d < 2 || rec.d === 'cap') continue;
        recordConnectors(rec, world).forEach((c, i) => {
          if (!this.links.get(uid)?.has(i)) hostOpen.push({ uid, c: i, d, ...c });
        });
      }
      // Mes ouvertures libres, invisibles.
      const mine: Array<{ m: WorldModule; c: number }> = [];
      for (const m of world.modules) {
        if (m.def.kind === 'cap' || m.graphDistance < 1 || m.graphDistance > 3) continue;
        m.connectors.forEach((c, i) => {
          if (!c.neighbor && !c.sealed && !world.isOpenConnectorVisible(m, i)) mine.push({ m, c: i });
        });
      }
      const current = world.currentModule;
      type Option = { a: (typeof mine)[number]; b: (typeof hostOpen)[number]; t: { x: number; z: number; angle: number }; dy: number; soft: WorldModule[]; score: number };
      const options: Option[] = [];
      for (const a of mine) {
        const ca = a.m.connectors[a.c]!;
        for (const b of hostOpen) {
          const angle = angleOf({ x: -b.normal.x, z: -b.normal.z }) - angleOf(ca.normal);
          const r = rotate(ca.pos, angle);
          const t = { x: b.pos.x - r.x, z: b.pos.z - r.z, angle };
          const dy = b.y - ca.y;
          // Mes salles, une fois déplacées, ne doivent pas chevaucher celles de l'atlas.
          let hard = false;
          const soft: WorldModule[] = [];
          for (const m of world.modules) {
            const poly = m.footprint.map((p) => applyTransform(t, p));
            const y0 = m.yRange[0] + dy + 0.3, y1 = m.yRange[1] + dy - 0.3;
            let hit = false;
            for (const fp of this.footprints.values()) {
              if (fp.y1 <= y0 || fp.y0 >= y1) continue;
              if (convexOverlap(poly, fp.poly, -0.003)) {
                hit = true;
                break;
              }
            }
            if (!hit) continue;
            if (m === current || m === a.m || m.visible || m.graphDistance < 2) {
              hard = true;
              break;
            }
            soft.push(m);
          }
          if (hard) continue;
          options.push({ a, b, t, dy, soft, score: a.m.graphDistance + b.d + soft.length * 0.5 });
        }
      }
      options.sort((p, q) => p.score - q.score);
      for (const o of options.slice(0, 6)) {
        const res = await this.F.runTransaction(this.ref(`links/${o.b.uid}/${o.b.c}`), (cur: LinkRecord | null) => (cur ? undefined : { m: o.a.m.uid, c: o.a.c }));
        if (!res.committed) continue;
        if (!o.a.m.alive || o.a.m.connectors[o.a.c]!.neighbor) {
          await this.F.remove(this.ref(`links/${o.b.uid}/${o.b.c}`));
          continue;
        }
        // Mon monde se place contre celui de l'hôte : repère absolu commun, sans décalage.
        for (const m of o.soft) if (m.alive) world.remove(m);
        this.engine.reframe(o.t, o.dy);
        world.offset.x = 0;
        world.offset.z = 0;
        world.net = this;
        await this.publishLoaded({ [`links/${o.a.m.uid}/${o.a.c}`]: { m: o.b.uid, c: o.b.c } });
        this.links.set(o.a.m.uid, new Map([...(this.links.get(o.a.m.uid) ?? []), [o.a.c, { m: o.b.uid, c: o.b.c }]]));
        const rec = this.records.get(o.b.uid);
        if (rec) this.importModule(o.b.uid, rec, { module: o.a.m, connector: o.a.c, entry: o.b.c });
        this.setState('active');
        return;
      }
    } catch (e) {
      console.warn('[session] jonction', e);
    } finally {
      this.joining = false;
    }
  }

  private setState(s: Session['state']): void {
    this.state = s;
    this.onState?.(s);
  }

  /** Fin de la visite à deux. `notify` : prévenir l'autre (on part). */
  end(notify = true): void {
    if (this.state === 'ended') return;
    this.setState('ended');
    if (this.world.net === this) this.world.net = null;
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    void this.F.remove(this.ref(`players/${this.me}`));
    void this.F.remove(this.ref(`holds/${this.me}`));
    if (notify) void this.F.set(this.ref('ended'), true);
    // Les œuvres attendues ne viendront plus : chacun pioche dans sa réserve.
    for (const m of this.world.modules) if (m.remote) for (const p of m.wallPieces) if (!p.artwork) p.fallbackToLibrary();
  }
}
