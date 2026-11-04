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
  const pinIdentities={"matthew.ydarraga": "YEcCCU6ovyd11eKrP6bM50CBmOE2", "michael.rodriguez": "kmi43GYZjdSAD6IdtIvrntU3lyU2", "jake.norris": "odxMVptzSJhpde1ffNyo4xjA15o2", "brandon.durman": "BhDPNH4w1lR5nwQQXNKxoHfIxBx1", "will.parker": "FeDQgK5NNMcKBCiCYxj8LNMkOds2", "ryan.higgins": "f9HCZO9x7kPClPgDkYDRUicp2mx1", "jordan.mcneely": "rCwG9NSeWyYFOP8ooyJBOTLZ5vi1", "reid.mixon": "fQhOeejdZrMuX9hiiEpXVECiVgJ2", "zach.cousar": "JPYKbcKTEBM0AlQMS9Op94perDS2", "jack.abraham": "GgfBmgOthXelPjlE73q4qye5RVU2", "peyton.braswell": "DLiHrLleaaeWWrKJGR6LbIT6R0t2", "nate.cox": "DVMgwShJuKbG4ifaFw4AWB8RDlB3", "kody.russey": "lwdqzuUi1dRZiwqaS5wfuRNdtrr2"};
  const newUID=pinIdentities['will.parker'];
  const newDb=env.authenticatedContext(newUID,{email:'will.parker@gga-pin.invalid'}).firestore();
  const signupMember={username:'will.parker',playerId:'player-will-parker',role:'player',active:true};
  const init=(db,uid,m=signupMember)=>setDoc(doc(db,'members',uid),m);
  await assertFails(init(guest,newUID));
  await assertFails(init(outsider,'outsider'));
  const impostor=env.authenticatedContext('impostor',{email:'will.parker@gga-pin.invalid'}).firestore();
  await assertFails(init(impostor,'impostor'));
  const wrongEmail=env.authenticatedContext(newUID,{email:'wrong@gga-pin.invalid'}).firestore();
  await assertFails(init(wrongEmail,newUID));
  await assertFails(init(newDb,'different-user'));
  await assertFails(init(newDb,newUID,{...signupMember,role:'owner'}));
  await assertFails(init(newDb,newUID,{...signupMember,username:'matthew.ydarraga',playerId:'player-matthew-ydarraga',role:'owner'}));
  await assertFails(init(newDb,newUID,{...signupMember,playerId:'player-reid-mixon'}));
  await assertFails(init(newDb,newUID,{...signupMember,extra:true}));
  await assertSucceeds(init(newDb,newUID));
  await assertSucceeds(getDoc(doc(newDb,'public','clubhouse')));
  await assertFails(getDoc(doc(newDb,'private','live2027')));
  await assertFails(updateDoc(doc(newDb,'members',newUID),{role:'owner'}));
  await assertFails(setDoc(doc(newDb,'rosterClaims','will.parker'),{uid:newUID,playerId:'player-will-parker'}));
  await assertFails(init(newDb,newUID,{...signupMember,username:'nate.cox',playerId:'player-nate-cox'}));
  await assertFails(getDocs(collection(newDb,'rosterClaims')));
  const pinOwnerUID=pinIdentities['matthew.ydarraga'];
  const pinOwner=env.authenticatedContext(pinOwnerUID,{email:'matthew.ydarraga@gga-pin.invalid'}).firestore();
  await assertSucceeds(init(pinOwner,pinOwnerUID,member));
  await assertSucceeds(getDoc(doc(pinOwner,'private','live2027')));
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'members','player'),{active:false}));
  await assertFails(getDoc(doc(player,'public','clubhouse')));await assertFails(setDoc(own,profile));
  await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'members','owner'),{active:false}));
  await assertFails(commit(owner,3));
  console.log('PASS: emulator rules: owner/member/guest, role escalation, atomic revisions, profiles, size/schema validation, disabled accounts');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});



