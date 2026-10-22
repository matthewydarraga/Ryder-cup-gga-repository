/* GGA shared cloud adapter. This file remains dormant until Firebase is configured.
 * Never use browser-local PIN hashes as network authentication.
 * 2027 live scoring is in a private Firestore document, NOT the public draft document.
 */
const config=window.FIREBASE_CONFIG||{};
const gga=window.GGA;
const $=s=>document.querySelector(s);
const backendConfigured=!!window.GGA_BACKEND_CONFIGURED;
const announce=(text,kind='info')=>{
 let banner=$('#gga-cloud-state');
 if(!banner){banner=document.createElement('div');banner.id='gga-cloud-state';banner.className='gga-cloud-state';const shell=$('main.shell');shell?.insertBefore(banner,shell.children[1]||null);}
 banner.textContent=text;banner.dataset.kind=kind;
};
if(!backendConfigured){
 announce('FOUNDER PREVIEW · Secure member accounts and live syncing activate when Firebase is connected.','preview');
}else{
 announce('CONNECTING · Initializing secure GGA accounts and shared clubhouse…','loading');
 try{
 const [appMod,authMod,fireMod,fnMod,storeMod]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js'),
  import('https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js')
 ]);
 const app=appMod.initializeApp(config),auth=authMod.getAuth(app),db=fireMod.getFirestore(app),functions=fnMod.getFunctions(app,'us-central1'),storage=storeMod.getStorage(app);
 const publicRef=fireMod.doc(db,'public','clubhouse'),privateRef=fireMod.doc(db,'private','live2027');
 const fn=name=>fnMod.httpsCallable(functions,name);
 const getStatus=fn('accountStatus'),logIn=fn('signInWithPin'),claim=fn('claimPin'),bootstrap=fn('bootstrapOwner'),createInvite=fn('createInvite'),resetMember=fn('resetMemberPin');
 const s=gga.getState();let suppress=false,ownerReady=false,initialPublic=false,privateUnsubscribe=null,publishTimer=null,ready=false;
 let currentUid=null;const profileCache=new Map();
 const formatError=e=>String(e?.message||e||'Something went wrong').replace(/^FirebaseError:\s*/,'').replace(/functions\/[\w-]+/g,'').slice(0,230);
 function serialize(){
   const season2026=s.seasons.find(x=>x.year===2026),future=s.seasons.find(x=>x.year===2027);
   return {schemaVersion:3,updatedAt:fireMod.serverTimestamp(),
    players:s.players.map(p=>({id:p.id,name:p.name,username:p.username,football:p.football||null,position:p.position||'',officialPhoto:p.officialPhoto||null,officialPhotoFallback:p.officialPhotoFallback||null,handicap:p.handicap===null?null:Number(p.handicap),handicapChecked:p.handicapChecked||null,fantasyCharacterId:p.fantasyCharacterId||null})),
    season2026:season2026||null,
    season2027:future?{year:2027,location:future.location,date:future.date,teams:future.teams,roster:future.roster}:null,
    clubhouse:{...s.clubhouse,coverPath:s.clubhouse?.coverPath||null},
    draft2027:s.draft2027||{phase:'pre',picks:[]},
    handicapWeight:s.handicapWeight||70
   };
 }
 function patchIncoming(data){
   if(!data||!Array.isArray(data.players))return;
   suppress=true;
   try{
    const old=new Map(s.players.map(p=>[p.id,p])),season2026=s.seasons.find(x=>x.year===2026),season2027=s.seasons.find(x=>x.year===2027);
    s.players=data.players.map(p=>({...old.get(p.id),...p,customPhoto:old.get(p.id)?.customPhoto||null,ghinNumber:old.get(p.id)?.ghinNumber||'',fantasyCharacterId:profileCache.get(p.id)?.fantasyCharacterId??p.fantasyCharacterId}));
    if(data.season2026){if(season2026)Object.assign(season2026,data.season2026);else s.seasons.push(data.season2026);}
    if(data.season2027){if(season2027)Object.assign(season2027,{...data.season2027,rounds:season2027.rounds});else s.seasons.push(data.season2027);}
    if(data.clubhouse)s.clubhouse={...s.clubhouse,...data.clubhouse};
    if(data.draft2027){s.draft2027.phase=data.draft2027.phase;s.draft2027.picks.splice(0,s.draft2027.picks.length,...(data.draft2027.picks||[]));}
    if(data.handicapWeight!==undefined)s.handicapWeight=data.handicapWeight;
    gga.render();gga.save();
    loadCover();
   }finally{suppress=false;}
 }
 async function loadCover(){
  const path=s.clubhouse?.coverPath;
  if(!path){document.documentElement.style.removeProperty('--gga-hero-photo');document.documentElement.style.setProperty('--gga-default-cover-opacity','1');return;}
  try{const url=await storeMod.getDownloadURL(storeMod.ref(storage,path));if(s.clubhouse?.coverPath===path){document.documentElement.style.setProperty('--gga-hero-photo',`url("${url}")`);document.documentElement.style.setProperty('--gga-default-cover-opacity','0');}}catch(e){console.warn('GGA cover unavailable',e);}
 }
 const ownerAllowed=()=>ownerReady&&auth.currentUser?.uid===currentUid;
 async function publish(){
  if(!ownerAllowed())return;
  try{
   const doc=serialize(),year2027=s.seasons.find(x=>x.year===2027);
   await fireMod.setDoc(publicRef,doc);
   if(year2027)await fireMod.setDoc(privateRef,{year:2027,rounds:year2027.rounds||[],updatedAt:fireMod.serverTimestamp()});
   announce('LIVE CLUBHOUSE · 2027 draft and player updates sync across signed-in devices. 2027 match scoring is private to Matthew.','live');
  }catch(e){announce('SYNC ERROR · '+formatError(e),'error');}
 }
 window.GGA_AFTER_SAVE=()=>{
  if(suppress||!ownerAllowed()||!initialPublic)return;
  clearTimeout(publishTimer);publishTimer=setTimeout(publish,650);
 };
 const publicUnsub=fireMod.onSnapshot(publicRef,async snapshot=>{
  if(snapshot.exists()){initialPublic=true;patchIncoming(snapshot.data());announce('LIVE CLUBHOUSE · Draft, player profiles and archive are shared. PINs are verified securely.','live');}
  else if(ownerAllowed()&&!initialPublic){initialPublic=true;await publish();}
  else announce('CLOUD CONNECTED · Waiting for Matthew to publish the inaugural clubhouse.','preview');
 },e=>announce('Unable to receive shared data · '+formatError(e),'error'));
 const profilesUnsub=fireMod.onSnapshot(fireMod.collection(db,'profiles'),async snapshot=>{
  for(const change of snapshot.docChanges()){
   if(change.type==='removed')continue;
   const record=change.doc.data(),player=s.players.find(p=>p.id===change.doc.id);profileCache.set(change.doc.id,record);
   if(!player)continue;
   if(record.fantasyCharacterId)player.fantasyCharacterId=record.fantasyCharacterId;
   if(window.GGA_STRENGTHS?.valid(record.strengthOrder))player.strengthOrder=record.strengthOrder;
   if(record.photoPath){
    try{const url=await storeMod.getDownloadURL(storeMod.ref(storage,record.photoPath));if(s.players.find(p=>p.id===change.doc.id))s.players.find(p=>p.id===change.doc.id).customPhoto=url;}
    catch(e){console.warn('Profile photo unavailable',e);}
   }
  }
  suppress=true;gga.render();gga.save();suppress=false;
 },e=>console.warn('Profile updates not available',e));
 async function enablePrivate(){
  if(privateUnsubscribe){privateUnsubscribe();privateUnsubscribe=null;}
  if(!ownerAllowed())return;
  const snap=await fireMod.getDoc(privateRef);
  if(snap.exists()&&Array.isArray(snap.data().rounds)){
   suppress=true;const season=s.seasons.find(y=>y.year===2027);
   if(season)season.rounds=snap.data().rounds;
   gga.render();gga.save();suppress=false;
  }else if(initialPublic){await publish();}
  privateUnsubscribe=fireMod.onSnapshot(privateRef,snap=>{
   if(!snap.exists()||!Array.isArray(snap.data().rounds))return;
   suppress=true;const season=s.seasons.find(y=>y.year===2027);if(season)season.rounds=snap.data().rounds;
   gga.render();gga.save();suppress=false;
  },e=>console.warn('Private 2027 match sync failed',e));
 }
 authMod.onAuthStateChanged(auth,async user=>{
  if(!user){ownerReady=false;currentUid=null;window.GGA_BACKEND_AUTHORIZED=false;gga.setSignedIn('');if(privateUnsubscribe){privateUnsubscribe();privateUnsubscribe=null;}return;}
  try{
   const token=await user.getIdTokenResult(true),claims=token.claims;
   const username=claims.username||'';
   ownerReady=claims.owner===true&&username==='matthew.ydarraga';
   currentUid=user.uid;window.GGA_BACKEND_AUTHORIZED=ownerReady;
   gga.setSignedIn(username);
   $('#login-mask')?.classList.remove('open');
   if(ownerReady){
    const snap=await fireMod.getDoc(publicRef);if(!snap.exists()){initialPublic=true;await publish();}
    await enablePrivate();
   }
  }catch(e){ownerReady=false;window.GGA_BACKEND_AUTHORIZED=false;gga.setSignedIn('');announce('Account verification failed · '+formatError(e),'error');}
 });
 const profileSelect=$('#login-player');
 const inviteWrap=$('#gga-invite-wrap'),bootstrapWrap=$('#gga-owner-bootstrap-wrap'),submit=$('#login-submit'),note=$('#login-mode-note');
 async function refreshLogin(){
  const username=profileSelect.value;if(!username)return;
  inviteWrap.hidden=true;bootstrapWrap.hidden=true;
  note.textContent='Checking secure GGA account…';submit.disabled=true;
  try{
   const reply=await getStatus({username});if(username!==profileSelect.value)return;
   if(reply.data.claimed){submit.textContent='Sign in securely';note.textContent='Enter the 6–8 digit PIN for this player account.';}
   else if(username==='matthew.ydarraga'){bootstrapWrap.hidden=false;submit.textContent='Owner setup required';note.textContent='Matthew: sign in once with your verified Google account to activate your owner PIN.';}
   else{inviteWrap.hidden=false;submit.textContent='Create my private PIN';note.textContent='Enter the one-time invitation code Matthew provided, then choose your own 6–8 digit PIN.';}
   submit.disabled=username==='matthew.ydarraga'&&!reply.data.claimed;
  }catch(e){note.textContent='Could not check account status · '+formatError(e);submit.disabled=true;}
 }
 $('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
  const username=profileSelect.value,pin=$('#login-pin').value,invite=$('#gga-invite-code')?.value.trim();
  if(!/^\d{6,8}$/.test(pin)){gga.notify('Please enter a 6–8 digit PIN.');return;}
  submit.disabled=true;note.textContent='Verifying securely…';
  try{
   const status=await getStatus({username});
   const reply=status.data.claimed?await logIn({username,pin}):await claim({username,pin,inviteCode:invite});
   await authMod.signInWithCustomToken(auth,reply.data.token);
   gga.showTab('players');gga.notify('Secure sign-in successful.');
  }catch(e){note.textContent=formatError(e);gga.notify('Could not sign in: '+formatError(e));}
  finally{await refreshLogin();}
 },true);
 profileSelect.addEventListener('change',()=>{void refreshLogin()});
 $('#account-btn').addEventListener('click',()=>{
  if(!gga.getUser())setTimeout(refreshLogin,0);
 });
 document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-login-id],#login-as-player');if(btn)setTimeout(refreshLogin,0);
 },true);
 const ownerSetup=$('#gga-owner-bootstrap');
 ownerSetup?.addEventListener('click',async()=>{
  const pin=$('#login-pin').value;
  if(!/^\d{6,8}$/.test(pin)){gga.notify('Enter the 6–8 digit owner PIN you want to use, then click owner setup.');return;}
  try{
   const provider=new authMod.GoogleAuthProvider();
   const result=await authMod.signInWithPopup(auth,provider);
   const reply=await bootstrap({pin});
   await authMod.signInWithCustomToken(auth,reply.data.token);
   gga.notify('Matthew owner account activated. Keep your PIN private.');
  }catch(e){gga.notify('Owner activation failed: '+formatError(e));}
 });
 async function uploadPhoto(file,p){
  if(!auth.currentUser){gga.openLogin(p.id);return;}
  const result=await auth.currentUser.getIdTokenResult();
  if(!result.claims.owner&&result.claims.playerId!==p.id){gga.notify('You can update only your own profile photo.');return;}
  if(!file||!file.type.startsWith('image/')||file.size>12*1024*1024){gga.notify('Choose an image smaller than 12 MB.');return;}
  const url=URL.createObjectURL(file);
  try{
   const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Unsupported image'));i.src=url});
   const c=document.createElement('canvas');c.width=c.height=512;
   const ctx=c.getContext('2d');const edge=Math.min(img.naturalWidth,img.naturalHeight);
   ctx.drawImage(img,(img.naturalWidth-edge)/2,(img.naturalHeight-edge)/2,edge,edge,0,0,512,512);
   const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.82));
   if(!blob)throw Error('Could not convert your photo.');
   const path='profile-photos/'+p.id+'/avatar.jpg';
   await storeMod.uploadBytes(storeMod.ref(storage,path),blob,{contentType:'image/jpeg'});
   await fireMod.setDoc(fireMod.doc(db,'profiles',p.id),{photoPath:path,updatedAt:fireMod.serverTimestamp()},{merge:true});
   p.customPhoto=await storeMod.getDownloadURL(storeMod.ref(storage,path));
   gga.render();gga.notify('Profile picture updated for everyone.');
  }catch(e){gga.notify('Photo upload failed: '+formatError(e));}
  finally{URL.revokeObjectURL(url);}
 }
 window.GGA_SAVE_STRENGTHS=async(p,order)=>{
  if(!auth.currentUser||!window.GGA_STRENGTHS.valid(order))throw Error('Sign in and rank each skill once.');
  const token=await auth.currentUser.getIdTokenResult();
  if(token.claims.playerId!==p.id)throw Error('Only this player can set their strengths.');
  await fireMod.setDoc(fireMod.doc(db,'profiles',p.id),{strengthOrder:order,updatedAt:fireMod.serverTimestamp()},{merge:true});
 };
 window.GGA_UPLOAD_PHOTO=(file,p)=>void uploadPhoto(file,p);
 window.GGA_CHARACTER_UPDATED=async p=>{if(!auth.currentUser)return;try{const t=await auth.currentUser.getIdTokenResult();if(!t.claims.owner&&t.claims.playerId!==p.id)return;await fireMod.setDoc(fireMod.doc(db,'profiles',p.id),{fantasyCharacterId:p.fantasyCharacterId,updatedAt:fireMod.serverTimestamp()},{merge:true});}catch(e){gga.notify('Character selection did not sync: '+formatError(e));}};
 window.GGA_UPLOAD_BRANDING=async file=>{
  if(!ownerAllowed())return gga.notify('Matthew must sign in as owner to change the cover.');
  if(!file||!file.type.startsWith('image/')||file.size>12*1024*1024)return gga.notify('Choose a photo smaller than 12 MB.');
  const blob=await new Promise((resolve,reject)=>{const im=new Image(),url=URL.createObjectURL(file);im.onload=()=>{const canvas=document.createElement('canvas');const scale=Math.min(1,1800/im.naturalWidth);canvas.width=Math.round(im.naturalWidth*scale);canvas.height=Math.round(im.naturalHeight*scale);canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(resolve,'image/jpeg',.82);};im.onerror=()=>reject(Error('Could not open image'));im.src=url});
  if(!blob)return gga.notify('Unsupported image format.');
  try{const path='branding/cover.jpg';await storeMod.uploadBytes(storeMod.ref(storage,path),blob,{contentType:'image/jpeg'});s.clubhouse.coverPath=path;gga.save();await loadCover();gga.notify('2027 cover photo published to everyone.');}
  catch(e){gga.notify('Unable to publish cover image: '+formatError(e));}
 };
 async function inviteFor(username,reset=false){
  if(!ownerAllowed())return;
  try{
   const result=await (reset?resetMember:createInvite)({username});
   const code=result.data.code;
   const line=username+' · Invite code: '+code+' (expires in 72 hours)';
   const output=$('#gga-generated-invite');if(output){output.textContent=line;output.hidden=false;}
   try{await navigator.clipboard.writeText(line);gga.notify('Invitation code copied. Send it privately to this golfer.');}
   catch{gga.notify('Invitation created. Copy the code displayed in Owner Studio.');}
  }catch(e){gga.notify('Could not create invitation: '+formatError(e));}
 }
 document.addEventListener('click',event=>{
  const invite=event.target.closest('[data-cloud-invite]'),reset=event.target.closest('[data-cloud-reset]');
  if(!invite&&!reset)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  if(reset&&!confirm('Reset this player’s server PIN? They will need a new invitation code.'))return;
  void inviteFor((invite||reset).dataset.cloudInvite||(invite||reset).dataset.cloudReset,!!reset);
 },true);
 window.GGA_CLOUD_SIGNOUT=async()=>{await authMod.signOut(auth);gga.showTab('home');};
 window.GGA_BACKEND_API={inviteFor,ownerAllowed,uploadPhoto};
 $('#gga-cloud-state')?.addEventListener('click',()=>{});
 window.GGA_LOGIN_READY=true;ready=true;announce('CLOUD CONNECTED · Member sign-in secured; loading shared data…','live');
 }catch(e){
  announce('CLOUD SETUP ERROR · '+String(e?.message||e).slice(0,180),'error');
  console.error('GGA cloud failed to load',e);
 }
}
