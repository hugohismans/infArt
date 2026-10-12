import type { Database } from 'firebase/database';
import { FIREBASE_CONFIG, USE_EMULATOR } from './config';

export type DatabaseApi = typeof import('firebase/database');

export interface Firebase {
  db: Database;
  uid: string;
  /** Fonctions de firebase/database (chargées à la demande). */
  F: DatabaseApi;
}

let ready: Promise<Firebase> | null = null;

/**
 * Connexion anonyme à Firebase, chargée seulement quand on en a besoin : la visite en solo
 * ne télécharge rien de plus. Chaque visiteur a un compte anonyme ; le pseudo n'est qu'un
 * nom affiché.
 */
export function connect(): Promise<Firebase> {
  if (ready) return ready;
  ready = (async () => {
    const [{ initializeApp }, auth, database] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]);
    const config = !USE_EMULATOR && FIREBASE_CONFIG ? FIREBASE_CONFIG : {
      apiKey: 'demo-key',
      projectId: 'demo-ailleurs',
      databaseURL: 'http://127.0.0.1:9000?ns=demo-ailleurs',
    };
    const app = initializeApp(config);
    const a = auth.getAuth(app);
    const db = database.getDatabase(app);
    if (USE_EMULATOR) {
      auth.connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
      database.connectDatabaseEmulator(db, '127.0.0.1', 9000);
    }
    const cred = await auth.signInAnonymously(a);
    return { db, uid: cred.user.uid, F: database };
  })();
  ready.catch(() => (ready = null));
  return ready;
}
