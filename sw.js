// sw.js — AP Stats QUIZ-app PWA service worker (OFFLINE_MODE_SPEC §4.G, cr mirror).
// Registered from the quiz index with the cr repo-root scope. Same strategy as the
// follow-alongs SW: NETWORK-FIRST navigations (fresh online, cached offline),
// cache-first same-origin assets, PASSTHROUGH for cross-origin/APIs/non-GET and
// version.json. DISTINCT cache prefix ('apstats-quiz-pwa-') because cr shares the
// github.io origin (and the localhost pack origin) with the Desk — each SW must
// only purge its OWN caches.
//
// KILL SWITCH: deploy an sw.js whose body just skipWaiting()s on install and, on
// activate, deletes all caches + clients.claim() — pages then fall back to network.

const BUILD = '2026-06-22-hb3b'; // scripts/bump-build.mjs replaces this stamp
const CACHE = 'apstats-quiz-pwa-' + BUILD;

const CORE = [
  './', 'index.html', 'css/styles.css',
  'offline-queue.js', 'gradebook-client.js', 'roster-client.js', 'roster_config.js',
  'railway_client.js', 'railway_config.js', 'name-finder.js', 'roster-dropdown.js',
  'version-check.js', 'manifest.webmanifest', 'icon.svg', 'pwa-register.js',
  'data/curriculum.js', 'data/units.js',
];

// Pure decision (unit-tested via extraction): 'navigate' | 'asset' | 'passthrough'.
function cacheStrategyFor(request, selfOrigin) {
  if (request.method !== 'GET') return 'passthrough';
  let url;
  try { url = new URL(request.url); } catch (_) { return 'passthrough'; }
  if (url.origin !== selfOrigin) return 'passthrough';          // roster/cr/supabase APIs → network only
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('version.json')) return 'passthrough';
  const isNav = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  return isNav ? 'navigate' : 'asset';
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('apstats-quiz-pwa-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const strat = cacheStrategyFor(e.request, self.location.origin);
  if (strat === 'passthrough') return;

  if (strat === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(e.request);
        const c = await caches.open(CACHE); c.put(e.request, net.clone());
        return net;
      } catch (_) {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        const shell = await caches.match('index.html');
        return shell || new Response('Offline — open the quiz once while online to cache it.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const net = await fetch(e.request);
      if (net && net.ok) { const c = await caches.open(CACHE); c.put(e.request, net.clone()); }
      return net;
    } catch (_) {
      return new Response('', { status: 504 });
    }
  })());
});

// Background sync: ask any open client to drain the offline queue (the page holds
// the auth token a service worker can't read).
self.addEventListener('sync', (e) => {
  if (e.tag !== 'apstats-sync-grades') return;
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    cs.forEach((c) => c.postMessage({ type: 'drain-offline-queue' }));
  })());
});

self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
