<script lang="ts">
  import { onMount } from 'svelte';
  import { CONFIG } from '../config';
  import type { Engine, EngineStats } from '../engine/Engine';
  import { t } from '../i18n';

  let { engine }: { engine: Engine } = $props();
  let s = $state<EngineStats | null>(null);

  onMount(() => {
    s = engine.stats();
    const id = setInterval(() => (s = engine.stats()), CONFIG.debug.refreshMs);
    return () => clearInterval(id);
  });
</script>

{#if s}
  <div class="debug" aria-hidden="true">
    <div><b>{t('debug.fps')}</b> {s.fps.toFixed(0)} <span class="dim">({s.frameMs.toFixed(1)} ms)</span></div>
    <div><b>{t('debug.modules')}</b> {s.world.modules} <span class="dim">· {t('debug.visible')} {s.world.visible}</span></div>
    <div><b>{t('debug.created')}</b> {s.world.created} <span class="dim">· {t('debug.destroyed')} {s.world.destroyed}</span>{#if s.world.popIns > 0} <span class="warn">· pop-in {s.world.popIns}</span>{/if}</div>
    <div><b>{t('debug.geometries')}</b> {s.geometries} <span class="dim">· {t('debug.textures')} {s.textures}</span></div>
    <div><b>{t('debug.calls')}</b> {s.calls} <span class="dim">· {(s.triangles / 1000).toFixed(1)}k tri</span></div>
    {#if s.heapMB !== null}<div><b>{t('debug.heap')}</b> {s.heapMB.toFixed(1)} Mo</div>{/if}
    <div><b>{t('debug.module')}</b> {s.world.currentModule}</div>
    <div><b>{t('debug.position')}</b> {s.position} <span class="dim">· {s.distanceWalked.toFixed(0)} m</span></div>
    <div><b>{t('debug.ambiance')}</b> {s.ambiance}</div>
    <div><b>Zone</b> <span class="dim">{s.world.zone}</span></div>
    {#if s.art}
      <div><b>{t('debug.art')}</b> {s.art.mode}{s.art.offline ? ' (hors ligne)' : ''} <span class="dim">· prêtes {s.art.ready} · file {s.art.queued} · chargement {s.art.loading} · attente {s.art.waiting}</span></div>
      <div><b>GPU œuvres</b> {s.art.gpuMB.toFixed(1)} Mo <span class="dim">· {s.art.liveTextures} tex · HD {s.art.highRes} · échecs {s.art.failedImages} · filtrées {s.art.filtered}{s.art.disabledSources.length ? ` · écartées : ${s.art.disabledSources.join(', ')}` : ''}</span></div>
      {#if s.art.perSource}<div><b>Sources</b> <span class="dim">(réussies/échecs)</span> {s.art.perSource}</div>{/if}
      {#if s.art.themes}<div><b>Thèmes</b> {s.art.themes}</div>{/if}
    {/if}
    <div><b>{t('debug.seed')}</b> {s.seed}</div>
  </div>
{/if}

<style>
  .debug {
    z-index: 5;
    position: fixed;
    top: max(12px, env(safe-area-inset-top));
    right: max(12px, env(safe-area-inset-right));
    background: rgba(0, 0, 0, 0.62);
    color: #d9f5d0;
    font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    padding: 8px 10px;
    pointer-events: none;
    border-radius: 4px;
    min-width: 190px;
  }
  b {
    color: #8fe07a;
    font-weight: 600;
  }
.warn {
    color: #ff8a7a;
  }
  .dim {
    color: #9fb59a;
  }
</style>
