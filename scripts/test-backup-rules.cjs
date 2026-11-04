/* Complete backup round-trip under the actual deployed security rules, emulator only. */
'use strict';
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore'),fs=require('node:fs'),assert=require('node:assert/strict');
const b=require('../backup-core.js'),factory=require('../backup-cloud.js'),{fixture}=require('./test-backups.cjs');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-gga-spark',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 try{
  await env.clearFirestore();const f=fixture();
  f.docs.get('public/clubhouse').liveCup.rounds[0].started=false;f.docs.get('liveMatches/original-match').started=false;
  await env.withSecurityRulesDisabled(async ctx=>{for(const [path,data]of f.docs)await sdk.setDoc(sdk.doc(ctx.firestore(),path),data);await sdk.setDoc(sdk.doc(ctx.firestore(),'members','backup-owner'),{username:'matthew.ydarraga',playerId:f.ids[0],role:'owner',active:true});await sdk.setDoc(sdk.doc(ctx.firestore(),'members','backup-player'),{username:'michael.rodriguez',playerId:f.ids[1],role:'player',active:true});});
  const db=env.authenticatedContext('backup-owner').firestore();let state=f.state;
  const api=factory({sdk,db,gga:{getState:()=>state},projectId:'demo-gga-spark',assertReady(){},sessionId:()=> 'backup-owner:1',onBusy(){},onRestored:plan=>state=plan.state});
  const original=await api.capture(),prepared=await api.prepare(original);await api.restore(prepared);const restored=await api.capture();
  const old=original.payload.state.liveCup.rounds[0].matches[0],next=restored.payload.state.liveCup.rounds[0].matches[0];
  assert.notEqual(next.id,old.id);assert.deepEqual(next.holes,old.holes);assert.deepEqual(restored.payload.profiles,original.payload.profiles);assert.deepEqual(restored.payload.state.seasons,original.payload.state.seasons);assert.equal(restored.payload.sourceRevision,8);
  const oldMeta=await sdk.getDocFromServer(sdk.doc(db,'liveMatches','original-match'));assert.equal(oldMeta.data().active,false);
  const player=env.authenticatedContext('backup-player').firestore();await assertFails(sdk.setDoc(sdk.doc(player,'liveScores','original-match_2'),{matchId:'original-match',hole:2,winner:'A',updatedAt:sdk.serverTimestamp()}));
  const reopened=restored.payload.state.liveCup;reopened.rounds[0].started=true;
  await sdk.runTransaction(db,async tx=>{const updatedAt=sdk.serverTimestamp();tx.set(sdk.doc(db,'public','clubhouse'),{...f.docs.get('public/clubhouse'),liveCup:reopened,revision:9,updatedAt});tx.set(sdk.doc(db,'private','live2027'),{year:2027,rounds:f.docs.get('private/live2027').rounds,revision:9,updatedAt});tx.set(sdk.doc(db,'liveMatches',next.id),{a:next.a,b:next.b,roundId:'practice-round',test:true,active:true,started:true,updatedAt});});
  await sdk.setDoc(sdk.doc(player,'liveScores',next.id+'_2'),{matchId:next.id,hole:2,winner:'B',updatedAt:sdk.serverTimestamp()});
  const resumed=await api.capture();assert.equal(resumed.payload.state.liveCup.rounds[0].matches[0].holes[2],'B','Restored match accepts participant scoring after reopening');
  const denied=factory({sdk,db:player,gga:{getState:()=>state},projectId:'demo-gga-spark',assertReady(){},sessionId:()=> 'player',onBusy(){},onRestored(){}});await assert.rejects(denied.capture());
  console.log('PASS: real Firestore rules permit atomic owner restore; portraits, strengths, manual stats, seasons and live results survive; old match revoked; restored match resumes participant scoring; player cannot export private backup');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
