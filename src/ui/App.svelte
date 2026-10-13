<script lang="ts">
  import { onDestroy } from 'svelte';
  import { AMBIANCES, DEFAULT_AMBIANCE } from '../ambiances';
  import { Engine, isTouchDevice } from '../engine/Engine';
  import { randomSeed } from '../world/random';
  import { t } from '../i18n';
  import Home from './Home.svelte';
  import PauseMenu from './PauseMenu.svelte';
  import DebugPanel from './DebugPanel.svelte';
  import ArtworkSheet from './ArtworkSheet.svelte';
  import CollectionPanel from './CollectionPanel.svelte';
  import { progress } from '../progress/achievements.svelte';
  import { lobby, type Pairing } from '../net/Lobby.svelte';
  import { multiplayerAvailable } from '../net/config';
  import type { Session } from '../net/Session';
  import type { Companion } from '../net/Companion';
  import type { Voice } from '../net/Voice';
  import { readUrlParams } from './params';
  import { loadSettings, saveSettings } from './settings';
  import { CONFIG } from '../config';
  import { ArtClient } from '../art/ArtClient';
  import { ImageLoader } from '../art/ImageLoader';
  import { ArtLibrary } from '../art/ArtLibrary';
  import type { ArtContext } from '../art/ArtPiece';
  import { AudioEngine } from '../audio/AudioEngine';
  import { Director, type Oddity } from '../director/Director';
  import { parseWeights, type Artwork } from '../../shared/artwork';
  import { Narrator } from '../narrator/Narrator.svelte';

  const params = readUrlParams();
  const settings = loadSettings();
  const mobile = isTouchDevice();

  // Les œuvres commencent à se précharger dès l'écran d'accueil.
  const pendingSeed = params.seed ?? randomSeed();
  const apiUrl = new URLSearchParams(window.location.search).get('api') ?? import.meta.env.VITE_API_URL ?? null;
  const client = new ArtClient(pendingSeed, apiUrl);
  const loader = new ImageLoader();
  const library = new ArtLibrary(client, loader, mobile ? CONFIG.art.textureSize.mobile : CONFIG.art.textureSize.desktop);
  // Essais : &mix=pochette-disque:1,couverture-livre:1 force les types tirés.
  const mixParam = parseWeights(new URLSearchParams(window.location.search).get('mix'));
  if (Object.keys(mixParam).length > 0) library.mix = mixParam;
  library.filterSensitive = settings.filterSensitive;
  // Dès l'accueil, on prépare de quoi accrocher les premières salles.
  library.startTarget = CONFIG.art.startReady;
  library.pump();
  const artCtx: ArtContext = {
    library,
    loader,
    client,
    budget: { highRes: 0 },
    textureSizeHigh: mobile ? CONFIG.art.textureSizeHigh.mobile : CONFIG.art.textureSizeHigh.desktop,
    textureSize: mobile ? CONFIG.art.textureSize.mobile : CONFIG.art.textureSize.desktop,
    viewer: null,
  };

  // Essais : &oddity=porte-muree impose une étrangeté partout.
  Director.debugOddity = (new URLSearchParams(window.location.search).get('oddity') as Oddity | null) ?? null;

  // Le son ne démarre qu'au clic sur « Entrer » (contrainte des navigateurs).
  const audio = new AudioEngine();
  // La voix off (solo) ; à la première visite, l'aile qu'elle promet se prépare dès l'accueil.
  const narrator = new Narrator(library, audio);
  // (Première visite : l'aile de la mer se prépare dès l'accueil ; finale : la salle aux cinq portes.)
  const hubOptions = narrator.hubOptions();
  const firstTheme = hubOptions.firstTheme ?? null;

  let screen = $state<'home' | 'visit'>('home');
  let sound = $state(settings.sound);
  let menuOpen = $state(false);
  let debugVisible = $state(params.debug);
  let autoWalk = $state(params.autoWalk);
  let reduceMotion = $state(settings.reduceMotion);
  let filterSensitive = $state(settings.filterSensitive);
  let quality = $state(settings.quality);
  let gyro = $state(settings.gyro);
  let largeText = $state(settings.largeText);
  let sheetArtwork = $state<Artwork | null>(null);
  let collectionOpen = $state(false);
  let aimed = $state<Artwork | null>(null);
  let locked = $state(false);
  let themeTitle = $state<{ name: string; phase: 'entree' | 'sortie' } | null>(null);
  /** L'aile où l'on se trouve (étiquette discrète à côté des boutons). */
  let wingName = $state<string | null>(null);
  let titleKey = $state(0);
  let titleTimer = 0;
  let rupture = $state<'noir' | 'glitch' | null>(null);
  let seed = $state(params.seed ?? '');
  let showLookHint = $state(false);
  let engine = $state<Engine | null>(null);

  let container: HTMLDivElement;
  let overlay: HTMLDivElement;

  /**
   * Écran de chargement : on attend qu'assez d'œuvres soient prêtes pour que les
   * premières salles soient accrochées dès l'entrée (et pas des toiles drapées).
   */
  let loading = $state<{ ready: number; target: number } | null>(null);
  function waitForArt(): Promise<void> {
    const target = CONFIG.art.startReady;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const s = library.stats();
        loading = { ready: Math.min(s.ready, target), target };
        // (L'aile promise par la voix off doit pouvoir s'accrocher dès qu'on y entre.)
        const themeOk = !firstTheme || library.themeReadyCount(firstTheme.id) >= 3;
        if ((s.ready >= target && themeOk) || s.offline || performance.now() - t0 > CONFIG.art.startTimeoutMs) {
          loading = null;
          resolve();
          return;
        }
        window.setTimeout(tick, 120);
      };
      tick();
    });
  }

  let entering = false;
  // --- Visite à deux -------------------------------------------------------------------
  const duoAvailable = multiplayerAvailable();
  let session: Session | null = null;
  let companion: Companion | null = null;
  let voice: Voice | null = null;
  let micOn = $state(false);
  let meSpeaking = $state(false);
  let duoState = $state<'joining' | 'active' | null>(null);
  let duoRooms = $state<number | null>(null);
  let duoNotice = $state<string | null>(null);
  let friendAbsent = 0;

  lobby.onPair = (p) => void startDuo(p);

  async function startDuo(p: Pairing) {
    if (!engine || !lobby.F || !lobby.database || !lobby.uid) return;
    const [{ Session }, { Companion }, { Voice }] = await Promise.all([import('../net/Session'), import('../net/Companion'), import('../net/Voice')]);
    const e = engine;
    const s = new Session(lobby.F, lobby.database, p.sid, lobby.uid, p.friend.uid, p.role, e);
    narrator.setDuo(true);
    session = s;
    companion = new Companion(e, s, p.friend.name, p.friend.uid);
    duoState = 'joining';
    friendAbsent = 0;
    const v = new Voice(lobby.F, lobby.database, s, e, audio, apiUrl ? `${apiUrl}/turn` : null);
    s.onState = (st) => {
      if (st === 'ended') stopDuo(p.friend.name);
      else duoState = st;
      // Musées raccordés : la liaison audio peut s'établir.
      if (st === 'active' && !voice) {
        voice = v;
        void v.start();
      }
    };
    e.onFrame = (dt) => {
      s.update(dt);
      voice?.update(dt);
      if (companion) companion.speaking = voice?.friendSpeaking ?? false;
      companion?.update(dt);
      const speaking = voice?.meSpeaking ?? false;
      if (speaking !== meSpeaking) meSpeaking = speaking;
      duoRooms = s.path.length > 0 ? s.path.length - 1 : null;
      // L'ami ne donne plus de nouvelles (fermé, coupé) : on arrête après un moment.
      friendAbsent = s.friend ? 0 : friendAbsent + dt;
      if (s.state === 'active' && friendAbsent > 12) s.end(false);
    };
    await s.start();
  }

  function stopDuo(name: string | null) {
    if (engine) engine.onFrame = null;
    narrator.setDuo(false);
    companion?.dispose();
    companion = null;
    voice?.dispose();
    voice = null;
    micOn = false;
    meSpeaking = false;
    session = null;
    duoState = null;
    duoRooms = null;
    lobby.endPairing();
    if (name) {
      duoNotice = t('duo.left', { name });
      window.setTimeout(() => (duoNotice = null), 4000);
    }
  }

  async function toggleMic() {
    if (!voice) return;
    // (Le contexte audio doit être actif pour la voix spatialisée.)
    audio.unlock();
    const ok = await voice.setMic(!micOn);
    if (!micOn && !ok) {
      duoNotice = t('duo.micDenied');
      window.setTimeout(() => (duoNotice = null), 5000);
    }
    micOn = voice.micOn;
  }

  function leaveDuo() {
    session?.end(true);
    stopDuo(null);
  }

  async function enter(pseudo: string | null = null) {
    if (entering) return;
    entering = true;
    // Visite à deux : connexion (pseudo, ou anonyme) en arrière-plan.
    if (duoAvailable) void lobby.login(pseudo);
    collectionOpen = false;
    sheetArtwork = null;
    seed = pendingSeed;
    // La graine apparaît dans l'URL : la visite est reproductible et partageable.
    const url = new URL(window.location.href);
    url.searchParams.set('seed', seed);
    window.history.replaceState(null, '', url);

    // Son et plein écran : à demander pendant le geste du visiteur, avant toute attente.
    audio.setMuted(!sound);
    audio.unlock();
    if (isTouchDevice()) document.documentElement.requestFullscreen?.().catch(() => undefined);
    await waitForArt();
    library.startTarget = 0;

    screen = 'visit';
    // Essais : &ambiance=foret démarre dans une ambiance donnée (sans rotonde) ; &rotonde=0 la retire.
    const query = new URLSearchParams(window.location.search);
    const forced = AMBIANCES[query.get('ambiance') ?? ''];
    const hub = !forced && query.get('rotonde') !== '0';
    const e = new Engine(container, overlay, {
      seed,
      ambiance: forced ?? DEFAULT_AMBIANCE,
      startHub: hub,
      hub: hub ? hubOptions : {},
      quality,
      autoWalk,
      timeScale: params.timeScale,
      art: artCtx,
      audio,
    });
    e.setReduceMotion(reduceMotion);
    e.onMenuRequest = () => openMenu();
    e.onAutoWalkChange = (v) => (autoWalk = v);
    e.onArtworkOpen = (art) => openSheet(art);
    e.onAimChange = (art) => (aimed = art);
    // S'arrêter devant une œuvre compte comme un intérêt (une fois par œuvre).
    e.onDwell = (art) => {
      library.noteInterest(art, CONFIG.interest.strength.regard);
      narrator.dwell(art);
    };
    e.onWing = (name) => (wingName = name);
    e.onThemeTitle = (name, phase) => {
      themeTitle = { name, phase };
      titleKey++;
      clearTimeout(titleTimer);
      titleTimer = window.setTimeout(() => (themeTitle = null), CONFIG.director.titleDuration * 1000);
    };
    e.onRupture = (style) => {
      narrator.rupture();
      // Flash et parasites : jamais avec « réduire les mouvements » (sensibilité visuelle).
      if (reduceMotion) return;
      rupture = style;
      window.setTimeout(() => (rupture = null), style === 'noir' ? 1400 : 700);
    };
    e.start();
    engine = e;
    progress.visit();
    narrator.setSound(sound);
    narrator.start(e, hub);
    observeVisit(e);
    (window as unknown as { __galerie: unknown }).__galerie = { engine: e, library, audio, stats: () => e.stats(), openSheet, lobby, duo: () => session, voice: () => voice, narrator };

    if (!isTouchDevice()) {
      e.requestPointerLock();
      showLookHint = true;
    }
  }

  /** Relevé régulier pour les succès : ambiance, aile à thème, étrangeté, distance. */
  let observeTimer = 0;
  function observeVisit(e: Engine) {
    let walked = e.walked;
    observeTimer = window.setInterval(() => {
      const m = e.world.currentModule;
      if (!m) return;
      const d = e.walked - walked;
      walked = e.walked;
      progress.observe({
        // Les ambiances intermédiaires d'une transition ne comptent pas.
        ...(AMBIANCES[m.preset.id] ? { ambiance: m.preset.id } : {}),
        ...(m.zone.wing ? { theme: m.zone.wing.theme.id } : {}),
        ...(m.zone.oddity ? { oddity: m.zone.oddity } : {}),
        walked: d,
      });
    }, 1000);
  }

  // Annonce des succès, un par un.
  const toast = $derived(progress.toasts[0] ?? null);
  $effect(() => {
    if (!toast) return;
    narrator.achievement(toast.id);
    const id = window.setTimeout(() => progress.dismissToast(), 4200);
    return () => clearTimeout(id);
  });

  /** Fiche ouverte depuis la galerie (le visé). */
  function openSheet(art: Artwork) {
    if (!engine) return;
    sheetArtwork = art;
    engine.setPaused(true);
    progress.openedSheet();
    library.noteInterest(art, CONFIG.interest.strength.fiche);
    narrator.sheetOpened(art);
  }



  function closeSheet() {
    sheetArtwork = null;
    narrator.sheetClosed();
    // Ouverte depuis la collection : on y revient.
    if (!engine || collectionOpen) return;
    engine.setPaused(false);
    engine.requestPointerLock();
  }

  function openCollection() {
    narrator.collectionOpened();
    collectionOpen = true;
    menuOpen = false;
    engine?.setPaused(true);
  }

  function closeCollection() {
    collectionOpen = false;
    if (!engine) return;
    engine.setPaused(false);
    engine.requestPointerLock();
  }

  function openMenu() {
    if (!engine || menuOpen || sheetArtwork || collectionOpen) return;
    menuOpen = true;
    engine.setPaused(true);
  }

  function resume() {
    if (!engine) return;
    if (menuOpen) narrator.resumed();
    menuOpen = false;
    engine.setPaused(false);
    engine.requestPointerLock();
  }

  function newVisit() {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', randomSeed());
    window.location.href = url.toString();
  }

  function onKey(e: KeyboardEvent) {
    // Invitation reçue : O pour accepter, N pour refuser (même souris capturée).
    const inv = lobby.invitations[0];
    if (inv && screen === 'visit' && !lobby.pairing && (e.code === 'KeyO' || e.code === 'KeyN')) {
      if (e.code === 'KeyO') void lobby.accept(inv);
      else void lobby.decline(inv);
      return;
    }
    if (e.code === 'Escape' && sheetArtwork) return closeSheet();
    if (e.code === 'Escape' && collectionOpen) return closeCollection();
    if (screen !== 'visit') return;
    if (e.code === 'F3' || (e.code === 'Backquote' && !e.repeat)) {
      e.preventDefault();
      debugVisible = !debugVisible;
    } else if ((e.code === 'KeyE' || e.code === 'Enter') && aimed && !menuOpen && !sheetArtwork && !collectionOpen) {
      // Clavier : ouvrir l'œuvre visée sans cliquer.
      e.preventDefault();
      openSheet(aimed);
    } else if (e.code === 'KeyC' && !menuOpen && !sheetArtwork && !collectionOpen) {
      openCollection();
    } else if (e.code === 'Escape') {
      // Avec le pointer lock, c'est sa perte qui ouvre le menu (voir onMenuRequest).
      if (document.pointerLockElement) return;
      // Sans pointer lock (glisser-pour-regarder), Échap ouvre/ferme le menu.
      if (menuOpen) resume();
      else openMenu();
    }
  }

  let lastAutoWalk = params.autoWalk;
  $effect(() => {
    engine?.setAutoWalk(autoWalk);
    // (Réglage du menu : la voix off le remarque aussi.)
    if (engine && autoWalk !== lastAutoWalk) narrator.autoWalkChanged(autoWalk);
    lastAutoWalk = autoWalk;
  });
  $effect(() => {
    engine?.setReduceMotion(reduceMotion);
  });
  $effect(() => {
    engine?.quality.set(quality);
  });
  $effect(() => {
    engine?.setGyro(gyro);
  });
  $effect(() => {
    document.documentElement.style.fontSize = largeText ? '19px' : '';
  });
  $effect(() => {
    library.filterSensitive = filterSensitive;
    audio.setMuted(!sound);
    narrator.setSound(sound);
    saveSettings({ reduceMotion, filterSensitive, sound, quality, gyro, largeText });
  });

  function onLockChange() {
    locked = document.pointerLockElement !== null;
    // Souris capturée : plus aucun élément de l'interface ne garde le focus (sinon le curseur
    // de saisie de texte reste affiché au milieu de l'écran).
    if (locked && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function onCanvasPointer() {
    showLookHint = false;
  }

  // Essais : &pseudo=Alice se connecte avec ce pseudo au démarrage automatique.
  if (params.autoStart) queueMicrotask(() => enter(new URLSearchParams(window.location.search).get('pseudo')));

  $effect(() => {
    document.addEventListener('pointerlockchange', onLockChange);
    return () => document.removeEventListener('pointerlockchange', onLockChange);
  });

  onDestroy(() => {
    narrator.stop();
    session?.end(true);
    clearInterval(observeTimer);
    engine?.dispose();
    library.dispose();
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="stage" bind:this={container} onpointerdown={onCanvasPointer} role="presentation"></div>
<div class="overlay" bind:this={overlay}></div>

{#if screen === 'home'}
  <Home onEnter={enter} onCollection={openCollection} {library} {client} {loading} {reduceMotion} duo={duoAvailable} />
{:else}
  <div class="hud">
    <button class="hud-btn" aria-label={t('hud.menu')} onclick={openMenu}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
    <button class="hud-btn" aria-label={t('hud.collection')} title={t('hud.collection')} onclick={openCollection}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
    </button>
    <button class="hud-btn" aria-label={sound ? t('hud.soundOff') : t('hud.soundOn')} aria-pressed={!sound} onclick={() => (sound = !sound)}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
        {#if sound}
          <path d="M15.5 9a4 4 0 0 1 0 6M17.8 6.8a7 7 0 0 1 0 10.4" />
        {:else}
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        {/if}
      </svg>
    </button>
    {#if duoState === 'active'}
      <button class="hud-btn mic" class:on={micOn} class:talking={meSpeaking} aria-label={micOn ? t('duo.micOn') : t('duo.micOff')} aria-pressed={micOn} onclick={toggleMic}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          {#if !micOn}<path d="M4 4l16 16" />{/if}
        </svg>
      </button>
    {/if}
    {#if wingName && !menuOpen}<span class="wing-tag" title={t('hud.wing')}>{wingName}</span>{/if}
  </div>

  {#if showLookHint && !menuOpen && !locked}
    <div class="hint">{t('hud.clickToLook')}</div>
  {/if}

  {#if locked && !menuOpen && !sheetArtwork}
    <div class="crosshair" class:on={aimed !== null} aria-hidden="true"></div>
    {#if aimed}<div class="aim-label">{t('hud.view')}</div>{/if}
  {/if}

  {#if narrator.current && !sheetArtwork}
    {#key narrator.current.id}<p class="narration" role="status" aria-live="polite"><span>{narrator.current.text}</span></p>{/key}
  {/if}
  {#if themeTitle && !menuOpen && !sheetArtwork}
    {#key titleKey}
      <div class="theme-title" class:out={themeTitle.phase === 'sortie'} role="status" aria-live="polite" style="animation-duration: {(themeTitle.phase === 'sortie' ? 0.7 : 1) * CONFIG.director.titleDuration}s">
        <span class="theme-kicker">{t(themeTitle.phase === 'sortie' ? 'hud.wingEnd' : 'hud.wing')}</span>{themeTitle.name}
      </div>
    {/key}
  {/if}

  {#if rupture}<div class="rupture {rupture}" aria-hidden="true"></div>{/if}

  {#if menuOpen}
    <PauseMenu {seed} bind:autoWalk bind:reduceMotion bind:debugVisible bind:filterSensitive bind:quality bind:gyro bind:largeText onResume={resume} onNewVisit={newVisit} onCollection={openCollection} duo={duoAvailable && lobby.connected} duoJoining={duoState === 'joining'} onLeaveDuo={leaveDuo} />
  {/if}

  {#if debugVisible && engine}
    <DebugPanel {engine} />
  {/if}
{/if}

{#if collectionOpen}
  <CollectionPanel {client} onOpen={(art) => (sheetArtwork = art)} onClose={closeCollection} />
{/if}
{#if sheetArtwork}
  {#key sheetArtwork.id}<ArtworkSheet artwork={sheetArtwork} {client} onClose={closeSheet} onFavorite={(art, added) => {
        if (added) library.noteInterest(art, CONFIG.interest.strength.favori);
        narrator.favorite(art, added);
      }} />{/key}
{/if}
{#if screen === 'visit' && lobby.invitations[0] && !lobby.pairing}
  {@const inv = lobby.invitations[0]}
  <div class="invite" role="alertdialog" aria-label={t('duo.inviteFrom', { name: inv.name })}>
    <p>{t('duo.inviteFrom', { name: inv.name })}</p>
    <div class="invite-actions">
      <button class="yes" onclick={() => lobby.accept(inv)}>{t('duo.accept')}</button>
      <button onclick={() => lobby.decline(inv)}>{t('duo.decline')}</button>
    </div>
    {#if !isTouchDevice()}<p class="invite-keys">{t('duo.keys')}</p>{/if}
  </div>
{/if}
{#if screen === 'visit' && (duoState || duoNotice)}
  <div class="duo-chip" role="status" aria-live="polite">
    {#if duoNotice}{duoNotice}
    {:else if duoState === 'joining'}{t('duo.joining')}
    {:else if lobby.pairing}<span class="dot-live"></span>{lobby.pairing.friend.name}{#if duoRooms !== null}&nbsp;·&nbsp;{duoRooms === 0 ? t('duo.sameRoom') : t('duo.rooms', { n: duoRooms })}{/if}{/if}
  </div>
{/if}
{#if toast}
  {#key toast.id}
    <div class="toast" role="status" aria-live="polite">
      <span class="star" aria-hidden="true">★</span>
      <div><p class="toast-kicker">{t('toast.achievement')}</p><p class="toast-title">{toast.title}</p></div>
    </div>
  {/key}
{/if}

<style>
  .invite {
    position: fixed;
    left: 50%;
    bottom: max(24px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 25;
    width: min(380px, calc(100vw - 32px));
    padding: 16px 18px;
    background: var(--panel);
    border: 1px solid rgba(95, 212, 196, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    text-align: center;
    animation: invite-in 0.3s ease-out;
  }
  @keyframes invite-in {
    from { opacity: 0; transform: translate(-50%, 12px); }
  }
  .invite p {
    margin: 0 0 12px;
    font-family: var(--serif);
    font-size: 1.05rem;
  }
  .invite-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
  .invite button {
    padding: 8px 18px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: transparent;
    cursor: pointer;
  }
  .invite .yes {
    border-color: #5fd4c4;
    color: #5fd4c4;
  }
  .invite .invite-keys {
    margin: 10px 0 0;
    font-family: var(--sans);
    font-size: 0.72rem;
    color: var(--ink-dim);
  }
  .duo-chip {
    position: fixed;
    top: max(16px, env(safe-area-inset-top));
    right: max(16px, env(safe-area-inset-right));
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgba(10, 8, 7, 0.45);
    border: 1px solid rgba(95, 212, 196, 0.45);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    font-size: 0.82rem;
    pointer-events: none;
  }
  .dot-live {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #5fd4c4;
  }
  .toast {
    position: fixed;
    top: max(16px, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 10px 18px 10px 14px;
    background: var(--panel);
    border: 1px solid rgba(201, 161, 74, 0.55);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    pointer-events: none;
    animation: toast 4.2s ease-in-out forwards;
  }
  @keyframes toast {
    0% { opacity: 0; transform: translate(-50%, -12px); }
    10%, 85% { opacity: 1; transform: translate(-50%, 0); }
    100% { opacity: 0; transform: translate(-50%, -6px); }
  }
  .toast .star {
    color: var(--accent);
    font-size: 1.5rem;
  }
  .toast p {
    margin: 0;
  }
  .toast-kicker {
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .toast-title {
    font-family: var(--serif);
    font-size: 1.05rem;
  }
  .stage {
    position: fixed;
    inset: 0;
  }
  .overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }
  .hud {
    position: fixed;
    top: max(12px, env(safe-area-inset-top));
    left: max(12px, env(safe-area-inset-left));
    display: flex;
    gap: 8px;
  }
  .hud-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(10, 8, 7, 0.35);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: grid;
    place-items: center;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s;
  }
  .hud-btn:hover {
    opacity: 1;
  }
  .hud-btn.mic.on {
    opacity: 1;
    border-color: #5fd4c4;
    color: #5fd4c4;
  }
  .hud-btn.mic.talking {
    box-shadow: 0 0 0 3px rgba(95, 212, 196, 0.35);
  }
  /* Voix off : sous-titre en bas d'écran, comme au cinéma. */
  .narration {
    position: fixed;
    left: 50%;
    bottom: calc(6% + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(46rem, calc(100% - 32px));
    margin: 0;
    text-align: center;
    pointer-events: none;
    animation: narration-in 0.5s ease-out;
    z-index: 5;
  }
  .narration span {
    display: inline;
    padding: 0.2em 0.5em;
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(0.95rem, 2.6vw, 1.25rem);
    line-height: 1.7;
    color: #fffaf0;
    background: rgba(8, 8, 10, 0.62);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  @keyframes narration-in {
    from { opacity: 0; transform: translate(-50%, 6px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  .theme-title {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 16%;
    text-align: center;
    font-family: var(--serif);
    font-size: clamp(1.1rem, 4vw, 1.9rem);
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: rgba(255, 252, 244, 0.92);
    text-shadow: 0 1px 12px rgba(0, 0, 0, 0.55);
    pointer-events: none;
    animation-name: title;
    animation-timing-function: ease-in-out;
    animation-fill-mode: forwards;
  }
  .theme-kicker {
    display: block;
    margin-bottom: 0.5em;
    font-family: var(--sans);
    font-size: max(0.66rem, 0.42em);
    letter-spacing: 0.35em;
    opacity: 0.75;
  }
  .theme-title.out {
    font-size: clamp(0.95rem, 3vw, 1.4rem);
    color: rgba(255, 252, 244, 0.75);
  }
  .wing-tag {
    align-self: center;
    max-width: 46vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(10, 8, 7, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.14);
    font-family: var(--serif);
    font-style: italic;
    font-size: 0.82rem;
    color: rgba(255, 252, 244, 0.82);
    pointer-events: none;
  }
  @keyframes title {
    0% { opacity: 0; letter-spacing: 0.4em; }
    20%, 75% { opacity: 1; letter-spacing: 0.32em; }
    100% { opacity: 0; }
  }
  /* Rupture : on « tombe » dans un autre monde. */
  .rupture {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 15;
  }
  .rupture.noir {
    background: #000;
    animation: noir 1.4s ease-in forwards;
  }
  @keyframes noir {
    0%, 35% { opacity: 1; }
    100% { opacity: 0; }
  }
  .rupture.glitch {
    background: repeating-linear-gradient(0deg, rgba(255, 0, 80, 0.25) 0 3px, rgba(0, 255, 220, 0.18) 3px 6px, transparent 6px 14px);
    mix-blend-mode: screen;
    animation: glitch 0.7s steps(7) forwards;
  }
  @keyframes glitch {
    0% { transform: translate(-12px, 4px); opacity: 1; }
    30% { transform: translate(9px, -6px); }
    60% { transform: translate(-5px, 2px); opacity: 0.8; }
    100% { transform: translate(0, 0); opacity: 0; }
  }
  .crosshair {
    position: fixed;
    left: 50%;
    top: 50%;
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.55);
    pointer-events: none;
    transition: all 0.15s;
  }
  .crosshair.on {
    width: 22px;
    height: 22px;
    margin: -11px 0 0 -11px;
    background: transparent;
    border: 1.5px solid rgba(255, 255, 255, 0.8);
  }
  .aim-label {
    position: fixed;
    left: 50%;
    top: calc(50% + 22px);
    transform: translateX(-50%);
    font-size: 0.78rem;
    color: rgba(255, 255, 255, 0.8);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
    pointer-events: none;
  }
  .hint {
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--serif);
    font-style: italic;
    color: var(--ink-dim);
    pointer-events: none;
    animation: fade 4s ease-in forwards;
  }
  @keyframes fade {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }
</style>
