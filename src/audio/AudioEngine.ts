import type { FloorPattern, SoundProfile } from '../ambiances/types';
import { CONFIG } from '../config';

type StepSpec = { thump: number; thumpGain: number; click: number; clickQ: number; clickGain: number; len: number; wet: number };

/** Sonorité des pas par famille de sol. */
const STEP_SPECS: Record<'bois' | 'dur' | 'sonore' | 'mou' | 'eau' | 'crissant', StepSpec> = {
  bois: { thump: 95, thumpGain: 0.9, click: 1900, clickQ: 0.9, clickGain: 0.55, len: 0.07, wet: 0.35 },
  dur: { thump: 110, thumpGain: 0.5, click: 3200, clickQ: 0.7, clickGain: 0.8, len: 0.05, wet: 0.6 },
  sonore: { thump: 120, thumpGain: 0.45, click: 4200, clickQ: 1.2, clickGain: 0.95, len: 0.045, wet: 0.7 },
  mou: { thump: 75, thumpGain: 0.55, click: 520, clickQ: 0.6, clickGain: 0.35, len: 0.09, wet: 0.05 },
  // Éclaboussure : un bruit long et clair.
  eau: { thump: 70, thumpGain: 0.25, click: 1300, clickQ: 0.5, clickGain: 0.9, len: 0.22, wet: 0.5 },
  // Sable, neige : crissement étouffé.
  crissant: { thump: 60, thumpGain: 0.3, click: 2600, clickQ: 0.4, clickGain: 0.6, len: 0.16, wet: 0.05 },
};

const STEP_KIND: Record<FloorPattern, keyof typeof STEP_SPECS> = {
  parquet: 'bois',
  tatami: 'mou',
  beton: 'dur',
  lino: 'dur',
  grille: 'dur',
  carrelage: 'sonore',
  marbre: 'sonore',
  moquette: 'mou',
  nuages: 'mou',
  herbe: 'mou',
  eau: 'eau',
  sable: 'crissant',
  neige: 'crissant',
};

/**
 * Son procédural (Web Audio, aucun fichier) : tout est synthétisé à partir de bruit
 * et d'oscillateurs, donc libre de droits et très léger.
 *
 * - Nappes d'ambiance en boucle (souffle de la pièce, ventilation, néons, pluie sur la
 *   verrière), dont les volumes suivent le profil sonore de l'ambiance : les
 *   transitions sont des fondus enchaînés.
 * - Évènements ponctuels : pas lointains, oiseaux.
 * - Pas du visiteur selon le sol, gouttes spatialisées.
 *
 * Le contexte audio n'est créé qu'au premier geste du visiteur (contrainte des navigateurs).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private reverb!: ConvolverNode;
  private layers!: Record<'roomTone' | 'hvac' | 'hum' | 'rain' | 'wind' | 'water' | 'crackle', GainNode>;
  private nextBleep = 2;
  private nextCricket = 1;
  private humBuzz!: GainNode;
  private noise!: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };
  private muted = false;
  private nextDistantSteps = 8;
  private nextBird = 5;
  private flickerTimer = 0;
  private rainDrift = 0;

  get started(): boolean {
    return this.ctx !== null;
  }

  /** À appeler depuis un geste du visiteur (clic sur « Entrer »). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.build(this.ctx);
    }
    void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : CONFIG.audio.volume, this.ctx.currentTime, 0.15);
  }

  /**
   * Entrées pour une source extérieure (la voix de l'ami, visite à deux) : son direct et
   * départ vers la réverbération de la salle. Null tant que le son n'est pas démarré.
   */
  externalInputs(): { ctx: AudioContext; dry: AudioNode; reverb: AudioNode } | null {
    return this.ctx ? { ctx: this.ctx, dry: this.dry, reverb: this.reverb } : null;
  }

  /** Onglet masqué : on suspend tout (batterie). */
  suspend(hidden: boolean): void {
    if (!this.ctx) return;
    void (hidden ? this.ctx.suspend() : this.ctx.resume());
  }

  /** Position et orientation de l'auditeur (la caméra). */
  setListener(x: number, y: number, z: number, fx: number, fz: number): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      const t = this.ctx!.currentTime;
      l.positionX.setValueAtTime(x, t);
      l.positionY.setValueAtTime(y, t);
      l.positionZ.setValueAtTime(z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      // Safari ancien.
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
      (l as unknown as { setOrientation(...v: number[]): void }).setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /**
   * Avance d'une image : suit le profil de l'ambiance (fondus de quelques secondes)
   * et déclenche les évènements ponctuels. `listener` : position du visiteur.
   */
  update(dt: number, profile: SoundProfile, flicker: number, listener: { x: number; y: number; z: number }): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const fade = CONFIG.audio.crossfade / 3;
    const v = CONFIG.audio.layers;
    this.layers.roomTone.gain.setTargetAtTime(profile.roomTone * v.roomTone, t, fade);
    this.layers.hvac.gain.setTargetAtTime(profile.hvac * v.hvac, t, fade);
    // La pluie va et vient.
    this.rainDrift += dt * 0.07;
    const gust = 0.75 + 0.25 * Math.sin(this.rainDrift * 2.3) * Math.sin(this.rainDrift * 0.9 + 1);
    this.layers.rain.gain.setTargetAtTime(profile.rain * v.rain * gust, t, fade);
    const windGust = 0.55 + 0.45 * Math.sin(this.rainDrift * 1.7 + 2) * Math.sin(this.rainDrift * 0.6);
    this.layers.wind.gain.setTargetAtTime(profile.wind * v.wind * windGust, t, fade);
    this.layers.water.gain.setTargetAtTime(profile.water * v.water * (0.8 + 0.2 * Math.sin(this.rainDrift * 5)), t, fade);
    this.layers.crackle.gain.setTargetAtTime(profile.crackle * v.crackle, t, fade);
    // Néons : bourdonnement constant, grésillement qui suit le vacillement.
    let hum = profile.hum * v.hum;
    this.flickerTimer -= dt;
    if (profile.hum > 0.05 && flicker > 0 && this.flickerTimer <= 0 && Math.random() < flicker * dt * 60) {
      this.flickerTimer = 0.08 + Math.random() * 0.2;
    }
    if (this.flickerTimer > 0) hum *= 0.25 + Math.random() * 1.6;
    this.layers.hum.gain.setTargetAtTime(hum, t, 0.03);
    this.humBuzz.gain.setTargetAtTime(this.flickerTimer > 0 ? profile.hum * v.hum * 2.2 : profile.hum * v.hum * 0.25, t, 0.02);
    this.wet.gain.setTargetAtTime(0.15 + profile.reverb * 0.85, t, fade);

    // Évènements ponctuels.
    this.nextDistantSteps -= dt;
    if (this.nextDistantSteps <= 0) {
      this.nextDistantSteps = 10 + Math.random() * 25;
      if (Math.random() < profile.distantSteps) this.distantWalker(listener);
    }
    this.nextBleep -= dt;
    if (this.nextBleep <= 0) {
      this.nextBleep = 0.8 + Math.random() * 3;
      if (Math.random() < profile.bleeps) this.bleep(listener);
    }
    this.nextCricket -= dt;
    if (this.nextCricket <= 0) {
      this.nextCricket = 0.25 + Math.random() * 0.9;
      if (Math.random() < profile.crickets) this.cricket(listener);
    }
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 2 + Math.random() * 7;
      if (Math.random() < profile.birds) this.bird(listener);
    }
  }

  /** Un pas du visiteur, selon le sol. `run` : pas plus appuyé. */
  footstep(floor: FloorPattern, run: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const gain = CONFIG.audio.footsteps * (run ? 1.25 : 1) * (0.8 + Math.random() * 0.35);
    this.step(ctx.currentTime, floor, gain, null);
  }

  /** Une goutte tombe dans un seau, à la position (monde) donnée. */
  drip(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const p = this.panner(x, y, z, 1.2);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = 900 + Math.random() * 700;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * 1.9, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(CONFIG.audio.drips, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(p);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // --- Construction ----------------------------------------------------------

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : CONFIG.audio.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.4;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(ctx, 2.6, 2.8);
    this.dry.connect(this.master);
    this.reverb.connect(this.wet).connect(this.master);

    this.noise = { white: this.noiseBuffer(ctx, 'white'), pink: this.noiseBuffer(ctx, 'pink'), brown: this.noiseBuffer(ctx, 'brown') };
    const loop = (buffer: AudioBuffer, ...nodes: AudioNode[]): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      // Départ décalé : deux nappes du même bruit ne sont jamais en phase.
      src.start(0, Math.random() * buffer.duration);
      const g = ctx.createGain();
      g.gain.value = 0;
      let node: AudioNode = src;
      for (const n of nodes) node = node.connect(n);
      node.connect(g);
      g.connect(this.dry);
      return g;
    };
    const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };

    // Souffle de la pièce : bruit brun très filtré.
    const roomTone = loop(this.noise.brown, filter('lowpass', 220));
    // Ventilation : bruit rose en bande moyenne.
    const hvac = loop(this.noise.pink, filter('bandpass', 520, 0.5), filter('lowpass', 1400));
    // Pluie sur la verrière : bruit blanc dans les aigus, envoyé aussi dans la réverbération.
    const rain = loop(this.noise.white, filter('highpass', 1800), filter('lowpass', 7500));
    rain.connect(this.reverb);

    // Néons : 60 Hz et harmoniques, plus un grésillement aigu.
    const hum = ctx.createGain();
    hum.gain.value = 0;
    hum.connect(this.dry);
    for (const [f, a, type] of [[60, 0.5, 'sawtooth'], [120, 0.35, 'sine'], [180, 0.15, 'sine'], [240, 0.08, 'sine']] as Array<[number, number, OscillatorType]>) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(filter('lowpass', 900)).connect(g).connect(hum);
      o.start();
    }
    this.humBuzz = loop(this.noise.white, filter('bandpass', 3400, 6));
    // Vent : bruit brun dans les médiums, qui siffle un peu.
    const wind = loop(this.noise.brown, filter('bandpass', 420, 0.8), filter('lowpass', 1600));
    // Clapotis : bruit rose grave et doux.
    const water = loop(this.noise.pink, filter('lowpass', 650), filter('highpass', 120));
    water.connect(this.reverb);
    // Vinyle : souffle léger et craquements, en boucle.
    const crackle = loop(this.crackleBuffer(ctx), filter('highpass', 900));
    this.layers = { roomTone, hvac, hum, rain, wind, water, crackle };
  }

  /** Réponse impulsionnelle synthétique : bruit à décroissance exponentielle (stéréo). */
  private impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private noiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBuffer {
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'white') d[i] = w * 0.5;
      else if (color === 'pink') {
        // Filtre de Paul Kellet (version courte).
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    }
    // Raccord de boucle sans clic : fondu sur les bords.
    const edge = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < edge; i++) {
      const k = i / edge;
      d[i] = d[i]! * k + d[len - edge + i]! * (1 - k);
    }
    return buf;
  }

  private panner(x: number, y: number, z: number, ref: number): PannerNode {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.2;
    p.maxDistance = 60;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else {
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
    }
    p.connect(this.dry);
    p.connect(this.reverb);
    return p;
  }

  /**
   * Bruit de pas synthétique : un choc grave (talon) et un claquement filtré selon
   * le sol ; la moquette étouffe tout, le béton et le carrelage claquent et résonnent.
   */
  private step(t: number, floor: FloorPattern, gain: number, out: AudioNode | null): void {
    const ctx = this.ctx!;
    const dest = out ?? this.dry;
    const spec = STEP_SPECS[STEP_KIND[floor]];
    const jitter = 0.9 + Math.random() * 0.2;
    // Talon.
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(spec.thump * 1.6 * jitter, t);
    o.frequency.exponentialRampToValueAtTime(spec.thump * jitter, t + 0.05);
    og.gain.setValueAtTime(gain * spec.thumpGain, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og).connect(dest);
    o.start(t);
    o.stop(t + 0.1);
    // Claquement.
    const n = ctx.createBufferSource();
    n.buffer = this.noise.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = spec.click * jitter;
    f.Q.value = spec.clickQ;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * spec.clickGain, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + spec.len);
    n.connect(f).connect(ng);
    ng.connect(dest);
    if (!out && spec.wet > 0) {
      const w = ctx.createGain();
      w.gain.value = spec.wet * 0.5;
      ng.connect(w).connect(this.reverb);
    }
    n.start(t, Math.random() * 2);
    n.stop(t + spec.len + 0.02);
  }

  /** Quelqu'un marche au loin, quelque part dans le musée. */
  private distantWalker(at: { x: number; y: number; z: number }): void {
    const ctx = this.ctx!;
    const a = Math.random() * Math.PI * 2;
    const d = 12 + Math.random() * 14;
    const p = this.panner(at.x + Math.cos(a) * d, at.y, at.z + Math.sin(a) * d, 2);
    const g = ctx.createGain();
    g.gain.value = 0.9;
    g.connect(p);
    const steps = 5 + Math.floor(Math.random() * 8);
    const pace = 0.5 + Math.random() * 0.15;
    const floor = (['parquet', 'beton', 'carrelage'] as const)[Math.floor(Math.random() * 3)]!;
    for (let i = 0; i < steps; i++) this.step(ctx.currentTime + 0.1 + i * pace, floor, 0.5 * (1 - (i / steps) * 0.5), g);
  }

  /** Boucle de crépitement de vinyle : un souffle, des craquements épars. */
  private crackleBuffer(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.04;
    const pops = 90;
    for (let k = 0; k < pops; k++) {
      const at = Math.floor(Math.random() * (len - 200));
      const amp = 0.3 + Math.random() * 0.7;
      for (let j = 0; j < 40; j++) d[at + j]! += (Math.random() * 2 - 1) * amp * Math.exp(-j / 6);
    }
    return buf;
  }

  /** Une borne d'arcade quelque part : un petit arpège en signaux carrés. */
  private bleep(at: { x: number; y: number; z: number }): void {
    const ctx = this.ctx!;
    const a = Math.random() * Math.PI * 2;
    const p = this.panner(at.x + Math.cos(a) * 7, at.y, at.z + Math.sin(a) * 7, 2);
    const base = [262, 330, 392, 523, 659][Math.floor(Math.random() * 5)]!;
    const notes = 3 + Math.floor(Math.random() * 4);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = base * [1, 1.25, 1.5, 2, 1.5][i % 5]!;
      g.gain.setValueAtTime(CONFIG.audio.bleeps, t);
      g.gain.setValueAtTime(0, t + 0.07);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.08);
      t += 0.08;
    }
  }

  /** Stridulation d'un grillon : trois impulsions aiguës. */
  private cricket(at: { x: number; y: number; z: number }): void {
    const ctx = this.ctx!;
    const a = Math.random() * Math.PI * 2;
    const p = this.panner(at.x + Math.cos(a) * 6, at.y - 1, at.z + Math.sin(a) * 6, 2);
    const f = 4200 + Math.random() * 900;
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(CONFIG.audio.birds * 0.6, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + 0.035);
      t += 0.045;
    }
  }

  /** Gazouillis : quelques notes glissées. */
  private bird(at: { x: number; y: number; z: number }): void {
    const ctx = this.ctx!;
    const a = Math.random() * Math.PI * 2;
    const p = this.panner(at.x + Math.cos(a) * 9, at.y + 3, at.z + Math.sin(a) * 9, 3);
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1600;
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const dur = 0.05 + Math.random() * 0.08;
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), t);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(CONFIG.audio.birds, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(p);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur + 0.03 + Math.random() * 0.08;
    }
  }
}
