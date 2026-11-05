'use strict';
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing'),sdk=require('firebase/firestore'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createPublisher}=require('../course-core.js');
const {fixture}=require('./test-backups.cjs'),{course}=require('./test-courses.cjs');
(async()=>{const env=await initializeTestEnvironment({projectId:'demo-gga-spark',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});sdk.setLogLevel('silent');try{
 await env.clearFirestore();const f=fixture();await env.withSecurityRulesDisabled(async ctx=>{for(const [path,d]of f.docs)await sdk.setDoc(sdk.doc(ctx.firestore(),path),d);for(const [uid,index,role]of [['owner',0,'owner'],['player',1,'player']])await sdk.setDoc(sdk.doc(ctx.firestore(),'members',uid),{username:f.state.players[index].username,playerId:f.ids[index],role,active:true});});
 const owner=env.authenticatedContext('owner').firestore(),player=env.authenticatedContext('player').firestore(),guest=env.unauthenticatedContext().firestore();
 async function save(db,value){const shared=(await sdk.getDoc(sdk.doc(owner,'public','clubhouse'))).data(),priv=(await sdk.getDoc(sdk.doc(owner,'private','live2027'))).data(),revision=shared.revision+1;const batch=sdk.writeBatch(db);batch.set(sdk.doc(db,'public','clubhouse'),{...shared,season2027:{...shared.season2027,course:value},revision,updatedAt:sdk.serverTimestamp()});batch.set(sdk.doc(db,'private','live2027'),{...priv,revision,updatedAt:sdk.serverTimestamp()});return batch.commit();}
 await assertFails(save(player,course));await assertFails(save(guest,course));await assert.rejects(createPublisher({sdk,db:player})(course));await assert.rejects(createPublisher({sdk,db:guest})(course));const published=await createPublisher({sdk,db:owner})(course);await assertSucceeds(save(owner,published));
 assert.deepEqual((await sdk.getDoc(sdk.doc(player,'public','clubhouse'))).data().season2027.course,published);
 for(const value of [{...course,slope:999},{...course,name:'x'.repeat(201)},{...course,holes:course.holes.slice(1)},{...course,holes:course.holes.map((h,i)=>i===2?{...h,par:'4'}:h)},{...course,holes:course.holes.map((h,i)=>i===1?{...h,number:1}:h)}])await assertFails(save(owner,value));
 const badPart={start:1,holes:course.holes.slice(0,6).map((h,i)=>i===2?{...h,yards:1001}:h)};await assertFails(sdk.setDoc(sdk.doc(owner,'courseParts','invalid_1'),badPart));
 await assertFails(sdk.updateDoc(sdk.doc(owner,'courseCards',published.recordId),{name:'changed'}));
 console.log('PASS: emulator course owner-only atomic import, player read access, guest denial, and course/tee/hole schema validation');
}finally{await env.cleanup();}})().catch(e=>{console.error(e);process.exitCode=1;});
