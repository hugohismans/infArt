<script lang="ts">
  /**
   * TESTS SEULEMENT (à retirer) : remet le joueur à zéro, comme une toute première visite.
   * Efface tout ce que le jeu garde dans le navigateur (narrateur, nombre de visites,
   * collection, succès, statistiques, thèmes vus, réglages, pseudo), puis recharge.
   */
  function reset() {
    if (!confirm('Tout effacer (narrateur, visites, collection, succès, réglages) et recommencer comme une première visite ?')) return;
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('galerie-infinie')) localStorage.removeItem(k);
      sessionStorage.clear();
    } catch {
      /* stockage indisponible */
    }
    location.replace(location.pathname);
  }
</script>

<button class="dev-reset" type="button" onclick={reset} aria-label="Réinitialiser (tests)" title="Réinitialiser (tests)">↺</button>

<style>
  .dev-reset {
    position: fixed;
    right: max(8px, env(safe-area-inset-right));
    bottom: max(8px, env(safe-area-inset-bottom));
    z-index: 30;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-dim);
    font-size: 15px;
    line-height: 28px;
    opacity: 0.18;
    cursor: pointer;
  }
  .dev-reset:hover,
  .dev-reset:focus-visible {
    opacity: 0.8;
  }
</style>
