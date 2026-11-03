// Run ONLY against demo-gga-spark emulator. No production credentials required.
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,writeBatch,serverTimestamp}=require('firebase/firestore');
const fs=require('node:fs');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-gga-spark',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 try{
  const owner=env.authenticatedContext('owner').firestore(),player=env.authenticatedContext('player').firestore(),outsider=env.authenticatedContext('outsider').firestore(),guest=env.unauthenticatedContext().firestore();
  const member={username:'matthew.ydarraga',playerId:'player-matthew-ydarraga',role:'owner',active:true};
  await env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),'members','owner'),member);
   await setDoc(doc(ctx.firestore(),'members','player'),{username:'reid.mixon',playerId:'player-reid-mixon',role:'player',active:true});
  });
  const shared=revision=>({schemaVersion:4,players:Array(13).fill({id:'test'}),season2026:{year:2026,rounds:[]},season2027:{year:2027,location:'',date:'',teams:{},roster:{}},clubhouse:{},draft2027:{picks:[]},liveCup:{year:2027,rounds:[]},handicapWeight:70,revision,updatedAt:serverTimestamp()});
  const privateData=revision=>({year:2027,rounds:[],revision,updatedAt:serverTimestamp()});
  const commit=(db,revision)=>{const b=writeBatch(db);b.set(doc(db,'public','clubhouse'),shared(revision));b.set(doc(db,'private','live2027'),privateData(revision));return b.commit();};
  await assertFails(setDoc(doc(outsider,'members','outsider'),member));
  await assertFails(updateDoc(doc(player,'members','player'),{role:'owner'}));
  await assertSucceeds(getDoc(doc(player,'members','player')));
  await assertFails(getDoc(doc(player,'members','owner')));
  await assertFails(getDocs(collection(owner,'members')));
  await assertFails(commit(player,1));await assertFails(commit(outsider,1));
  await assertSucceeds(commit(owner,1));
  await assertSucceeds(getDoc(doc(player,'public','clubhouse')));
  await assertFails(getDoc(doc(outsider,'public','clubhouse')));await assertFails(getDoc(doc(guest,'public','clubhouse')));
  await assertFails(getDoc(doc(player,'private','live2027')));await assertSucceeds(getDoc(doc(owner,'private','live2027')));
  await assertFails(setDoc(doc(owner,'public','clubhouse'),shared(2))); // paired write required
  await assertFails(commit(owner,1));await assertSucceeds(commit(owner,2));
  await assertFails(deleteDoc(doc(owner,'public','clubhouse')));
  const own=doc(player,'profiles','player-reid-mixon'),other=doc(player,'profiles','player-matthew-ydarraga');
  const profile={strengthOrder:['Driving','Approach','Chipping','Putting'],updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(own,profile));await assertSucceeds(getDocs(collection(player,'profiles')));
  await assertFails(setDoc(other,profile));await assertFails(setDoc(own,{...profile,role:'owner'}));
  await assertFails(setDoc(own,{...profile,strengthOrder:['Driving','Driving','Putting','Approach']}));
  await assertFails(updateDoc(own,{strengthOrder:['Putting']}));
  await assertFails(setDoc(own,{...profile,updatedAt:new Date(0)}));
  await assertFails(setDoc(own,{...profile,photoData:'https://evil.example/avatar.svg'}));
  await assertFails(setDoc(own,{...profile,photoData:'data:image/jpeg;base64,'+'a'.repeat(32000)}));
  await assertSucceeds(setDoc(own,{...profile,photoData:'data:image/jpeg;base64,YQ==',fantasyCharacterId:'legend-tiger-woods'}));
  await assertFails(setDoc(doc(owner,'profiles','unknown-player'),profile));
  const manualStats={version:1,handicap:14.2,year:2026,best:{score:80,course:'Pine Dunes',location:'Frankston, TX'},worst:{score:99,course:'Westridge',location:'McKinney, TX'}};
  await assertSucceeds(setDoc(own,{...profile,manualStats}));
  await assertFails(setDoc(other,{...profile,manualStats}));
  await assertFails(setDoc(own,{...profile,manualStats:{...manualStats,handicap:90}}));
  await assertFails(updateDoc(own,{'manualStats.handicap':'14'}));
  await assertFails(updateDoc(own,{'manualStats.best.course':'a'.repeat(121)}));
  await assertFails(updateDoc(own,{'manualStats.role':'owner'}));
  await assertFails(updateDoc(own,{'manualStats.best.score':120}));
  await assertFails(setDoc(own,{...profile,manualStats:{...manualStats,best:{score:80}}}));
  await assertSucceeds(updateDoc(own,{manualStats:{version:1,handicap:null,year:2026,best:null,worst:null},updatedAt:serverTimestamp()}));
  await assertFails(getDocs(collection(guest,'profiles')));
  await assertFails(getDoc(doc(owner,'accounts','legacy')));await assertFails(getDoc(doc(owner,'invites','legacy')));
  const newDb=env.authenticatedContext('new-player').firestore(),duplicate=env.authenticatedContext('duplicate').firestore();
  const signupMember={username:'will.parker',playerId:'player-will-parker',role:'player',active:true};
  const register=(db,uid,m=signupMember)=>{const b=writeBatch(db);b.set(doc(db,'members',uid),m);b.set(doc(db,'rosterClaims',m.username),{uid,playerId:m.playerId});return b.commit();};
  await assertFails(setDoc(doc(newDb,'members','new-player'),signupMember));
  await assertFails(setDoc(doc(newDb,'rosterClaims','will.parker'),{uid:'new-player',playerId:'player-will-parker'}));
  await assertFails(register(guest,'new-player'));
  await assertFails(register(newDb,'different-user'));
  await assertFails(register(newDb,'new-player',{...signupMember,role:'owner'}));
  await assertFails(register(newDb,'new-player',{...signupMember,username:'matthew.ydarraga',playerId:'player-matthew-ydarraga'}));
  await assertFails(register(newDb,'new-player',{...signupMember,playerId:'player-reid-mixon'}));
  await assertFails(register(newDb,'new-player',{...signupMember,extra:true}));
  await assertSucceeds(register(newDb,'new-player'));
  await assertSucceeds(getDoc(doc(newDb,'public','clubhouse')));
  await assertFails(getDoc(doc(newDb,'private','live2027')));
  await assertFails(register(duplicate,'duplicate'));
  await assertFails(updateDoc(doc(newDb,'members','new-player'),{role:'owner'}));
  await assertFails(updateDoc(doc(newDb,'rosterClaims','will.parker'),{uid:'duplicate'}));
  await assertFails(deleteDoc(doc(newDb,'rosterClaims','will.parker')));
  await assertFails(register(newDb,'new-player',{...signupMember,username:'nate.cox',playerId:'player-nate-cox'}));
  await assertFails(getDocs(collection(newDb,'rosterClaims')));
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'members','player'),{active:false}));
  await assertFails(getDoc(doc(player,'public','clubhouse')));await assertFails(setDoc(own,profile));
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'members','owner'),{active:false}));
  await assertFails(commit(owner,3));
  console.log('PASS: emulator rules: owner/member/guest, role escalation, atomic revisions, profiles, size/schema validation, disabled accounts');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});


