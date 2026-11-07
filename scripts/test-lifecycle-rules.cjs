'use strict';
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing'),sdk=require('firebase/firestore'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./test-backups.cjs'),{createAPI}=require('../match-lifecycle.js');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-gga-spark',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 sdk.setLogLevel('silent');
 try{
  await env.clearFirestore();const f=fixture();
  await env.withSecurityRulesDisabled(async ctx=>{for(const [path,d]of f.docs)await sdk.setDoc(sdk.doc(ctx.firestore(),path),d);for(const [uid,index,role]of [['owner',0,'owner'],['player',1,'player'],['outside',2,'player']])await sdk.setDoc(sdk.doc(ctx.firestore(),'members',uid),{username:f.state.players[index].username,playerId:f.ids[index],role,active:true});});
  const owner=env.authenticatedContext('owner').firestore(),player=env.authenticatedContext('player').firestore(),outside=env.authenticatedContext('outside').firestore(),guest=env.unauthenticatedContext().firestore(),id='original-match';
  const api=(db,uid,pid,isOwner)=>createAPI({sdk,db,assertReady(){},session:()=>({uid,playerId:pid,owner:isOwner})});
  const own=api(owner,'owner',f.ids[0],true),play=api(player,'player',f.ids[1],false),other=api(outside,'outside',f.ids[2],false);
  const score=(db,generation)=>sdk.setDoc(sdk.doc(db,'liveScores',id+'_3'),{matchId:id,hole:3,winner:'A',generation,updatedAt:sdk.serverTimestamp()});
  const hole=1,scoreRef=db=>sdk.doc(db,'liveScores',id+'_'+hole);
  await env.withSecurityRulesDisabled(ctx=>sdk.deleteDoc(scoreRef(ctx.firestore())));
  const historyRef=(db,key)=>sdk.doc(db,'liveMatches',id,'scoreHistory',key);
  const changeId=n=>String(n).padStart(32,'0');
  const correction=(db,n,overrides={},options={})=>{
   const key=changeId(n),batch=sdk.writeBatch(db);
   const audit={hole,before:'B',after:'A',actor:f.ids[1],generation:0,undoOf:null,
    roundIndex:0,matchIndex:0,updatedAt:sdk.serverTimestamp(),...overrides};
   if(options.score!==false)batch.set(scoreRef(db),{matchId:id,hole,winner:audit.after,
    generation:audit.generation,changeId:key,updatedAt:sdk.serverTimestamp()});
   if(options.audit!==false)batch.set(historyRef(db,key),audit);
   return batch.commit();
  };
  await assertFails(correction(player,1,{}, {audit:false}));
  await assertFails(correction(player,1,{}, {score:false}));
  await assertFails(correction(player,1,{before:null}));
  await assertFails(correction(player,1,{actor:f.ids[0]}));
  await assertFails(correction(player,1,{extra:'injected'}));
  await assertFails(correction(outside,1,{actor:f.ids[2]}));
  await assertSucceeds(correction(player,1));
  await assertFails(sdk.setDoc(scoreRef(player),{matchId:id,hole,winner:'B',generation:0,updatedAt:sdk.serverTimestamp()}));
  await assertFails(sdk.updateDoc(historyRef(owner,changeId(1)),{before:null}));
  await assertFails(sdk.deleteDoc(historyRef(owner,changeId(1))));
  const historyQuery=db=>sdk.query(sdk.collection(db,'liveMatches',id,'scoreHistory'),sdk.orderBy('updatedAt','desc'),sdk.limit(50));
  await assertFails(sdk.getDocs(historyQuery(guest)));
  await assertFails(sdk.getDocs(sdk.collection(player,'liveMatches',id,'scoreHistory')));
  assert.equal((await assertSucceeds(sdk.getDocs(historyQuery(player)))).size,1);
  await assertFails(correction(player,2,{before:'A',after:null,undoOf:changeId(1)}));
  await assertSucceeds(correction(player,2,{before:'A',after:'B',undoOf:changeId(1)}));
  await assertFails(correction(player,3,{before:'B',after:'A',undoOf:changeId(2)}));
  await assertSucceeds(correction(player,3));
  await assertFails(correction(player,4,{before:'A',after:'B',undoOf:changeId(1)}));
  await assertSucceeds(score(player,0));
  await assert.rejects(other(id,'submit'));await assertFails(sdk.getDocs(sdk.collection(guest,'matchStates')));await assertFails(sdk.getDocs(sdk.collection(guest,'matchAudit')));
  // State writes without their matching immutable audit record fail.
  const base={matchId:id,status:'awaiting',revision:1,generation:0,confirmed:[],reason:'',actor:f.ids[1],updatedAt:sdk.serverTimestamp()};
  await assertFails(sdk.setDoc(sdk.doc(player,'matchStates',id),base));
  await play(id,'submit');await assertFails(correction(player,4,{before:'A',after:'B',undoOf:changeId(3)}));await assertFails(score(owner,0));await assertFails(score(player,0));
  await assert.rejects(own(id,'finalize','',1));await assert.rejects(other(id,'confirm','',1));await assert.rejects(play(id,'reopen','Wrong actor',1));
  await play(id,'confirm','',1);await assert.rejects(play(id,'confirm','',1),/state changed/);
  await own(id,'confirm','',2);await own(id,'finalize','',3);
  assert.equal((await sdk.getDoc(sdk.doc(owner,'matchStates',id))).data().status,'final');
  // A normal owner metadata publication cannot erase the separate final lock.
  const meta=(await sdk.getDoc(sdk.doc(owner,'liveMatches',id))).data();await sdk.setDoc(sdk.doc(owner,'liveMatches',id),{...meta,updatedAt:sdk.serverTimestamp()});await assertFails(score(owner,0));
  await assertFails(sdk.deleteDoc(sdk.doc(owner,'matchStates',id)));await assertFails(sdk.deleteDoc(sdk.doc(owner,'matchAudit',id+'_4')));await assertFails(sdk.updateDoc(sdk.doc(owner,'matchAudit',id+'_4'),{reason:'rewritten'}));
  await assert.rejects(own(id,'reopen','',4));await own(id,'reopen','Correct hole 4',4);
  await assertFails(correction(player,4,{before:'A',after:'B',undoOf:changeId(3),generation:1}));await assertFails(score(player,0));await assertSucceeds(score(player,1));
  await assertFails(sdk.setDoc(sdk.doc(player,'liveScores',id+'_4'),{matchId:id,hole:4,winner:'B',updatedAt:sdk.serverTimestamp()}));
  // Forged status and confirmation changes cannot bypass owner transitions.
  const current=(await sdk.getDoc(sdk.doc(player,'matchStates',id))).data();
  const forge=sdk.writeBatch(player),forged={...current,status:'final',revision:6,actor:f.ids[1],updatedAt:sdk.serverTimestamp()};forge.set(sdk.doc(player,'matchStates',id),forged);forge.set(sdk.doc(player,'matchAudit',id+'_6'),{...forged,action:'finalize'});await assertFails(forge.commit());
  await play(id,'submit','',5);await assertFails(score(player,1));
  const audits=await sdk.getDocs(sdk.collection(owner,'matchAudit'));assert.equal(audits.size,6);
  console.log('PASS: emulator lifecycle, participant/outsider/guest permissions, required immutable audit, confirmations, owner finalization/reopening, metadata-lock preservation, stale generations and forged transitions');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
