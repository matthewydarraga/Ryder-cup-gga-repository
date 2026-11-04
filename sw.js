const CACHE='gga-ryder-cup-will-jacket-v23';
const CORE=['./','./index.html','./premium.css','./dossier-dark.css','./draft-board.js?v=20261022a','./player-strengths.js?v=20261022b','./player-dossier.js?v=20261103-manual-stats-r2','./ghin-snapshot.js?v=20261103-manual-stats-r2','./gga-upgrade.js?v=20261104-pin-clean','./gga-cloud.js?v=20261104-pin-clean','./firebase-config.js','./assets/gga-2026-group.webp','./assets/gga-icon.png','./assets/golf-legends.webp','./assets/golf-legends-extra.webp','./manifest.webmanifest'];
CORE.push('./assets/jordan-green-jacket.webp','./assets/reid-green-jacket.webp','./assets/brandon-green-jacket.webp','./assets/will-green-jacket.webp','./live-scoring.js?v=20261102-course');
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
  return response;
 }).catch(()=>caches.match(event.request).then(cached=>cached||Response.error())));
});




