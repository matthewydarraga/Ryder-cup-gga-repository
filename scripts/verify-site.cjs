#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const files=['backup-core.js','backup-cloud.js','backup-ui.js','draft-board.js','player-strengths.js','index.html','premium.css','gga-upgrade.js','gga-cloud.js','firebase-config.js','assets/gga-2026-original-group.jpeg','assets/gga-icon.png','manifest.webmanifest','sw.js','firebase.json','firestore.rules','storage.rules'];
for(const path of files)assert.ok(fs.existsSync(path),'Required file missing: '+path);
const html=fs.readFileSync('index.html','utf8');
for(const id of ['home','history','draft','players','forge','rankings','stats','matches','roster','owner','gga-history-players','gga-history-rounds','gga-draft-pool','gga-owner-account-controls','draft-order-summary','login-email']){
 assert.ok(html.includes('id="'+id+'"'),'Required interface element missing: '+id);
}
for(const name of ['Matthew Ydarraga','Michael Rodriguez','Jake Norris','Brandon Durman','Will Parker','Ryan Higgins','Jordan McNeely','Reid Mixon','Zach Cousar','Jack Abraham','Peyton Braswell','Nate Cox','Kody Russey'])
 assert.ok(html.includes(name),'Missing roster member: '+name);
assert.ok(html.includes('gga-2026-original-group.jpeg'),'Missing 2026 group photo reference');
const scriptRegex=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let matches=[...html.matchAll(scriptRegex)],inline=0;
for(const [i,m] of matches.entries()){
 const attributes=m[1],source=m[2];if(/\bsrc\s*=/.test(attributes)||!source.trim())continue;
 new vm.Script(source,{filename:'index-inline-'+i+'.js'});inline++;
}
assert.ok(inline>=1,'No inline app script validated');
for(const path of ['backup-core.js','backup-cloud.js','backup-ui.js','draft-board.js','player-strengths.js','gga-upgrade.js','sw.js','ghin-snapshot.js','player-dossier.js'])
 new vm.Script(fs.readFileSync(path,'utf8'),{filename:path});
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
new AsyncFunction(fs.readFileSync('gga-cloud.js','utf8'));
const css=fs.readFileSync('premium.css','utf8');
assert.ok(css.includes('.gga-promo')&&css.includes('.gga-mobile-nav'),'Premium styles missing');
JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
JSON.parse(fs.readFileSync('firebase.json','utf8'));
const cloud=fs.readFileSync('gga-cloud.js','utf8');
assert.ok(cloud.includes("fireMod.doc(db,'private','live2027')"),'Owner-only legacy scoring path missing');
assert.ok(cloud.includes('signInWithEmailAndPassword')&&cloud.includes('runTransaction'),'Spark authentication and conflict checks missing');
assert.ok(!/firebase-functions|firebase-storage|httpsCallable|signInWithCustomToken/.test(cloud),'Paid-service dependency found');
const config=JSON.parse(fs.readFileSync('firebase.json','utf8'));
assert.ok(!config.functions&&!config.storage&&!config.hosting,'Unexpected deploy target');
console.log('PASS: GGA 2027 structure, 13-player roster, 2026 archive, code syntax, PWA assets and private scoring separation.');
