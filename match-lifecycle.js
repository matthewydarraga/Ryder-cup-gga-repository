/* Spark match lifecycle. Every transition and its immutable audit record commit together. */
(function(root){'use strict';
const initial=()=>({status:'live',revision:0,generation:0,confirmed:[]});
function transition(previous,action,{owner,playerId,participants,reason=''}){
 const s=previous||initial(),next={...s,confirmed:[...s.confirmed],revision:s.revision+1,reason:''};
 if(action==='submit'&&s.status==='live'&&(owner||participants.includes(playerId))){next.status='awaiting';next.confirmed=[];}
 else if(action==='confirm'&&s.status==='awaiting'&&participants.includes(playerId)&&!s.confirmed.includes(playerId)){next.confirmed.push(playerId);}
 else if(action==='finalize'&&owner&&s.status==='awaiting'&&participants.every(p=>s.confirmed.includes(p))){next.status='final';}
 else if(action==='reopen'&&owner&&['awaiting','final'].includes(s.status)&&reason.trim()&&reason.trim().length<=500){next.status='live';next.generation++;next.confirmed=[];next.reason=reason.trim();}
 else throw Error('This action is no longer available. Review the match and confirmations.');
 return next;
}
function createAPI({sdk,db,session,assertReady}){return async(id,action,reason='',expectedRevision=0)=>{
 assertReady();const who=session();
 return sdk.runTransaction(db,async tx=>{
  const ref=sdk.doc(db,'matchStates',id),meta=await tx.get(sdk.doc(db,'liveMatches',id)),snap=await tx.get(ref);
  if(!who||session()?.uid!==who.uid||!meta.exists()||!meta.data().active||!meta.data().started)throw Error('Match or account changed. Reopen the match.');
  const m=meta.data(),before=snap.exists()?snap.data():null;
  if((before?.revision??0)!==expectedRevision)throw Error('The match state changed. Review the latest scorecard before confirming.');
  const next=transition(before,action,{owner:who.owner,playerId:who.playerId,participants:[...m.a,...m.b],reason});
  const d={...next,matchId:id,actor:who.playerId,updatedAt:sdk.serverTimestamp()};
  tx.set(ref,d);tx.set(sdk.doc(db,'matchAudit',id+'_'+next.revision),{...d,action});return d;
 });
};}
const api={initial,transition,createAPI};if(typeof module!=='undefined')module.exports=api;else root.GGA_LIFECYCLE=api;
})(typeof window==='undefined'?globalThis:window);
