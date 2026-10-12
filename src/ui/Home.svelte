<script lang="ts">
  import { onMount } from 'svelte';
  import type { Artwork } from '../../shared/artwork';
  import { t } from '../i18n';
  import { isTouchDevice } from '../engine/Engine';
  import type { ArtLibrary } from '../art/ArtLibrary';
  import type { ArtClient } from '../art/ArtClient';
  import { collection } from '../progress/collection.svelte';
  import { ACHIEVEMENTS, progress } from '../progress/achievements.svelte';

  interface Props {
    onEnter: () => void;
    onCollection: () => void;
    library: ArtLibrary;
    client: ArtClient;
    /** Accrochage des premières œuvres, une fois « Entrer » cliqué. */
    loading: { ready: number; target: number } | null;
    reduceMotion: boolean;
  }
  let { onEnter, onCollection, library, client, loading, reduceMotion }: Props = $props();

  const touch = isTouchDevice();
  let readyCount = $state(0);
  const unlocked = $derived(ACHIEVEMENTS.filter((a) => progress.unlocked[a.id]).length);

  // --- Couloir en perspective -------------------------------------------------
  // Des cadres défilent lentement sur deux murs et s'enfoncent dans l'obscurité ;
  // ils se remplissent des œuvres déjà préparées pour la visite.
  const PER_SIDE = 7;
  const SPACING = 430;
  const DEPTH = PER_SIDE * SPACING;
  const HALF_WIDTH = 360;
  /** Les cadres sont un peu tournés vers le visiteur (vus de face, ils restent lisibles). */
  const TURN = 58;
  const SPEED = 55; // px / s

  interface Slot {
    el?: HTMLDivElement;
    side: -1 | 1;
    z: number;
    w: number;
    h: number;
    src: string | null;
  }
  const slots: Slot[] = $state(
    Array.from({ length: PER_SIDE * 2 }, (_, i) => ({
      side: (i % 2 === 0 ? -1 : 1) as -1 | 1,
      z: -DEPTH + (Math.floor(i / 2) + (i % 2) * 0.5) * SPACING,
      w: 150,
      h: 190,
      src: null,
    })),
  );

  let floor: HTMLDivElement;
  let travelled = 0;
  let pool: Artwork[] = [];
  let next = 0;
  const shown = new Set<string>();

  /** Prochaine œuvre à accrocher : de préférence une qui n'est pas déjà sur les murs. */
  function assign(s: Slot): void {
    if (pool.length === 0) return;
    for (let k = 0; k < pool.length; k++) {
      const art = pool[(next + k) % pool.length]!;
      if (shown.has(art.id) && k < pool.length - 1) continue;
      next = (next + k + 1) % pool.length;
      const aspect = Math.min(1.6, Math.max(0.6, art.aspectRatio ?? 0.8));
      s.h = aspect >= 1 ? 150 : 200;
      s.w = s.h * aspect;
      s.src = client.thumbUrl(art, 320);
      shown.add(art.id);
      return;
    }
  }

  function place(s: Slot): void {
    if (!s.el) return;
    // Brume : les cadres naissent dans le noir au fond et s'effacent en passant à côté.
    const far = Math.min(1, Math.max(0, (s.z + DEPTH) / (DEPTH * 0.45)));
    const near = Math.min(1, Math.max(0, (420 - s.z) / 260));
    s.el.style.opacity = String(far * near);
    s.el.style.transform = `translate3d(${s.side * HALF_WIDTH - s.w / 2}px, ${-s.h / 2}px, ${s.z}px) rotateY(${-s.side * TURN}deg)`;
  }

  onMount(() => {
    let raf = 0;
    let last = performance.now();
    let refresh = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      refresh -= dt;
      if (refresh <= 0) {
        refresh = 1;
        readyCount = library.stats().ready;
        pool = library.preview(40);
        for (const s of slots) if (!s.src) assign(s);
      }
      const v = reduceMotion ? 0 : SPEED * dt;
      // Le parquet avance d'une latte puis revient : un simple déplacement, sans repeindre.
      travelled = (travelled + v) % 60;
      floor.style.transform = `translate3d(0, 0, ${travelled}px) rotateX(90deg) translateY(-3000px)`;
      for (const s of slots) {
        s.z += v;
        if (s.z > 420) {
          s.z -= DEPTH;
          assign(s);
        }
        place(s);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    onEnter();
  }
</script>

<div class="home">
  <div class="corridor" aria-hidden="true">
    <div class="space">
      <div class="floor" bind:this={floor}></div>
      <div class="ceiling"></div>
      {#each slots as s, i (i)}
        <div class="frame" bind:this={s.el} style="width: {s.w}px; height: {s.h}px">
          {#if s.src}<img src={s.src} alt="" draggable="false" onerror={() => (s.src = null)} />{/if}
        </div>
      {/each}
    </div>
  </div>
  <div class="veil" aria-hidden="true"></div>

  <form class="card" onsubmit={submit}>
    <p class="kicker">{t('home.kicker')}</p>
    <h1>{t('app.title')}</h1>
    <p class="subtitle">{t('app.subtitle')}</p>

    {#if loading}
      <div class="loading" role="status" aria-live="polite">
        <p>{t('home.loading')}</p>
        <div class="bar"><div class="fill" style="width: {(100 * loading.ready) / loading.target}%"></div></div>
      </div>
    {:else}
      <button class="enter" type="submit">{t('home.enter')}</button>
      <p class="status">{readyCount > 0 ? t('home.ready', { n: readyCount }) : t('home.preparing')}</p>
    {/if}

    <div class="links">
      <button class="link" type="button" onclick={onCollection}>
        {t('home.collection')}{#if collection.items.length > 0}<span class="count">{collection.items.length}</span>{/if}
      </button>
      {#if unlocked > 0}<span class="dot">·</span><button class="link" type="button" onclick={onCollection}>{t('home.achievements', { n: unlocked, total: ACHIEVEMENTS.length })}</button>{/if}
    </div>

    <p class="controls">{touch ? t('home.controlsMobile') : t('home.controlsDesktop')}</p>
  </form>

  <p class="credits">{t('home.credits')}</p>
</div>

<style>
  .home {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #070605;
  }

  /* --- Couloir ------------------------------------------------------------ */
  .corridor {
    position: absolute;
    inset: 0;
    perspective: 760px;
    perspective-origin: 50% 46%;
    pointer-events: none;
  }
  .space {
    position: absolute;
    left: 50%;
    top: 46%;
    transform-style: preserve-3d;
  }
  .frame {
    position: absolute;
    left: 0;
    top: 0;
    box-sizing: border-box;
    padding: 7px;
    background: linear-gradient(135deg, #d9b45a, #8a6a2a 45%, #c79c43 70%, #6d5322);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
    backface-visibility: hidden;
    will-change: transform, opacity;
  }
  .frame::before {
    /* Toile sombre tant que l'image n'est pas là. */
    content: '';
    position: absolute;
    inset: 7px;
    background: linear-gradient(160deg, #2a221c, #15110e);
  }
  .frame img {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    animation: reveal 1.2s ease-out;
  }
  @keyframes reveal {
    from { opacity: 0; }
  }
  .floor,
  .ceiling {
    position: absolute;
    left: -400px;
    width: 800px;
    height: 3400px;
    transform-origin: 50% 0;
  }
  .floor {
    top: 230px;
    transform: rotateX(90deg) translateY(-3000px);
    background:
      repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.35) 0 2px, transparent 2px 100px),
      repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.25) 0 2px, transparent 2px 60px),
      linear-gradient(0deg, #3a2a1c, #120d09);
    will-change: transform;
  }
  .ceiling {
    top: -300px;
    transform: rotateX(-90deg) translateY(-400px);
    background: linear-gradient(180deg, #17120f, #060504);
  }
  .veil {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 34% 40% at 50% 50%, rgba(7, 6, 5, 0.8), rgba(7, 6, 5, 0.35) 65%, transparent 100%),
      radial-gradient(ellipse at 50% 46%, transparent 55%, rgba(0, 0, 0, 0.6) 100%);
    pointer-events: none;
  }

  /* --- Carte ---------------------------------------------------------------- */
  .card {
    position: relative;
    height: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 24px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  .kicker {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: 0.42em;
    text-transform: uppercase;
    color: var(--accent);
    animation: rise 1.4s ease-out both;
  }
  h1 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: clamp(2.6rem, 10vw, 4.6rem);
    letter-spacing: 0.05em;
    line-height: 1.05;
    margin: 0;
    color: #fbf4e6;
    text-shadow: 0 2px 30px rgba(0, 0, 0, 0.9);
    animation: rise 1.4s 0.15s ease-out both;
  }
  .subtitle {
    font-family: var(--serif);
    font-style: italic;
    font-size: 1.08rem;
    color: rgba(243, 236, 224, 0.75);
    margin: 0 0 14px;
    line-height: 1.55;
    max-width: 30em;
    animation: rise 1.4s 0.3s ease-out both;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(10px); }
  }
  .enter {
    font-family: var(--serif);
    font-size: 1.2rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    padding: 15px 52px 15px 58px;
    border: 1px solid var(--accent);
    background: rgba(10, 8, 6, 0.55);
    color: var(--accent);
    cursor: pointer;
    transition: background 0.25s, color 0.25s, box-shadow 0.25s;
    animation: rise 1.4s 0.45s ease-out both;
  }
  .enter:hover,
  .enter:focus-visible {
    background: var(--accent);
    color: #0d0c0b;
    box-shadow: 0 0 40px rgba(201, 161, 74, 0.35);
  }
  .status {
    font-size: 0.75rem;
    color: var(--ink-dim);
    margin: -4px 0 0;
    font-style: italic;
    min-height: 1em;
  }
  .loading {
    display: grid;
    gap: 12px;
    justify-items: center;
    font-family: var(--serif);
    font-style: italic;
    color: var(--ink-dim);
    min-height: 74px;
  }
  .loading p {
    margin: 0;
  }
  .bar {
    width: min(260px, 70vw);
    height: 2px;
    background: rgba(255, 255, 255, 0.12);
  }
  .fill {
    height: 100%;
    background: rgba(201, 161, 74, 0.9);
    transition: width 0.25s ease-out;
  }
  .links {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 6px;
  }
  .dot {
    color: var(--ink-dim);
  }
  .link {
    background: none;
    border: none;
    padding: 4px;
    color: rgba(243, 236, 224, 0.82);
    font-family: var(--serif);
    font-style: italic;
    font-size: 1rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 5px;
    text-decoration-color: rgba(201, 161, 74, 0.5);
  }
  .link:hover {
    color: var(--ink);
  }
  .count {
    display: inline-block;
    margin-left: 8px;
    padding: 0 7px;
    border-radius: 999px;
    font-family: var(--sans);
    font-style: normal;
    font-size: 0.72rem;
    line-height: 1.6;
    background: rgba(201, 161, 74, 0.2);
    color: var(--accent);
  }
  .controls {
    font-size: 0.75rem;
    color: var(--ink-dim);
    line-height: 1.6;
    margin: 10px 0 0;
    max-width: 30em;
  }
  .credits {
    position: absolute;
    left: 0;
    right: 0;
    bottom: max(12px, env(safe-area-inset-bottom));
    margin: 0;
    padding: 0 16px;
    text-align: center;
    font-size: 0.68rem;
    color: rgba(243, 236, 224, 0.38);
    line-height: 1.5;
  }

  /* Portrait (téléphone) : le couloir en haut, le texte en bas. */
  @media (orientation: portrait) {
    .corridor {
      perspective-origin: 50% 30%;
    }
    .space {
      top: 30%;
    }
    .card {
      justify-content: flex-end;
      padding-bottom: calc(96px + env(safe-area-inset-bottom));
    }
    .veil {
      background:
        linear-gradient(180deg, transparent 30%, rgba(7, 6, 5, 0.7) 55%, rgba(7, 6, 5, 0.92) 100%),
        radial-gradient(ellipse at 50% 30%, transparent 45%, rgba(0, 0, 0, 0.6) 100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .kicker, h1, .subtitle, .enter, .frame img {
      animation: none;
    }
  }
</style>
