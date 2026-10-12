import type { FirebaseOptions } from 'firebase/app';

/**
 * Configuration Firebase du projet (visite à deux). Ces valeurs sont publiques par
 * conception : la sécurité repose sur les règles de la base (database.rules.json).
 * Tant qu'elle est absente, la visite à deux est masquée (sauf émulateur : `&emulator=1`).
 */
export const FIREBASE_CONFIG: FirebaseOptions | null = {
  apiKey: 'AIzaSyBhToV8i9S13DxUEeCRqWUCT4ea1nDRYxk',
  authDomain: 'ailleurs-3106a.firebaseapp.com',
  databaseURL: 'https://ailleurs-3106a-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'ailleurs-3106a',
  storageBucket: 'ailleurs-3106a.firebasestorage.app',
  messagingSenderId: '629597876661',
  appId: '1:629597876661:web:cb00db350dea39d578a9fc',
};

/** Essais en local : émulateurs Firebase (npm run emulators). */
export const USE_EMULATOR = new URLSearchParams(window.location.search).get('emulator') === '1';

export const multiplayerAvailable = (): boolean => FIREBASE_CONFIG !== null || USE_EMULATOR;
