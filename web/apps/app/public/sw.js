// 3REco service worker.
//
// It does two jobs and nothing else:
//  1. Keep the built app files (/assets/*, named by a hash of their content)
//     so the installed app opens fast. Nothing else is stored: never /api,
//     sign-in, files, pages or alert data.
//  2. Show phone alerts, and open the alert's own link when it is tapped.

const ASSETS = 'three-assets-v1';

// Only a same-origin GET for a built file is ever stored.
function cacheable(request, origin) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === origin && url.pathname.startsWith('/assets/');
}

// A link opens only if it is a path inside this app.
function safeLink(link, origin) {
  if (typeof link !== 'string' || !link.startsWith('/')) return '/';
  if (link.startsWith('//') || link.includes('\\')) return '/';
  try {
    const url = new URL(link, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // An older version's files go when a new version takes over.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('three-') && name !== ASSETS)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!cacheable(request, self.location.origin)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(request);
      if (hit) return hit;

      const response = await fetch(request);
      // A missing file is answered with the app page; never keep that.
      const type = response.headers.get('Content-Type') || '';
      if (response.ok && !type.includes('text/html')) {
        await cache.put(request, response.clone());
      }
      return response;
    })()
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '3REco', {
      body: data.body || '',
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
      tag: data.id,
      data: { link: safeLink(data.link, self.location.origin) },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const origin = self.location.origin;
  const target = new URL(
    safeLink(event.notification.data && event.notification.data.link, origin),
    origin
  ).href;

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of open) {
        if (new URL(client.url).origin === origin && 'navigate' in client) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});
