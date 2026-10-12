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

  const params = readUrlParams();
  const settings = loadSettings();
  const mobile = isTouchDevice();

  // Les œuvres commencent à se précharger dès l'écran d'accueil.
  let pendingSeed = params.seed ?? randomSeed();
  const apiUrl = new URLSearchParams(window.location.search).get('api') ?? import.meta.env.VITE_API_URL ?? null;
  const client = new ArtClient(pendingSeed, apiUrl);
  const loader = new ImageLoader();
  const library = new ArtLibrary(client, loader, mobile ? CONFIG.art.textureSize.mobile : CONFIG.art.textureSize.desktop);
  // Essais : &mix=pochette-disque:1,couverture-livre:1 force les types tirés.
  const mixParam = parseWeights(new URLSearchParams(window.location.search).get('mix'));
  if (Object.keys(mixParam).length > 0) library.mix = mixParam;
  library.filterSensitive = settings.filterSensitive;
  library.pump();
  const artCtx: ArtContext = {
    library,
    loader,
    client,
    budget: { highRes: 0 },
    textureSizeHigh: mobile ? CONFIG.art.textureSizeHigh.mobile : CONFIG.art.textureSizeHigh.desktop,
    viewer: null,
  };

  // Essais : &oddity=porte-muree impose une étrangeté partout.
  Director.debugOddity = (new URLSearchParams(window.location.search).get('oddity') as Oddity | null) ?? null;

  // Le son ne démarre qu'au clic sur « Entrer » (contrainte des navigateurs).
  const audio = new AudioEngine();

  let screen = $state<'home' | 'visit'>('home');
  let sound = $state(settings.sound);
  let menuOpen = $state(false);
  let debugVisible = $state(params.debug);
  let autoWalk = $state(params.autoWalk);
  let reduceMotion = $state(settings.reduceMotion);
  let filterSensitive = $state(settings.filterSensitive);
  let sheetArtwork = $state<Artwork | null>(null);
  let aimed = $state<Artwork | null>(null);
  let locked = $state(false);
  let themeTitle = $state<string | null>(null);
  let titleKey = $state(0);
  let titleTimer = 0;
  let rupture = $state<'noir' | 'glitch' | null>(null);
  let seed = $state(params.seed ?? '');
  let showLookHint = $state(false);
  let engine = $state<Engine | null>(null);

  let container: HTMLDivElement;
  let overlay: HTMLDivElement;

  function enter(chosenSeed: string) {
    seed = chosenSeed.trim() || pendingSeed;
    if (seed !== pendingSeed) {
      pendingSeed = seed;
      library.reset(seed);
    }
    // La graine apparaît dans l'URL : la visite est reproductible et partageable.
    const url = new URL(window.location.href);
    url.searchParams.set('seed', seed);
    window.history.replaceState(null, '', url);

    screen = 'visit';
    audio.setMuted(!sound);
    audio.unlock();
    const e = new Engine(container, overlay, {
      seed,
      // Essais : &ambiance=foret démarre dans une ambiance donnée.
      ambiance: AMBIANCES[new URLSearchParams(window.location.search).get('ambiance') ?? ''] ?? DEFAULT_AMBIANCE,
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
    e.onThemeTitle = (name) => {
      if (!name) {
        themeTitle = null;
        return;
      }
      themeTitle = name;
      titleKey++;
      clearTimeout(titleTimer);
      titleTimer = window.setTimeout(() => (themeTitle = null), CONFIG.director.titleDuration * 1000);
    };
    e.onRupture = (style) => {
      rupture = style;
      window.setTimeout(() => (rupture = null), style === 'noir' ? 1400 : 700);
    };
    e.start();
    engine = e;
    (window as unknown as { __galerie: unknown }).__galerie = { engine: e, library, audio, stats: () => e.stats(), openSheet };

    if (isTouchDevice()) {
      // Plein écran sur mobile (Android) pour l'immersion ; ignoré si refusé.
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      e.requestPointerLock();
      showLookHint = true;
    }
  }

  function openSheet(art: Artwork) {
    if (!engine) return;
    sheetArtwork = art;
    engine.setPaused(true);
  }

  function closeSheet() {
    if (!engine) return;
    sheetArtwork = null;
    engine.setPaused(false);
    engine.requestPointerLock();
  }

  function openMenu() {
    if (!engine || menuOpen || sheetArtwork) return;
    menuOpen = true;
    engine.setPaused(true);
  }

  function resume() {
    if (!engine) return;
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
    if (screen !== 'visit') return;
    if (e.code === 'F3' || (e.code === 'Backquote' && !e.repeat)) {
      e.preventDefault();
      debugVisible = !debugVisible;
    } else if (e.code === 'Escape' && sheetArtwork) {
      closeSheet();
    } else if (e.code === 'Escape') {
      // Avec le pointer lock, c'est sa perte qui ouvre le menu (voir onMenuRequest).
      if (document.pointerLockElement) return;
      // Sans pointer lock (glisser-pour-regarder), Échap ouvre/ferme le menu.
      if (menuOpen) resume();
      else openMenu();
    }
  }

  $effect(() => {
    engine?.setAutoWalk(autoWalk);
  });
  $effect(() => {
    engine?.setReduceMotion(reduceMotion);
  });
  $effect(() => {
    library.filterSensitive = filterSensitive;
    audio.setMuted(!sound);
    saveSettings({ reduceMotion, filterSensitive, sound });
  });

  function onLockChange() {
    locked = document.pointerLockElement !== null;
  }

  function onCanvasPointer() {
    showLookHint = false;
  }

  if (params.autoStart) queueMicrotask(() => enter(seed));

  $effect(() => {
    document.addEventListener('pointerlockchange', onLockChange);
    return () => document.removeEventListener('pointerlockchange', onLockChange);
  });

  onDestroy(() => {
    engine?.dispose();
    library.dispose();
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="stage" bind:this={container} onpointerdown={onCanvasPointer} role="presentation"></div>
<div class="overlay" bind:this={overlay}></div>

{#if screen === 'home'}
  <Home initialSeed={seed} onEnter={enter} {library} />
{:else}
  <div class="hud">
    <button class="hud-btn" aria-label={t('hud.menu')} onclick={openMenu}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
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
  </div>

  {#if showLookHint && !menuOpen && !locked}
    <div class="hint">{t('hud.clickToLook')}</div>
  {/if}

  {#if locked && !menuOpen && !sheetArtwork}
    <div class="crosshair" class:on={aimed !== null} aria-hidden="true"></div>
    {#if aimed}<div class="aim-label">{t('hud.view')}</div>{/if}
  {/if}

  {#if themeTitle && !menuOpen && !sheetArtwork}
    {#key titleKey}<div class="theme-title" style="animation-duration: {CONFIG.director.titleDuration}s">{themeTitle}</div>{/key}
  {/if}

  {#if rupture}<div class="rupture {rupture}" aria-hidden="true"></div>{/if}

  {#if sheetArtwork}
    <ArtworkSheet artwork={sheetArtwork} {client} onClose={closeSheet} />
  {/if}

  {#if menuOpen}
    <PauseMenu {seed} bind:autoWalk bind:reduceMotion bind:debugVisible bind:filterSensitive onResume={resume} onNewVisit={newVisit} />
  {/if}

  {#if debugVisible && engine}
    <DebugPanel {engine} />
  {/if}
{/if}

<style>
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
