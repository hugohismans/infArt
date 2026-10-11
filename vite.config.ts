import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base relative : le site fonctionne aussi bien à la racine qu'en sous-dossier
// (GitHub Pages sert le projet sous /infArt/).
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
  server: { host: true },
});
