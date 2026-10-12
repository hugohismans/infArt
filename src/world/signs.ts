import * as THREE from 'three';
import type { AmbiancePreset } from '../ambiances/types';
import { CONFIG } from '../config';
import { dot, sub, type Vec2 } from './math2d';
import { wallNormal, type ArtSlotDef, type ModuleDef } from './modules/defs';

/**
 * Panneaux d'orientation : le nom d'un thème écrit en grand sur un mur, avec une flèche
 * vers l'ouverture qui y mène (« LA MER → »). Trois façons de les poser, par ordre de
 * préférence :
 * - au-dessus de la porte, quand un linteau la surmonte (rotonde) : pas besoin de flèche ;
 * - sur le même mur, à côté de l'ouverture, flèche vers elle ;
 * - sur le mur du fond, face au visiteur qui arrive (carrefours dont les côtés sont
 *   entièrement ouverts), flèche à gauche ou à droite.
 */
export interface SignSpot {
  /** Centre du panneau au pied du mur (repère du module). */
  pos: Vec2;
  /** Normale du mur, vers l'intérieur. */
  normal: Vec2;
  /** Hauteur du centre et taille maximale. */
  y: number;
  maxWidth: number;
  maxHeight: number;
  /** Flèche, vue de face : vers la gauche, la droite, ou aucune. */
  arrow: -1 | 0 | 1;
}

/** Point du plan sur un mur plein (hors obstacles), à 5 cm près. */
function onWall(def: ModuleDef, p: Vec2, n: Vec2, halfWidth: number): boolean {
  return def.walls.some((w) => {
    if (w.obstacle || w.height !== undefined) return false;
    const wn = wallNormal(w.seg);
    if (dot(wn, n) < 0.99) return false;
    const d = sub(w.seg.b, w.seg.a);
    const len = Math.hypot(d.x, d.z);
    const u = { x: d.x / len, z: d.z / len };
    const rel = sub(p, w.seg.a);
    if (Math.abs(dot(rel, wn)) > 0.05) return false;
    const t = dot(rel, u);
    return t - halfWidth > 0.15 && t + halfWidth < len - 0.15;
  });
}

/** Flèche vue de face, pour un panneau de normale `n` (vers le visiteur) qui désigne `target`. */
function arrowTo(spot: Vec2, n: Vec2, target: Vec2): -1 | 1 {
  // Le lecteur regarde le mur (direction −n) : sa droite est (n.z, −n.x).
  const right = { x: n.z, z: -n.x };
  return dot(sub(target, spot), right) > 0 ? 1 : -1;
}

/** Où poser le panneau de l'ouverture `index` (null : pas de place). */
export function signSpot(def: ModuleDef, preset: AmbiancePreset, index: number): SignSpot | null {
  const c = def.connectors[index];
  // (L'entrée d'un module n'a pas de panneau, sauf dans la salle ronde où toutes les portes se valent.)
  if (!c || (index === 0 && def.kind !== 'rotonde')) return null;
  const ceiling = def.ceilingHeight ?? preset.geometry.ceilingHeight * def.ceilingScale;
  const top = c.top ?? preset.geometry.ceilingHeight;
  const inward = { x: -c.normal.x, z: -c.normal.z };
  // 1. Au-dessus de la porte.
  const lintel = def.lintels?.some((l) => Math.hypot((l.a.x + l.b.x) / 2 - c.pos.x, (l.a.z + l.b.z) / 2 - c.pos.z) < 0.2);
  if (lintel && ceiling - top > 0.8) {
    return { pos: { ...c.pos }, normal: inward, y: top + (ceiling - top) / 2, maxWidth: c.width, maxHeight: (ceiling - top) * 0.7, arrow: 0 };
  }
  const W = CONFIG.signs.width;
  const y = Math.min(CONFIG.signs.height, ceiling * 0.55);
  const maxHeight = Math.min(1.1, ceiling * 0.35);
  // 2. À côté de l'ouverture, côté entrée d'abord.
  const along = { x: -c.normal.z, z: c.normal.x };
  const entry = def.connectors[0]!.pos;
  const sides = [1, -1].sort((a, b) => {
    const pa = { x: c.pos.x + along.x * a, z: c.pos.z + along.z * a };
    const pb = { x: c.pos.x + along.x * b, z: c.pos.z + along.z * b };
    return Math.hypot(pa.x - entry.x, pa.z - entry.z) - Math.hypot(pb.x - entry.x, pb.z - entry.z);
  });
  for (const s of sides) {
    const off = c.width / 2 + 0.35 + W / 2;
    const p = { x: c.pos.x + along.x * s * off, z: c.pos.z + along.z * s * off };
    if (onWall(def, p, inward, W / 2)) return { pos: p, normal: inward, y, maxWidth: W, maxHeight, arrow: arrowTo(p, inward, c.pos) };
  }
  // 3. Sur le mur qui fait face au visiteur entrant.
  const e = def.connectors[0]!;
  const facing = { x: e.normal.x, z: e.normal.z };
  for (const w of def.walls) {
    if (w.obstacle || w.height !== undefined) continue;
    const wn = wallNormal(w.seg);
    if (dot(wn, facing) < 0.99) continue;
    const mid = { x: (w.seg.a.x + w.seg.b.x) / 2, z: (w.seg.a.z + w.seg.b.z) / 2 };
    const len = Math.hypot(w.seg.b.x - w.seg.a.x, w.seg.b.z - w.seg.a.z);
    if (len < W + 0.4) continue;
    return { pos: mid, normal: wn, y, maxWidth: W, maxHeight, arrow: arrowTo(mid, wn, c.pos) };
  }
  return null;
}

/** Emplacement fictif qui réserve la place du panneau (œuvres et décor l'évitent). */
export function signSlot(spot: SignSpot): ArtSlotDef {
  return { pos: spot.pos, y: 0, normal: spot.normal, maxWidth: spot.maxWidth + 0.3 };
}

/** Un emplacement d'œuvre empiète-t-il sur le panneau ? */
export function slotHitsSign(slot: ArtSlotDef, spot: SignSpot): boolean {
  if (spot.arrow === 0 || dot(slot.normal, spot.normal) < 0.99) return false;
  const rel = sub(slot.pos, spot.pos);
  if (Math.abs(dot(rel, spot.normal)) > 0.1) return false;
  const along = Math.abs(rel.x * -spot.normal.z + rel.z * spot.normal.x) - (slot.offset ?? 0);
  return Math.abs(along) < spot.maxWidth / 2 + slot.maxWidth / 2 + 0.2;
}

function luminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Titre de thème découpé pour le mur : « Dans la lignée de « X » » → petite ligne + X en grand. */
function words(title: string): { small: string | null; big: string } {
  const m = title.match(/^(.*?)\s*«\s*(.+?)\s*»\s*$/);
  if (m && m[1]) return { small: m[1], big: m[2]! };
  return { small: null, big: title };
}

/**
 * Allure d'un panneau : lettres peintes du musée ; « vert » : panneau lumineux de sortie de
 * secours (pas le style de la maison) ; « petit » : le même en minuscules, discret.
 */
export type SignStyle = 'mur' | 'vert' | 'petit';

export interface SignLook {
  title: string;
  style?: SignStyle;
  /** Étoile devant le nom (le pari du Conservateur, jeu des trois portes). */
  star?: boolean;
}

/**
 * Le panneau lui-même : lettres peintes (encre sombre sur mur clair, claire sur mur
 * sombre), flèche, et un poteau quand le mur est invisible (ciel ouvert).
 */
export function buildSign(spot: SignSpot, look: SignLook, preset: AmbiancePreset): { object: THREE.Object3D; dispose(): void } {
  const style = look.style ?? 'mur';
  const green = style === 'vert' || style === 'petit';
  const dark = luminance(preset.palette.wall) > 0.45;
  const ink = green ? '#ffffff' : dark ? '#1d1c1a' : '#f4efe4';
  const { small, big } = words(look.title);
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d')!;
  const H = 256;
  const family = green ? `'Helvetica Neue', Arial, sans-serif` : `Georgia, 'Times New Roman', serif`;
  const bigFont = `700 ${small ? 120 : 150}px ${family}`;
  g.font = bigFont;
  const bigText = (look.star ? '★ ' : '') + (style === 'petit' ? big.toLowerCase() : big.toUpperCase());
  const arrowW = spot.arrow !== 0 ? 260 : 0;
  const textW = g.measureText(bigText).width;
  // (Un blanc entre le mot et la flèche.)
  canvas.width = Math.min(2048, Math.ceil(textW + arrowW + (arrowW ? 140 : 80)));
  canvas.height = H;
  if (green) {
    // Le caisson vert d'une sortie de secours.
    g.fillStyle = '#12924a';
    g.beginPath();
    g.roundRect(4, 16, canvas.width - 8, H - 32, 26);
    g.fill();
  }
  g.font = bigFont;
  g.fillStyle = ink;
  g.textBaseline = 'middle';
  const x0 = spot.arrow < 0 ? arrowW + 100 : 40;
  const yBig = small ? 160 : H / 2 + 6;
  g.fillText(bigText, x0, yBig, canvas.width - (arrowW ? 140 : 80) - arrowW);
  if (small) {
    g.font = `italic 400 64px Georgia, 'Times New Roman', serif`;
    g.fillText(small, x0, 58, canvas.width - (arrowW ? 140 : 80) - arrowW);
  }
  if (spot.arrow !== 0) {
    // Flèche pleine, à l'extrémité du côté de l'ouverture.
    const cx = spot.arrow > 0 ? canvas.width - 40 - arrowW / 2 : 40 + arrowW / 2;
    const cy = H / 2;
    g.save();
    g.translate(cx, cy);
    g.scale(spot.arrow * 1.4, 1.4);
    g.beginPath();
    g.moveTo(-80, -22);
    g.lineTo(10, -22);
    g.lineTo(10, -60);
    g.lineTo(85, 0);
    g.lineTo(10, 60);
    g.lineTo(10, 22);
    g.lineTo(-80, 22);
    g.closePath();
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const aspect = canvas.width / H;
  // Au-dessus d'une porte, le linteau entier ; au mur, des lettres d'une cinquantaine de cm.
  let h = (spot.arrow === 0 ? spot.maxHeight : Math.min(spot.maxHeight, small ? 1 : 0.85)) * (style === 'petit' ? 0.4 : green ? 0.7 : 1);
  let w = h * aspect;
  if (w > spot.maxWidth) {
    w = spot.maxWidth;
    h = w / aspect;
  }
  const geo = new THREE.PlaneGeometry(w, h);
  // Le caisson de sortie est lumineux ; les lettres peintes prennent la lumière de la salle.
  const mat = green
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
    : new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.2, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  const off = CONFIG.world.wallGap + 0.01;
  mesh.position.set(spot.pos.x + spot.normal.x * off, spot.y, spot.pos.z + spot.normal.z * off);
  mesh.rotation.y = Math.atan2(spot.normal.x, spot.normal.z);
  group.add(mesh);
  const owned: Array<{ dispose(): void }> = [geo, mat, tex];
  // Ciel ouvert : le mur ne se voit pas, le panneau est cloué sur un poteau.
  if (preset.surfaces.wall === 'brume') {
    const postH = spot.y - h / 2 + 0.15;
    const postGeo = new THREE.BoxGeometry(0.1, postH, 0.1);
    const postMat = new THREE.MeshLambertMaterial({ color: '#5a4636' });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(spot.pos.x + spot.normal.x * 0.12, postH / 2, spot.pos.z + spot.normal.z * 0.12);
    const boardGeo = new THREE.BoxGeometry(w + 0.2, h + 0.16, 0.05);
    const boardMat = new THREE.MeshLambertMaterial({ color: dark ? '#ece6d8' : '#3a2f27' });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(spot.pos.x + spot.normal.x * 0.2, spot.y, spot.pos.z + spot.normal.z * 0.2);
    board.rotation.y = mesh.rotation.y;
    mesh.position.set(spot.pos.x + spot.normal.x * 0.23, spot.y, spot.pos.z + spot.normal.z * 0.23);
    group.add(post, board);
    owned.push(postGeo, postMat, boardGeo, boardMat);
  }
  return { object: group, dispose: () => owned.forEach((o) => o.dispose()) };
}
