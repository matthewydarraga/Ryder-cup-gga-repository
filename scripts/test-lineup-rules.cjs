'use strict';
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing'),sdk=require('firebase/firestore'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./test-backups.cjs'),{createCloudAPI}=require('../lineup-tools.js'),b=require('../backup-core.js');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-gga-spark',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 try{
  await env.clearFirestore();const f=fixture();
  await env.withSecurityRulesDisabled(async ctx=>{for(const [path,d]of f.docs)await sdk.setDoc(sdk.doc(ctx.firestore(),path),d);for(const [uid,index,role]of [['owner',0,'owner'],['old-player',1,'player'],['new-player',2,'player'],['outsider',7,'player']])await sdk.setDoc(sdk.doc(ctx.firestore(),'members',uid),{username:f.state.players[index].username,playerId:f.ids[index],role,active:true});});
  const owner=env.authenticatedContext('owner').firestore(),oldPlayer=env.authenticatedContext('old-player').firestore(),newPlayer=env.authenticatedContext('new-player').firestore(),outsider=env.authenticatedContext('outsider').firestore();
  let revision=7,latest,busy=false,injected=false;
  // A participant changes a hole after the substitution reads it. Firestore must retry.
  const racingSDK={...sdk,runTransaction:(db,fn)=>sdk.runTransaction(db,async tx=>{const result=await fn(tx);if(!injected){injected=true;await sdk.setDoc(sdk.doc(oldPlayer,'liveScores','original-match_0'),{matchId:'original-match',hole:0,winner:'B',updatedAt:sdk.serverTimestamp()});}return result;})};
  const api=createCloudAPI({sdk:racingSDK,db:owner,assertReady(){},sessionId:()=> 'owner:1',getRevision:()=>revision,onBusy:v=>busy=v,onApplied:r=>{latest=r;revision=r.shared.revision;}});
  const request={roundId:'practice-round',matchId:'original-match',before:{a:[f.ids[0]],b:[f.ids[1]]},a:[f.ids[2]],b:[f.ids[3]],points:{front:1,back:1,match:2},policy:'retain',reason:'Substitute unavailable players'};
  const first=await api(request);assert.equal(busy,false);assert.equal(revision,8);assert.equal(latest.replacement.holes[0],'B','Concurrent player correction must be retained');assert.equal(latest.replacement.holes[1],null,'Cleared result remains cleared');assert.equal(latest.record.before.holes[0],'B');
  const meta=await sdk.getDoc(sdk.doc(owner,'liveMatches','original-match'));assert.equal(meta.data().active,false);
  const result=(matchId,hole,winner)=>({matchId,hole,winner,updatedAt:sdk.serverTimestamp()});
  await assertFails(sdk.setDoc(sdk.doc(oldPlayer,'liveScores','original-match_2'),result('original-match',2,'A')));
  await assertFails(sdk.setDoc(sdk.doc(oldPlayer,'liveScores',first.matchId+'_2'),result(first.matchId,2,'A')));
  await assertFails(sdk.setDoc(sdk.doc(outsider,'liveScores',first.matchId+'_2'),result(first.matchId,2,'A')));
  await assertSucceeds(sdk.setDoc(sdk.doc(newPlayer,'liveScores',first.matchId+'_2'),result(first.matchId,2,'A')));
  const second=await api({...request,matchId:first.matchId,before:{a:request.a,b:request.b},a:[f.ids[0]],b:[f.ids[1]],policy:'fresh',reason:'Restart corrected pairing'});
  assert(latest.replacement.holes.every(h=>h===null));assert.equal(latest.cup.lineupHistory.length,2);assert.equal(latest.cup.lineupHistory[1].before.holes[2],'A');assert.equal(latest.cup.lineupHistory[0].before.matchId,'original-match');assert.equal(latest.cup.lineupHistory[1].lineageId,'original-match');
  await assertFails(sdk.setDoc(sdk.doc(newPlayer,'liveScores',first.matchId+'_3'),result(first.matchId,3,'B')));
  await assertSucceeds(sdk.setDoc(sdk.doc(oldPlayer,'liveScores',second.matchId+'_3'),result(second.matchId,3,'B')));
  const before=b.canonical((await sdk.getDoc(sdk.doc(owner,'public','clubhouse'))).data());
  const denied=createCloudAPI({sdk,db:oldPlayer,assertReady(){},sessionId:()=> 'old-player:1',getRevision:()=>revision,onBusy(){},onApplied(){throw Error('Must not apply');}});
  await assert.rejects(denied({...request,matchId:second.matchId,before:{a:[f.ids[0]],b:[f.ids[1]]}}));assert.equal(b.canonical((await sdk.getDoc(sdk.doc(owner,'public','clubhouse'))).data()),before);
  const stale=createCloudAPI({sdk,db:owner,assertReady(){},sessionId:()=> 'owner:1',getRevision:()=>7,onBusy(){},onApplied(){}});await assert.rejects(stale({...request,matchId:second.matchId}),/newer owner/);
  assert.equal((await sdk.getDoc(sdk.doc(owner,'private','live2027'))).data().revision,9);
  console.log('PASS: real Firestore concurrent correction retained on substitution, atomic permissions/revisions, removed-player and outsider rejection, new-participant scoring, fresh restart with archived scorecard, repeated audit lineage, non-owner denial and stale-owner rejection');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
