import * as THREE from 'three';
import { hashString } from '../world/random';
import { CONFIG } from '../config';

/** Couleurs des visiteurs (blouson, bonnet, ligne au sol) : tirée de l'identifiant. */
const COLORS = ['#5fd4c4', '#ff7a5c', '#f2b33d', '#9b7bff', '#4fa8ff', '#ff6fa5'];

export function playerColor(uid: string): string {
  return COLORS[hashString(uid)[0] % COLORS.length]!;
}

const SKIN = '#f0dccb';
const TROUSERS = '#2c3140';
const SHOES = '#1b1d24';
const EYES = '#15161a';

/** Étiquette du pseudo ; variante « parle » : liseré coloré et ondes. */
function drawLabel(text: string, color: string, speaking: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '600 52px system-ui, sans-serif';
  const waves = speaking ? 70 : 0;
  const w = Math.min(500, g.measureText(text).width + 64 + waves);
  const x0 = (512 - w) / 2;
  g.fillStyle = 'rgba(10, 12, 14, 0.66)';
  g.beginPath();
  g.roundRect(x0, 22, w, 84, 42);
  g.fill();
  if (speaking) {
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.stroke();
    // Trois barres, comme un petit égaliseur.
    g.fillStyle = color;
    [26, 44, 30].forEach((h, i) => g.fillRect(x0 + 34 + i * 14, 64 - h / 2, 8, h));
  }
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256 + waves / 2, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Ombre ronde et douce sous les pieds. */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * L'ami, en visiteur stylisé : bonnet et blouson à sa couleur, sac à dos. Il marche
 * (jambes, bras, balancement) au rythme où il avance, respire quand il s'arrête, et
 * lève ou baisse la tête comme sa caméra. Regarde vers −Z.
 */
export class Avatar {
  readonly root = new THREE.Group();
  private readonly owned: Array<{ dispose(): void }> = [];
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: Array<{ hip: THREE.Group; knee: THREE.Group }> = [];
  private readonly arms: Array<{ shoulder: THREE.Group; elbow: THREE.Group }> = [];
  private readonly label: THREE.Sprite;
  private readonly labels: [THREE.CanvasTexture, THREE.CanvasTexture];
  private readonly last = new THREE.Vector3();
  private speed = 0;
  private phase = 0;
  private time = 0;
  private pitch = 0;
  private wasSpeaking = false;
  private fresh = true;
  private readonly tmp = new THREE.Vector3();

  constructor(name: string, readonly color: string) {
    const mat = (c: string, glow = 0.22) => {
      const m = new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: glow, flatShading: true });
      this.owned.push(m);
      return m;
    };
    const jacket = mat(color, 0.3), dark = mat(new THREE.Color(color).multiplyScalar(0.55).getStyle(), 0.2);
    const skin = mat(SKIN, 0.18), trousers = mat(TROUSERS, 0.12), shoes = mat(SHOES, 0.08), eyes = mat(EYES, 0);
    const geo = <G extends THREE.BufferGeometry>(g: G) => (this.owned.push(g), g);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      return o;
    };

    // Bassin à hauteur de hanche : tout le haut du corps en dépend.
    this.hips.position.y = 0.92;
    this.root.add(this.hips);
    this.hips.add(this.torso);
    const chest = mesh(geo(new THREE.CapsuleGeometry(0.17, 0.36, 3, 8)), jacket, 0, 0.3, 0);
    chest.scale.set(1.2, 1, 0.78);
    const pelvis = mesh(geo(new THREE.CapsuleGeometry(0.15, 0.06, 2, 8)), trousers, 0, 0.02, 0);
    pelvis.scale.set(1.15, 1, 0.8);
    const pack = mesh(geo(new THREE.BoxGeometry(0.28, 0.32, 0.13)), dark, 0, 0.34, 0.17);
    const collar = mesh(geo(new THREE.CylinderGeometry(0.09, 0.12, 0.08, 8)), dark, 0, 0.6, 0);
    this.torso.add(chest, pelvis, pack, collar);

    // Tête : visage clair, deux yeux, bonnet à pompon.
    this.head.position.y = 0.64;
    this.torso.add(this.head);
    const face = mesh(geo(new THREE.IcosahedronGeometry(0.13, 1)), skin, 0, 0.13, 0);
    face.scale.set(1, 1.1, 1);
    const eyeGeo = geo(new THREE.SphereGeometry(0.019, 6, 4));
    const hat = mesh(geo(new THREE.SphereGeometry(0.138, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2)), jacket, 0, 0.16, 0);
    hat.scale.set(1, 0.95, 1);
    const brim = mesh(geo(new THREE.TorusGeometry(0.132, 0.025, 5, 14)), dark, 0, 0.165, 0);
    brim.rotation.x = Math.PI / 2;
    const pompom = mesh(geo(new THREE.IcosahedronGeometry(0.04, 0)), dark, 0, 0.3, 0);
    this.head.add(face, mesh(eyeGeo, eyes, -0.045, 0.14, -0.118), mesh(eyeGeo, eyes, 0.045, 0.14, -0.118), hat, brim, pompom);

    // Bras : épaule, coude, main.
    const upperArm = geo(new THREE.CapsuleGeometry(0.055, 0.2, 2, 6));
    const foreArm = geo(new THREE.CapsuleGeometry(0.048, 0.18, 2, 6));
    const hand = geo(new THREE.IcosahedronGeometry(0.05, 0));
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.25, 0.5, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      elbow.add(mesh(foreArm, jacket, 0, -0.13, 0), mesh(hand, skin, 0, -0.29, 0));
      shoulder.add(mesh(upperArm, jacket, 0, -0.15, 0), elbow);
      this.torso.add(shoulder);
      this.arms.push({ shoulder, elbow });
    }

    // Jambes : hanche, genou, chaussure (pointe vers l'avant).
    const thigh = geo(new THREE.CapsuleGeometry(0.075, 0.28, 2, 6));
    const shin = geo(new THREE.CapsuleGeometry(0.065, 0.28, 2, 6));
    const shoe = geo(new THREE.BoxGeometry(0.12, 0.08, 0.25));
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      knee.add(mesh(shin, trousers, 0, -0.2, 0), mesh(shoe, shoes, 0, -0.44, -0.04));
      hip.add(mesh(thigh, trousers, 0, -0.22, 0), knee);
      this.hips.add(hip);
      this.legs.push({ hip, knee });
    }

    const shadowTex = shadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const shadow = mesh(geo(new THREE.PlaneGeometry(0.9, 0.9)), shadowMat, 0, 0.012, 0);
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    this.owned.push(shadowTex, shadowMat);

    this.labels = [drawLabel(name, color, false), drawLabel(name, color, true)];
    const labelMat = new THREE.SpriteMaterial({ map: this.labels[0], transparent: true, depthWrite: false });
    this.label = new THREE.Sprite(labelMat);
    this.label.position.y = 2.02;
    this.owned.push(...this.labels, labelMat);
    this.root.add(shadow, this.label);
  }

  /**
   * Avance l'animation. `pos`/`yaw` : où il est (pieds) ; `pitch` : sa caméra ;
   * `eye` : notre caméra, pour garder le pseudo lisible de loin.
   */
  update(dt: number, pos: THREE.Vector3, yaw: number, pitch: number, speaking: boolean, eye: THREE.Vector3): void {
    if (this.fresh) this.last.copy(pos);
    this.fresh = false;
    const moved = Math.hypot(pos.x - this.last.x, pos.z - this.last.z);
    this.last.copy(pos);
    // Vitesse lissée (les positions n'arrivent que cinq fois par seconde).
    const v = dt > 0 ? Math.min(4, moved / dt) : 0;
    this.speed += (v - this.speed) * Math.min(1, dt * 6);
    const amp = Math.min(1, this.speed / CONFIG.player.walkSpeed);
    this.phase += (moved / CONFIG.headBob.strideLength) * Math.PI * 2;
    this.time += dt;
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;

    const s = Math.sin(this.phase);
    this.legs.forEach(({ hip, knee }, i) => {
      const side = i === 0 ? 1 : -1;
      hip.rotation.x = side * s * 0.5 * amp;
      // Le genou plie pendant que la jambe revient vers l'avant.
      knee.rotation.x = -amp * (0.1 + 0.8 * Math.max(0, side * Math.cos(this.phase)));
    });
    const breathe = Math.sin(this.time * 1.7);
    this.arms.forEach(({ shoulder, elbow }, i) => {
      const side = i === 0 ? -1 : 1;
      shoulder.rotation.x = -(i === 0 ? s : -s) * 0.45 * amp + (1 - amp) * 0.03 * breathe;
      shoulder.rotation.z = side * (0.07 + 0.02 * (1 - amp) * breathe);
      elbow.rotation.x = 0.18 + 0.3 * amp;
    });
    this.hips.position.y = 0.92 + 0.025 * amp * Math.cos(this.phase * 2) - 0.015 * amp;
    this.torso.rotation.x = -0.08 * amp;
    this.torso.rotation.y = 0.06 * s * amp;
    this.torso.scale.y = 1 + 0.008 * (1 - amp) * breathe;
    this.pitch += (pitch - this.pitch) * Math.min(1, dt * 8);
    this.head.rotation.x = Math.max(-0.6, Math.min(0.6, this.pitch * 0.8)) + 0.08 * amp;
    this.head.rotation.y = -this.torso.rotation.y;

    if (speaking !== this.wasSpeaking) {
      this.wasSpeaking = speaking;
      this.label.material.map = this.labels[speaking ? 1 : 0];
    }
    // Pseudo : taille fixe de près, grossit au-delà de 6 m pour rester lisible.
    const k = Math.max(1, eye.distanceTo(this.label.getWorldPosition(this.tmp)) / 6) * (speaking ? 1 + 0.04 * Math.sin(this.time * 14) : 1);
    this.label.scale.set(1.5 * k, 0.375 * k, 1);
  }

  /** Après un saut (téléportation, recentrage), pas d'élan fictif. */
  reset(): void {
    this.fresh = true;
    this.speed = 0;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const o of this.owned) o.dispose();
  }
}
