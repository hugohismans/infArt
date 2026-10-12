import type { Database, Unsubscribe } from 'firebase/database';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Engine } from '../engine/Engine';
import { segmentsIntersect } from '../world/math2d';
import type { DatabaseApi } from './firebase';
import type { Session } from './Session';

/** Serveurs STUN publics : suffisent en wifi ; un relais TURN (Worker) prend le relais sinon. */
const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

/** Au-delà de ce nombre de salles entre les deux visiteurs, on ne s'entend plus. */
const MAX_ROOMS = 2;

/**
 * Chat vocal de proximité (visite à deux) : un appel audio direct entre les deux
 * navigateurs (WebRTC), la mise en relation passant par la session Firebase.
 *
 * La voix de l'ami sort de son avatar (son spatialisé, réverbération de la salle) :
 * pleine dans la même salle, étouffée derrière un mur, de plus en plus faible d'une salle
 * à l'autre, muette au-delà de deux salles.
 *
 * Base : sessions/{sid}/rtc/{ offer, answer, ice/{uid}/{id} } — l'hôte appelle, l'invité répond.
 */
export class Voice {
  /** Micro ouvert. */
  micOn = false;
  /** L'ami parle (niveau de sa voix au-dessus d'un seuil). */
  friendSpeaking = false;
  /** Je parle. */
  meSpeaking = false;
  /** État de la liaison audio, pour l'interface. */
  link: 'connecting' | 'connected' | 'failed' = 'connecting';

  private pc: RTCPeerConnection | null = null;
  private sender: RTCRtpSender | null = null;
  private mic: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private readonly unsubs: Unsubscribe[] = [];
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private gen = 0;
  // Chaîne de lecture : source → filtre (mur) → gain (distance) → panoramique → dry/réverbération.
  private audioEl: HTMLAudioElement | null = null;
  private nodes: { src: MediaStreamAudioSourceNode; filter: BiquadFilterNode; gain: GainNode; panner: PannerNode; send: GainNode; analyser: AnalyserNode } | null = null;
  private readonly buf = new Uint8Array(256);
  private retryTimer = 0;

  constructor(
    private readonly F: DatabaseApi,
    private readonly db: Database,
    private readonly session: Session,
    private readonly engine: Engine,
    private readonly audio: AudioEngine,
    /** Relais TURN (Worker), facultatif. */
    private readonly turnUrl: string | null,
  ) {}

  private ref(path: string) {
    return this.F.ref(this.db, `sessions/${this.session.sid}/rtc/${path}`);
  }

  async start(): Promise<void> {
    await this.connect();
  }

  /** Ouvre ou coupe le micro (l'autorisation est demandée au premier usage). */
  async setMic(on: boolean): Promise<boolean> {
    if (on && !this.mic) {
      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch {
        return false;
      }
      const io = this.audio.externalInputs();
      if (io) {
        this.micAnalyser = io.ctx.createAnalyser();
        this.micAnalyser.fftSize = 512;
        io.ctx.createMediaStreamSource(this.mic).connect(this.micAnalyser);
      }
    }
    const track = this.mic?.getAudioTracks()[0] ?? null;
    if (track) track.enabled = on;
    if (this.sender && this.sender.track !== track && on) await this.sender.replaceTrack(track);
    this.micOn = on && !!track;
    return this.micOn;
  }

  private async iceServers(): Promise<RTCIceServer[]> {
    if (!this.turnUrl) return STUN;
    try {
      const res = await fetch(this.turnUrl);
      if (!res.ok) return STUN;
      const data = (await res.json()) as { iceServers?: RTCIceServer[] | RTCIceServer };
      const turn = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
      return [...STUN, ...turn];
    } catch {
      return STUN;
    }
  }

  /** (Re)crée la liaison : l'hôte envoie une offre, l'invité y répond. */
  private async connect(): Promise<void> {
    const { onValue, onChildAdded, push, set, remove } = this.F;
    const gen = ++this.gen;
    this.teardownPeer();
    this.link = 'connecting';
    const pc = new RTCPeerConnection({ iceServers: await this.iceServers() });
    if (gen !== this.gen) return pc.close();
    this.pc = pc;
    this.remoteSet = false;
    this.pendingIce = [];
    const me = this.session.me, friend = this.session.friendUid;
    const host = this.session.role === 'host';
    // Les candidats sont rattachés à l'offre de l'hôte (son numéro), des deux côtés.
    const offerGen = () => (host ? gen : this.offerGen);
    pc.onicecandidate = (e) => {
      if (e.candidate) void push(this.ref(`ice/${me}`), { ...e.candidate.toJSON(), gen: offerGen() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.link = 'connected';
      if (pc.connectionState === 'failed') this.link = 'failed';
    };
    pc.ontrack = (e) => this.playRemote(e.streams[0] ?? new MediaStream([e.track]));
    const addIce = (c: RTCIceCandidateInit & { gen?: number }) => {
      if (!this.remoteSet) return void this.pendingIce.push(c);
      if (c.gen !== undefined && c.gen !== offerGen()) return;
      void pc.addIceCandidate(c).catch(() => undefined);
    };
    const flushIce = () => {
      this.remoteSet = true;
      for (const c of this.pendingIce as Array<RTCIceCandidateInit & { gen?: number }>) {
        if (c.gen === undefined || c.gen === offerGen()) void pc.addIceCandidate(c).catch(() => undefined);
      }
      this.pendingIce = [];
    };
    this.unsubs.push(onChildAdded(this.ref(`ice/${friend}`), (s) => addIce(s.val() as RTCIceCandidateInit & { gen?: number })));

    if (host) {
      await remove(this.ref('answer'));
      const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.sender = tr.sender;
      if (this.micOn && this.mic) await this.sender.replaceTrack(this.mic.getAudioTracks()[0] ?? null);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await set(this.ref('offer'), { type: offer.type, sdp: offer.sdp, gen });
      this.unsubs.push(
        onValue(this.ref('answer'), (s) => {
          const a = s.val() as { type: RTCSdpType; sdp: string; gen: number } | null;
          if (!a || a.gen !== gen || pc.signalingState !== 'have-local-offer') return;
          void pc.setRemoteDescription({ type: a.type, sdp: a.sdp }).then(flushIce);
        }),
      );
    } else {
      this.unsubs.push(
        onValue(this.ref('offer'), (s) => {
          const o = s.val() as { type: RTCSdpType; sdp: string; gen: number } | null;
          if (!o) return;
          // Nouvelle offre (l'hôte a relancé) : on repart sur une liaison neuve.
          if (this.remoteSet || pc.signalingState !== 'stable') {
            if (o.gen !== this.offerGen) void this.connect();
            return;
          }
          this.offerGen = o.gen;
          void (async () => {
            await pc.setRemoteDescription({ type: o.type, sdp: o.sdp });
            flushIce();
            const tr = pc.getTransceivers()[0];
            if (tr) {
              tr.direction = 'sendrecv';
              this.sender = tr.sender;
              if (this.micOn && this.mic) await tr.sender.replaceTrack(this.mic.getAudioTracks()[0] ?? null);
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await set(this.ref('answer'), { type: answer.type, sdp: answer.sdp, gen: o.gen });
          })();
        }),
      );
    }
  }
  private offerGen = -1;

  /** Voix de l'ami : spatialisée à la position de son avatar. */
  private playRemote(stream: MediaStream): void {
    const io = this.audio.externalInputs();
    // (Chrome ne fait couler un flux distant dans Web Audio que s'il est aussi attaché à un élément média.)
    this.audioEl?.remove();
    const el = document.createElement('audio');
    el.srcObject = stream;
    el.muted = true;
    void el.play().catch(() => undefined);
    this.audioEl = el;
    if (!io) {
      // Son pas encore démarré : lecture simple, non spatialisée.
      el.muted = false;
      return;
    }
    this.disconnectNodes();
    const { ctx } = io;
    const src = ctx.createMediaStreamSource(stream);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 2;
    panner.rolloffFactor = 1.2;
    const send = ctx.createGain();
    send.gain.value = 0.25;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    src.connect(filter).connect(gain).connect(panner);
    panner.connect(io.dry);
    panner.connect(send).connect(io.reverb);
    this.nodes = { src, filter, gain, panner, send, analyser };
  }

  /** À chaque image : position de la voix, distance, murs, indicateurs de parole. */
  update(dt: number): void {
    const s = this.session, n = this.nodes;
    // Liaison en échec (réseau) : l'hôte relance de temps en temps.
    if (this.link === 'failed' && this.session.role === 'host') {
      this.retryTimer -= dt;
      if (this.retryTimer <= 0) {
        this.retryTimer = 8;
        void this.connect();
      }
    }
    this.meSpeaking = this.micOn && level(this.micAnalyser, this.buf) > 0.04;
    if (!n) return;
    this.friendSpeaking = level(n.analyser, this.buf) > 0.04;
    const f = s.friend;
    const world = this.engine.world;
    const ctx = n.panner.context;
    const t = ctx.currentTime;
    const rooms = s.path.length > 0 ? s.path.length - 1 : Infinity;
    let target = 0, cutoff = 18000;
    if (f && s.state === 'active' && rooms <= MAX_ROOMS) {
      const x = f.x + world.offset.x, z = f.z + world.offset.z;
      setPos(n.panner, x, f.y + 1.5, z, t);
      // Même salle : pleine voix ; une salle plus loin, moins ; deux, à peine.
      target = rooms === 0 ? 1 : rooms === 1 ? 0.7 : 0.35;
      // Un mur entre nous (pas de ligne de vue) : la voix est étouffée.
      const me = this.engine.player.position;
      const blocked = [...world.modules].some((m) => m.graphDistance <= 2 && m.walls.some((w) => segmentsIntersect(me, { x, z }, w.a, w.b)));
      if (blocked) {
        cutoff = 900;
        target *= 0.6;
      }
    }
    n.gain.gain.setTargetAtTime(target, t, 0.25);
    n.filter.frequency.setTargetAtTime(cutoff, t, 0.2);
  }

  private disconnectNodes(): void {
    if (!this.nodes) return;
    for (const node of Object.values(this.nodes)) node.disconnect();
    this.nodes = null;
  }

  private teardownPeer(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.pc?.close();
    this.pc = null;
    this.sender = null;
  }

  dispose(): void {
    this.gen++;
    this.teardownPeer();
    this.disconnectNodes();
    this.audioEl?.remove();
    this.audioEl = null;
    for (const tr of this.mic?.getTracks() ?? []) tr.stop();
    this.mic = null;
    this.micAnalyser?.disconnect();
    this.micAnalyser = null;
    this.micOn = false;
  }
}

/** Niveau RMS (0..1) d'un analyseur. */
function level(a: AnalyserNode | null, buf: Uint8Array): number {
  if (!a) return 0;
  a.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

function setPos(p: PannerNode, x: number, y: number, z: number, t: number): void {
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, t, 0.05);
    p.positionY.setTargetAtTime(y, t, 0.05);
    p.positionZ.setTargetAtTime(z, t, 0.05);
  } else (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(x, y, z);
}
