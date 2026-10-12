import * as THREE from 'three';
import type { AmbiancePreset } from './types';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpColor = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/**
 * Ambiance intermédiaire entre `a` et `b` (t = 0 → a, t = 1 → b), pour les
 * transitions progressives : couleurs, lumière, brouillard, hauteur et largeur
 * sont interpolés ; les motifs et le mobilier basculent à mi-chemin.
 * Le résultat est un preset ordinaire (mêmes caches, mêmes règles).
 */
export function blendPresets(a: AmbiancePreset, b: AmbiancePreset, t: number): AmbiancePreset {
  const discrete = t < 0.5 ? a : b;
  const pal = Object.fromEntries(
    Object.entries(a.palette).map(([k, v]) => [k, Array.isArray(v) ? (discrete.palette as Record<string, unknown>)[k] : lerpColor(v as string, (b.palette as unknown as Record<string, string>)[k]!, t)]),
  ) as AmbiancePreset['palette'];
  return {
    ...discrete,
    id: `${a.id}>${b.id}@${t.toFixed(2)}`,
    // Une zone de transition n'a pas de nom : le titre s'affiche à l'arrivée.
    name: undefined,
    tension: lerp(a.tension, b.tension, t),
    geometry: {
      ceilingHeight: lerp(a.geometry.ceilingHeight, b.geometry.ceilingHeight, t),
      corridorWidth: lerp(a.geometry.corridorWidth, b.geometry.corridorWidth, t),
    },
    palette: pal,
    fog: {
      color: lerpColor(a.fog.color, b.fog.color, t),
      near: lerp(a.fog.near, b.fog.near, t),
      far: lerp(a.fog.far, b.fog.far, t),
    },
    lighting: {
      hemiSky: lerpColor(a.lighting.hemiSky, b.lighting.hemiSky, t),
      hemiGround: lerpColor(a.lighting.hemiGround, b.lighting.hemiGround, t),
      hemiIntensity: lerp(a.lighting.hemiIntensity, b.lighting.hemiIntensity, t),
      artGlow: lerp(a.lighting.artGlow, b.lighting.artGlow, t),
      flicker: lerp(a.lighting.flicker, b.lighting.flicker, t),
    },
    art: { ...discrete.art, density: lerp(a.art.density, b.art.density, t) },
  };
}
