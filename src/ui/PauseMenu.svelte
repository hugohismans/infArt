<script lang="ts">
  import { t } from '../i18n';
  import { shareUrl } from './params';

  interface Props {
    seed: string;
    autoWalk: boolean;
    reduceMotion: boolean;
    debugVisible: boolean;
    onResume: () => void;
    onNewVisit: () => void;
  }
  let {
    seed,
    autoWalk = $bindable(),
    reduceMotion = $bindable(),
    debugVisible = $bindable(),
    onResume,
    onNewVisit,
  }: Props = $props();

  let copied = $state(false);

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
    <button class="primary" onclick={onResume}>{t('menu.resume')}</button>

    <label class="toggle">
      <input type="checkbox" bind:checked={autoWalk} />
      <span>{t('menu.autoWalk')}</span>
    </label>
    <label class="toggle">
      <input type="checkbox" bind:checked={reduceMotion} />
      <span>{t('menu.reduceMotion')}</span>
    </label>
    <label class="toggle">
      <input type="checkbox" bind:checked={debugVisible} />
      <span>{t('menu.debug')}</span>
    </label>

    <div class="seed">
      <span>{t('menu.seed')} : <code>{seed}</code></span>
      <button class="link" onclick={share}>{copied ? t('menu.copied') : t('menu.share')}</button>
    </div>

    <button class="secondary" onclick={onNewVisit}>{t('menu.newVisit')}</button>
  </div>
</div>

<style>
  .backdrop {
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
