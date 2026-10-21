const CACHE='gga-ryder-cup-2027-dossier-v5';
const CORE=['./','./index.html','./premium.css','./dossier-dark.css','./player-dossier.js','./gga-upgrade.js','./gga-cloud.js','./firebase-config.js','./assets/gga-2026-group.webp','./assets/gga-icon.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
  return response;
 }).catch(()=>caches.match(event.request).then(cached=>cached||Response.error())));
});
