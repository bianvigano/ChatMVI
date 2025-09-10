// public/sw.js - PWA cache dasar
// const CACHE = 'chk-cache-v1';
// const CORE = ['/', '/manifest.json', '/style.css'];

// self.addEventListener('install', (e) => {
//   e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(()=>self.skipWaiting()));
// });
// self.addEventListener('activate', (e) => {
//   e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k)))).then(()=>self.clients.claim()));
// });
// self.addEventListener('fetch', (e) => {
//   const url = new URL(e.request.url);
//   if (url.origin === location.origin) {
//     e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
//       if (e.request.method === 'GET' && res.ok) {
//         const copy = res.clone();
//         caches.open(CACHE).then(c => c.put(e.request, copy));
//       }
//       return res;
//     }).catch(()=>caches.match('/'))));
//   }
// });
