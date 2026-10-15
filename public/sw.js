/* LOOG Studio Service Worker — Web Push + força atualização agressiva.
 *
 * SW_VERSION bump a cada deploy que precisa forçar refresh em TODOS os PWAs
 * instalados. Quando o browser detecta este arquivo mudou (byte-diff), ativa
 * o novo SW → activate limpa caches + manda "RELOAD" pros clients → cliente
 * recarrega sozinho, sem o usuário precisar desinstalar.
 */
const SW_VERSION = '2026-10-14-pdf-premium-ia-v1-dalle3';

self.addEventListener('install', (e) => {
  // skipWaiting = NÃO espera abas antigas fecharem pra ativar — ativa já
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Limpa TODOS os caches antigos — garante que nada ficou preso
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch { /* silencioso */ }
    // claim: assume controle das abas abertas AGORA
    await self.clients.claim();
    // Dispara reload em cada cliente — eles pegam a nova versão do app
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach((c) => c.postMessage({ type: 'LOOG_SW_UPDATED', version: SW_VERSION }));
    } catch { /* silencioso */ }
  })());
});

// Permite que o cliente peça skipWaiting via postMessage (fallback)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
