// Simple passthrough service worker so browser allows PWA installation without intercepting or breaking navigation
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Let browser fetch normally without caching interference
  return;
});
