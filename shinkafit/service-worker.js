/* SHINKAFIT service worker: offline-first for the core app shell + catalogue data.
 *
 * Strategy:
 *  - App shell (HTML/CSS/JS/icons/manifest/data): cache-first, precached at install so
 *    the whole workout experience — library, timer, routines — works with no connection
 *    after the first visit.
 *  - Navigations (page loads): network-first with a cache fallback, so visitors normally
 *    get the freshest HTML, but never a browser error page when offline.
 *  - Anything cross-origin (the Supabase backend, if configured) is left completely alone:
 *    the app's own sync/outbox logic (see js/api.js) already handles retrying those.
 *  - The admin dashboard is intentionally NOT precached: it needs live data and sits
 *    behind login, so there is little value in an offline copy. */

const VERSION = 'v2';
const CACHE = `shinkafit-${VERSION}`;

const APP_SHELL = [
  './', './index.html', './404.html', './login.html', './signup.html', './profile.html', './settings.html',
  './workouts.html', './workout.html', './exercises.html', './exercise.html', './routines.html', './routine.html',
  './timer.html', './progress.html', './premium.html', './privacy.html',
  './manifest.json',
  './css/style.css', './css/components.css', './css/pages.css', './css/responsive.css',
  './js/theme.js', './js/storage.js', './js/config.js', './js/ui.js', './js/search.js', './js/filters.js',
  './js/auth.js', './js/api.js', './js/favorites.js', './js/analytics.js', './js/notifications.js',
  './js/navigation.js', './js/app.js', './js/home.js', './js/workouts.js', './js/exercises.js',
  './js/workout-detail.js', './js/exercise-detail.js', './js/routines.js', './js/routine-detail.js',
  './js/timer.js', './js/progress.js', './js/profile.js', './js/settings.js', './js/login.js', './js/signup.js',
  './data/exercises.json', './data/workouts.json', './data/routines.json', './data/media-sources.json',
  './assets/icons/icon.svg', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png', './assets/icons/apple-touch-icon.png', './assets/icons/favicon-48.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* add resilience: one missing/renamed file should not abort the whole precache */
    await Promise.all(APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch((e) => console.warn('SW precache miss', url, e))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('shinkafit-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });

function isAppOrigin(url) { return url.origin === self.location.origin; }
function isAdminPath(url) { return url.pathname.includes('/admin/'); }

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
    return res;
  } catch (e) {
    if (req.mode === 'navigate') return caches.match('./404.html');
    throw e;
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match('./index.html')) || Response.error();
  }
}

/* catalogue JSON: serve the cached copy instantly, but refresh it in the background
 * so the next load has any updates, without ever blocking on the network */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; /* POST/PATCH/DELETE (backend writes) always go straight to the network */
  const url = new URL(request.url);
  if (!isAppOrigin(url) || isAdminPath(url)) return; /* cross-origin and admin: never intercept */

  if (request.mode === 'navigate') { event.respondWith(networkFirst(request)); return; }
  if (url.pathname.includes('/data/')) { event.respondWith(staleWhileRevalidate(request)); return; }
  event.respondWith(cacheFirst(request));
});
