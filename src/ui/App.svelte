<script lang="ts">
  import { onDestroy } from 'svelte';
  import { DEFAULT_AMBIANCE } from '../ambiances';
  import { Engine, isTouchDevice } from '../engine/Engine';
  import { randomSeed } from '../world/random';
  import { t } from '../i18n';
  import Home from './Home.svelte';
  import PauseMenu from './PauseMenu.svelte';
  import DebugPanel from './DebugPanel.svelte';
  import { readUrlParams } from './params';

  const params = readUrlParams();

  let screen = $state<'home' | 'visit'>('home');
  let menuOpen = $state(false);
  let debugVisible = $state(params.debug);
  let autoWalk = $state(params.autoWalk);
  let reduceMotion = $state(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let seed = $state(params.seed ?? '');
  let showLookHint = $state(false);
  let engine = $state<Engine | null>(null);

  let container: HTMLDivElement;
  let overlay: HTMLDivElement;

  function enter(chosenSeed: string) {
    seed = chosenSeed.trim() || randomSeed();
    // La graine apparaît dans l'URL : la visite est reproductible et partageable.
    const url = new URL(window.location.href);
    url.searchParams.set('seed', seed);
    window.history.replaceState(null, '', url);

    screen = 'visit';
    const e = new Engine(container, overlay, {
      seed,
      ambiance: DEFAULT_AMBIANCE,
      autoWalk,
      timeScale: params.timeScale,
    });
    e.setReduceMotion(reduceMotion);
    e.onMenuRequest = () => openMenu();
    e.onAutoWalkChange = (v) => (autoWalk = v);
    e.start();
    engine = e;
    (window as unknown as { __galerie: unknown }).__galerie = { engine: e, stats: () => e.stats() };

    if (isTouchDevice()) {
      // Plein écran sur mobile (Android) pour l'immersion ; ignoré si refusé.
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      e.requestPointerLock();
      showLookHint = true;
    }
  }

  function openMenu() {
    if (!engine || menuOpen) return;
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

  function onCanvasPointer() {
    showLookHint = false;
  }

  if (params.autoStart) queueMicrotask(() => enter(seed));

  onDestroy(() => engine?.dispose());
</script>

<svelte:window onkeydown={onKey} />

<div class="stage" bind:this={container} onpointerdown={onCanvasPointer} role="presentation"></div>
<div class="overlay" bind:this={overlay}></div>

{#if screen === 'home'}
  <Home initialSeed={seed} onEnter={enter} />
{:else}
  <div class="hud">
    <button class="hud-btn" aria-label={t('hud.menu')} onclick={openMenu}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  {#if showLookHint && !menuOpen}
    <div class="hint">{t('hud.clickToLook')}</div>
  {/if}

  {#if menuOpen}
    <PauseMenu {seed} bind:autoWalk bind:reduceMotion bind:debugVisible onResume={resume} onNewVisit={newVisit} />
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
