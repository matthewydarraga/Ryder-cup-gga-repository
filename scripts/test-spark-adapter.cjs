// Adapter integration with deterministic SDK doubles. Does not prove deployed security.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const tick=()=>new Promise(r=>setImmediate(r));
async function harness(pending=false){
 const nodes=new Map(),events={},listeners=new Map(),timers=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,dataset:{},addEventListener:(t,f)=>events[id+':'+t]=f,prepend(){},append(){}});return nodes.get(id);};
 const state={players:[{id:'player-matthew-ydarraga',username:'matthew.ydarraga',name:'Matthew'},{id:'player-reid-mixon',username:'reid.mixon',name:'Reid Mixon'}],seasons:[{year:2026,rounds:[]},{year:2027,location:'LA',date:'',teams:{},roster:{},rounds:[]}],clubhouse:{hero:'Initial'},draft2027:{phase:'pre',picks:[]},handicapWeight:70};
 let signed='',writes=0,txFailure=null,current=null,authCallback;
 const auth={currentUser:null},snapshot=(d,meta={})=>({exists:()=>!!d,data:()=>d,metadata:{fromCache:false,hasPendingWrites:false,...meta}});
 const membership={active:true,username:'matthew.ydarraga',playerId:'player-matthew-ydarraga',role:'owner'};
 let shared=null,priv=null,savedMember=pending?null:membership;const claims=new Map();
 const fire={getFirestore:()=>({}),doc:(_,...p)=>p.join('/'),collection:(_,p)=>p,serverTimestamp:()=>123,
  getDocFromServer:async ref=>snapshot(ref.startsWith('members/')?savedMember:priv),
  onSnapshot:(ref,...args)=>{const cb=args.find(x=>typeof x==='function');listeners.set(ref,cb);return ()=>listeners.delete(ref);},
  runTransaction:async(_,fn)=>{if(txFailure)throw Error(txFailure);const staged=[];const result=await fn({get:async ref=>snapshot(ref.startsWith('members/')?savedMember:ref.startsWith('rosterClaims/')?claims.get(ref.split('/')[1]):shared),set:(ref,d)=>staged.push([ref,d])});for(const [r,d]of staged){if(r==='public/clubhouse')shared=d;else if(r.startsWith('members/'))savedMember=d;else if(r.startsWith('rosterClaims/'))claims.set(r.split('/')[1],d);else priv=d;writes++;}return result;},
  setDoc:async()=>{writes++;}
 };
 const g={getState:()=>state,render(){},save(){ctx.window.GGA_AFTER_SAVE?.();},setSignedIn:u=>signed=u,notify(){},closeLogin(){},showTab(){}};
 const ctx={window:{GGA:g,GGA_BACKEND_CONFIGURED:true,FIREBASE_CONFIG:{},addEventListener:(t,f)=>events[t]=f},document:{querySelector:node,createElement:()=>node('banner'),addEventListener:(t,f)=>events[t]=f},console,confirm:()=>true,setTimeout:f=>(timers.push(f),timers.length),clearTimeout(){},URL,Map,JSON,
  modules:[{initializeApp:()=>({})},{getAuth:()=>auth,setPersistence:async()=>{},browserSessionPersistence:'session',onAuthStateChanged:(_,f)=>authCallback=f,signOut:async()=>{},signInWithEmailAndPassword:async()=>{},sendPasswordResetEmail:async()=>{}},fire]};
 const source=fs.readFileSync('gga-cloud.js','utf8').replace(/const \[appMod,authMod,fireMod\]=await Promise\.all\(\[[\s\S]*?\]\);/,'const [appMod,authMod,fireMod]=modules;');
 await vm.runInNewContext('(async()=>{'+source+'})()',ctx);
 return {ctx,state,events,listeners,node,snapshot,membership,auth,
  setClaim:(username,uid)=>claims.set(username,{uid}),
  login:async()=>{if(pending)node('#login-player').value='reid.mixon';auth.currentUser={uid:'owner'};await authCallback(auth.currentUser);},
  emit:async()=>{await listeners.get('public/clubhouse')(snapshot(shared));},
  flush:async()=>{const f=timers.pop();timers.length=0;if(f){f();await tick();await tick();}},
  get signed(){return signed},get writes(){return writes},get shared(){return shared},get priv(){return priv},
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
 const pending=await harness(true);await pending.login();await pending.emit();assert.equal(pending.signed,'reid.mixon');assert.equal(pending.ctx.window.GGA_BACKEND_AUTHORIZED,false);assert.equal(pending.writes,2,'Pending player must receive paired membership and claim');
 const taken=await harness(true);taken.setClaim('reid.mixon','someone-else');await taken.login();assert.equal(taken.signed,'');assert.equal(taken.writes,0,'Claimed roster name must not be reassigned');
 const signup=await harness(true);let savedName=null,accountsCreated=0;
 signup.ctx.modules[1].createUserWithEmailAndPassword=async()=>{accountsCreated++;const user={uid:'new-player'};signup.auth.currentUser=user;return {user};};signup.ctx.modules[1].updateProfile=async(user,data)=>{savedName=data.displayName;};
 signup.node('#login-player').value='matthew.ydarraga';signup.node('#login-email').value='example@example.com';signup.node('#login-pin').value='test-password-only';await signup.events['banner:click']();assert.equal(accountsCreated,0,'Owner signup must be reserved');
 signup.node('#login-player').value='reid.mixon';await signup.events['banner:click']();assert.equal(savedName,'Reid Mixon');assert.equal(signup.writes,2);assert(signup.node('#login-mode-note').textContent.includes('ACCOUNT READY'));assert(!signup.ctx.window.GGA_BACKEND_AUTHORIZED);
 console.log('PASS: explicit first publish, atomic revisions, no snapshot echo, stale owner conflict, failed writes, revocation, member write gating, automatic player signup, duplicate name rejection and reserved owner signup');
})().catch(e=>{console.error(e);process.exitCode=1;});

