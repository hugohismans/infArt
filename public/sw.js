// Service worker minimal : l'application s'installe, mais tout passe par le réseau
// (le musée se construit en ligne, rien n'est mis en cache, donc jamais de version périmée).
// Hors ligne, la page d'accueil laisse place à un petit mot.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ailleurs</title>' +
            '<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0d0c0b;color:#e9e2d3;font:italic 1.2rem Georgia,serif;text-align:center;padding:24px">' +
            '<p>Le musée est fermé pour l’instant.<br><small style="opacity:.6">Il faut une connexion pour entrer.</small></p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        ),
    ),
  );
});
