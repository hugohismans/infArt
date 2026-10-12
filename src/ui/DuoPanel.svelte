<script lang="ts">
  import { t } from '../i18n';
  import { lobby } from '../net/Lobby.svelte';

  interface Props {
    joining: boolean;
    onLeave: () => void;
  }
  let { joining, onLeave }: Props = $props();
</script>

<section class="duo" aria-label={t('duo.title')}>
  <h3>{t('duo.title')}</h3>
  {#if lobby.error}
    <p class="note">{t('duo.offline')}</p>
  {:else if lobby.pairing}
    <p class="with">{t('duo.with', { name: lobby.pairing.friend.name })}{#if joining}<br /><em>{t('duo.joining')}</em>{/if}</p>
    <button class="leave" onclick={onLeave}>{t('duo.leave')}</button>
  {:else}
    {#if !lobby.name}<p class="note">{t('duo.anonymous')}</p>{/if}
    {#if lobby.players.length === 0}
      <p class="note">{t('duo.empty')}</p>
    {:else}
      <ul>
        {#each lobby.players as p (p.uid)}
          <li>
            <span class="name">{p.name}</span>
            {#if p.busy}
              <span class="state">{t('duo.busy')}</span>
            {:else if lobby.pending.includes(p.uid)}
              <span class="state">{t('duo.invited')}</span>
            {:else}
              <button onclick={() => lobby.invite(p)}>{t('duo.invite')}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .duo {
    display: grid;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  h3 {
    margin: 0;
    font-family: var(--serif);
    font-weight: 400;
    font-size: 0.95rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .note {
    margin: 0;
    font-size: 0.8rem;
    color: var(--ink-dim);
    line-height: 1.4;
  }
  .with {
    margin: 0;
    font-family: var(--serif);
  }
  .with em {
    font-size: 0.8rem;
    color: var(--ink-dim);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    max-height: 180px;
    overflow-y: auto;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    font-size: 0.75rem;
    color: var(--ink-dim);
    font-style: italic;
  }
  button {
    padding: 5px 12px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.8rem;
  }
  .leave {
    justify-self: start;
  }
</style>
