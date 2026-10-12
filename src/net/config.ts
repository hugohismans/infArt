import type { FirebaseOptions } from 'firebase/app';

/**
 * Configuration Firebase du projet (visite à deux). Ces valeurs sont publiques par
 * conception : la sécurité repose sur les règles de la base (database.rules.json).
 * Tant qu'elle est absente, la visite à deux est masquée (sauf émulateur : `&emulator=1`).
 */
export const FIREBASE_CONFIG: FirebaseOptions | null = null;

/** Essais en local : émulateurs Firebase (npm run emulators). */
export const USE_EMULATOR = new URLSearchParams(window.location.search).get('emulator') === '1';

export const multiplayerAvailable = (): boolean => FIREBASE_CONFIG !== null || USE_EMULATOR;
