/* Owner-only complete backup/atomic restore using the existing Spark rules. */
(function(root){'use strict';
function factory({sdk,db,gga,projectId,assertReady,sessionId,onBusy,onRestored}){
 const b=root.GGA_BACKUP||(typeof require==='function'?require('./backup-core.js'):null),collectionNames=['profiles','liveMatches','liveScores','matchStates','matchAudit','scoreAudit'];
 const publicRef=sdk.doc(db,'public','clubhouse'),privateRef=sdk.doc(db,'private','live2027');
 const strip=d=>Object.fromEntries(Object.entries(d).filter(([k])=>k!=='updatedAt'));
 const serial=x=>b.clone(x);
 const uuid=()=>Array.from(root.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
 const roster=()=>gga.getState().players.map(p=>({id:p.id,username:p.username}));
 function checkSession(ticket){if(!ticket||sessionId()!==ticket)throw Error('Account changed. Sign in as Matthew again.');}
 async function read(){
  const results=await Promise.all([sdk.getDocFromServer(publicRef),sdk.getDocFromServer(privateRef),...collectionNames.map(n=>sdk.getDocsFromServer(sdk.collection(db,n)))]);
  if(!results[0].exists()||!results[1].exists())throw Error('The shared clubhouse has not been published. No complete server backup is available.');
  const shared=serial(results[0].data()),privateData=serial(results[1].data());
  if(shared.revision!==privateData.revision)throw Error('The server is updating. Wait for confirmation and retry.');
  const rows={};collectionNames.forEach((name,i)=>{rows[name]=results[i+2].docs.map(d=>({id:d.id,...serial(d.data())})).sort((a,b)=>a.id.localeCompare(b.id));});return {shared,privateData,...rows};
 }
 async function capture(){
  assertReady();const ticket=sessionId();
  for(let attempt=0;attempt<3;attempt++){
   const first=await read(),second=await read();checkSession(ticket);
   if(b.canonical(first)!==b.canonical(second))continue;
   const profiles=Object.fromEntries(roster().map(p=>[p.id,{}]));for(const {id,...d}of second.profiles)profiles[id]=strip(d);const scores=second.liveScores.map(strip),metadata=second.liveMatches.map(strip);
   const state=b.buildState(gga.getState(),second.shared,second.privateData,profiles,scores);
   return b.create({state,profiles,liveScores:scores,liveMatches:metadata,matchStates:second.matchStates.map(strip),matchAudit:second.matchAudit.map(strip),scoreAudit:second.scoreAudit,sourceRevision:second.shared.revision},roster(),projectId,'server');
  }
  throw Error('Scores or profiles are changing. Pause scoring and retry the backup. Nothing was changed.');
 }
 async function prepare(file){
  assertReady();file=await b.parse(JSON.stringify(file),roster(),projectId);
  if(file.source!=='server')throw Error('A device-only backup cannot replace the shared clubhouse.');
  const recovery=await capture();
  if(recovery.payload.state.liveCup.rounds.some(r=>r.started)||recovery.payload.liveMatches.some(m=>m.active&&m.started))throw Error('Pause all active rounds in Live before restoring. Nothing was changed.');
  const plan=b.restorePlan(file,roster(),uuid),active=recovery.payload.liveMatches.filter(m=>m.active);
  const writes=2+roster().length+active.length+plan.state.liveCup.rounds.reduce((n,r)=>n+r.matches.length,0);
  if(writes>450)throw Error('This restore exceeds the safe atomic write limit. Nothing was changed.');
  return {file,recovery,plan,session:sessionId(),writes};
 }
 async function restore(prepared){
  assertReady();checkSession(prepared.session);
  const parsed=await b.parse(JSON.stringify(prepared.file),roster(),projectId);
  const current=await capture();
  if(b.canonical(current.payload)!==b.canonical(prepared.recovery.payload))throw Error('The clubhouse changed after the preview. Preview the backup again before restoring.');
  // Rebuild from the verified file, never trust an externally modified preview plan.
  const plan=b.restorePlan(parsed,roster(),uuid),active=current.payload.liveMatches.filter(m=>m.active),ticket=sessionId(),revision=current.payload.sourceRevision;
  if(current.payload.state.liveCup.rounds.some(r=>r.started)||active.some(m=>m.started))throw Error('Pause all active rounds before restoring.');
  if(2+roster().length+active.length+plan.state.liveCup.rounds.reduce((n,r)=>n+r.matches.length,0)>450)throw Error('Restore exceeds the atomic write limit.');
  onBusy(true);
  try{
   if(plan.shared.season2027.course){
    const courses=root.GGA_COURSE_CORE||(typeof require==='function'?require('./course-core.js'):null);
    const saved=await courses.createPublisher({sdk,db})(plan.shared.season2027.course);
    plan.shared.season2027.course=saved;plan.state.seasons.find(s=>s.year===2027).course=saved;
   }
   await sdk.runTransaction(db,async tx=>{
    const refs=[publicRef,privateRef,...roster().map(p=>sdk.doc(db,'profiles',p.id)),...active.map(m=>sdk.doc(db,'liveMatches',m.id))];
    const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));checkSession(ticket);
    if(!snaps[0].exists()||!snaps[1].exists()||snaps[0].data().revision!==revision||snaps[1].data().revision!==revision)throw Error('A newer owner update exists. Preview again.');
    roster().forEach((p,i)=>{const data=snaps[i+2].exists()?strip(serial(snaps[i+2].data())):{};if(b.canonical(data)!==b.canonical(current.payload.profiles[p.id]||{}))throw Error('A player profile changed. Preview again.');});
    active.forEach((m,i)=>{const snap=snaps[2+roster().length+i];if(!snap.exists()||b.canonical(strip(serial(snap.data())))!==b.canonical(Object.fromEntries(Object.entries(m).filter(([k])=>k!=='id'))))throw Error('A matchup changed. Preview again.');});
    const updatedAt=sdk.serverTimestamp(),next=revision+1;
    tx.set(publicRef,{...plan.shared,revision:next,updatedAt});
    tx.set(privateRef,{year:2027,rounds:plan.privateRounds,revision:next,updatedAt});
    for(const p of roster())tx.set(sdk.doc(db,'profiles',p.id),{...plan.profiles[p.id],updatedAt});
    for(const {id,...m}of active)tx.set(sdk.doc(db,'liveMatches',id),{...m,active:false,updatedAt});
    for(const r of plan.state.liveCup.rounds)for(const m of r.matches)tx.set(sdk.doc(db,'liveMatches',m.id),{a:m.a,b:m.b,roundId:r.id,started:false,test:!!r.test,active:true,updatedAt});
   });
   checkSession(ticket);onRestored(plan,revision+1);return {revision:revision+1,matches:Object.keys(plan.mapping).length};
  }finally{onBusy(false);}
 }
 return {capture,prepare,restore};
}
if(typeof module!=='undefined')module.exports=factory;else root.GGA_BACKUP_CLOUD_FACTORY=factory;
})(typeof window==='undefined'?globalThis:window);
