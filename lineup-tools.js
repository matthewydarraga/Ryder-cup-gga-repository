/* Project Revamp — Step 2: explicit substitutions, score generations and audit history. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x),legacy={front:0,back:0,match:1};
function makeChange(cup,request,{holes,actor,newId,at=new Date().toISOString(),revision=null,players,roster={}}){
 const r=cup.rounds.find(r=>r.id===request.roundId),m=r?.matches.find(m=>m.id===request.matchId);if(!m)throw Error('This matchup changed or was removed. Reopen it before editing.');
 if(!same(m.a,request.before?.a)||!same(m.b,request.before?.b))throw Error('The lineup changed. Reopen the match before editing.');
 const a=request.a,b=request.b,p=request.points,ids=[...(a||[]),...(b||[])];
 if(!Array.isArray(a)||!Array.isArray(b)||a.length<1||a.length>4||a.length!==b.length||new Set(ids).size!==ids.length||ids.some(id=>!players.includes(id)))throw Error('Choose a different known golfer for every slot.');
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
