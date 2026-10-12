<script lang="ts">
  import { onMount } from 'svelte';
  import type { Artwork } from '../../shared/artwork';
  import { ADAPTERS_BY_ID } from '../../shared/adapters';
  import type { ArtClient } from '../art/ArtClient';
  import { t } from '../i18n';
  import type { MessageKey } from '../i18n/fr';

  interface Props {
    artwork: Artwork;
    client: ArtClient;
    onClose: () => void;
  }
  let { artwork, client, onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let src = $state(client.detailImageUrl(artwork, false));
  let loadingHd = $state(false);
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let viewport: HTMLDivElement;

  const source = $derived(ADAPTERS_BY_ID[artwork.source]);
  const typeLabel = $derived(t(`type.${artwork.type}` as MessageKey));
  const dims = $derived(
    artwork.dimensions ? `${fmt(artwork.dimensions.h)} × ${fmt(artwork.dimensions.w)}${artwork.dimensions.d ? ` × ${fmt(artwork.dimensions.d)}` : ''} cm` : null,
  );

  function fmt(n: number): string {
    return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  }

  onMount(() => {
    // Haute définition en arrière-plan ; on garde le zoom courant quand elle arrive.
    const high = client.detailImageUrl(artwork, true);
    if (high !== src) {
      loadingHd = true;
      const img = new Image();
      img.onload = () => {
        src = high;
        loadingHd = false;
      };
      img.onerror = () => (loadingHd = false);
      img.src = high;
      return () => {
        img.onload = img.onerror = null;
        img.src = '';
      };
    }
  });

  // --- Zoom et déplacement --------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let dragged = false;
  /**
   * Le clic qui suit le geste d'ouverture (relâchement de la souris, « clic fantôme »
   * après un toucher) ne doit pas refermer la fiche : on n'écoute que les clics dont
   * l'appui a commencé sur la fiche.
   */
  let armed = false;

  function clampView() {
    if (scale <= 1) {
      scale = 1;
      tx = 0;
      ty = 0;
      return;
    }
    const r = viewport.getBoundingClientRect();
    const maxX = (r.width * (scale - 1)) / 2;
    const maxY = (r.height * (scale - 1)) / 2;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }

  /** Zoom autour d'un point de l'écran. */
  function zoomAt(factor: number, cx: number, cy: number) {
    const r = viewport.getBoundingClientRect();
    const px = cx - r.left - r.width / 2;
    const py = cy - r.top - r.height / 2;
    const next = Math.max(1, Math.min(8, scale * factor));
    const k = next / scale;
    tx = px - (px - tx) * k;
    ty = py - (py - ty) * k;
    scale = next;
    clampView();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }

  function onPointerDown(e: PointerEvent) {
    armed = true;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 0) zoomAt(d / pinchDist, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      pinchDist = d;
      dragged = true;
    } else if (scale > 1) {
      tx += cur.x - prev.x;
      ty += cur.y - prev.y;
      clampView();
      if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > 1) dragged = true;
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
  }

  function onDblClick(e: MouseEvent) {
    if (scale > 1) {
      scale = 1;
      clampView();
    } else zoomAt(2.5, e.clientX, e.clientY);
  }

  /** Clic sur le fond (hors image, sans glisser) : on ferme. */
  function onViewportClick(e: MouseEvent) {
    if (armed && !dragged && scale === 1 && (e.target as HTMLElement).tagName !== 'IMG') onClose();
  }

  // Glisser vers le bas sur la poignée (mobile) pour fermer.
  let swipeY: number | null = null;
  function onHandleDown(e: PointerEvent) {
    swipeY = e.clientY;
  }
  function onHandleUp(e: PointerEvent) {
    if (swipeY !== null && e.clientY - swipeY > 70) onClose();
    swipeY = null;
  }
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label={artwork.title}>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    class="viewport"
    bind:this={viewport}
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={onDblClick}
    onclick={onViewportClick}
    class:zoomed={scale > 1}
  >
    <img
      {src}
      alt={artwork.title}
      draggable="false"
      style="transform: translate({tx}px, {ty}px) scale({scale})"
    />
    <div class="hint">{loadingHd ? t('sheet.loadingHd') : t('sheet.zoomHint')}</div>
  </div>

  <aside class="info">
    <div class="handle" onpointerdown={onHandleDown} onpointerup={onHandleUp} role="presentation"><span></span></div>
    <button class="close" onclick={onClose} aria-label={t('sheet.close')}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>
    <p class="type">{typeLabel}</p>
    <h2>{artwork.title}</h2>
    <p class="creator">{artwork.creator ?? t('sheet.unknownArtist')}{#if artwork.date}<span class="date">, {artwork.date}</span>{/if}</p>

    <dl>
      {#if artwork.medium}<dt>{t('sheet.medium')}</dt><dd>{artwork.medium}</dd>{/if}
      {#if dims}<dt>{t('sheet.dimensions')}</dt><dd>{dims}</dd>{/if}
      {#if artwork.culture}<dt>{t('sheet.culture')}</dt><dd>{artwork.culture}</dd>{/if}
      {#if artwork.movement}<dt>{t('sheet.movement')}</dt><dd>{artwork.movement}</dd>{/if}
    </dl>

    {#if artwork.description}
      <div class="description">
        {#each artwork.description.split(/\n\n+/) as para}<p>{para}</p>{/each}
      </div>
    {/if}

    <dl class="credits">
      <dt>{t('sheet.source')}</dt><dd><a href={source?.homepage ?? artwork.sourceUrl} target="_blank" rel="noopener noreferrer">{source?.name ?? artwork.source}</a></dd>
      <dt>{t('sheet.credit')}</dt><dd>{artwork.credit}</dd>
      <dt>{t('sheet.license')}</dt><dd>{artwork.license}</dd>
    </dl>

    <a class="open" href={artwork.sourceUrl} target="_blank" rel="noopener noreferrer">{t('sheet.open')} ↗</a>
  </aside>
</div>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    display: flex;
    background: rgba(8, 7, 6, 0.94);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: appear 0.25s ease-out;
    z-index: 20;
  }
  @keyframes appear {
    from { opacity: 0; }
  }
  .viewport {
    position: relative;
    flex: 1;
    overflow: hidden;
    display: grid;
    place-items: center;
    touch-action: none;
    cursor: zoom-in;
    min-height: 0;
  }
  .viewport.zoomed {
    cursor: grab;
  }
  img {
    /* Centrée en absolu : les pourcentages se rapportent bien à la zone d'image. */
    position: absolute;
    inset: 0;
    margin: auto;
    max-width: calc(100% - 32px);
    max-height: calc(100% - 52px);
    object-fit: contain;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    user-select: none;
    -webkit-user-select: none;
    transform-origin: center;
    will-change: transform;
  }
  .hint {
    position: absolute;
    bottom: 12px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 0.75rem;
    color: var(--ink-dim);
    pointer-events: none;
  }
  .info {
    position: relative;
    width: 380px;
    max-width: 42vw;
    overflow-y: auto;
    padding: 52px 28px 28px;
    background: var(--panel);
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 0.92rem;
    line-height: 1.55;
  }
  .handle {
    display: none;
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
  .type {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.72rem;
    color: var(--accent);
    margin: 0 0 6px;
  }
  h2 {
    font-family: var(--serif);
    font-weight: 400;
    font-style: italic;
    font-size: 1.55rem;
    line-height: 1.25;
    margin: 0 0 8px;
  }
  .creator {
    font-family: var(--serif);
    font-size: 1.08rem;
    margin: 0 0 18px;
  }
  .date {
    color: var(--ink-dim);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    margin: 0 0 18px;
  }
  dt {
    color: var(--ink-dim);
    font-size: 0.8rem;
  }
  dd {
    margin: 0;
  }
  .description p {
    margin: 0 0 10px;
    color: rgba(243, 236, 224, 0.86);
  }
  .credits {
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 0.82rem;
  }
  a {
    color: var(--accent);
  }
  .open {
    display: inline-block;
    margin-top: 4px;
    padding: 10px 16px;
    border: 1px solid var(--accent);
    text-decoration: none;
    font-family: var(--serif);
  }

  /* Mobile / portrait : image en haut, informations dessous. */
  @media (max-width: 760px), (orientation: portrait) {
    .sheet {
      flex-direction: column;
    }
    .viewport {
      flex: 0 0 52%;
    }
    .info {
      width: 100%;
      max-width: none;
      flex: 1;
      border-left: none;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding: 22px 20px calc(24px + env(safe-area-inset-bottom));
    }
    .handle {
      display: flex;
      justify-content: center;
      margin: -12px 0 10px;
      padding: 6px 0;
      touch-action: none;
    }
    .handle span {
      width: 44px;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.25);
    }
    .close {
      top: 10px;
    }
  }
</style>
