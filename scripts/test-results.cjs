'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),R=require('../results-core.js'),B=require('../backup-core.js'),{fixture}=require('./test-backups.cjs'),{makeChange}=require('../lineup-tools.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`),clone=B.clone;
(async()=>{
 const f=fixture(),s=f.state,html=fs.readFileSync('index.html','utf8');
 const seed=html.slice(html.indexOf('function seed2026OutcomesIfEmpty(){'),html.indexOf('let pins={}'));
 vm.runInNewContext(seed,{state:s,normalizeName:x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,'')});
 const archive=R.event(s,2026),expected={matthew:[2,1,0,3,4],jake:[3,0,0,4,4],nate:[2,0,0,2,2],zach:[1,2,0,1,4],brandon:[0,0,0,0,0],will:[1,2,0,1,4],jordan:[1,2,0,2,4],kody:[0,3,0,0,4],reid:[2,1,0,3,4],michael:[1,2,0,1,4],ryan:[1,2,0,1,4],jack:[1,2,0,1,4],peyton:[2,1,0,3,4]};
 for(const [name,values]of Object.entries(expected)){const p=s.players.find(p=>p.username.startsWith(name+'.')),t=archive.stats.get(p.id);assert.deepEqual([t.w,t.l,t.h,t.points,t.possible],values);}
 assert.equal(archive.matches.filter(m=>m.outcome).length,12);assert.equal(archive.totals.a,0,'Unconfirmed historical teams must not be fabricated');assert.equal(archive.totals.b,0);
 assert.equal(archive.matches[0].margin,'5–3','Original reported margins survive');assert(archive.matches[0].contests.filter(c=>c.key!=='match').every(c=>!c.settled),'Do not invent old nine-hole outcomes');
 const manual=R.score(Array(18).fill(null),{front:1,back:1,match:2},'halve');assert.deepEqual(manual.map(c=>[c.a,c.b]),[[0,0],[0,0],[1,1]]);
 const r=s.liveCup.rounds[0],m=r.matches[0];r.test=false;m.points={front:1,back:1,match:1};m.holes=Array(18).fill(null);
 const overlay=new Map(Array.from({length:18},(_,i)=>[m.id+'_'+i,i<9?'A':'B']));
 s.liveCup.rounds.push({id:'practice',title:'Practice',test:true,started:true,matches:[{id:'practice-match',a:[f.ids[0]],b:[f.ids[1]],holes:Array(18).fill('A'),points:{front:10,back:10,match:10}}]});
 const model=R.event(s,2027,{overlay}),row=model.stats.get(f.ids[0]);assert.deepEqual(model.totals,{a:1.5,b:1.5,available:3,decided:3,remaining:0});assert.equal(row.h,1);assert.equal(row.matches,1);assert.equal(row.points,1.5);assert.equal(row.holesW,9);assert.equal(row.holesL,9);assert.equal(R.playerMatches(model,f.ids[0])[0].result,'Halved');
 assert.equal(R.event(s,2027,{practice:true,overlay}).totals.a,30);assert.equal(R.event({...s,liveCup:undefined},2027).matches.length,0,'Never use the separate legacy owner editor for 2027');
 near(R.score(R.effectiveHoles(m,overlay),m.points).reduce((n,c)=>n+c.a,0),model.totals.a);
 const cleared=new Map(overlay);cleared.set(m.id+'_0',null);const pending=R.event(s,2027,{overlay:cleared});assert.equal(pending.totals.a,1);assert.equal(pending.totals.b,1);assert.equal(pending.stats.get(f.ids[0]).h,0);assert.equal(pending.stats.get(f.ids[0]).inProgress,1);assert.equal(R.playerMatches(pending,f.ids[0])[0].result,'In progress');
 const corrected=new Map(overlay);corrected.set(m.id+'_0','B');assert.equal(R.event(s,2027,{overlay:corrected}).totals.b,2);assert.equal(R.event(s,2027,{overlay:corrected}).stats.get(f.ids[0]).l,1);
 r.started=false;assert.equal(R.event(s,2027,{overlay}).totals.a,1.5,'Pausing must not remove secured points');r.started=true;
 for(const size of [1,2,3,4]){const state=clone(s);state.liveCup.rounds=[{...r,matches:[{...m,a:f.ids.slice(0,size),b:f.ids.slice(size,size*2),holes:Array(18).fill('A'),points:{front:1,back:2.5,match:4}}]}];const e=R.event(state,2027);near(e.totals.a,7.5);near([...e.stats.values()].reduce((n,p)=>n+p.points,0),7.5);for(const id of f.ids.slice(0,size)){near(e.stats.get(id).points,7.5/size);assert.equal(e.stats.get(id).w,1);}}
 // Official substitutions inherit team-side results; previous lineup history never counts twice.
 const changed=makeChange(s.liveCup,{roundId:r.id,matchId:m.id,before:{a:m.a,b:m.b},a:[f.ids[2]],b:[f.ids[3]],points:m.points,policy:'retain',reason:'Substitution'}, {holes:R.effectiveHoles(m,overlay),actor:'matthew.ydarraga',newId:'replacement',players:f.ids});
 const substituted={...s,liveCup:changed.cup},se=R.event(substituted,2027,{overlay});assert.equal(se.totals.a,1.5);assert.equal(se.stats.get(f.ids[0]).matches,0);assert.equal(se.stats.get(f.ids[2]).matches,1);
 const fresh=makeChange(s.liveCup,{roundId:r.id,matchId:m.id,before:{a:m.a,b:m.b},a:[f.ids[2]],b:[f.ids[3]],points:m.points,policy:'fresh',reason:'New match'}, {holes:R.effectiveHoles(m,overlay),actor:'matthew.ydarraga',newId:'fresh',players:f.ids});assert.equal(R.event({...s,liveCup:fresh.cup},2027,{overlay}).totals.a,0);
 s.players.forEach((p,i)=>p.handicap=10+i);const ranking=R.rankings(s,2027);const altered=clone(s);altered.liveCup.rounds[0].matches[0].holes=Array(18).fill('A');assert.deepEqual(R.rankings(altered,2027).arr.map(p=>p.rating),ranking.arr.map(p=>p.rating),'2027 draft ranks use 2026, never live/practice 2027');
 const shared={players:s.players,season2026:s.seasons.find(x=>x.year===2026),season2027:s.seasons.find(x=>x.year===2027),clubhouse:s.clubhouse,draft2027:s.draft2027,handicapWeight:70,liveCup:s.liveCup};
 const rawScores=[...overlay].map(([id,winner])=>({id,matchId:m.id,hole:Number(id.split('_').at(-1)),winner}));const hydrated=B.buildState(s,shared,{rounds:shared.season2027.rounds},{},rawScores),backup=await B.create({state:hydrated,profiles:{},liveScores:rawScores,liveMatches:[],sourceRevision:7},hydrated.players,'gga-ryder-cup');
 assert.equal(B.summarize(backup).officialPointsA,1.5);const parsed=await B.parse(JSON.stringify(backup),s.players,'gga-ryder-cup');let serial=0;const restored=B.restorePlan(parsed,s.players,()=> 'restored-'+(++serial));assert.deepEqual(R.event(restored.state,2027).totals,model.totals);
 assert.deepEqual([...R.event(restored.state,2027).stats.values()].map(p=>[p.id,p.points,p.w,p.l,p.h]),[...R.event(hydrated,2027).stats.values()].map(p=>[p.id,p.points,p.w,p.l,p.h]));
 // The profile uses this same current-year model, including pending and historical states.
 const host={innerHTML:'',querySelector:()=>null},gga={getState:()=>s,getResults:()=>R.event(s,s.activeYear,{overlay}),ranks:()=>R.rankings(s,2027),playerHonors:()=>[],fmt:x=>String(x),render(){}};
 const win={GGA:gga,GGA_RESULTS:R};vm.runInNewContext(fs.readFileSync('player-dossier.js','utf8'),{window:win,document:{querySelector:()=>host,querySelectorAll:()=>[]}});
 s.activeYear=2027;win.GGA_RENDER_DOSSIER(s.players[0],false);assert(host.innerHTML.includes('2027 Match Appearances'));assert(host.innerHTML.includes('Halved'));assert(host.innerHTML.includes('2027 Tournament Statistics'));assert(host.innerHTML.includes('Player point credit'));assert(!host.innerHTML.includes('2026 Match Appearances'));
 s.activeYear=2026;win.GGA_RENDER_DOSSIER(s.players[0],false);assert(host.innerHTML.includes('2026 Match Appearances'));assert(host.innerHTML.includes('8–2'));
 console.log('PASS: unified live/player/profile/archive/backup totals, golden 2026 records and original margins, benchmark/half results, 1v1–4v4 split credit, pending/corrected/cleared holes, paused rounds, practice and substitution-history exclusion, prior-year rankings and full backup round trip');
})().catch(e=>{console.error(e);process.exitCode=1;});
