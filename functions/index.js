'use strict';
/**
 * GGA invitation-only member sign-in. All PIN verification is SERVER-SIDE.
 * PINs are stored as salted scrypt hashes; Firestore rules protect the
 * account and invite collections. No privileged credentials go in web files.
 */
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');
const {randomBytes,scryptSync,timingSafeEqual,createHash}=require('node:crypto');
admin.initializeApp();
const db=admin.firestore();
const OWNER='matthew.ydarraga';
const playerNames=[
 'matthew.ydarraga','michael.rodriguez','jake.norris','brandon.durman','will.parker',
 'ryan.higgins','jordan.mcneely','reid.mixon','zach.cousar','jack.abraham',
 'peyton.braswell','nate.cox','kody.russey'
];
const allowed=new Set(playerNames);
const ownerEmail=(process.env.GGA_OWNER_EMAIL||'').trim().toLowerCase();
const opts={region:'us-central1',maxInstances:12,memory:'256MiB'};
const userId=username=>'gga-'+username.replace(/[^a-z0-9]/g,'-');
const playerId=username=>'player-'+username.replace(/\./g,'-');
const norm=x=>String(x||'').trim().toLowerCase();
const safeUser=x=>{const username=norm(x);if(!allowed.has(username))throw new HttpsError('invalid-argument','Unknown GGA member.');return username;};
const validPin=p=>typeof p==='string'&&/^\d{6,8}$/.test(p);
const randomCode=()=>randomBytes(12).toString('hex').toUpperCase();
const sha=s=>createHash('sha256').update(s).digest('hex');
const hashPin=(pin,salt)=>scryptSync(pin,salt,64,{N:16384,r:8,p:1}).toString('hex');
function verify(pin,record){
 if(typeof record.salt!=='string'||typeof record.pinHash!=='string')return false;
 const h=Buffer.from(hashPin(pin,record.salt),'hex'),stored=Buffer.from(record.pinHash,'hex');
 return h.length===stored.length&&timingSafeEqual(h,stored);
}
const account=username=>db.collection('accounts').doc(username);
const requireOwner=async req=>{
 if(!req.auth||req.auth.token.owner!==true||req.auth.token.username!==OWNER)throw new HttpsError('permission-denied','Owner access required.');
 const snap=await account(OWNER).get();
 if(!snap.exists||snap.data().uid!==req.auth.uid)throw new HttpsError('permission-denied','Owner account inactive.');
};
const credentials=(username,pin)=>({username,pinHash:hashPin(pin,randomBytes(16).toString('hex'))});
// Public account presence can be checked for a known roster username only.
exports.accountStatus=onCall(opts,async req=>{
 const username=safeUser(req.data?.username);
 const snap=await account(username).get();
 return {claimed:snap.exists,ownerSetupAvailable:username===OWNER&&!snap.exists};
});
exports.bootstrapOwner=onCall(opts,async req=>{
 if(!ownerEmail||ownerEmail==='owner-google-email@example.com')throw new HttpsError('failed-precondition','Owner Google email is not configured on the server.');
 if(!req.auth||!req.auth.token.email_verified||norm(req.auth.token.email)!==ownerEmail)throw new HttpsError('permission-denied','Sign in using the verified Google account authorized as GGA owner.');
 const pin=String(req.data?.pin||'');
 if(!validPin(pin))throw new HttpsError('invalid-argument','Use a 6–8 digit PIN.');
 const ref=account(OWNER),snap=await ref.get();
 if(snap.exists)throw new HttpsError('already-exists','Owner PIN already activated. Use owner sign-in or approved recovery.');
 const salt=randomBytes(16).toString('hex'),uid=req.auth.uid;
 await db.runTransaction(async tx=>{
   const current=await tx.get(ref);if(current.exists)throw new HttpsError('already-exists','Owner already active.');
   tx.create(ref,{uid,playerId:playerId(OWNER),role:'owner',pinHash:hashPin(pin,salt),salt,failedAttempts:0,lockedUntil:0,createdAt:admin.firestore.FieldValue.serverTimestamp()});
 });
 await admin.auth().setCustomUserClaims(uid,{username:OWNER,playerId:playerId(OWNER),owner:true});
 const token=await admin.auth().createCustomToken(uid,{username:OWNER,playerId:playerId(OWNER),owner:true});
 return {token};
});
exports.createInvite=onCall(opts,async req=>{
 await requireOwner(req);
 const username=safeUser(req.data?.username);
 if(username===OWNER)throw new HttpsError('failed-precondition','Owner setup requires a verified Google account.');
 if((await account(username).get()).exists)throw new HttpsError('already-exists','Member already has a PIN. Reset it first.');
 const code=randomCode(),expiresAt=Date.now()+72*3600000;
 await db.collection('invites').doc(username).set({digest:sha(code),expiresAt,issuedAt:admin.firestore.FieldValue.serverTimestamp(),issuedBy:req.auth.uid,used:false});
 return {code,username,expiresAt};
});
exports.claimPin=onCall(opts,async req=>{
 const username=safeUser(req.data?.username),pin=String(req.data?.pin||''),code=String(req.data?.inviteCode||'').trim().toUpperCase();
 if(username===OWNER)throw new HttpsError('permission-denied','Owner account is activated separately.');
 if(!validPin(pin)||!/^[A-F0-9]{24}$/.test(code))throw new HttpsError('invalid-argument','A 6–8 digit PIN and valid invitation code are required.');
 const ref=account(username),inviteRef=db.collection('invites').doc(username);
 const salt=randomBytes(16).toString('hex'),uid=userId(username);
 await db.runTransaction(async tx=>{
   const [existing,invite]=await Promise.all([tx.get(ref),tx.get(inviteRef)]);
   if(existing.exists)throw new HttpsError('already-exists','Member is already claimed.');
   if(!invite.exists||invite.data().used||invite.data().expiresAt<Date.now()||invite.data().digest!==sha(code))throw new HttpsError('permission-denied','Invalid or expired invitation. Contact Matthew.');
   tx.create(ref,{uid,playerId:playerId(username),role:'player',pinHash:hashPin(pin,salt),salt,failedAttempts:0,lockedUntil:0,createdAt:admin.firestore.FieldValue.serverTimestamp()});
   tx.update(inviteRef,{used:true,usedAt:admin.firestore.FieldValue.serverTimestamp()});
 });
 try{await admin.auth().createUser({uid,displayName:username});}
 catch(e){if(e.code!=='auth/uid-already-exists')throw e;}
 const token=await admin.auth().createCustomToken(uid,{username,playerId:playerId(username),owner:false});
 return {token};
});
exports.signInWithPin=onCall(opts,async req=>{
 const username=safeUser(req.data?.username),pin=String(req.data?.pin||'');
 if(!validPin(pin))throw new HttpsError('invalid-argument','PIN must contain 6–8 digits.');
 const ref=account(username);const current=await ref.get();
 if(!current.exists)throw new HttpsError('not-found','No PIN registered. Ask Matthew for a member invitation.');
 const record=current.data();
 if((record.lockedUntil||0)>Date.now())throw new HttpsError('resource-exhausted','Too many failed attempts. Try again later.');
 if(!verify(pin,record)){
   await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);if(!snap.exists)return;
    const prev=snap.data(),count=(prev.failedAttempts||0)+1;
    tx.update(ref,{failedAttempts:count,lockedUntil:count>=5?Date.now()+30*60000:0});
   });
   throw new HttpsError('unauthenticated','Incorrect PIN.');
 }
 await ref.update({failedAttempts:0,lockedUntil:0,lastLogin:admin.firestore.FieldValue.serverTimestamp()});
 const token=await admin.auth().createCustomToken(record.uid,{username,playerId:record.playerId,owner:username===OWNER});
 return {token};
});
exports.resetMemberPin=onCall(opts,async req=>{
 await requireOwner(req);const username=safeUser(req.data?.username);
 if(username===OWNER)throw new HttpsError('permission-denied','Owner recovery requires verified Google identity.');
 const current=await account(username).get();
 if(current.exists){
   await account(username).delete();
   try{await admin.auth().deleteUser(current.data().uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
 }
 const code=randomCode(),expiresAt=Date.now()+72*3600000;
 await db.collection('invites').doc(username).set({digest:sha(code),expiresAt,issuedBy:req.auth.uid,used:false});
 return {code,username,expiresAt};
});
exports.changeMyPin=onCall(opts,async req=>{
 if(!req.auth?.token.username)throw new HttpsError('unauthenticated','Sign in first.');
 const username=safeUser(req.auth.token.username),oldPin=String(req.data?.oldPin||''),newPin=String(req.data?.newPin||'');
 if(!validPin(newPin))throw new HttpsError('invalid-argument','Use a 6–8 digit PIN.');
 const ref=account(username),snap=await ref.get();
 if(!snap.exists||snap.data().uid!==req.auth.uid||!verify(oldPin,snap.data()))throw new HttpsError('permission-denied','Current PIN incorrect.');
 const salt=randomBytes(16).toString('hex');
 await ref.update({pinHash:hashPin(newPin,salt),salt,failedAttempts:0,lockedUntil:0});
 return {ok:true};
});
