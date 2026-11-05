'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),b=require('../backup-core.js'),factory=require('../backup-cloud.js');
const html=fs.readFileSync('index.html','utf8'),seed=html.slice(html.indexOf("const STORE='"),html.indexOf('let state;try'));
function fixture(){
 const state=JSON.parse(JSON.stringify(vm.runInNewContext(seed+';initial()',{})));
 state.clubhouse={hero:'Preserved clubhouse'},state.draft2027={phase:'pre',picks:[]};
 const ids=state.players.map(p=>p.id),m={id:'original-match',a:[ids[0]],b:[ids[1]],holes:Array(18).fill(null),points:{front:1,back:1,match:2}};
 m.holes[0]='A';m.holes[1]='B';state.liveCup={year:2027,rounds:[{id:'practice-round',title:'Mock 2027',date:'2027-06-01',test:true,started:true,matches:[m]}]};
 const future=state.seasons.find(s=>s.year===2027),shared={schemaVersion:4,players:state.players,season2026:state.seasons.find(s=>s.year===2026),season2027:{year:2027,location:future.location,date:future.date,teams:future.teams,roster:future.roster},clubhouse:state.clubhouse,draft2027:state.draft2027,liveCup:state.liveCup,handicapWeight:70,revision:7,updatedAt:123};
 const docs=new Map([['public/clubhouse',b.clone(shared)],['private/live2027',{year:2027,rounds:future.rounds,revision:7,updatedAt:123}],['profiles/'+ids[0],{photoData:'data:image/jpeg;base64,YQ==',strengthOrder:['Putting','Chipping','Approach','Driving'],manualStats:{version:1,handicap:14.2,year:2026,best:{score:80,course:'Pine Dunes',location:'Frankston, TX'},worst:{score:99,course:'Westridge',location:'McKinney, TX'}},updatedAt:123}],['liveMatches/'+m.id,{a:m.a,b:m.b,roundId:'practice-round',started:true,test:true,active:true,updatedAt:123}],['liveScores/'+m.id+'_0',{matchId:m.id,hole:0,winner:'halve',updatedAt:123}],['liveScores/'+m.id+'_1',{matchId:m.id,hole:1,winner:null,updatedAt:123}]]);
 return {state,docs,ids};
}
function fake(){const f=fixture();let owner=true,session='owner:1',busy=false,fail=false,beforeTx=null;
 const snap=path=>({exists:()=>f.docs.has(path),data:()=>b.clone(f.docs.get(path))});
 const sdk={doc:(_,...v)=>v.join('/'),collection:(_,v)=>v,serverTimestamp:()=>456,getDocFromServer:async ref=>snap(ref),getDocsFromServer:async name=>({docs:[...f.docs].filter(([p])=>p.startsWith(name+'/')).map(([p])=>({id:p.split('/')[1],data:()=>b.clone(f.docs.get(p))}))}),runTransaction:async(_,fn)=>{if(beforeTx){beforeTx();beforeTx=null;}const staged=[];const result=await fn({get:async ref=>snap(ref),set:(ref,d)=>staged.push([ref,d])});if(fail)throw Error('simulated commit failure');for(const [ref,d]of staged)f.docs.set(ref,b.clone(d));return result;}};
 const api=factory({sdk,db:{},gga:{getState:()=>f.state},projectId:'gga-ryder-cup',assertReady:()=>{if(!owner)throw Error('Owner required');},sessionId:()=>session,onBusy:v=>busy=v,onRestored:(plan)=>{f.state=plan.state;}});
 return {...f,get state(){return f.state},api,pause(){f.docs.get('public/clubhouse').liveCup.rounds[0].started=false;f.docs.get('liveMatches/original-match').started=false;},setOwner:v=>owner=v,setSession:v=>session=v,setFail:v=>fail=v,setBeforeTx:v=>beforeTx=v,get busy(){return busy}};
}
async function run(){
 const h=fake();const lifecycle={matchId:'original-match',status:'awaiting',revision:1,generation:0,confirmed:[],reason:'',actor:h.ids[0],updatedAt:123};
 h.docs.set('matchStates/original-match',lifecycle);h.docs.set('matchAudit/original-match_1',{...lifecycle,action:'submit'});
 const file=await h.api.capture(),roster=h.state.players;
 assert.equal(file.payload.matchStates.length,1);assert.equal(file.payload.matchAudit[0].action,'submit');
 assert.equal(file.payload.state.liveCup.rounds[0].matches[0].holes[0],'halve','Live result replaces stale browser hole');
 assert.equal(file.payload.state.liveCup.rounds[0].matches[0].holes[1],null,'Explicit cleared result survives backup');
 assert.equal(file.payload.state.players[0].handicap,14.2);assert(file.payload.profiles[roster[0].id].photoData);
 const parsed=await b.parse(JSON.stringify(file),roster,'gga-ryder-cup');assert.deepEqual(parsed,file);
 await assert.rejects(h.api.prepare(file),/Pause all active/);h.pause();
 const prepared=await h.api.prepare(file),before=b.canonical([...h.docs]);h.setFail(true);
 await assert.rejects(h.api.restore(prepared),/simulated commit/);assert.equal(b.canonical([...h.docs]),before,'Commit failure cannot partially restore');assert.equal(h.busy,false);h.setFail(false);
 await h.api.restore(prepared);const next=await h.api.capture(),restored=next.payload.state.liveCup.rounds[0].matches[0];
 assert.notEqual(restored.id,'original-match');assert.deepEqual(restored.holes,file.payload.state.liveCup.rounds[0].matches[0].holes);
 assert.equal(next.payload.state.liveCup.rounds[0].started,false);assert.deepEqual(next.payload.profiles,file.payload.profiles);
 assert.deepEqual(next.payload.state.seasons,file.payload.state.seasons);assert.deepEqual(next.payload.state.draft2027,file.payload.state.draft2027);assert.deepEqual(next.payload.state.clubhouse,file.payload.state.clubhouse);
 assert.equal(h.docs.get('liveMatches/original-match').active,false);assert(h.docs.has('liveScores/original-match_0'),'Old records are retained for recovery');
 assert.equal(h.docs.get('public/clubhouse').revision,8);assert.equal(h.docs.get('private/live2027').revision,8);
 assert.equal(next.payload.state.liveCup.lifecycleArchive[0].audit[0].action,'submit','Restore retains immutable lifecycle history as an archive');
 const modified=b.clone(file);modified.payload.state.handicapWeight=50;await assert.rejects(b.parse(JSON.stringify(modified),roster,'gga-ryder-cup'),/integrity/);
 await assert.rejects(b.parse(JSON.stringify({...file,version:999}),roster,'gga-ryder-cup'),/version/);
 await assert.rejects(b.parse(JSON.stringify(file),roster,'different-project'),/different Firebase/);
 await assert.rejects(b.parse('{',roster,'gga-ryder-cup'),/valid JSON/);
 await assert.rejects(b.parse(JSON.stringify({version:2,players:roster}),roster,'gga-ryder-cup'),/legacy/);
 const invalid=b.clone(file.payload);invalid.state.liveCup.rounds[0].matches[0].a=[roster[1].id];assert.throws(()=>b.validatePayload(invalid,roster),/Duplicate/);
 invalid.state.liveCup.rounds[0].matches[0].a=[roster[0].id];invalid.profiles[roster[0].id].role='owner';assert.throws(()=>b.validatePayload(invalid,roster),/Unsupported profile/);
 const stale=fake();stale.pause();const preview=await stale.api.prepare(await stale.api.capture());stale.docs.get('profiles/'+stale.ids[0]).manualStats.handicap=12;const unchanged=b.canonical([...stale.docs]);await assert.rejects(stale.api.restore(preview),/changed after/);assert.equal(b.canonical([...stale.docs]),unchanged);
 const racing=fake();racing.pause();const p=await racing.api.prepare(await racing.api.capture());racing.setBeforeTx(()=>racing.docs.get('profiles/'+racing.ids[0]).manualStats.handicap=11);await assert.rejects(racing.api.restore(p),/profile changed/);assert.equal(racing.docs.get('public/clubhouse').revision,7);
 const guest=fake();guest.setOwner(false);await assert.rejects(guest.api.capture(),/Owner required/);
 console.log('PASS: complete backup/export/restore round trip, cloud overrides, cleared holes, photos/manual stats/strengths, practice isolation, corruption/version/project/legacy rejection, atomic failure, stale previews, racing profile writes and owner gating');
}
module.exports={fixture};if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
