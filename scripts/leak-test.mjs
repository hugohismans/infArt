/**
 * Test de fuite mémoire : lance le build dans Chromium (sans écran), active
 * l'auto-marche et relève régulièrement géométries, textures, modules et tas JS.
 * Échoue si ces valeurs dérivent au lieu de rester stables.
 *
 * Usage : npm run build && npm run test:leak
 * Variables : LEAK_MINUTES (défaut 10), LEAK_TIMESCALE (défaut 3), LEAK_SEED,
 *             LEAK_API (URL d'un Worker, ex. http://localhost:8787 avec scripts/dev-worker.ts),
 *             CHROMIUM_PATH (défaut /opt/pw-browsers/chromium ou Chromium de Playwright).
 * Derrière un proxy (HTTPS_PROXY), Chromium l'utilise pour charger les vraies images.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const minutes = Number(process.env.LEAK_MINUTES ?? 10);
const timeScale = Number(process.env.LEAK_TIMESCALE ?? 3);
const seed = process.env.LEAK_SEED ?? 'leak-test';
const api = process.env.LEAK_API;
const sampleEveryMs = Math.max(5000, (minutes * 60000) / 40);
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = await preview({ preview: { port: 4317, strictPort: false }, logLevel: 'warn' });
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:4317/';

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'],
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}),
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${base}?seed=${encodeURIComponent(seed)}&autostart=1&autowalk=1&timescale=${timeScale}${api ? `&api=${encodeURIComponent(api)}` : ''}`);
await page.waitForFunction(() => window.__galerie !== undefined, null, { timeout: 30000 });

const samples = [];
let popInLog = [];
const end = Date.now() + minutes * 60000;
console.log(`Marche automatique pendant ${minutes} min (×${timeScale})…`);
while (Date.now() < end) {
  await page.waitForTimeout(Math.min(sampleEveryMs, Math.max(0, end - Date.now())));
  const s = await page.evaluate(() => {
    globalThis.gc?.();
    return window.__galerie.stats();
  });
  const row = {
    t: Math.round(s.elapsed),
    walked: Math.round(s.distanceWalked),
    modules: s.world.modules,
    created: s.world.created,
    destroyed: s.world.destroyed,
    popIns: s.world.popIns,
    shifts: s.world.originShifts,
    geometries: s.geometries,
    textures: s.textures,
    heapMB: s.heapMB === null ? null : Number(s.heapMB.toFixed(2)),
    artTextures: s.art?.liveTextures ?? 0,
    // Textures d'œuvres qui ne sont ni accrochées, ni en réserve, ni en HD : doit rester proche de 0.
    artOrphans: s.art ? s.art.liveTextures - s.world.arts - s.art.ready - s.art.highRes : 0,
    artMB: s.art ? Number(s.art.gpuMB.toFixed(1)) : 0,
    artReady: s.art?.ready ?? 0,
    fps: Math.round(s.fps),
  };
  popInLog = s.world.popInLog;
  samples.push(row);
  console.log(JSON.stringify(row));
}

await browser.close();
await server.close();

// --- Analyse ---
const half = Math.floor(samples.length / 2);
const first = samples.slice(0, half);
const second = samples.slice(half);
const max = (rows, k) => Math.max(...rows.map((r) => r[k] ?? 0));
const avg = (rows, k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0) / rows.length;
const failures = [];

// Le monde chargé varie beaucoup (salles, embranchements) : on compare des moyennes.
for (const k of ['geometries', 'textures', 'modules', 'artTextures']) {
  const a = avg(first, k), b = avg(second, k);
  if (b > a * 1.35 + 4) failures.push(`${k} augmente : moyenne ${a.toFixed(1)} puis ${b.toFixed(1)}`);
}
// Fuite de textures d'œuvres : des textures vivantes qui n'appartiennent plus à rien.
const orphans = max(samples, 'artOrphans');
if (orphans > 12) failures.push(`textures d'œuvres orphelines : jusqu'à ${orphans}`);
if (samples[0]?.heapMB !== null) {
  const a = avg(first, 'heapMB'), b = avg(second, 'heapMB');
  if (b > a * 1.3 + 3) failures.push(`tas JS augmente : moyenne ${a.toFixed(1)} Mo puis ${b.toFixed(1)} Mo`);
}
const last = samples[samples.length - 1];
if (!last || last.destroyed < 10) failures.push('trop peu de modules détruits : le streaming ne tourne pas ?');
if (!last || last.walked < 50) failures.push(`distance parcourue trop faible (${last?.walked ?? 0} m) : auto-marche bloquée ?`);
if (last && last.popIns > 0) failures.push(`${last.popIns} module(s) généré(s) à portée de vue (pop-in) : ${popInLog.join(' ; ')}`);
if (errors.length) failures.push(`erreurs JS : ${errors.slice(0, 3).join(' | ')}`);

writeFileSync('leak-report.json', JSON.stringify({ minutes, timeScale, seed, samples, failures }, null, 2));
if (failures.length) {
  console.error('\n✗ ÉCHEC\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`\n✓ Aucune fuite détectée (${last.walked} m parcourus, ${last.created} modules créés, ${last.destroyed} détruits).`);
