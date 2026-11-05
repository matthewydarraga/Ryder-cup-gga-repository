/* Project Revamp: portable application backups. No credentials or memberships. */
(function(root){'use strict';
const results=typeof module!=='undefined'?require('./results-core.js'):root.GGA_RESULTS;
const courses=typeof module!=='undefined'?require('./course-core.js'):root.GGA_COURSE_CORE;
const FORMAT='gga-complete-backup',VERSION=1,MAX_BYTES=20*1024*1024;
const clone=x=>JSON.parse(JSON.stringify(x));
const check=(ok,message)=>{if(!ok)throw Error(message);};
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=(x,n=120)=>typeof x==='string'&&x.length<=n;
const id=x=>text(x,64)&&/^[A-Za-z0-9_-]+$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
const winner=x=>[null,'A','B','halve'].includes(x);
const canonical=x=>JSON.stringify(x,(_k,v)=>obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function safeTree(x,depth=0){check(depth<=35,'Backup is nested too deeply.');if(obj(x))for(const [k,v]of Object.entries(x)){check(!['__proto__','prototype','constructor'].includes(k),'Unsafe backup field.');safeTree(v,depth+1);}else if(Array.isArray(x)){check(x.length<=10000,'Backup array is too large.');x.forEach(v=>safeTree(v,depth+1));}else check(x===null||['string','number','boolean'].includes(typeof x),'Invalid backup value.');}
function profile(d){
 check(obj(d)&&Object.keys(d).every(k=>['photoData','fantasyCharacterId','strengthOrder','manualStats'].includes(k)),'Unsupported profile fields.');
 if('photoData'in d)check(text(d.photoData,32000)&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d.photoData),'Invalid profile photo.');
 if('fantasyCharacterId'in d)check(/^legend-[a-z-]{1,50}$/.test(d.fantasyCharacterId),'Invalid player character.');
 if('strengthOrder'in d)check(Array.isArray(d.strengthOrder)&&d.strengthOrder.length===4&&new Set(d.strengthOrder).size===4&&d.strengthOrder.every(x=>['Driving','Approach','Chipping','Putting'].includes(x)),'Invalid player strengths.');
 if('manualStats'in d){const s=d.manualStats;check(obj(s)&&Object.keys(s).sort().join(',')==='best,handicap,version,worst,year'&&s.version===1&&Number.isInteger(s.year)&&s.year>=2020&&s.year<=2100&&(s.handicap===null||Number.isFinite(s.handicap)&&s.handicap>=-10&&s.handicap<=54),'Invalid manual stats.');for(const k of ['best','worst'])if(s[k]!==null){const r=s[k];check(obj(r)&&Object.keys(r).sort().join(',')==='course,location,score'&&Number.isInteger(r.score)&&r.score>=18&&r.score<=300&&text(r.course)&&r.course.trim()&&text(r.location)&&r.location.trim(),'Invalid yearly round.');}check(!s.best||!s.worst||s.best.score<=s.worst.score,'Best round exceeds worst round.');}
}
function validatePayload(p,roster){
 safeTree(p);check(obj(p)&&obj(p.state)&&obj(p.profiles)&&Array.isArray(p.liveScores)&&Array.isArray(p.liveMatches),'Incomplete backup payload.');
 const s=p.state;check(s.version===2&&Array.isArray(s.players)&&s.players.length===roster.length,'Backup roster is incompatible.');
 for(const season of s.seasons||[])if(season.course)check(courses.validCourse(season.course),'Invalid saved course scorecard.');
 for(const name of ['matchStates','matchAudit'])if(name in p){check(Array.isArray(p[name])&&p[name].length<=10000,'Invalid lifecycle archive.');for(const d of p[name])check(obj(d)&&id(d.matchId)&&['live','awaiting','final'].includes(d.status)&&Number.isInteger(d.revision)&&d.revision>0&&Number.isInteger(d.generation)&&d.generation>=0&&Array.isArray(d.confirmed)&&d.confirmed.length<=8&&text(d.reason,500)&&text(d.actor,64),'Invalid match state/audit record.');}
 const expected=new Map(roster.map(p=>[p.id,p.username])),ids=new Set();
 for(const p of s.players){check(expected.has(p.id)&&expected.get(p.id)===p.username&&!ids.has(p.id)&&text(p.name)&&p.name.trim(),'Backup player identity does not match this clubhouse.');ids.add(p.id);for(const k of ['officialPhoto','officialPhotoFallback','football'])if(p[k]!=null)check(text(p[k],2000)&&(/^(https:\/\/|\.\/assets\/)/.test(p[k])),'Invalid player image or biography link.');}
 check(Array.isArray(s.seasons)&&s.seasons.length>=2&&s.seasons.length<=30&&new Set(s.seasons.map(x=>x.year)).size===s.seasons.length,'Invalid seasons.');
 for(const year of [2026,2027])check(s.seasons.some(x=>x.year===year),'Required tournament year is missing.');
 for(const season of s.seasons){check(obj(season)&&Number.isInteger(season.year)&&season.year>=2020&&season.year<=2100&&obj(season.teams)&&['A','B'].every(k=>obj(season.teams[k])&&text(season.teams[k].name,40))&&obj(season.roster)&&Object.entries(season.roster).every(([k,v])=>ids.has(k)&&[null,'','A','B'].includes(v))&&Array.isArray(season.rounds)&&season.rounds.length<=30,'Invalid tournament settings.');check(text(season.location||'',200)&&text(season.date||'',10),'Invalid tournament location/date.');for(const r of season.rounds){check(obj(r)&&id(r.id)&&text(r.title||'',120)&&Array.isArray(r.matches)&&r.matches.length<=30,'Invalid historical round.');for(const m of r.matches){check(obj(m)&&id(m.id)&&Array.isArray(m.a)&&Array.isArray(m.b)&&m.a.length<=4&&m.b.length<=4&&[...m.a,...m.b].every(x=>!x||ids.has(x))&&Array.isArray(m.holes)&&m.holes.length===18&&m.holes.every(winner),'Invalid historical match.');}}}
 check(obj(s.clubhouse)&&obj(s.draft2027)&&Array.isArray(s.draft2027.picks)&&s.draft2027.picks.length<=12&&s.draft2027.picks.every(p=>obj(p)&&ids.has(p.playerId))&&Number.isFinite(s.handicapWeight)&&s.handicapWeight>=0&&s.handicapWeight<=100,'Invalid clubhouse or draft.');
 check(obj(s.liveCup)&&s.liveCup.year===2027&&Array.isArray(s.liveCup.rounds)&&s.liveCup.rounds.length<=30,'Invalid live tournament.');
 const matchIds=new Set(),roundIds=new Set();
 for(const r of s.liveCup.rounds){check(obj(r)&&id(r.id)&&!roundIds.has(r.id)&&text(r.title,70)&&r.title.trim()&&typeof r.started==='boolean'&&(!('test'in r)||typeof r.test==='boolean')&&text(r.date||'',10)&&Array.isArray(r.matches)&&r.matches.length<=6,'Invalid live round.');roundIds.add(r.id);const used=new Set();for(const m of r.matches){check(obj(m)&&id(m.id)&&!matchIds.has(m.id)&&Array.isArray(m.a)&&Array.isArray(m.b)&&m.a.length>=1&&m.a.length<=4&&m.a.length===m.b.length&&Array.isArray(m.holes)&&m.holes.length===18&&m.holes.every(winner),'Invalid live matchup or hole result.');matchIds.add(m.id);for(const pid of [...m.a,...m.b]){check(ids.has(pid)&&!used.has(pid),'Duplicate or unknown golfer in a live round.');used.add(pid);}if(m.points){check(obj(m.points)&&Object.keys(m.points).sort().join(',')==='back,front,match'&&Object.values(m.points).every(n=>Number.isFinite(n)&&n>=0&&n<=100&&Number.isInteger(n*2))&&Object.values(m.points).some(n=>n>0),'Invalid Ryder Cup points.');}}}
 const history=s.liveCup.lineupHistory||[];check(Array.isArray(history)&&history.length<=200,'Invalid lineup history.');
 for(const h of history){
  check(obj(h)&&id(h.id)&&id(h.lineageId)&&id(h.roundId)&&h.actor==='matthew.ydarraga'&&text(h.reason,500)&&h.reason.trim()&&['retain','fresh'].includes(h.policy)&&text(h.at,40)&&Number.isFinite(Date.parse(h.at))&&(h.revision===null||Number.isInteger(h.revision)&&h.revision>0),'Invalid lineup history entry.');
  for(const k of ['before','after']){const side=h[k];check(obj(side)&&id(side.matchId)&&Array.isArray(side.a)&&Array.isArray(side.b)&&side.a.length>=1&&side.a.length<=4&&side.a.length===side.b.length&&new Set([...side.a,...side.b]).size===side.a.length+side.b.length&&[...side.a,...side.b].every(x=>ids.has(x))&&obj(side.points)&&Object.keys(side.points).sort().join(',')==='back,front,match'&&Object.values(side.points).every(n=>Number.isFinite(n)&&n>=0&&n<=100&&Number.isInteger(n*2)),'Invalid historical lineup.');}
  check(Array.isArray(h.before.holes)&&h.before.holes.length===18&&h.before.holes.every(winner),'Invalid historical scorecard.');
 }
 for(const [pid,d]of Object.entries(p.profiles)){check(ids.has(pid),'Unknown player profile.');profile(d);}
 for(const d of p.liveScores)check(obj(d)&&id(d.matchId)&&Number.isInteger(d.hole)&&d.hole>=0&&d.hole<18&&winner(d.winner)&&d.id===d.matchId+'_'+d.hole,'Invalid live score record.');
 for(const d of p.liveMatches)check(obj(d)&&id(d.id)&&Array.isArray(d.a)&&Array.isArray(d.b)&&d.a.length>=1&&d.a.length<=4&&d.a.length===d.b.length&&new Set([...d.a,...d.b]).size===d.a.length+d.b.length&&[...d.a,...d.b].every(x=>ids.has(x))&&id(d.roundId)&&typeof d.started==='boolean'&&typeof d.test==='boolean'&&typeof d.active==='boolean','Invalid saved matchup permissions.');
 return p;
}
async function digest(value){const bytes=new TextEncoder().encode(canonical(value)),bits=await root.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(bits),n=>n.toString(16).padStart(2,'0')).join('');}
async function create(payload,roster,projectId,source='server'){
 validatePayload(payload,roster);const file={format:FORMAT,version:VERSION,projectId,createdAt:new Date().toISOString(),source,payload:clone(payload)};file.checksum=await digest(file);check(new TextEncoder().encode(JSON.stringify(file)).length<=MAX_BYTES,'Backup exceeds 20 MB.');return file;
}
async function parse(raw,roster,projectId){
 check(typeof raw==='string'&&new TextEncoder().encode(raw).length<=MAX_BYTES,'Choose a backup smaller than 20 MB.');let file;try{file=JSON.parse(raw);}catch{throw Error('This file is not valid JSON.');}
 check(obj(file)&&file.format===FORMAT,'This is a legacy or unrelated backup. It cannot safely restore live scores. Keep it for historical recovery.');
 check(file.version===VERSION,'This backup version is not supported. Update the app before restoring.');
 check(file.projectId===projectId,'This backup belongs to a different Firebase project.');check(['server','device'].includes(file.source)&&text(file.createdAt,40)&&Number.isFinite(Date.parse(file.createdAt)),'Invalid backup metadata.');
 const {checksum,...body}=file;check(typeof checksum==='string'&&checksum===await digest(body),'Backup integrity check failed. The file was changed or damaged.');validatePayload(file.payload,roster);return file;
}
function summarize(file){const s=file.payload.state,rounds=s.liveCup.rounds,matches=rounds.flatMap(r=>r.matches);const totals=results.event(s,2027).totals;return {officialPointsA:totals.a,officialPointsB:totals.b,createdAt:file.createdAt,source:file.source,players:s.players.length,profiles:Object.values(file.payload.profiles).filter(d=>Object.keys(d).length).length,seasons:s.seasons.length,rounds:rounds.length,matches:matches.length,holes:matches.reduce((n,m)=>n+m.holes.filter(h=>h!==null).length,0),practiceRounds:rounds.filter(r=>r.test).length};}
function buildState(base,shared,privateData,profiles,scores){
 const s=clone(base);s.players=clone(shared.players);s.seasons=s.seasons.filter(x=>![2026,2027].includes(x.year));s.seasons.push(clone(shared.season2026),{...clone(shared.season2027),rounds:clone(privateData.rounds)});s.activeYear=s.seasons.some(x=>x.year===base.activeYear)?base.activeYear:2027;
 s.clubhouse=clone(shared.clubhouse);s.draft2027=clone(shared.draft2027);s.handicapWeight=shared.handicapWeight;s.liveCup=clone(shared.liveCup);
 for(const p of s.players){const d=profiles[p.id]||{};p.customPhoto=d.photoData||null;p.fantasyCharacterId=d.fantasyCharacterId||null;p.strengthOrder=d.strengthOrder||null;p.manualStats=d.manualStats||null;p.handicap=d.manualStats?.handicap??null;p.handicapChecked=null;delete p.ghinNumber;}
 const overlay=new Map(scores.map(d=>[d.id,d.winner]));s.liveCup=results.materializeCup(s.liveCup,overlay);return s;
}
// New match IDs isolate restored baselines from all pre-restore live-score documents.
function restorePlan(file,roster,makeId){
 validatePayload(file.payload,roster);const s=clone(file.payload.state),mapping={};
 for(const r of s.liveCup.rounds){r.started=false;for(const m of r.matches){const old=m.id;m.id=makeId();check(id(m.id)&&m.id!==old&&!Object.values(mapping).includes(m.id),'Could not allocate a fresh match ID.');mapping[old]=m.id;}}
 if(file.payload.matchStates?.length||file.payload.matchAudit?.length)s.liveCup.lifecycleArchive=[...(s.liveCup.lifecycleArchive||[]),{mapping:clone(mapping),states:clone(file.payload.matchStates||[]),audit:clone(file.payload.matchAudit||[])}];
 const season=s.seasons.find(x=>x.year===2027),shared={schemaVersion:4,players:s.players.map(p=>({id:p.id,name:p.name,username:p.username,football:p.football||null,position:p.position||'',officialPhoto:p.officialPhoto||null,officialPhotoFallback:p.officialPhotoFallback||null,handicap:null,handicapChecked:null})),season2026:s.seasons.find(x=>x.year===2026),season2027:{year:2027,location:season.location||'',date:season.date||'',teams:season.teams,roster:season.roster,...(season.course?{course:season.course}:{})},clubhouse:Object.fromEntries(Object.entries(s.clubhouse).filter(([k])=>!['coverData','coverPath'].includes(k))),draft2027:s.draft2027,liveCup:s.liveCup,handicapWeight:s.handicapWeight};
 check(new TextEncoder().encode(JSON.stringify(shared)).length<900000,'Restored clubhouse exceeds the safe document size.');
 return {state:s,shared,privateRounds:season.rounds,profiles:clone(file.payload.profiles),mapping};
}
const api={FORMAT,VERSION,MAX_BYTES,clone,canonical,create,parse,summarize,validatePayload,buildState,restorePlan};if(typeof module!=='undefined')module.exports=api;else root.GGA_BACKUP=api;
})(typeof window==='undefined'?globalThis:window);
