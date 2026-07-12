self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const payload = event.data?.json() || { title: 'MesaYa', body: 'Tienes una reserva próxima.' };
  event.waitUntil(
    self.registration.showNotification(payload.title || 'MesaYa', {
      body: payload.body || 'Tienes una reserva próxima.',
      icon: '/favicon.svg',
      tag: 'mesa-ya-reminder',
    })
  );
});
