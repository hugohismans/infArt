/**
 * Générateur pseudo-aléatoire à graine (sfc32) + hachage de chaînes (cyrb128).
 * Tout le procédural passe par ici pour qu'une génération soit reproductible.
 */

/** Hache une chaîne en quatre entiers 32 bits (cyrb128). */
export function hashString(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /** Crée un générateur à partir de n'importe quelle combinaison de clés. */
  constructor(...keys: Array<string | number>) {
    [this.a, this.b, this.c, this.d] = hashString(keys.join('|'));
    // Quelques tours à vide pour bien mélanger l'état initial.
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Entier 32 bits non signé. */
  nextUint(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    return this.nextUint() / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entier dans [min, max] (bornes incluses). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick sur une liste vide');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Tirage pondéré ; `weights` associe chaque clé à son poids (≥ 0). */
  weighted<K extends string>(weights: Readonly<Record<K, number>>): K {
    const entries = Object.entries(weights) as Array<[K, number]>;
    const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
    let r = this.next() * total;
    for (const [key, w] of entries) {
      r -= Math.max(0, w);
      if (r < 0) return key;
    }
    return entries[entries.length - 1]![0];
  }

  /** Mélange de Fisher-Yates (renvoie une copie). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

/** Graine lisible, facile à partager (ex. « k7f2-q9xm »). */
export function randomSeed(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const values = crypto.getRandomValues(new Uint32Array(8));
  let s = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) s += '-';
    s += alphabet[values[i]! % alphabet.length];
  }
  return s;
}
