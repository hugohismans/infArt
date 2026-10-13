/**
 * Installer Ailleurs comme une application (écran d'accueil du téléphone).
 * Android / Chrome : l'invitation du navigateur, gardée pour le bouton de l'accueil.
 * iPhone / iPad : Safari n'a pas d'invitation, on explique le geste (Partager, puis
 * « Sur l'écran d'accueil »).
 */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function standalone(): boolean {
  return matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

class Install {
  /** Invitation du navigateur, si elle a été proposée. */
  private deferred: InstallPrompt | null = null;
  available = $state(false);
  /** iOS : le bouton affiche le mode d'emploi. */
  readonly manual = ios;

  constructor() {
    if (standalone()) return;
    this.available = ios;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as InstallPrompt;
      this.available = true;
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.available = false;
    });
  }

  /** Lance l'invitation du navigateur ; false s'il n'y en a pas (iOS : mode d'emploi). */
  async prompt(): Promise<boolean> {
    const d = this.deferred;
    if (!d) return false;
    this.deferred = null;
    await d.prompt();
    const { outcome } = await d.userChoice;
    if (outcome === 'accepted') this.available = false;
    return true;
  }
}

export const install = new Install();

/** Le service worker rend l'application installable (tout passe par le réseau). */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
