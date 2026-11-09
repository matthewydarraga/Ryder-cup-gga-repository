const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing'),sdk=require('firebase/firestore'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./test-backups.cjs'),{change}=require('../score-history.js');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-gga-spark',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});sdk.setLogLevel('silent');
 try{
  await env.clearFirestore();const f=fixture(),id='original-match',hole=5;
  await env.withSecurityRulesDisabled(async ctx=>{for(const [path,d]of f.docs)await sdk.setDoc(sdk.doc(ctx.firestore(),path),d);for(const [uid,index,role]of [['owner',0,'owner'],['player',1,'player'],['outside',2,'player'],['peer',0,'player']])await sdk.setDoc(sdk.doc(ctx.firestore(),'members',uid),{username:f.state.players[index].username,playerId:f.ids[index],role,active:true});});
  const db=env.authenticatedContext('player').firestore(),owner=env.authenticatedContext('owner').firestore(),other=env.authenticatedContext('outside').firestore(),guest=env.unauthenticatedContext().firestore();
  const ref=sdk.doc(db,'liveScores',id+'_'+hole),read=async()=>(await sdk.getDoc(ref)).data();
  const make=(current,before,value,extra={})=>change({matchId:id,hole,current,before,value,actor:f.ids[1],generation:0,updatedAt:sdk.serverTimestamp(),...extra});
  const write=(database,u)=>{const b=sdk.writeBatch(database);b.set(sdk.doc(database,'liveScores',id+'_'+hole),u.score);b.set(sdk.doc(database,'scoreAudit',u.id),u.record);return b.commit();};
  let u=make(null,null,'A');
  await assertFails(sdk.setDoc(ref,u.score)); // No audit.
  await assertFails(sdk.setDoc(sdk.doc(db,'scoreAudit',u.id),u.record)); // No score.
  await assertFails(write(other,u));await assertFails(write(guest,u));
  await assertFails(write(db,{...u,record:{...u.record,actor:f.ids[0]}}));
  await assertFails(write(db,{...u,record:{...u.record,extra:'pollution'}}));
  await assertFails(write(db,{...u,record:{...u.record,before:'B'}}));
  await assertFails(write(db,{...u,record:{...u.record,roundIndex:30}}));
  await assertSucceeds(write(db,u));
  const first=await read();
  await assertFails(write(db,u)); // Replay immutable record.
  await assertFails(sdk.setDoc(ref,{matchId:id,hole,winner:'B',generation:0,updatedAt:sdk.serverTimestamp()})); // Downgrade.
  await assertFails(sdk.updateDoc(ref,{winner:'B',updatedAt:sdk.serverTimestamp()})); // No new revision.
  u=make(first,'A','B');
  await assertFails(write(db,{...u,record:{...u.record,before:'halve'}}));
  await assertFails(write(db,{...u,record:{...u.record,winner:'A'}}));
  await assertFails(write(db,{...u,score:{...u.score,revision:999}}));
  await assertFails(write(db,{...u,record:{...u.record,actor:'x'.repeat(10000)}}));
  await assertSucceeds(write(db,u));const second=await read();
  await assertFails(write(db,make(second,'B','halve',{undoOf:2}))); // Undo must restore prior result.
  await assertFails(write(db,make(second,'B',null,{undoOf:1}))); // Stale undo.
  await assertFails(write(env.authenticatedContext('peer').firestore(),make(second,'B','A',{undoOf:2,actor:f.ids[0]})));
  await assertSucceeds(write(db,make(second,'B','A',{undoOf:2})));
  const third=await read();assert.equal(third.revision,3);assert.equal(third.winner,'A');
  for(const database of [db,owner]){await assertFails(sdk.deleteDoc(sdk.doc(database,'scoreAudit',id+'_'+hole+'_1')));await assertFails(sdk.updateDoc(sdk.doc(database,'scoreAudit',id+'_'+hole+'_1'),{before:'B'}));}
  await assertFails(sdk.getDocs(sdk.collection(guest,'scoreAudit')));await assertSucceeds(sdk.getDocs(sdk.collection(db,'scoreAudit')));
  await env.withSecurityRulesDisabled(ctx=>sdk.setDoc(sdk.doc(ctx.firestore(),'matchStates',id),{status:'final',generation:0}));
  await assertFails(write(db,make(third,'A','B')));
  await assertFails(write(owner,make(third,'A','B',{actor:f.ids[0]})));
  await env.withSecurityRulesDisabled(ctx=>sdk.setDoc(sdk.doc(ctx.firestore(),'matchStates',id),{status:'live',generation:1}));
  await assertFails(write(db,make(third,'A','B',{generation:1,undoOf:3})));
  await assertFails(write(db,make(third,'A','B')));
  await assertSucceeds(write(db,make(third,'A','halve',{generation:1})));
  console.log('PASS: atomic score/audit, participant-only writes, immutable history, no downgrade/replay, actor/value/schema validation, latest-only undo, final locks and reopened generations');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
