/* LOOG Studio Service Worker — Web Push notifications */
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: 'LOOG Studio', body: event.data.text() }; }
  const title = payload.title || 'LOOG Studio';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-96.png',
    image: payload.image,
    tag: payload.tag || 'loog-sdr',
    renotify: true,
    requireInteraction: !!payload.requireInteraction,
    vibrate: [200, 100, 200, 100, 200],
    data: payload.data || {},
    actions: payload.actions || [
      { action: 'open', title: 'Abrir painel' },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/studio?mundo=vendas&sub=sdr';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus().then(() => w.navigate(target));
      }
      return self.clients.openWindow(target);
    })
  );
});
