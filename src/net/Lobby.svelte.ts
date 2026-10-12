import type { Database, Unsubscribe } from 'firebase/database';
import { connect, type DatabaseApi } from './firebase';

/** Un visiteur connecté avec un pseudo (les anonymes ne sont pas listés). */
export interface OnlinePlayer {
  uid: string;
  name: string;
  /** Déjà en visite avec quelqu'un. */
  busy: boolean;
}

/** Invitation reçue. */
export interface Invitation {
  from: string;
  name: string;
  sid: string;
}

/** Visite à deux en cours (côté interface). */
export interface Pairing {
  sid: string;
  friend: { uid: string; name: string };
  /** Celui qui a invité : son monde reste en place, l'autre s'y raccorde. */
  role: 'host' | 'guest';
}

const ANONYMOUS = 'Anonyme';

/**
 * Le salon : connexion (pseudo ou anonyme), liste des visiteurs connectés, invitations.
 * Une invitation acceptée ouvre une session partagée ; `onPair` est alors appelé des deux
 * côtés (l'invitant est l'hôte).
 *
 * Base de données :
 * - presence/{uid} : { name, busy, at } — seulement avec un pseudo ;
 * - invites/{destinataire}/{expéditeur} : { name, sid, state? } ;
 * - sessions/{sid} : { members: { uid: true }, host, … } (voir Session).
 */
class Lobby {
  /** Connecté à Firebase (avec ou sans pseudo). */
  connected = $state(false);
  uid = $state<string | null>(null);
  name = $state<string | null>(null);
  players = $state<OnlinePlayer[]>([]);
  invitations = $state<Invitation[]>([]);
  /** Invitations envoyées, en attente de réponse (uid du destinataire). */
  pending = $state<string[]>([]);
  pairing = $state<Pairing | null>(null);
  error = $state<string | null>(null);
  /** Appelé quand une visite à deux commence (les deux côtés). */
  onPair: ((p: Pairing) => void) | null = null;

  private db: Database | null = null;
  /** Fonctions Firebase (chargées à la connexion). */
  F: DatabaseApi | null = null;
  private unsubs: Unsubscribe[] = [];

  /** Connexion : avec un pseudo, on apparaît dans la liste ; sans, on reste invisible. */
  async login(pseudo: string | null): Promise<void> {
    try {
      const fb = await connect();
      this.db = fb.db;
      this.F = fb.F;
      const { onDisconnect, onValue, ref, serverTimestamp, set } = fb.F;
      this.uid = fb.uid;
      this.name = pseudo?.trim().slice(0, 24) || null;
      this.connected = true;
      const db = fb.db;
      if (this.name) {
        const me = ref(db, `presence/${fb.uid}`);
        await onDisconnect(me).remove();
        await set(me, { name: this.name, busy: false, at: serverTimestamp() });
      }
      this.unsubs.push(
        onValue(ref(db, 'presence'), (snap) => {
          const all = (snap.val() ?? {}) as Record<string, { name: string; busy?: boolean }>;
          this.players = Object.entries(all)
            .filter(([uid]) => uid !== fb.uid)
            .map(([uid, p]) => ({ uid, name: p.name, busy: !!p.busy }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }),
        onValue(ref(db, `invites/${fb.uid}`), (snap) => {
          const all = (snap.val() ?? {}) as Record<string, { name: string; sid: string; state?: string }>;
          this.invitations = Object.entries(all)
            .filter(([, v]) => !v.state)
            .map(([from, v]) => ({ from, name: v.name, sid: v.sid }));
        }),
      );
    } catch (e) {
      this.error = 'Connexion impossible pour le moment.';
      console.warn('[lobby]', e);
    }
  }

  /** Invite un visiteur : on prépare la session, et on attend sa réponse. */
  async invite(to: OnlinePlayer): Promise<void> {
    const db = this.db, uid = this.uid;
    if (!this.F) return;
    const { onDisconnect, onValue, push, ref, remove, serverTimestamp, set } = this.F;
    if (!db || !uid || this.pairing || this.pending.includes(to.uid)) return;
    const sid = push(ref(db, 'sessions')).key!;
    await set(ref(db, `sessions/${sid}`), { members: { [uid]: true, [to.uid]: true }, host: uid, at: serverTimestamp() });
    const inv = ref(db, `invites/${to.uid}/${uid}`);
    await onDisconnect(inv).remove();
    await set(inv, { name: this.name ?? ANONYMOUS, sid });
    this.pending = [...this.pending, to.uid];
    const stop = onValue(ref(db, `invites/${to.uid}/${uid}/state`), (snap) => {
      const state = snap.val() as string | null;
      if (!state) return;
      stop();
      this.pending = this.pending.filter((p) => p !== to.uid);
      void remove(inv);
      if (state === 'accepted' && !this.pairing) this.startPairing({ sid, friend: { uid: to.uid, name: to.name }, role: 'host' });
    });
  }

  async accept(inv: Invitation): Promise<void> {
    const db = this.db;
    if (!this.F) return;
    const { ref, update } = this.F;
    if (!db || this.pairing) return;
    await update(ref(db, `invites/${this.uid}/${inv.from}`), { state: 'accepted' });
    this.invitations = this.invitations.filter((i) => i.from !== inv.from);
    this.startPairing({ sid: inv.sid, friend: { uid: inv.from, name: inv.name }, role: 'guest' });
  }

  async decline(inv: Invitation): Promise<void> {
    const db = this.db;
    if (!this.F) return;
    const { ref, update } = this.F;
    if (!db) return;
    await update(ref(db, `invites/${this.uid}/${inv.from}`), { state: 'declined' });
    this.invitations = this.invitations.filter((i) => i.from !== inv.from);
  }

  /** Fin de la visite à deux (quittée, ou l'ami est parti). */
  endPairing(): void {
    this.pairing = null;
    if (this.F && this.db && this.uid && this.name) void this.F.update(this.F.ref(this.db, `presence/${this.uid}`), { busy: false });
  }

  get database(): Database | null {
    return this.db;
  }

  private startPairing(p: Pairing): void {
    this.pairing = p;
    if (this.F && this.db && this.uid && this.name) void this.F.update(this.F.ref(this.db, `presence/${this.uid}`), { busy: true });
    this.onPair?.(p);
  }
}

export const lobby = new Lobby();
