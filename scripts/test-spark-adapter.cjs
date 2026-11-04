// Adapter integration with deterministic SDK doubles. Does not prove deployed security.
const {webcrypto}=require('node:crypto');
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const tick=()=>new Promise(r=>setImmediate(r));
async function harness(pending=false){
 const nodes=new Map(),events={},listeners=new Map(),timers=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,dataset:{},addEventListener:(t,f)=>events[id+':'+t]=f,prepend(){},append(){}});return nodes.get(id);};
 const state={players:[{id:'player-matthew-ydarraga',username:'matthew.ydarraga',name:'Matthew'},{id:'player-reid-mixon',username:'reid.mixon',name:'Reid Mixon'}],seasons:[{year:2026,rounds:[]},{year:2027,location:'LA',date:'',teams:{},roster:{},rounds:[]}],clubhouse:{hero:'Initial'},draft2027:{phase:'pre',picks:[]},handicapWeight:70};
 let resultRefreshes=0;let signed='',writes=0,txFailure=null,current=null,authCallback;
 const auth={currentUser:null},snapshot=(d,meta={})=>({exists:()=>!!d,data:()=>d,metadata:{fromCache:false,hasPendingWrites:false,...meta}});
 const membership={active:true,username:'matthew.ydarraga',playerId:'player-matthew-ydarraga',role:'owner'};
 let shared=null,priv=null,savedMember=pending?null:membership;const claims=new Map(),records=new Map();
 const fire={getFirestore:()=>({}),doc:(_,...p)=>p.join('/'),collection:(_,p)=>p,serverTimestamp:()=>123,
  getDocFromServer:async ref=>snapshot(ref.startsWith('members/')?savedMember:priv),
  onSnapshot:(ref,...args)=>{const cb=args.find(x=>typeof x==='function');listeners.set(ref,cb);return ()=>listeners.delete(ref);},
  runTransaction:async(_,fn)=>{if(txFailure)throw Error(txFailure);const staged=[];const result=await fn({get:async ref=>snapshot(ref.startsWith('members/')?savedMember:ref.startsWith('rosterClaims/')?claims.get(ref.split('/')[1]):ref.startsWith('live')?records.get(ref):shared),set:(ref,d)=>staged.push([ref,d])});for(const [r,d]of staged){if(r==='public/clubhouse')shared=d;else if(r.startsWith('members/'))savedMember=d;else if(r.startsWith('rosterClaims/'))claims.set(r.split('/')[1],d);else if(r.startsWith('live'))records.set(r,d);else priv=d;writes++;}return result;},
  setDoc:async()=>{writes++;}
 };
 const g={getState:()=>state,refreshResults:()=>resultRefreshes++,render(){},save(){ctx.window.GGA_AFTER_SAVE?.();},setSignedIn:u=>signed=u,notify(){},closeLogin(){},showTab(){}};
 const ctx={crypto:webcrypto,TextEncoder,Uint8Array,btoa,window:{GGA:g,GGA_BACKEND_CONFIGURED:true,FIREBASE_CONFIG:{},addEventListener:(t,f)=>events[t]=f},document:{querySelector:node,createElement:()=>node('banner'),addEventListener:(t,f)=>events[t]=f},console,confirm:()=>true,setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){},URL,Map,JSON,
  modules:[{initializeApp:()=>({})},{getAuth:()=>auth,setPersistence:async()=>{},browserSessionPersistence:'session',onAuthStateChanged:(_,f)=>authCallback=f,signOut:async()=>{},signInWithEmailAndPassword:async()=>{},sendPasswordResetEmail:async()=>{}},fire]};
 const source=fs.readFileSync('gga-cloud.js','utf8').replace(/const \[appMod,authMod,fireMod\]=await Promise\.all\(\[[\s\S]*?\]\);/,'const [appMod,authMod,fireMod]=modules;');
 await vm.runInNewContext('(async()=>{'+source+'})()',ctx);
 return {ctx,state,records,events,listeners,node,snapshot,membership,auth,
  setClaim:(username,uid)=>claims.set(username,{uid}),
  login:async()=>{if(pending)node('#login-player').value='reid.mixon';auth.currentUser={uid:'owner',email:pending?'reid.mixon@gga-pin.invalid':'matthew.ydarraga@gga-pin.invalid'};await authCallback(auth.currentUser);},
  emit:async()=>{await listeners.get('public/clubhouse')(snapshot(shared));},
  flush:async()=>{const f=timers.pop();timers.length=0;if(f){f();await tick();await tick();}},
  get resultRefreshes(){return resultRefreshes},get signed(){return signed},get writes(){return writes},get shared(){return shared},get priv(){return priv},
  setFailure:x=>txFailure=x,setShared:x=>shared=x,
 };
}
(async()=>{
 const h=await harness();await h.login();await h.emit();
 assert.equal(h.writes,0,'Must not auto-publish browser data');assert(h.ctx.window.GGA_BACKEND_AUTHORIZED);
 const target={closest:s=>s.includes('#add-golfer')?null:{}};
 h.events.click({target});await tick();await tick();
 assert.equal(h.writes,2);assert.equal(h.shared.revision,1);assert.equal(h.priv.revision,1);
 assert(!('privateRounds'in h.shared));assert(!('rounds'in h.shared.season2027));
 await h.emit();h.ctx.window.GGA.save();await h.flush();assert.equal(h.writes,2,'Remote snapshots must not echo writes');
 h.state.clubhouse.hero='Updated';h.ctx.window.GGA.save();await h.flush();assert.equal(h.shared.revision,2);
 h.state.clubhouse.hero='Unsynced';h.ctx.window.GGA.save();h.setShared({...h.shared,revision:3});await h.flush();
 assert.equal(h.writes,4,'Stale owner must not overwrite newer revision');assert.equal(h.ctx.window.GGA_BACKEND_AUTHORIZED,false);
 const failed=await harness();await failed.login();await failed.emit();failed.setFailure('permission-denied');failed.events.click({target});await tick();await tick();assert.equal(failed.writes,0);assert.equal(failed.ctx.window.GGA_BACKEND_AUTHORIZED,false);
 const revoked=await harness();await revoked.login();await revoked.emit();revoked.listeners.get('members/owner')(revoked.snapshot({...revoked.membership,active:false}));assert.equal(revoked.signed,'');assert.equal(revoked.ctx.window.GGA_BACKEND_AUTHORIZED,false);assert.equal(revoked.listeners.size,0);
 const member=await harness();member.membership.role='player';await member.login();await member.emit();assert.equal(member.ctx.window.GGA_BACKEND_AUTHORIZED,false);member.state.clubhouse.hero='Forged';member.ctx.window.GGA.save();await member.flush();assert.equal(member.writes,0);
 const pending=await harness(true);await pending.login();await pending.emit();assert.equal(pending.signed,'reid.mixon');assert.equal(pending.ctx.window.GGA_BACKEND_AUTHORIZED,false);assert.equal(pending.writes,1,'Assigned PIN user initializes only its membership');
 const pin=await harness(true);let signin=null;
 pin.ctx.modules[1].signInWithEmailAndPassword=async(_,email,password)=>{signin={email,password};};
 pin.node('#login-player').value='reid.mixon';pin.node('#login-pin').value='123';
 await pin.events['#login-form:submit']({preventDefault(){},stopImmediatePropagation(){}});assert.equal(signin,null);
 pin.node('#login-pin').value='123456';await pin.events['#login-form:submit']({preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(signin.email,'reid.mixon@gga-pin.invalid');
 const expected='GGA!'+require('node:crypto').pbkdf2Sync('123456','GGA-PIN-v1:reid.mixon',150000,32,'sha256').toString('base64');
 assert.equal(signin.password,expected,'WebCrypto must match provisioning KDF');
 assert.equal(pin.node('#login-email').required,false);assert.equal(pin.node('#login-email').disabled,true);assert.equal(pin.node('#login-submit').textContent,'Sign in');assert.equal(pin.node('#gga-email-wrap').hidden,true);
 pin.ctx.modules[1].signInWithEmailAndPassword=async()=>{throw {code:'auth/invalid-credential'};};
 pin.node('#login-pin').value='000000';await pin.events['#login-form:submit']({preventDefault(){},stopImmediatePropagation(){}});
 assert(pin.node('#login-mode-note').textContent.includes('selected name and PIN'));
 assert.equal(pin.node('#login-submit').disabled,false);
 const scoring=await harness();await scoring.login();await scoring.emit();
 const match={id:'match-one',a:['player-matthew-ydarraga'],b:['player-reid-mixon'],holes:Array(18).fill(null),points:{front:1,back:1,match:1}};
 scoring.state.liveCup={year:2027,rounds:[{id:'round-one',title:'Practice',started:true,test:true,matches:[match]}]};
 scoring.events.click({target});await tick();await tick();
 assert(scoring.records.get('liveMatches/match-one').active,'Owner setup writes immutable participant metadata atomically');
 scoring.listeners.get('liveScores')({metadata:{fromCache:false},docChanges:()=>[]});
 assert(scoring.ctx.window.GGA_BACKEND_API.canScore('match-one'));
 await scoring.ctx.window.GGA_SAVE_HOLE('match-one',0,'A',null);
 assert.equal(scoring.records.get('liveScores/match-one_0').winner,'A');
 await assert.rejects(scoring.ctx.window.GGA_SAVE_HOLE('match-one',0,'B',null),/just changed/);
 await scoring.ctx.window.GGA_SAVE_HOLE('match-one',0,'halve','A');
 assert.equal(scoring.ctx.window.GGA_LIVE_RESULTS.get('match-one_0'),'halve');
 scoring.records.get('liveMatches/match-one').started=false;
 await assert.rejects(scoring.ctx.window.GGA_SAVE_HOLE('match-one',1,'B',null),/active match/);
 scoring.records.get('liveMatches/match-one').started=true;
 scoring.state.liveCup.rounds[0].matches=[];scoring.ctx.window.GGA.save();await scoring.flush();
 assert.equal(scoring.records.get('liveMatches/match-one').active,false,'Removed matches lose score access');
 const refreshBefore=scoring.resultRefreshes,writesBefore=scoring.writes;scoring.listeners.get('liveScores')({metadata:{fromCache:false},docChanges:()=>[{type:'modified',doc:{id:'match-one_0',data:()=>({winner:'B'})}}]});assert.equal(scoring.resultRefreshes,refreshBefore+1,'Remote scores must refresh player/profile/statistics consumers');assert.equal(scoring.writes,writesBefore,'Result refresh must not echo a cloud write');
 console.log('PASS: atomic matchup metadata, independent hole writes, concurrent-edit rejection, score correction, paused/removed matches');
 console.log('PASS: explicit first publish, atomic revisions, no snapshot echo, stale owner conflict, failed writes, revocation, member write gating, PIN KDF compatibility, six-digit validation, hidden email, failed PIN feedback and membership initialization');
})().catch(e=>{console.error(e);process.exitCode=1;});


