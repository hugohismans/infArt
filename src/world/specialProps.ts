import * as THREE from 'three';

/** Objets des salles mises en scène par la voix off. Repère du module ; le visiteur entre par −Z. */
export interface Prop {
  object: THREE.Object3D;
  dispose(): void;
}

function kit() {
  const owned: Array<{ dispose(): void }> = [];
  const group = new THREE.Group();
  const mat = (color: string, emissive = 0) => {
    const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: emissive });
    owned.push(m);
    return m;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    owned.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    group.add(mesh);
    return mesh;
  };
  return { group, mat, box, prop: (): Prop => ({ object: group, dispose: () => owned.forEach((o) => o.dispose()) }) };
}

/**
 * L'atelier du Conservateur : un chevalet en bois au fond de l'impasse, tourné vers
 * l'entrée, et sur lui une toile blanche. Rien d'autre.
 */
export function buildEasel(x: number, z: number): Prop {
  const k = kit();
  const wood = k.mat('#7a5534', 0.05);
  const canvas = k.mat('#f3efe6', 0.18);
  const frame = k.mat('#d9cfbd', 0.08);
  // Trois pieds : deux devant, un derrière.
  k.box(0.05, 2.0, 0.05, wood, x - 0.42, 1.0, z - 0.08, -0.08, -0.12);
  k.box(0.05, 2.0, 0.05, wood, x + 0.42, 1.0, z - 0.08, -0.08, 0.12);
  k.box(0.05, 2.05, 0.05, wood, x, 1.0, z + 0.42, 0.32, 0);
  // Traverse qui porte la toile.
  k.box(1.0, 0.05, 0.12, wood, x, 0.86, z - 0.12);
  // La toile : châssis et surface, légèrement inclinée.
  k.box(0.92, 1.18, 0.05, frame, x, 1.5, z - 0.06, -0.08, 0);
  k.box(0.88, 1.14, 0.02, canvas, x, 1.5, z - 0.095, -0.08, 0);
  // Une petite palette oubliée au pied du chevalet.
  k.box(0.32, 0.02, 0.22, wood, x + 0.55, 0.01, z - 0.4, 0, 0);
  return k.prop();
}

/**
 * Le bout de la sortie : un encadrement de porte seul, au milieu du néant. On le voit
 * de loin, il ne mène nulle part (le traverser ramène à la salle ronde).
 */
export function buildDoorFrame(x: number, z: number): Prop {
  const k = kit();
  const white = k.mat('#f6f5f1', 0.35);
  const green = k.mat('#12924a', 1);
  const w = 1.2, h = 2.3, t = 0.14;
  k.box(t, h, t, white, x - w / 2 - t / 2, h / 2, z);
  k.box(t, h, t, white, x + w / 2 + t / 2, h / 2, z);
  k.box(w + 2 * t, t, t, white, x, h + t / 2, z);
  // Le petit caisson vert au-dessus, comme au-dessus de toutes les sorties.
  k.box(0.5, 0.16, 0.06, green, x, h + 0.32, z - 0.02);
  // Un seuil, pour qu'on ait envie de le franchir.
  k.box(w, 0.03, 0.3, white, x, 0.015, z);
  return k.prop();
}

/** Banc de musée (salle récompense), tourné vers +Z local avant rotation. */
export function buildBench(x: number, z: number, angle: number): Prop {
  const k = kit();
  const wood = k.mat('#6b4a2e', 0.04);
  const metal = k.mat('#2a2a2c');
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = angle;
  k.group.add(g);
  const add = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number) => {
    const mesh = k.box(w, h, d, m, px, py, pz);
    g.add(mesh);
  };
  add(1.6, 0.06, 0.45, wood, 0, 0.45, 0);
  for (const sx of [-0.7, 0.7]) add(0.05, 0.42, 0.4, metal, sx, 0.21, 0);
  return k.prop();
}

/**
 * Faisceau d'un projecteur qui tombe du plafond sur une seule œuvre (salle récompense) :
 * un cône de lumière très pâle, additif.
 */
export function buildSpotBeam(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): Prop {
  const owned: Array<{ dispose(): void }> = [];
  const group = new THREE.Group();
  const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const geo = new THREE.ConeGeometry(0.6, len, 24, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  owned.push(geo, mat);
  const cone = new THREE.Mesh(geo, mat);
  cone.position.set(from.x, from.y, from.z);
  // Le cône pointe de `from` vers `to` (son axe est −Y).
  const dir = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z).normalize();
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  cone.renderOrder = 3;
  group.add(cone);
  return { object: group, dispose: () => owned.forEach((o) => o.dispose()) };
}

/**
 * La porte au fond du sas (visite guidée) : un battant fermé, et de la lumière qui passe
 * dessous et sur les côtés. Lumière non soumise à l'exposition : seule chose visible dans
 * le noir complet. `open(t)` ouvre le battant (0 fermé, 1 ouvert).
 */
export function buildLitDoor(z: number, width: number, height: number): Prop & { open(t: number): void } {
  const owned: Array<{ dispose(): void }> = [];
  const group = new THREE.Group();
  const leafMat = new THREE.MeshLambertMaterial({ color: '#5a4636' });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd59a', toneMapped: false, fog: false });
  const leafGeo = new THREE.BoxGeometry(width - 0.04, height - 0.03, 0.05);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  owned.push(leafMat, glowMat, leafGeo, unit);
  // Battant : pivote autour de son gond, à gauche.
  const hinge = new THREE.Group();
  hinge.position.set(-width / 2 + 0.02, 0, z - 0.03);
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.set((width - 0.04) / 2, height / 2, 0);
  hinge.add(leaf);
  hinge.userData.animated = true;
  group.add(hinge);
  // La lumière : sous la porte (franche), et un fil le long des côtés et du haut.
  const glow = new THREE.Group();
  const bar = (sx: number, sy: number, px: number, py: number) => {
    const m = new THREE.Mesh(unit, glowMat);
    m.scale.set(sx, sy, 0.01);
    m.position.set(px, py, z - 0.065);
    glow.add(m);
  };
  bar(width - 0.1, 0.035, 0, 0.018);
  for (const s of [-1, 1]) bar(0.012, height - 0.1, s * (width / 2 - 0.03), height / 2);
  bar(width - 0.1, 0.01, 0, height - 0.03);
  // Une flaque de lumière sur le sol, devant la porte.
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g2 = c.getContext('2d')!;
  const grad = g2.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,213,154,0.55)');
  grad.addColorStop(1, 'rgba(255,213,154,0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const poolGeo = new THREE.PlaneGeometry(width * 1.1, 1.2);
  owned.push(tex, poolMat, poolGeo);
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.006, z - 0.65);
  glow.add(pool);
  group.add(glow);
  return {
    object: group,
    dispose: () => owned.forEach((o) => o.dispose()),
    open(t: number) {
      const e = t * t * (3 - 2 * t);
      hinge.rotation.y = -1.8 * e;
      hinge.updateMatrix();
      hinge.updateMatrixWorld(true);
      glow.visible = t < 0.05;
    },
  };
}
