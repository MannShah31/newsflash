const CACHE = 'newsflash-v1';
const STATIC = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

// ── Install: cache static assets ─────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fallback to network ──────────────────────────────
self.addEventListener('fetch', (e) => {
  // Only cache GET requests for same origin
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  // Don't cache API or WebSocket
  if (e.request.url.includes('/api/') || e.request.url.includes('ws://') || e.request.url.includes('wss://')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  let data = { title: 'NewsFlash', body: 'New breaking news arrived', tag: 'newsflash' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: data.tag || 'newsflash',
      renotify: true,
      vibrate: [100, 50, 100],
      data: { url: data.url || '/' },
      actions: [
        { action: 'open',    title: 'Read Now' },
        { action: 'dismiss', title: 'Dismiss'  },
      ],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(target);
    })
  );
});
