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
