// The service worker makes the game installable as an app and, without a
// connection, shows a short System message instead of the browser's error
// page. The game's files and the API still come from the network as before:
// only page loads and the files of the offline page pass through here. It
// also shows the game's phone notifications (push.js).

const CACHE = 'insight-offline-v2';
// offline.html, at the address the static files answer without a redirect
// (a page load cannot take a redirected answer from the worker).
const OFFLINE_PAGE = '/offline';
// What the offline page needs, refreshed whenever the game fetches it online.
const OFFLINE_FILES = [OFFLINE_PAGE, '/styles.css', '/favicon-64.png'];

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

// A message from the server (src/server/push.js) shows as a notification.
// While the game is in front of the player, it shows the same news itself
// and the message stays quiet, except on Apple's push service: Safari takes
// the permission away from a page whose messages show nothing.
self.addEventListener('push', (event) => {
  let message = null;
  try {
    message = event.data?.json() ?? null;
  } catch {
    // Not one of the game's messages.
  }
  if (!message?.title) return;
  event.waitUntil(notify(message));
});

async function notify({ title, body, tag, url, at }) {
  const subscription = await self.registration.pushManager.getSubscription();
  const apple = subscription?.endpoint.includes('.push.apple.com') ?? false;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!apple && windows.some((client) => client.visibilityState === 'visible')) return;
  await self.registration.showNotification(title, {
    body,
    // A newer message of the same kind takes the older one's place.
    tag,
    renotify: Boolean(tag),
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    lang: 'pl',
    timestamp: at,
    data: { url },
  });
}

// A tap opens the game where the news is: the open game moves there itself.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = event.notification.data?.url ?? '#/walka';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const game = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (!game) {
        await self.clients.openWindow(`/${hash}`);
        return;
      }
      game.postMessage({ type: 'open', hash });
      await game.focus();
    })(),
  );
});
