// The service worker makes the game installable as an app and, without a
// connection, shows a short System message instead of the browser's error
// page. The game's files and the API still come from the network as before:
// only page loads and the files of the offline page pass through here.

const CACHE = 'insight-offline-v1';
// offline.html, at the address the static files answer without a redirect
// (a page load cannot take a redirected answer from the worker).
const OFFLINE_PAGE = '/offline';
// What the offline page needs, refreshed whenever the game fetches it online.
const OFFLINE_FILES = [OFFLINE_PAGE, '/styles.css', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(OFFLINE_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      // The page starts loading while the worker wakes up.
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) ?? (await fetch(request));
        } catch {
          return (await caches.match(OFFLINE_PAGE)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !OFFLINE_FILES.includes(url.pathname)) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) ?? Response.error()),
  );
});
