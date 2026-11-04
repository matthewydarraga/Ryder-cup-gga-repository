/* Durable per-account score outbox. Confirmed results stay separate from pending edits. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.GGA_OFFLINE=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 function create({storage,key,onChange=()=>{}}){
  let items=[];const raw=storage.getItem(key);if(raw){const data=JSON.parse(raw);if(!Array.isArray(data)||data.some(x=>!x||typeof x.id!=='string'||!Number.isInteger(x.hole)||x.hole<0||x.hole>17||![null,'A','B','halve'].includes(x.winner)||![null,'A','B','halve'].includes(x.expected)))throw Error('Stored score queue is unreadable. Keep this browser data and contact Matthew.');items=data.map(x=>({...x,status:x.status==='sending'?'pending':x.status}));}
  let running=false;
  const save=next=>{storage.setItem(key,JSON.stringify(next));items=next;onChange();};
  const list=()=>items.map(x=>({...x}));
  function put(id,hole,winner,expected,version=null){
   const prior=items.find(x=>x.id===id&&x.hole===hole);
   if(prior?.status==='sending')throw Error('This hole is syncing. Wait before correcting it.');
   if(prior?.status==='conflict')throw Error('Review the queued conflict before editing this hole.');
   const entry={id,hole,winner,expected:prior?prior.expected:expected,version:prior?prior.version:version,status:'pending',createdAt:prior?.createdAt||Date.now()};
   save([...items.filter(x=>x.id!==id||x.hole!==hole),entry]);return entry;
  }
  function remove(id,hole){if(items.some(x=>x.id===id&&x.hole===hole&&x.status==='sending'))throw Error('Wait for this score to finish syncing.');save(items.filter(x=>x.id!==id||x.hole!==hole));}
  function retry(id,hole){save(items.map(x=>x.id===id&&x.hole===hole?{...x,expected:x.latest,version:x.latestVersion,status:'pending',message:''}:x));}
  async function flush(send){
   if(running)return;running=true;
   try{for(const entry of list()){
    if(entry.status==='conflict'||entry.status==='blocked')continue;
    const current=items.find(x=>x.id===entry.id&&x.hole===entry.hole);if(!current)continue;
    save(items.map(x=>x===current?{...x,status:'sending'}:x));
    try{await send(entry);save(items.filter(x=>x.id!==entry.id||x.hole!==entry.hole));}
    catch(e){const status=e.code==='score-conflict'?'conflict':e.code==='score-blocked'||e.code==='permission-denied'?'blocked':'pending';
     save(items.map(x=>x.id===entry.id&&x.hole===entry.hole?{...x,status,message:String(e.message||e).slice(0,200),latest:e.latest??null,latestVersion:e.latestVersion??null}:x));
     if(status==='pending')break;
    }
   }}finally{running=false;}
  }
  return{list,put,remove,retry,flush};
 }
 return{create};
});
