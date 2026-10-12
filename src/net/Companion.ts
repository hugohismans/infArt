import * as THREE from 'three';
import type { Engine } from '../engine/Engine';
import type { Vec2 } from '../world/math2d';
import type { Session } from './Session';
import { Avatar, playerColor } from './Avatar';

/** Tirets lumineux qui défilent le long de la ligne (vers l'ami). */
function makeDashTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.55, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0.15)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Visite à deux : l'ami (silhouette et pseudo) et la ligne tracée au sol qui mène à lui,
 * à travers les salles, le long du chemin de l'atlas. Elle se recalcule quand l'un ou
 * l'autre bouge.
 */
export class Companion {
  private readonly group = new THREE.Group();
  private readonly avatar: Avatar;
  private readonly lineMesh: THREE.Mesh;
  private readonly lineMat: THREE.MeshBasicMaterial;
  private readonly dash = makeDashTexture();
  private readonly owned: Array<{ dispose(): void }> = [];
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private yaw = 0;
  private placed = false;
  /** L'ami parle (pseudo encadré de sa couleur). */
  speaking = false;
  private rebuild = 0;

  constructor(
    private readonly engine: Engine,
    private readonly session: Session,
    name: string,
    friendUid: string,
  ) {
    this.avatar = new Avatar(name, playerColor(friendUid));
    this.lineMat = new THREE.MeshBasicMaterial({
      color: this.avatar.color,
      map: this.dash,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.lineMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.lineMat);
    this.lineMesh.frustumCulled = false;
    this.lineMesh.renderOrder = 3;
    this.owned.push(this.lineMat, this.dash);
    this.group.add(this.avatar.root, this.lineMesh);
    engine.scene.add(this.group);
  }

  update(dt: number): void {
    const s = this.session;
    const world = this.engine.world;
    const f = s.friend;
    const friendHere = !!f && !!world.byUid(f.m) && s.state === 'active';
    this.avatar.root.visible = friendHere;
    if (f && friendHere) {
      const target = this.target.set(f.x + world.offset.x, f.y, f.z + world.offset.z);
      // Un saut (recentrage, téléportation) : on se place directement.
      if (!this.placed || this.pos.distanceTo(target) > 6) {
        this.pos.copy(target);
        this.avatar.reset();
      } else this.pos.lerp(target, Math.min(1, dt * 8));
      let dyaw = f.yaw - this.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      this.yaw += dyaw * Math.min(1, dt * 8);
      this.placed = true;
      this.avatar.update(dt, this.pos, this.yaw, f.pt ?? 0, this.speaking, this.engine.camera.getWorldPosition(this.eye));
    } else this.placed = false;

    this.dash.offset.y -= dt * 0.9;
    this.rebuild -= dt;
    if (this.rebuild <= 0) {
      this.rebuild = 0.2;
      this.buildLine(friendHere ? { x: this.pos.x, z: this.pos.z } : null);
    }
  }

  /** Ligne au sol : de moi, d'ouverture en ouverture, jusqu'à l'ami (ou aussi loin que chargé). */
  private buildLine(friendPos: Vec2 | null): void {
    const s = this.session;
    const world = this.engine.world;
    const p = this.engine.player;
    const pts: Vec2[] = [{ ...p.position }];
    const path = s.path;
    let reached = path.length > 0;
    for (let k = 0; k + 1 < path.length; k++) {
      const m = world.byUid(path[k]!);
      const c = m ? s.linkBetween(path[k]!, path[k + 1]!) : -1;
      const conn = c >= 0 ? m!.connectors[c] : undefined;
      if (!conn) {
        reached = false;
        break;
      }
      // On passe le seuil bien au milieu, perpendiculairement.
      pts.push({ x: conn.pos.x - conn.normal.x * 0.6, z: conn.pos.z - conn.normal.z * 0.6 });
      pts.push({ x: conn.pos.x + conn.normal.x * 0.6, z: conn.pos.z + conn.normal.z * 0.6 });
    }
    if (reached && friendPos) pts.push(friendPos);
    if (pts.length < 2 || s.state !== 'active') {
      this.lineMesh.visible = false;
      return;
    }
    // Échantillonnage tous les 40 cm, à hauteur du sol (escaliers compris).
    const samples: Array<{ x: number; y: number; z: number; d: number }> = [];
    let y = p.floorY, d = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(len / 0.4));
      for (let j = i === 0 ? 0 : 1; j <= n; j++) {
        const t = j / n;
        const q = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        y = world.floorAt(q, y);
        samples.push({ x: q.x, y: y + 0.025, z: q.z, d: d + len * t });
      }
      d += len;
    }
    // On ne trace pas sous ses propres pieds : la ligne part un peu devant.
    const start = samples.findIndex((q) => q.d > 0.5);
    const used = start > 0 ? samples.slice(start) : samples;
    if (used.length < 2) {
      this.lineMesh.visible = false;
      return;
    }
    const half = 0.07;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    used.forEach((q, i) => {
      const a = used[Math.max(0, i - 1)]!, b = used[Math.min(used.length - 1, i + 1)]!;
      let sx = -(b.z - a.z), sz = b.x - a.x;
      const l = Math.hypot(sx, sz) || 1;
      sx = (sx / l) * half;
      sz = (sz / l) * half;
      pos.push(q.x + sx, q.y, q.z + sz, q.x - sx, q.y, q.z - sz);
      uv.push(0, q.d / 0.9, 1, q.d / 0.9);
      if (i > 0) {
        const o = (i - 1) * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.lineMesh.geometry.dispose();
    this.lineMesh.geometry = geo;
    this.lineMesh.visible = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.lineMesh.geometry.dispose();
    this.avatar.dispose();
    for (const o of this.owned) o.dispose();
  }
}
