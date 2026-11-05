const CACHE='gga-ryder-cup-project-revamp-rounds-v38';
const CORE=['./live-round.css?v=20261105-rounds','./course-core.js?v=20261105-rounds','./match-lifecycle.js?v=20261105-revamp-5','./opengolf-course.js?v=20261105-rounds','./offline-scores.js?v=20261105-revamp-5','./results-core.js?v=20261104-revamp-3','./lineup-tools.js?v=20261104-revamp-2','./backup-core.js?v=20261105-revamp-5','./backup-cloud.js?v=20261105-revamp-5','./backup-ui.js?v=20261105-revamp-5','./','./index.html','./premium.css','./dossier-dark.css?v=20261104-history-years','./draft-board.js?v=20261022a','./player-strengths.js?v=20261022b','./player-dossier.js?v=20261104-revamp-3','./ghin-snapshot.js?v=20261103-manual-stats-r2','./gga-upgrade.js?v=20261105-revamp-5','./gga-cloud.js?v=20261105-revamp-5','./firebase-config.js','./assets/gga-2026-original-group.jpeg','./assets/gga-icon.png','./assets/golf-legends.webp','./assets/golf-legends-extra.webp','./manifest.webmanifest'];
CORE.push('./assets/gga-2025-open-01.webp','./assets/gga-2025-open-02.webp','./assets/jake-green-jacket.webp','./assets/kody-green-jacket.webp','./assets/nate-green-jacket.webp','./assets/peyton-green-jacket.webp','./assets/zach-green-jacket.webp','./assets/ryan-green-jacket.webp','./assets/michael-green-jacket.webp','./assets/jack-green-jacket.webp','./assets/matthew-green-jacket.webp','./assets/jordan-green-jacket.webp','./assets/reid-green-jacket.webp','./assets/brandon-green-jacket.webp','./assets/will-green-jacket.webp','./live-scoring.js?v=20261105-rounds');
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
  return response;
 }).catch(()=>caches.match(event.request).then(cached=>cached||Response.error())));
});




