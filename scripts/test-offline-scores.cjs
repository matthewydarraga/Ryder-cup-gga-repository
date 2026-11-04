const assert=require('node:assert/strict'),{create}=require('../offline-scores.js');
const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
(async()=>{
 let q=create({storage,key:'owner'});q.put('m',0,'A',null);q.put('m',0,'B',null);assert.equal(q.list().length,1);assert.equal(q.list()[0].expected,null);
 memory.set('owner',JSON.stringify(q.list().map(x=>({...x,status:'sending'}))));q=create({storage,key:'owner'});assert.equal(q.list()[0].status,'pending','Reload recovers an interrupted send');assert.equal(q.list()[0].winner,'B','reload retains edits');assert.equal(create({storage,key:'other-player'}).list().length,0);
 await q.flush(async()=>{throw Error('offline');});assert.equal(q.list()[0].status,'pending');
 await q.flush(async()=>{throw Object.assign(Error('new result'),{code:'score-conflict',latest:'A',latestVersion:7});});assert.equal(q.list()[0].status,'conflict');
 let sent=0;await q.flush(async()=>sent++);assert.equal(sent,0,'conflicts never replay automatically');assert.throws(()=>q.put('m',0,'A',null),/Review/);
 q.retry('m',0);assert.equal(q.list()[0].expected,'A');assert.equal(q.list()[0].version,7);await q.flush(async e=>{assert.equal(e.winner,'B');});assert.equal(q.list().length,0);
 q.put('old-lineup',1,'halve',null);await q.flush(async()=>{throw Object.assign(Error('removed'),{code:'score-blocked'});});assert.equal(q.list()[0].status,'blocked');await q.flush(async()=>sent++);assert.equal(sent,0);q.remove('old-lineup',1);
 q.put('m',2,null,'A',5);let release;const hold=new Promise(r=>release=r);const first=q.flush(async()=>hold);assert.throws(()=>q.put('m',2,'B','A'),/syncing/);await q.flush(async()=>sent++);release();await first;assert.equal(sent,0);assert.equal(q.list().length,0);
 const broken=create({storage:{getItem:()=>null,setItem:()=>{throw Error('full');}},key:'x'});assert.throws(()=>broken.put('m',0,'A',null),/full/);assert.equal(broken.list().length,0,'never claim persistence on quota failure');
 console.log('Durable score outbox checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
