<script lang="ts">
  import { t } from '../i18n';
  import { onMount } from 'svelte';
  import { isTouchDevice } from '../engine/Engine';
  import type { ArtLibrary } from '../art/ArtLibrary';

  interface Props {
    initialSeed: string;
    onEnter: (seed: string) => void;
    library: ArtLibrary;
  }
  let { initialSeed, onEnter, library }: Props = $props();
  let readyCount = $state(0);

  onMount(() => {
    const id = setInterval(() => (readyCount = library.stats().ready), 300);
    return () => clearInterval(id);
  });
  // svelte-ignore state_referenced_locally
  let seed = $state(initialSeed);
  const touch = isTouchDevice();

  function submit(e: SubmitEvent) {
    e.preventDefault();
    onEnter(seed);
  }
</script>

<div class="home">
  <form class="card" onsubmit={submit}>
    <h1>{t('app.title')}</h1>
    <p class="subtitle">{t('app.subtitle')}</p>
    <button class="enter" type="submit">{t('home.enter')}</button>
    <label class="seed">
      <span>{t('home.seed')}</span>
      <input type="text" bind:value={seed} placeholder={t('home.seedHint')} autocomplete="off" spellcheck="false" />
    </label>
    <p class="status">{readyCount > 0 ? t('home.ready', { n: readyCount }) : t('home.preparing')}</p>
    <p class="controls">{touch ? t('home.controlsMobile') : t('home.controlsDesktop')}</p>
  </form>
</div>

<style>
  .home {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(ellipse at 50% 40%, rgba(201, 161, 74, 0.14), transparent 60%),
      var(--bg);
  }
  .card {
    max-width: 440px;
    width: 100%;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
  }
  h1 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: clamp(2.2rem, 8vw, 3.4rem);
    letter-spacing: 0.04em;
    margin: 0;
  }
  .subtitle {
    font-family: var(--serif);
    font-style: italic;
    color: var(--ink-dim);
    margin: 0 0 12px;
    line-height: 1.5;
  }
  .enter {
    font-family: var(--serif);
    font-size: 1.25rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    padding: 14px 44px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }
  .enter:hover,
  .enter:focus-visible {
    background: var(--accent);
    color: var(--bg);
  }
  .seed {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--ink-dim);
    width: 100%;
    max-width: 280px;
  }
  .seed input {
    font: inherit;
    font-size: 0.95rem;
    text-align: center;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: var(--ink);
    border-radius: 4px;
  }
  .status {
    font-size: 0.75rem;
    color: var(--ink-dim);
    margin: -8px 0 0;
    font-style: italic;
  }
  .controls {
    font-size: 0.78rem;
    color: var(--ink-dim);
    line-height: 1.6;
    margin: 8px 0 0;
  }
</style>
