<script lang="ts">
  import { t } from '../i18n';
  import { onMount } from 'svelte';
  import { shareUrl } from './params';
  import { GyroInput } from '../engine/input/GyroInput';
  import { isTouchDevice } from '../engine/Engine';
  import type { QualitySetting } from '../engine/Quality';
  import type { MessageKey } from '../i18n/fr';
  import DuoPanel from './DuoPanel.svelte';

  interface Props {
    seed: string;
    autoWalk: boolean;
    reduceMotion: boolean;
    debugVisible: boolean;
    filterSensitive: boolean;
    quality: QualitySetting;
    gyro: boolean;
    largeText: boolean;
    volume: number;
    mouseSensitivity: number;
    onResume: () => void;
    onNewVisit: () => void;
    onCollection: () => void;
    /** Visite à deux disponible (Firebase connecté). */
    duo: boolean;
    duoJoining: boolean;
    onLeaveDuo: () => void;
  }
  let {
    seed,
    autoWalk = $bindable(),
    reduceMotion = $bindable(),
    debugVisible = $bindable(),
    filterSensitive = $bindable(),
    quality = $bindable(),
    gyro = $bindable(),
    largeText = $bindable(),
    volume = $bindable(),
    mouseSensitivity = $bindable(),
    onResume,
    onNewVisit,
    onCollection,
    duo,
    duoJoining,
    onLeaveDuo,
  }: Props = $props();

  let copied = $state(false);
  let gyroDenied = $state(false);
  let resumeButton: HTMLButtonElement;
  const touch = isTouchDevice();
  const qualities: QualitySetting[] = ['auto', 'bas', 'moyen', 'haut'];

  // Le focus va dans le menu (clavier, lecteurs d'écran).
  onMount(() => resumeButton.focus());

  /** iOS : l'autorisation des capteurs se demande pendant le geste (ce clic). */
  async function toggleGyro(e: Event) {
    const want = (e.currentTarget as HTMLInputElement).checked;
    if (want && !(await GyroInput.requestPermission())) {
      gyroDenied = true;
      gyro = false;
      return;
    }
    gyroDenied = false;
    gyro = want;
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(shareUrl(seed));
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* presse-papiers indisponible */
    }
  }

  function backdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onResume();
  }
</script>

<div class="backdrop" onclick={backdrop} role="presentation">
  <div class="menu" role="dialog" aria-modal="true" aria-label={t('menu.title')}>
    <h2>{t('menu.title')}</h2>
    <button class="primary" bind:this={resumeButton} onclick={onResume}>{t('menu.resume')}</button>
    <button class="secondary" onclick={onCollection}>{t('menu.collection')}</button>

    <label class="toggle">
      <input type="checkbox" bind:checked={autoWalk} />
      <span>{t('menu.autoWalk')}</span>
    </label>
    <label class="toggle">
      <input type="checkbox" bind:checked={reduceMotion} />
      <span>{t('menu.reduceMotion')}</span>
    </label>
    <label class="toggle">
      <input type="checkbox" bind:checked={filterSensitive} />
      <span>{t('menu.filter')}</span>
    </label>
    <label class="toggle">
      <input type="checkbox" bind:checked={largeText} />
      <span>{t('menu.largeText')}</span>
    </label>
    {#if touch && GyroInput.supported}
      <label class="toggle">
        <input type="checkbox" checked={gyro} onchange={toggleGyro} />
        <span>{t('menu.gyro')}{#if gyroDenied}<em class="note"> · {t('menu.gyroDenied')}</em>{/if}</span>
      </label>
    {/if}
    <label class="range">
      <span>{t('menu.volume')}</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={volume} aria-valuetext={`${Math.round(volume * 100)} %`} />
      <output>{Math.round(volume * 100)} %</output>
    </label>
    {#if !touch}
      <label class="range">
        <span>{t('menu.mouse')}</span>
        <input type="range" min="0.25" max="3" step="0.05" bind:value={mouseSensitivity} aria-valuetext={`× ${mouseSensitivity.toFixed(2)}`} />
        <output>× {mouseSensitivity.toFixed(2)}</output>
      </label>
    {/if}
    <label class="select">
      <span>{t('menu.quality')}</span>
      <select bind:value={quality}>
        {#each qualities as q (q)}<option value={q}>{t(`menu.quality.${q}` as MessageKey)}</option>{/each}
      </select>
    </label>
    <label class="toggle">
      <input type="checkbox" bind:checked={debugVisible} />
      <span>{t('menu.debug')}</span>
    </label>

    {#if duo}<DuoPanel joining={duoJoining} onLeave={onLeaveDuo} />{/if}

    <div class="seed">
      <span>{t('menu.seed')} : <code>{seed}</code></span>
      <button class="link" onclick={share}>{copied ? t('menu.copied') : t('menu.share')}</button>
    </div>

    <button class="secondary" onclick={onNewVisit}>{t('menu.newVisit')}</button>
    {#if !touch}<p class="keys">{t('menu.keys')}</p>{/if}
  </div>
</div>

<style>
  .backdrop {
    z-index: 10;
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(5, 4, 3, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    padding: 16px;
  }
  .menu {
    background: var(--panel);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 28px 28px 22px;
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h2 {
    font-family: var(--serif);
    font-weight: 400;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    font-size: 1rem;
    color: var(--ink-dim);
    margin: 0 0 4px;
    text-align: center;
  }
  .primary,
  .secondary {
    padding: 11px;
    cursor: pointer;
    font-family: var(--serif);
    font-size: 1.05rem;
  }
  .primary {
    background: var(--accent);
    color: var(--bg);
    border: none;
  }
  .secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .toggle {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 0.92rem;
    cursor: pointer;
  }
  .toggle input {
    accent-color: var(--accent);
    width: 18px;
    height: 18px;
  }
  .select {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 0.92rem;
  }
  .select select {
    font: inherit;
    padding: 5px 8px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--ink);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .range {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) 3.6em;
    align-items: center;
    gap: 10px;
    font-size: 0.92rem;
  }
  .range input {
    width: 100%;
    accent-color: var(--accent);
  }
  .range output {
    font-variant-numeric: tabular-nums;
    color: var(--ink-dim);
    font-size: 0.85rem;
    text-align: right;
  }
  .note {
    color: var(--ink-dim);
    font-size: 0.8rem;
  }
  .keys {
    margin: 0;
    font-size: 0.75rem;
    color: var(--ink-dim);
    text-align: center;
  }
  .menu {
    max-height: calc(100vh - 32px);
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
  }
  .seed {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--ink-dim);
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  code {
    color: var(--ink);
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.85rem;
  }
</style>
