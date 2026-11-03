/* Spark-only: Firebase Auth + Firestore. No custom-token server or Storage. */
const gga=window.GGA,$=s=>document.querySelector(s);
function announce(text,kind='info'){
 let b=$('#gga-cloud-state');if(!b){b=document.createElement('div');b.id='gga-cloud-state';b.className='gga-cloud-state';$('main.shell')?.prepend(b);}b.textContent=text;b.dataset.kind=kind;
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
 let stops=[],lastContent='',pendingBackup=null,pendingRosterUsername=null,lastAuthError='';
 const errorText=e=>String(e?.message||e).slice(0,220);
 const ownerAllowed=()=>member?.role==='owner'&&member?.username==='matthew.ydarraga'&&auth.currentUser&&ready&&!blocked;
 function render(){const prev=suppress;suppress=true;try{gga.render();gga.save();}finally{suppress=prev;}}
 function authorize(){window.GGA_BACKEND_AUTHORIZED=!!ownerAllowed();}
 function stop(){clearTimeout(timer);stops.forEach(f=>f());stops=[];member=null;ready=false;dirty=false;revision=null;blocked=false;profiles.clear();authorize();gga.setSignedIn('');}
 function fail(e){
  blocked=true;authorize();clearTimeout(timer);announce('SYNC STOPPED · '+errorText(e)+' · Export a backup, then reload to receive the server copy.','error');
  const button=document.createElement('button');button.type='button';button.className='btn btn-secondary btn-tiny';button.textContent='Download local backup';button.addEventListener('click',()=>gga.exportFile());$('#gga-cloud-state').append(button);gga.render();
 }
 function content(){
  const future=s.seasons.find(x=>x.year===2027);
  return JSON.parse(JSON.stringify({schemaVersion:4,
   players:s.players.map(p=>({id:p.id,name:p.name,username:p.username,football:p.football||null,position:p.position||'',officialPhoto:p.officialPhoto||null,officialPhotoFallback:p.officialPhotoFallback||null,handicap:null,handicapChecked:null})),
   season2026:s.seasons.find(x=>x.year===2026),
   season2027:{year:2027,location:future.location,date:future.date,teams:future.teams,roster:future.roster},
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
   Object.assign(s.seasons.find(x=>x.year===2027),d.season2027,{rounds:privateData?.rounds||[]});
   s.clubhouse={...d.clubhouse};Object.assign(s.draft2027,d.draft2027);s.draft2027.picks=[...d.draft2027.picks];
   s.liveCup=d.liveCup;s.handicapWeight=d.handicapWeight;revision=d.revision;lastContent=JSON.stringify(content());render();
  }finally{suppress=false;}
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
   });
   if(ticket!==epoch)return;
   revision=(base??0)+1;lastContent=JSON.stringify(payload);dirty=changes!==serial;pendingBackup=null;gga.render();
   announce('SERVER CONFIRMED · Clubhouse and scoring saved.','live');
  }catch(e){if(ticket===epoch)fail(e);}
  finally{saving=false;if(dirty&&!blocked&&ticket===epoch){clearTimeout(timer);timer=setTimeout(()=>publish(),650);}}
 }
 window.GGA_AFTER_SAVE=()=>{
  if(suppress||!ownerAllowed()||revision===null||JSON.stringify(content())===lastContent)return;
  dirty=true;changes++;announce('UNSYNCED · Owner changes waiting to save.','loading');clearTimeout(timer);timer=setTimeout(()=>publish(),650);
 };
 window.GGA_CLOUD_SIGNOUT=async()=>{
  if(dirty||saving||pendingBackup)return gga.notify('Wait for confirmation or export a backup before signing out. Reload if syncing has stopped.');
  ++epoch;stop();await authMod.signOut(auth);gga.closeLogin();gga.showTab('home');
 };
 async function ensureMembership(user,username){
  const selected=s.players.find(p=>p.username===username);
  if(!selected||username==='matthew.ydarraga')throw Error('Select your own player name. Matthew’s owner account must use Sign in.');
  const ref=fireMod.doc(db,'members',user.uid),claimRef=fireMod.doc(db,'rosterClaims',username);
  return fireMod.runTransaction(db,async tx=>{
   const existing=await tx.get(ref);
   if(existing.exists()){
    const m=existing.data();if(m.username!==username||m.playerId!==selected.id)throw Error('This email already belongs to another roster profile. Use Sign in to open that profile.');if(!m.active)throw Error('This account is inactive. Ask Matthew to reactivate it.');return m;
   }
   const claim=await tx.get(claimRef);
   if(claim.exists()&&claim.data().uid!==user.uid)throw Error('That player name already has an account. Sign in to it, or ask Matthew to correct the roster.');
   if(auth.currentUser?.uid!==user.uid)throw Error('Account changed. Sign in again.');
   const m={username,playerId:selected.id,role:'player',active:true};
   tx.set(ref,m);if(!claim.exists())tx.set(claimRef,{uid:user.uid,playerId:selected.id});
   return m;
  });
 }
 function loginMode(){$('#gga-login-guidance').textContent='Choose your roster name and use your own email and password.';$('#login-mode-note').textContent='New players get access automatically after creating an account. Each roster name can be registered once.';$('#login-submit').textContent='Sign in';}
 const signup=document.createElement('button');signup.type='button';signup.id='gga-create-account';signup.className='btn btn-secondary';signup.textContent='Create account';$('#login-form').append(signup);
 signup.addEventListener('click',async()=>{
  $('#login-mode-note').textContent='Checking registration details…';
  const email=$('#login-email').value.trim(),password=$('#login-pin').value;
  const selected=s.players.find(p=>p.username===$('#login-player').value);
  if(!selected){$('#login-mode-note').textContent='Select your player name first.';return;}
  if(selected.username==='matthew.ydarraga'){$('#login-mode-note').textContent='Matthew’s owner account already exists. Use Sign in or Reset password by email.';return;}
  if(!email||password.length<12){$('#login-mode-note').textContent='Enter a valid email and a password of at least 12 characters.';return;}
  pendingRosterUsername=selected.username;lastAuthError='';signup.disabled=true;$('#login-mode-note').textContent='Contacting Firebase to create your account…';
  try{
   const user=auth.currentUser?.email?.toLowerCase()===email.toLowerCase()?auth.currentUser:(await authMod.createUserWithEmailAndPassword(auth,email,password)).user;
   await ensureMembership(user,selected.username);await authMod.updateProfile(user,{displayName:selected.name});$('#login-pin').value='';
   const message='ACCOUNT READY · '+selected.name+' can now sign in and edit their profile.';
   announce(message,'preview');$('#login-mode-note').textContent=message;
  }
  catch(e){const code=String(e?.code||'unknown-error').replace(/^auth\//,'');const hints={'operation-not-allowed':'Enable Email/Password under Firebase Authentication → Sign-in method.','unauthorized-domain':'Add this website domain under Firebase Authentication → Settings → Authorized domains.','email-already-in-use':'This email already has an account. Sign in or reset your password.','weak-password':'Choose a stronger password.','invalid-email':'Enter a valid email address.','network-request-failed':'Check your connection and try again.','too-many-requests':'Too many attempts. Wait before trying again.','invalid-api-key':'Check the Firebase web app configuration.'};$('#login-mode-note').textContent='Registration failed ('+code+'). '+(hints[code]||errorText(e));}
  finally{signup.disabled=false;pendingRosterUsername=null;}
 });
 window.GGA_REFRESH_LOGIN=loginMode;
 $('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();e.stopImmediatePropagation();lastAuthError='';$('#login-submit').disabled=true;
  try{await authMod.signInWithEmailAndPassword(auth,$('#login-email').value.trim(),$('#login-pin').value);$('#login-pin').value='';}
  catch{$('#login-mode-note').textContent='Unable to sign in. Check your email/password and network, or ask Matthew to check account setup.';}
  finally{$('#login-submit').disabled=false;}
 },true);
 $('#gga-reset-password').addEventListener('click',async()=>{
  const email=$('#login-email').value.trim();if(!email)return gga.notify('Enter your account email first.');
  try{await authMod.sendPasswordResetEmail(auth,email);gga.notify('If this account can receive a reset, check its email.');}
  catch{gga.notify('Reset unavailable. Try later or ask Matthew to reset it in Firebase Authentication.');}
 });
 async function saveProfile(p,fields){
  if(!member||blocked||!ready||(member.playerId!==p.id&&member.role!=='owner'))throw Error('Sign in to your provisioned account.');
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
  if(!user){announce(lastAuthError||'MEMBER SIGN-IN REQUIRED · Choose your roster name to sign in or create your account.',lastAuthError?'error':'preview');return;}
  announce('VERIFYING · Checking your provisioned membership…','loading');
  const ref=fireMod.doc(db,'members',user.uid);
  try{
   const snap=await fireMod.getDocFromServer(ref);if(ticket!==epoch)return;
   const username=pendingRosterUsername||s.players.find(p=>p.name===user.displayName)?.username||$('#login-player').value;
   const m=snap.exists()?snap.data():await ensureMembership(user,username);
   if(ticket!==epoch)return;
   const p=s.players.find(x=>x.id===m?.playerId&&x.username===m?.username);
   if(!m?.active||!p||!['owner','player'].includes(m.role)||(m.role==='owner'&&p.username!=='matthew.ydarraga'))throw Error('No active roster membership. Ask Matthew to check the UID mapping.');
   member=m;
   stops.push(fireMod.onSnapshot(ref,snap=>{
    if(ticket!==epoch)return;
    if(!snap.exists()||JSON.stringify(snap.data())!==JSON.stringify(m)){++epoch;stop();void authMod.signOut(auth);announce('MEMBERSHIP CHANGED · Sign in again after Matthew checks your access.','error');}
   },fail));
   stops.push(fireMod.onSnapshot(publicRef,{includeMetadataChanges:true},async snap=>{
    if(ticket!==epoch||snap.metadata.hasPendingWrites||dirty||saving||blocked)return;
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
      patch(data,privateData);ready=true;authorize();gga.setSignedIn(m.username);announce('SERVER COPY RECEIVED · Listening for clubhouse and scoring updates.','live');
     }else{ready=true;authorize();gga.setSignedIn(m.username);announce('NO SHARED RECORD · Matthew must publish the first clubhouse from Owner Studio.','preview');}
     gga.closeLogin();
    }catch(e){fail(e);}
   },fail));
   stops.push(fireMod.onSnapshot(fireMod.collection(db,'profiles'),{includeMetadataChanges:true},snap=>{
    if(ticket!==epoch||snap.metadata?.hasPendingWrites)return;
    for(const c of snap.docChanges()){if(c.type==='removed')profiles.delete(c.doc.id);else profiles.set(c.doc.id,c.doc.data());const p=s.players.find(p=>p.id===c.doc.id);if(p)applyProfile(p);}render();
   },fail));
  }catch(e){if(ticket===epoch){lastAuthError='ACCOUNT NOT AUTHORIZED · '+errorText(e);stop();$('#login-mode-note').textContent=lastAuthError;announce(lastAuthError,'error');await authMod.signOut(auth);}}
 });
 window.GGA_BACKEND_API={ownerAllowed,canPublishFirst:()=>ownerAllowed()&&revision===null};window.GGA_LOGIN_READY=true;loginMode();
 window.addEventListener('offline',()=>announce('OFFLINE · Changes are not confirmed. Reconnect before editing.','preview'));
 window.addEventListener('beforeunload',e=>{if(dirty||saving||pendingBackup){e.preventDefault();e.returnValue='';}});
}catch(e){const message='FIREBASE SETUP ERROR · '+String(e?.message||e).slice(0,200);announce(message,'error');const note=$('#login-mode-note');if(note)note.textContent=message;}


