const CACHE='gga-ryder-cup-rankings-v10';
const CORE=['./','./index.html','./premium.css','./dossier-dark.css','./draft-board.js?v=20261022a','./player-strengths.js?v=20261022b','./player-dossier.js?v=20261022-rankings','./ghin-snapshot.js?v=20261021a','./gga-upgrade.js?v=20261022-draft','./gga-cloud.js?v=20261022-draft','./firebase-config.js','./assets/gga-2026-group.webp','./assets/gga-icon.png','./assets/golf-legends.webp','./assets/golf-legends-extra.webp','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
  return response;
 }).catch(()=>caches.match(event.request).then(cached=>cached||Response.error())));
});

