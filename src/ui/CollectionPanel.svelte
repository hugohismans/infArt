<script lang="ts">
  import { onMount } from 'svelte';
  import type { Artwork, ArtType } from '../../shared/artwork';
  import { THEMES } from '../../shared/themes';
  import { AMBIANCES } from '../ambiances';
  import type { ArtClient } from '../art/ArtClient';
  import { t } from '../i18n';
  import type { MessageKey } from '../i18n/fr';
  import { ACHIEVEMENTS, progress } from '../progress/achievements.svelte';
  import { collection } from '../progress/collection.svelte';

  interface Props {
    client: ArtClient;
    onOpen: (art: Artwork) => void;
    onClose: () => void;
  }
  let { client, onOpen, onClose }: Props = $props();

  let tab = $state<'art' | 'achievements'>('art');
  let closeButton: HTMLButtonElement;
  onMount(() => closeButton.focus({ preventScroll: true }));
  let filter = $state<ArtType | null>(null);

  const types = $derived([...new Set(collection.items.map((s) => s.art.type))]);
  const shown = $derived(filter ? collection.items.filter((s) => s.art.type === filter) : collection.items);
  const unlockedCount = $derived(ACHIEVEMENTS.filter((a) => progress.unlocked[a.id]).length);
  // Les succès obtenus d'abord, puis les plus avancés.
  const achievements = $derived(
    [...ACHIEVEMENTS].sort((a, b) => {
      const ua = progress.unlocked[a.id] ? 1 : 0, ub = progress.unlocked[b.id] ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return progress.progressOf(b) / b.target - progress.progressOf(a) / a.target;
    }),
  );
  const ambianceTotal = Object.keys(AMBIANCES).length;

  function km(m: number): string {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
  }
  function day(ms: number): string {
    return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function backdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<div class="backdrop" onclick={backdrop} role="presentation">
  <div class="panel" role="dialog" aria-modal="true" aria-label={t('collection.title')}>
    <header>
      <h2>{t('collection.title')}</h2>
      <button class="close" bind:this={closeButton} onclick={onClose} aria-label={t('collection.close')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      </button>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'art'} class:on={tab === 'art'} onclick={() => (tab = 'art')}>{t('collection.tabArt')} <span>{collection.items.length}</span></button>
        <button role="tab" aria-selected={tab === 'achievements'} class:on={tab === 'achievements'} onclick={() => (tab = 'achievements')}>{t('collection.tabAchievements')} <span>{unlockedCount}/{ACHIEVEMENTS.length}</span></button>
      </div>
    </header>

    <div class="body">
      {#if tab === 'art'}
        {#if collection.items.length === 0}
          <p class="empty">{t('collection.empty')}</p>
        {:else}
          {#if types.length > 1}
            <div class="chips">
              <button class:on={filter === null} onclick={() => (filter = null)}>{t('collection.all')}</button>
              {#each types as ty (ty)}
                <button class:on={filter === ty} onclick={() => (filter = ty)}>{t(`type.${ty}` as MessageKey)}</button>
              {/each}
            </div>
          {/if}
          <ul class="grid">
            {#each shown as s (s.art.id)}
              <li>
                <button class="card" onclick={() => onOpen(s.art)}>
                  <span class="thumb"><img src={client.thumbUrl(s.art)} alt="" loading="lazy" draggable="false" /></span>
                  <span class="title">{s.art.title}</span>
                  <span class="creator">{s.art.creator ?? t('sheet.unknownArtist')}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else}
        <dl class="stats">
          <div><dt>{t('collection.statAmbiances')}</dt><dd>{progress.stats.ambiances.length} / {ambianceTotal}</dd></div>
          <div><dt>{t('collection.statThemes')}</dt><dd>{progress.stats.themes.length} / {THEMES.length}</dd></div>
          <div><dt>{t('collection.statDistance')}</dt><dd>{km(progress.stats.distance)}</dd></div>
          <div><dt>{t('collection.statSheets')}</dt><dd>{progress.stats.sheets}</dd></div>
        </dl>
        <ul class="achievements">
          {#each achievements as a (a.id)}
            {@const done = progress.unlocked[a.id]}
            {@const p = progress.progressOf(a)}
            <li class:done>
              <span class="medal" aria-hidden="true">{done ? '★' : '☆'}</span>
              <div>
                <p class="a-title">{done || !a.secret ? a.title : '???'}</p>
                <p class="a-desc">{done || !a.secret ? a.description : t('collection.secret')}</p>
                {#if done}
                  <p class="a-date">{t('collection.unlockedOn', { date: day(done) })}</p>
                {:else if a.target > 1 && !a.secret}
                  <div class="bar" title="{p} / {a.target}"><div style="width: {(100 * p) / a.target}%"></div></div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    z-index: 18;
    position: fixed;
    inset: 0;
    background: rgba(5, 4, 3, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  /* Marges explicites plutôt qu'une hauteur en vh ou en % : Safari (iPhone) les résolvait
     mal et le panneau sortait de l'écran par le bas. */
  .panel {
    position: absolute;
    top: max(12px, env(safe-area-inset-top), 7vh);
    bottom: max(12px, env(safe-area-inset-bottom), 7vh);
    left: max(12px, env(safe-area-inset-left));
    right: max(12px, env(safe-area-inset-right));
    margin: 0 auto;
    max-width: 920px;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  header {
    padding: 22px 22px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  h2 {
    font-family: var(--serif);
    font-weight: 400;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    font-size: 1rem;
    color: var(--ink-dim);
    margin: 0 0 14px;
  }
  .close {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: transparent;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .tabs {
    display: flex;
    gap: 22px;
  }
  .tabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 8px 0 10px;
    font-family: var(--serif);
    font-size: 1.05rem;
    color: var(--ink-dim);
    cursor: pointer;
  }
  .tabs button.on {
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  .tabs span {
    font-family: var(--sans);
    font-size: 0.75rem;
    color: var(--ink-dim);
    margin-left: 4px;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 18px 22px 24px;
    min-height: 0;
  }
  .empty {
    font-family: var(--serif);
    font-style: italic;
    color: var(--ink-dim);
    text-align: center;
    margin: 40px auto;
    max-width: 380px;
    line-height: 1.6;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .chips button {
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: transparent;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .chips button.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
  }
  .card {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .thumb {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    background: rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }
  .thumb img {
    max-width: 88%;
    max-height: 88%;
    object-fit: contain;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
    transition: transform 0.2s;
  }
  .card:hover img,
  .card:focus-visible img {
    transform: scale(1.04);
  }
  .title {
    font-family: var(--serif);
    font-style: italic;
    font-size: 0.92rem;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .creator {
    font-size: 0.75rem;
    color: var(--ink-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 12px;
    margin: 0 0 22px;
  }
  .stats div {
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.04);
  }
  .stats dt {
    font-size: 0.75rem;
    color: var(--ink-dim);
  }
  .stats dd {
    margin: 4px 0 0;
    font-family: var(--serif);
    font-size: 1.3rem;
  }
  .achievements {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
  }
  .achievements li {
    display: flex;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    opacity: 0.6;
  }
  .achievements li.done {
    opacity: 1;
    border-color: rgba(201, 161, 74, 0.45);
  }
  .medal {
    font-size: 1.4rem;
    line-height: 1;
    color: var(--accent);
  }
  .achievements p {
    margin: 0;
  }
  .a-title {
    font-family: var(--serif);
    font-size: 1rem;
  }
  .a-desc {
    font-size: 0.8rem;
    color: var(--ink-dim);
    margin-top: 2px !important;
  }
  .a-date {
    font-size: 0.72rem;
    color: var(--accent);
    margin-top: 4px !important;
  }
  .bar {
    margin-top: 8px;
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
  }
  .bar div {
    height: 100%;
    background: var(--accent);
  }
</style>
