/* Spark-only: Firebase Auth + Firestore. No custom-token server or Storage. */
const gga=window.GGA,$=s=>document.querySelector(s);
function announce(text,kind='info'){
 let b=$('#gga-cloud-state');if(!b){b=document.createElement('div');b.id='gga-cloud-state';b.className='gga-cloud-state';$('main.shell')?.prepend(b);}b.textContent=text;b.dataset.kind=kind;b.hidden=!text;
}
if(!window.GGA_BACKEND_CONFIGURED){announce('DEVICE PREVIEW · Accounts and shared syncing are inactive. Firebase setup is required.','preview');}
else try{
 const [appMod,authMod,fireMod]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
 ]);
 const app=appMod.initializeApp(window.FIREBASE_CONFIG),auth=authMod.getAuth(app),db=fireMod.getFirestore(app);
 await authMod.setPersistence(auth,authMod.browserSessionPersistence);
 const publicRef=fireMod.doc(db,'public','clubhouse'),privateRef=fireMod.doc(db,'private','live2027');
 const s=gga.getState(),profiles=new Map();
 const rosterPhotos=new Map(s.players.map(p=>[p.id,{officialPhoto:p.officialPhoto,officialPhotoFallback:p.officialPhotoFallback}]));
 let member=null,ready=false,suppress=false,revision=null,dirty=false,saving=false,blocked=false,timer=null,epoch=0,changes=0;
 let publishedMatches=new Map(),scoresReady=false,backupBusy=false,outbox=null,scoreRetry=null,releaseScoreLock=null;
 const scoreVersions=new Map();
 const versionOf=d=>{const t=d?.updatedAt;return t&&typeof t.seconds==='number'?{seconds:t.seconds,nanoseconds:t.nanoseconds}:t??null;};
 const refreshScores=()=>{if(gga.refreshResults)gga.refreshResults();else window.GGA_LIVE?.render();};
 window.GGA_LIVE_RESULTS=new Map();
 window.GGA_MATCH_STATES=new Map();window.GGA_MATCH_AUDIT=new Map();
 let stops=[],lastContent='',pendingBackup=null,lastAuthError='',openProfileAfterLogin=false;
 const errorText=e=>String(e?.message||e).slice(0,220);
 const ownerAllowed=()=>member?.role==='owner'&&member?.username==='matthew.ydarraga'&&auth.currentUser&&ready&&!blocked;
 const publishCourse=window.GGA_COURSE_CORE?.createPublisher({sdk:fireMod,db});
 window.GGA_PUBLISH_COURSE=async course=>{
  if(!ownerAllowed()||dirty||saving||backupBusy)throw Error('Sign in as Matthew and wait for pending changes.');
  const ticket=epoch,base=revision,saved=await publishCourse(course);
  if(ticket!==epoch||base!==revision||!ownerAllowed()||dirty||saving||backupBusy)throw Error('Account or event changed during import. Review and retry.');return saved;
 };
 function render(){const prev=suppress;suppress=true;try{gga.render();gga.save();}finally{suppress=prev;}}
 function authorize(){window.GGA_BACKEND_AUTHORIZED=!!ownerAllowed();}
 function stop(){releaseScoreLock?.();releaseScoreLock=null;clearTimeout(scoreRetry);outbox=null;scoreVersions.clear();window.GGA_MATCH_STATES.clear();window.GGA_MATCH_AUDIT.clear();document.querySelector('#gga-score-outbox')?.remove?.();document.querySelector('#gga-score-storage-warning')?.remove?.();scoresReady=false;window.GGA_LIVE_RESULTS.clear();publishedMatches.clear();clearTimeout(timer);stops.forEach(f=>f());stops=[];member=null;ready=false;dirty=false;revision=null;blocked=false;profiles.clear();authorize();gga.setSignedIn('');}
 function fail(e){
  blocked=true;authorize();clearTimeout(timer);announce('SYNC STOPPED · '+errorText(e)+' · Export a backup, then reload to receive the server copy.','error');
  const button=document.createElement('button');button.type='button';button.className='btn btn-secondary btn-tiny';button.textContent='Download local backup';button.addEventListener('click',()=>window.GGA_EXPORT_DEVICE_RECOVERY?window.GGA_EXPORT_DEVICE_RECOVERY():gga.exportFile());$('#gga-cloud-state').append(button);gga.render();
 }
 function content(){
  const future=s.seasons.find(x=>x.year===2027);
  return JSON.parse(JSON.stringify({schemaVersion:4,
   players:s.players.map(p=>({id:p.id,name:p.name,username:p.username,football:p.football||null,position:p.position||'',officialPhoto:p.officialPhoto||null,officialPhotoFallback:p.officialPhotoFallback||null,handicap:null,handicapChecked:null})),
   season2026:s.seasons.find(x=>x.year===2026),
   season2027:{year:2027,location:future.location,date:future.date,teams:future.teams,roster:future.roster,...(future.course?{course:future.course}:{})},
   clubhouse:Object.fromEntries(Object.entries(s.clubhouse||{}).filter(([k])=>!['coverData','coverPath'].includes(k))),
   draft2027:s.draft2027,liveCup:s.liveCup||{year:2027,rounds:[]},handicapWeight:s.handicapWeight??70,privateRounds:future.rounds||[]
  }));
 }
 function applyProfile(p){const d=profiles.get(p.id);p.customPhoto=d?.photoData||null;p.fantasyCharacterId=d?.fantasyCharacterId||null;p.strengthOrder=d?.strengthOrder||null;p.manualStats=d?.manualStats?.version===1?d.manualStats:null;p.handicap=p.manualStats?.handicap??null;p.handicapChecked=null;}
 function patch(d,privateData){
  suppress=true;
  try{
   const old=new Map(s.players.map(p=>[p.id,p]));s.players=d.players.map(p=>({...p,officialPhoto:rosterPhotos.get(p.id)?.officialPhoto||p.officialPhoto||null,officialPhotoFallback:rosterPhotos.get(p.id)?.officialPhotoFallback||p.officialPhotoFallback||null,ghinNumber:old.get(p.id)?.ghinNumber||''}));s.players.forEach(applyProfile);
   Object.assign(s.seasons.find(x=>x.year===2026),d.season2026);
   delete s.seasons.find(x=>x.year===2027).course;
   Object.assign(s.seasons.find(x=>x.year===2027),d.season2027,{rounds:privateData?.rounds||[]});
   s.clubhouse={...d.clubhouse};Object.assign(s.draft2027,d.draft2027);s.draft2027.picks=[...d.draft2027.picks];
   s.liveCup=d.liveCup;publishedMatches=matchMetadata(d.liveCup);s.handicapWeight=d.handicapWeight;revision=d.revision;lastContent=JSON.stringify(content());render();
  }finally{suppress=false;}
 }
 function matchMetadata(cup){
  const result=new Map();
  for(const r of cup?.rounds||[])for(const m of r.matches)result.set(m.id,{a:m.a,b:m.b,roundId:r.id,started:!!r.started,test:!!r.test,active:true});
  return result;
 }
 async function publish(initial=false){
  if(!ownerAllowed()||saving||(!initial&&!dirty))return;
  const ticket=epoch,uid=auth.currentUser.uid,base=revision,payload=content(),serial=changes;
  pendingBackup=JSON.stringify(payload);saving=true;announce('SAVING · Waiting for Firestore confirmation…','loading');
  try{
   await fireMod.runTransaction(db,async tx=>{
    const current=await tx.get(publicRef);
    if(ticket!==epoch||auth.currentUser?.uid!==uid)throw Error('Account changed; reload before editing.');
    if(initial?current.exists():!current.exists()||current.data().revision!==base)throw Error('A newer owner update exists. Your local copy was not published.');
    const {privateRounds,...shared}=payload,next=(base??0)+1;
    tx.set(publicRef,{...shared,revision:next,updatedAt:fireMod.serverTimestamp()});
    tx.set(privateRef,{year:2027,rounds:privateRounds,revision:next,updatedAt:fireMod.serverTimestamp()});
    const nextMatches=matchMetadata(payload.liveCup);
    for(const [id,meta]of nextMatches)tx.set(fireMod.doc(db,'liveMatches',id),{...meta,updatedAt:fireMod.serverTimestamp()});
    for(const [id,meta]of publishedMatches)if(!nextMatches.has(id))tx.set(fireMod.doc(db,'liveMatches',id),{...meta,active:false,updatedAt:fireMod.serverTimestamp()});
   });
   if(ticket!==epoch)return;
   publishedMatches=matchMetadata(payload.liveCup);revision=(base??0)+1;lastContent=JSON.stringify(payload);dirty=changes!==serial;pendingBackup=null;gga.render();
   announce('SERVER CONFIRMED · Clubhouse and scoring saved.','live');
  }catch(e){if(ticket===epoch)fail(e);}
  finally{saving=false;if(dirty&&!blocked&&ticket===epoch){clearTimeout(timer);timer=setTimeout(()=>publish(),650);}else if(!blocked&&ticket===epoch)void flushScores();}
 }
 window.GGA_AFTER_SAVE=()=>{
  if(backupBusy||suppress||!ownerAllowed()||revision===null||JSON.stringify(content())===lastContent)return;
  dirty=true;changes++;announce('UNSYNCED · Owner changes waiting to save.','loading');clearTimeout(timer);timer=setTimeout(()=>publish(),650);
 };
 const canScore=id=>{
  const r=s.liveCup?.rounds.find(r=>r.matches.some(m=>m.id===id)),m=r?.matches.find(m=>m.id===id);
  return !!(outbox&&member&&ready&&scoresReady&&!blocked&&!dirty&&!saving&&!backupBusy&&r?.started&&m&&(!window.GGA_MATCH_STATES.has(id)||window.GGA_MATCH_STATES.get(id).status==='live')&&(member.role==='owner'||[...m.a,...m.b].includes(member.playerId)));
 };
 function renderOutbox(){
  let panel=$('#gga-score-outbox');if(!panel){panel=document.createElement('section');panel.id='gga-score-outbox';panel.className='card';$('main.shell')?.prepend(panel);}
  panel.replaceChildren();const entries=outbox?.list()||[];panel.hidden=!entries.length;if(!entries.length){if(panel.dataset.hadScores==='yes')announce('SERVER CONFIRMED · Queued scores synced.','live');panel.dataset.hadScores='';return;}panel.dataset.hadScores='yes';
  const heading=document.createElement('h3');heading.textContent='Scores saved on this device · '+entries.length;panel.append(heading);
  const note=document.createElement('p');note.textContent='Pending scores are separate from confirmed standings. Keep this browser data until they sync. Reopen the app and sign in as the same player after a reload. Use one scoring tab per account.';panel.append(note);
  for(const entry of entries){
   const match=s.liveCup?.rounds.flatMap(r=>r.matches).find(m=>m.id===entry.id);
   const names=ids=>ids.map(id=>s.players.find(p=>p.id===id)?.name||id).join(' / ');
   const row=document.createElement('div');row.className='card';
   const label=document.createElement('p');label.textContent=(match?names(match.a)+' vs '+names(match.b):'Previous matchup')+' · Hole '+(entry.hole+1)+' · '+(entry.winner==='halve'?'Tied':entry.winner?'Side '+entry.winner:'Clear result')+' · '+entry.status.toUpperCase()+(entry.message?' · '+entry.message:'');row.append(label);
   if(entry.status==='conflict'){
    const latest=document.createElement('p');latest.textContent='Server result: '+(entry.latest??'not scored')+'. Review before replacing it.';row.append(latest);
    const retry=document.createElement('button');retry.className='btn btn-secondary btn-tiny';retry.textContent='Replace with my queued score';retry.onclick=()=>{if(confirm('Replace the displayed server result for hole '+(entry.hole+1)+' with your queued result?')){outbox.retry(entry.id,entry.hole);void flushScores();}};row.append(retry);
   }
   const discard=document.createElement('button');discard.className='btn btn-secondary btn-tiny';discard.textContent='Discard queued edit';discard.disabled=entry.status==='sending';discard.onclick=()=>{outbox.remove(entry.id,entry.hole);};row.append(discard);panel.append(row);
  }
  const sync=document.createElement('button');sync.className='btn btn-secondary';sync.textContent='Retry pending scores';sync.onclick=()=>void flushScores();panel.append(sync);
 }
 async function sendScore(entry){
  const {id,hole,winner,expected,version}=entry,ticket=epoch,playerId=member.playerId,isOwner=member.role==='owner';
  await fireMod.runTransaction(db,async tx=>{
   const meta=await tx.get(fireMod.doc(db,'liveMatches',id)),existing=await tx.get(fireMod.doc(db,'liveScores',id+'_'+hole)),state=await tx.get(fireMod.doc(db,'matchStates',id));
   const lifecycle=state.exists()?state.data():{status:'live',generation:0};
   if(lifecycle.status!=='live'||lifecycle.generation!==(entry.generation??0))throw Object.assign(Error('Match submitted, finalized, or reopened since this edit. Discard it and review the current scorecard.'),{code:'score-blocked'});
   if(ticket!==epoch||!meta.exists())throw Object.assign(Error('Match setup or account changed. Review this queued edit.'),{code:'score-blocked'});
   const m=meta.data();if(!m.active||!m.started||(!isOwner&&![...m.a,...m.b].includes(playerId)))throw Object.assign(Error('Match paused, replaced, or no longer assigned to you.'),{code:'score-blocked'});
   const baseline=s.liveCup.rounds.flatMap(r=>r.matches).find(m=>m.id===id)?.holes[hole]??null;
   const latest=existing.exists()?existing.data().winner:baseline,latestVersion=existing.exists()?versionOf(existing.data()):null;
   if(latest!==expected||JSON.stringify(latestVersion)!==JSON.stringify(version)){
    // An identical target is already satisfied, including a retry after a lost acknowledgement.
    if(latest===winner)return;
    throw Object.assign(Error('A newer result exists. Your queued edit was not applied.'),{code:'score-conflict',latest,latestVersion});
   }
   tx.set(fireMod.doc(db,'liveScores',id+'_'+hole),{matchId:id,hole,winner,generation:lifecycle.generation,updatedAt:fireMod.serverTimestamp()});
  });
  if(ticket!==epoch)throw Error('Account changed. Sign in again to confirm this queued edit.');
  const confirmed=await fireMod.getDocFromServer(fireMod.doc(db,'liveScores',id+'_'+hole));
  if(ticket!==epoch)throw Error('Account changed. Sign in again to confirm this queued edit.');
  if(confirmed.exists()){window.GGA_LIVE_RESULTS.set(id+'_'+hole,confirmed.data().winner);scoreVersions.set(id+'_'+hole,versionOf(confirmed.data()));}refreshScores();
 }
 async function flushScores(){
  clearTimeout(scoreRetry);
  if(!outbox||!member||!ready||!scoresReady||blocked||dirty||saving||backupBusy||globalThis.navigator?.onLine===false)return;
  const queue=outbox,ticket=epoch;
  try{await queue.flush(entry=>{if(queue!==outbox||ticket!==epoch)throw Error('Account changed. Reopen the original account to sync.');return sendScore(entry);});}
  catch(e){gga.notify('Score queue could not update device storage: '+errorText(e));return;}
  if(queue===outbox&&ticket===epoch&&queue.list().some(x=>x.status==='pending'))scoreRetry=setTimeout(()=>void flushScores(),15000);
 }
 window.GGA_SAVE_HOLE=async(id,hole,winner,expected)=>{
  if(!canScore(id)||!Number.isInteger(hole)||hole<0||hole>17||![null,'A','B','halve'].includes(winner))throw Error('This match is not ready for scoring. Wait for setup to sync.');
  if(!outbox)throw Error('Device score storage is unavailable. Scores have not been saved.');
  outbox.put(id,hole,winner,expected,scoreVersions.get(id+'_'+hole)??null,window.GGA_MATCH_STATES.get(id)?.generation??0);void flushScores();return {pending:true};
 };
 if(window.GGA_LIFECYCLE)window.GGA_MATCH_ACTION=window.GGA_LIFECYCLE.createAPI({sdk:fireMod,db,
  session:()=>member&&auth.currentUser?{uid:auth.currentUser.uid,owner:member.role==='owner',playerId:member.playerId}:null,
  assertReady:()=>{if(!member||!ready||!scoresReady||blocked||dirty||saving||backupBusy||outbox?.list().length||globalThis.navigator?.onLine===false)throw Error('Connect and resolve queued scores before changing match state.');}
 });
 if(window.GGA_LINEUP)window.GGA_CHANGE_LINEUP=window.GGA_LINEUP.createCloudAPI({sdk:fireMod,db,
  assertReady:()=>{if(!ownerAllowed()||dirty||saving||backupBusy||pendingBackup||outbox?.list().length)throw Error('Wait for all owner changes to sync before changing a lineup.');},
  sessionId:()=>member?.role==='owner'&&auth.currentUser?auth.currentUser.uid+':'+epoch:null,getRevision:()=>revision,
  onBusy:value=>{backupBusy=value;},
  onApplied:result=>{patch(result.shared,result.privateData);announce('SERVER CONFIRMED · Lineup changed and previous results saved in history.','live');}
 });
 window.GGA_CLOUD_SIGNOUT=async()=>{
  if(backupBusy||dirty||saving||pendingBackup||outbox?.list().length)return gga.notify('Resolve queued scores and wait for owner changes to sync before signing out.');
  ++epoch;stop();await authMod.signOut(auth);gga.closeLogin();gga.showTab('home');
 };
 // The public alias is only an Auth identifier. Assigned PINs never ship in source.
 async function pinPassword(username,pin){
  const enc=new TextEncoder();
  const material=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode('GGA-PIN-v1:'+username),iterations:150000,hash:'SHA-256'},material,256);
  return 'GGA!'+btoa(String.fromCharCode(...new Uint8Array(bits)));
 }
 async function ensureMembership(user,username){
  const selected=s.players.find(p=>p.username===username);
  if(!selected||user.email!==username+'@gga-pin.invalid')throw Error('This account has no assigned player profile. Ask Matthew for your PIN.');
  const ref=fireMod.doc(db,'members',user.uid);
  return fireMod.runTransaction(db,async tx=>{
   const existing=await tx.get(ref);
   if(existing.exists()){
    const m=existing.data();if(m.username!==username||m.playerId!==selected.id)throw Error('This account belongs to another roster profile.');if(!m.active)throw Error('This account is inactive. Ask Matthew to reactivate it.');return m;
   }
   if(auth.currentUser?.uid!==user.uid)throw Error('Account changed. Sign in again.');
   // Rules bind every pre-created Auth UID to its roster name and role.
   const m={username,playerId:selected.id,role:username==='matthew.ydarraga'?'owner':'player',active:true};
   tx.set(ref,m);return m;
  });
 }
 function loginMode(){
  $('#gga-email-wrap').hidden=true;$('#login-email').required=false;$('#login-email').disabled=true;$('#gga-reset-password').hidden=true;
  $('#gga-password-label').textContent='PIN';
  const input=$('#login-pin');input.pattern='[0-9]{6}';input.maxLength=6;input.minLength=6;input.inputMode='numeric';input.autocomplete='off';input.placeholder='6-digit PIN';
  $('#gga-login-guidance').hidden=true;$('#gga-login-security-note').hidden=true;
  $('#login-mode-note').textContent='';$('#login-submit').textContent='Sign in';
 }
 window.GGA_REFRESH_LOGIN=loginMode;
 $('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();e.stopImmediatePropagation();lastAuthError='';
  const username=$('#login-player').value,pin=$('#login-pin').value.trim();
  if(!s.players.some(p=>p.username===username)||!/^\d{6}$/.test(pin)){$('#login-mode-note').textContent='Select your name and enter your 6-digit PIN.';return;}
  openProfileAfterLogin=true;$('#login-submit').disabled=true;$('#login-submit').textContent='Signing in…';$('#login-mode-note').textContent='';
  try{const password=await pinPassword(username,pin);await authMod.signInWithEmailAndPassword(auth,username+'@gga-pin.invalid',password);$('#login-pin').value='';}
  catch(e){openProfileAfterLogin=false;const code=e?.code;$('#login-mode-note').textContent=code==='auth/too-many-requests'?'Too many attempts. Please try again in a few minutes.':code==='auth/network-request-failed'?'Check your connection and try again.':'Check your selected name and PIN, then try again.';}
  finally{$('#login-submit').disabled=false;$('#login-submit').textContent='Sign in';}
 },true);
 async function saveProfile(p,fields){
  if(backupBusy||!member||blocked||!ready||(member.playerId!==p.id&&member.role!=='owner'))throw Error('Sign in to your provisioned account.');
  try{await fireMod.setDoc(fireMod.doc(db,'profiles',p.id),{...fields,updatedAt:fireMod.serverTimestamp()},{merge:true});}
  catch(e){gga.notify('Profile did not sync. Reload to restore the server copy.');throw e;}
 }
 window.GGA_SAVE_MANUAL_STATS=(p,manualStats)=>saveProfile(p,{manualStats});
 window.GGA_SAVE_STRENGTHS=(p,strengthOrder)=>saveProfile(p,{strengthOrder});
 window.GGA_CHARACTER_UPDATED=p=>saveProfile(p,{fantasyCharacterId:p.fantasyCharacterId}).catch(()=>{});
 window.GGA_UPLOAD_PHOTO=async(file,p)=>{
  if(!file?.type.startsWith('image/')||file.size>12*1024*1024)return gga.notify('Choose an image smaller than 12 MB.');
  const url=URL.createObjectURL(file);
  try{
   const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});
   const c=document.createElement('canvas');c.width=c.height=160;const edge=Math.min(img.width,img.height);
   c.getContext('2d').drawImage(img,(img.width-edge)/2,(img.height-edge)/2,edge,edge,0,0,160,160);
   const photoData=c.toDataURL('image/jpeg',.65);if(photoData.length>32000)throw Error('Photo is too detailed. Choose a simpler crop.');
   await saveProfile(p,{photoData});gga.notify('Small profile photo saved to Firestore.');
  }catch(e){gga.notify('Photo was not saved: '+errorText(e));}finally{URL.revokeObjectURL(url);}
 };
 window.GGA_UPLOAD_BRANDING=()=>gga.notify('Add the cover image to repository assets for free hosting. Cloud Storage is disabled on Spark.');
 document.addEventListener('click',e=>{
  if(e.target.closest('#add-golfer,[data-remove]')){e.preventDefault();e.stopImmediatePropagation();gga.notify('The shared roster is fixed at 13 accounts. Export a backup before changing roster architecture.');return;}
  if(e.target.closest('#gga-publish-first')&&ownerAllowed()&&revision===null&&confirm('Publish this device archive and 2027 setup as the first shared record? Export a backup first.'))void publish(true);
 },true);
 authMod.onAuthStateChanged(auth,async user=>{
  const ticket=++epoch;stop();
  if(!user){announce(lastAuthError,lastAuthError?'error':'preview');return;}
  announce('VERIFYING · Checking your provisioned membership…','loading');
  const ref=fireMod.doc(db,'members',user.uid);
  try{
   const snap=await fireMod.getDocFromServer(ref);if(ticket!==epoch)return;
   const username=user.email?.endsWith('@gga-pin.invalid')?user.email.slice(0,-'@gga-pin.invalid'.length):s.players.find(p=>p.name===user.displayName)?.username;
   const m=snap.exists()?snap.data():await ensureMembership(user,username);
   if(ticket!==epoch)return;
   const p=s.players.find(x=>x.id===m?.playerId&&x.username===m?.username);
   if(!m?.active||!p||!['owner','player'].includes(m.role)||(m.role==='owner'&&p.username!=='matthew.ydarraga'))throw Error('No active roster membership. Ask Matthew to check the UID mapping.');
   member=m;
   try{
    const key='gga-score-outbox-v1:'+window.FIREBASE_CONFIG.projectId+':'+user.uid;
    const initialize=()=>{if(ticket!==epoch)throw Error('Account changed.');outbox=window.GGA_OFFLINE.create({storage:localStorage,key,onChange:()=>{if(ticket===epoch)renderOutbox();}});renderOutbox();};
    if(globalThis.navigator?.locks?.request)await new Promise((resolve,reject)=>{
     void navigator.locks.request(key,{ifAvailable:true},async lock=>{
      if(!lock){reject(Error('Scoring is open in another tab. Close that tab and reload here.'));return;}
      try{initialize();const hold=new Promise(r=>{releaseScoreLock=r;});resolve();await hold;}catch(e){reject(e);}
     }).catch(reject);
    });else initialize();
   }catch(e){const warning=document.createElement('p');warning.id='gga-score-storage-warning';warning.className='card';warning.textContent='SCORING UNAVAILABLE · '+errorText(e);$('main.shell')?.prepend(warning);gga.notify(warning.textContent);}
   if(ticket!==epoch)return;
   stops.push(fireMod.onSnapshot(ref,snap=>{
    if(ticket!==epoch)return;
    if(!snap.exists()||JSON.stringify(snap.data())!==JSON.stringify(m)){++epoch;stop();void authMod.signOut(auth);announce('MEMBERSHIP CHANGED · Sign in again after Matthew checks your access.','error');}
   },fail));
   for(const [collection,target]of [['matchStates',window.GGA_MATCH_STATES],['matchAudit',window.GGA_MATCH_AUDIT]])stops.push(fireMod.onSnapshot(fireMod.collection(db,collection),{includeMetadataChanges:true},snap=>{
    if(ticket!==epoch||snap.metadata?.hasPendingWrites||snap.metadata?.fromCache)return;
    for(const c of snap.docChanges()){if(c.type==='removed')target.delete(c.doc.id);else target.set(c.doc.id,c.doc.data());}window.GGA_LIVE?.render();
   },fail));
   stops.push(fireMod.onSnapshot(publicRef,{includeMetadataChanges:true},async snap=>{
    if(ticket!==epoch||snap.metadata.hasPendingWrites||dirty||saving||blocked||backupBusy)return;
    if(snap.metadata.fromCache){announce('OFFLINE · Showing cached data; live updates are not confirmed.','preview');return;}
    try{
     if(snap.exists()){
      const data=snap.data();let privateData=null;
      if(m.role==='owner'){
       const privateSnap=await fireMod.getDocFromServer(privateRef);
       if(ticket!==epoch||dirty||saving||blocked)return;
       if(!privateSnap.exists()||privateSnap.data().revision!==data.revision)throw Error('Scoring revision mismatch. Reload to receive a consistent copy.');
       privateData=privateSnap.data();
      }
      patch(data,privateData);ready=true;authorize();gga.setSignedIn(m.username);announce('SERVER COPY RECEIVED · Listening for clubhouse and scoring updates.','live');void flushScores();
     }else{ready=true;authorize();gga.setSignedIn(m.username);announce('SIGNED IN · '+p.name+' · Your profile changes sync across devices.','live');}
     gga.closeLogin();if(openProfileAfterLogin){openProfileAfterLogin=false;gga.openMyProfile?.();}
    }catch(e){fail(e);}
   },fail));
   stops.push(fireMod.onSnapshot(fireMod.collection(db,'liveScores'),{includeMetadataChanges:true},snap=>{
    if(ticket!==epoch||backupBusy||snap.metadata?.hasPendingWrites)return;
    if(snap.metadata?.fromCache){window.GGA_LIVE?.render();return;}
    for(const c of snap.docChanges()){if(c.type==='removed')window.GGA_LIVE_RESULTS.delete(c.doc.id);else {window.GGA_LIVE_RESULTS.set(c.doc.id,c.doc.data().winner);scoreVersions.set(c.doc.id,versionOf(c.doc.data()));}}
    scoresReady=true;refreshScores();void flushScores();
   },e=>{scoresReady=false;announce('SCORING NOT CONNECTED · '+errorText(e)+' · Match permissions must be published in Firebase.','error');window.GGA_LIVE?.render();}));
   stops.push(fireMod.onSnapshot(fireMod.collection(db,'profiles'),{includeMetadataChanges:true},snap=>{
    if(ticket!==epoch||backupBusy||snap.metadata?.hasPendingWrites)return;
    for(const c of snap.docChanges()){if(c.type==='removed')profiles.delete(c.doc.id);else profiles.set(c.doc.id,c.doc.data());const p=s.players.find(p=>p.id===c.doc.id);if(p)applyProfile(p);}render();
   },fail));
  }catch(e){if(ticket===epoch){lastAuthError='ACCOUNT NOT AUTHORIZED · '+errorText(e);stop();$('#login-mode-note').textContent=lastAuthError;announce(lastAuthError,'error');await authMod.signOut(auth);}}
 });
 if(window.GGA_BACKUP_CLOUD_FACTORY)window.GGA_BACKUP_CLOUD=window.GGA_BACKUP_CLOUD_FACTORY({sdk:fireMod,db,gga,projectId:window.FIREBASE_CONFIG.projectId,
  assertReady:()=>{if(!ownerAllowed()||dirty||saving||pendingBackup||backupBusy||outbox?.list().length)throw …31929 tokens truncated…|ids.some(id=>!players.includes(id)))throw Error('Choose a different known golfer for every slot.');
 if(same(a,m.a)&&same(b,m.b))throw Error('The players have not changed. Use the normal point settings instead.');
 if(r.matches.some(x=>x.id!==m.id&&[...x.a,...x.b].some(id=>ids.includes(id))))throw Error('A golfer can only play one matchup in this round.');
 if(!r.test&&(a.some(id=>roster[id]&&roster[id]!=='A')||b.some(id=>roster[id]&&roster[id]!=='B')))throw Error('Assign golfers to their drafted team.');
 if(!p||Object.keys(p).sort().join(',')!=='back,front,match'||Object.values(p).some(n=>!Number.isFinite(n)||n<0||n>100||!Number.isInteger(n*2))||!Object.values(p).some(n=>n>0))throw Error('Invalid point settings.');
 const reason=String(request.reason||'').trim();if(!['retain','fresh'].includes(request.policy)||!reason||reason.length>500)throw Error('Choose whether to keep results or start fresh, and enter a reason (up to 500 characters).');
 if(actor!=='matthew.ydarraga')throw Error('Only Matthew can change lineups.');
 if(!validId(newId)||cup.rounds.some(r=>r.matches.some(m=>m.id===newId)))throw Error('A fresh match ID is required.');
 if(!Array.isArray(holes)||holes.length!==18||holes.some(h=>![null,'A','B','halve'].includes(h)))throw Error('The old scorecard is incomplete or invalid.');
 const history=cup.lineupHistory||[];if(!Array.isArray(history)||history.length>=200)throw Error('The lineup history limit has been reached. Export a complete backup before reorganizing this event.');
 const lineageId=m.lineageId||m.id,replacement={...clone(m),id:newId,lineageId,a:[...a],b:[...b],points:clone(p),holes:request.policy==='retain'?[...holes]:Array(18).fill(null)};
 const record={id:newId,lineageId,roundId:r.id,at,actor,revision,reason,policy:request.policy,before:{matchId:m.id,a:[...m.a],b:[...m.b],points:clone(m.points||legacy),holes:[...holes]},after:{matchId:newId,a:[...a],b:[...b],points:clone(p)}};
 const next=clone(cup),round=next.rounds.find(x=>x.id===r.id);round.matches[round.matches.findIndex(x=>x.id===m.id)]=replacement;next.lineupHistory=[...history,record];return {cup:next,replacement,record};
}
function createCloudAPI({sdk,db,assertReady,sessionId,getRevision,onBusy,onApplied}){
 const publicRef=sdk.doc(db,'public','clubhouse'),privateRef=sdk.doc(db,'private','live2027');
 const uuid=()=>Array.from(root.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
 return async request=>{
  assertReady();const ticket=sessionId(),base=getRevision(),newId=uuid(),at=new Date().toISOString();if(!ticket)throw Error('Sign in as Matthew.');onBusy(true);
  try{
   const result=await sdk.runTransaction(db,async tx=>{
    const refs=[publicRef,privateRef,sdk.doc(db,'liveMatches',request.matchId),...Array.from({length:18},(_,i)=>sdk.doc(db,'liveScores',request.matchId+'_'+i))];
    const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
    const lifecycle=await tx.get(sdk.doc(db,'matchStates',request.matchId));
    if(lifecycle.exists()&&lifecycle.data().status!=='live')throw Error('Reopen this match with a reason before changing its lineup.');
    if(sessionId()!==ticket)throw Error('Account changed. Sign in again.');
    if(!snaps[0].exists()||!snaps[1].exists()||snaps[0].data().revision!==base||snaps[1].data().revision!==base)throw Error('A newer owner update exists. Reload the match before editing.');
    const shared=snaps[0].data(),priv=snaps[1].data(),round=shared.liveCup.rounds.find(r=>r.id===request.roundId),old=round?.matches.find(m=>m.id===request.matchId);
    if(!old)throw Error('This matchup no longer exists.');
    if(snaps[2].exists()){const meta=snaps[2].data();if(!meta.active||meta.roundId!==round.id||!same(meta.a,old.a)||!same(meta.b,old.b)||meta.started!==!!round.started)throw Error('Match permissions changed. Reload before editing.');}
    const holes=old.holes.map((h,i)=>snaps[i+3].exists()?snaps[i+3].data().winner:h);
    const changed=makeChange(shared.liveCup,request,{holes,actor:'matthew.ydarraga',newId,at,revision:base+1,players:shared.players.map(p=>p.id),roster:shared.season2027.roster});
    const next={...shared,liveCup:changed.cup,revision:base+1,updatedAt:sdk.serverTimestamp()},privateNext={...priv,revision:base+1,updatedAt:sdk.serverTimestamp()};
    if(new TextEncoder().encode(JSON.stringify({...next,updatedAt:null})).length>900000)throw Error('The event is too large to add another history entry. Export a complete backup first.');
    tx.set(publicRef,next);tx.set(privateRef,privateNext);
    tx.set(sdk.doc(db,'liveMatches',old.id),{a:old.a,b:old.b,roundId:round.id,started:!!round.started,test:!!round.test,active:false,updatedAt:sdk.serverTimestamp()});
    tx.set(sdk.doc(db,'liveMatches',newId),{a:request.a,b:request.b,roundId:round.id,started:!!round.started,test:!!round.test,active:true,updatedAt:sdk.serverTimestamp()});
    return {shared:next,privateData:privateNext,...changed};
   });
   if(sessionId()!==ticket)throw Error('Account changed after saving. Reload to receive the server copy.');onApplied(result);return {matchId:result.replacement.id};
  }finally{onBusy(false);}
 };
}
const api={makeChange,createCloudAPI};if(typeof module!=='undefined')module.exports=api;else root.GGA_LINEUP=api;
})(typeof window==='undefined'?globalThis:window);
