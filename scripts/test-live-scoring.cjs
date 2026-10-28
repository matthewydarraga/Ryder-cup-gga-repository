const assert=require('node:assert/strict');
const {score}=require('../live-scoring.js');
const empty=()=>Array(18).fill(null);
assert(score(empty()).every(s=>!s.settled));
assert.deepEqual(score(Array(18).fill('halve')).map(s=>[s.a,s.b]),[[.5,.5],[.5,.5],[.5,.5]]);
assert.deepEqual(score([...Array(9).fill('A'),...Array(9).fill('B')]).map(s=>[s.a,s.b]),[[1,0],[0,1],[.5,.5]]);
const early=score([...Array(10).fill('A'),...Array(8).fill(null)]);
assert.equal(early[0].a,1);assert.equal(early[2].a,1);assert.equal(early[1].settled,false);
assert.equal(score([...Array(9).fill('A'),...Array(9).fill(null)])[2].settled,false);
for(let n=0;n<100;n++){
 const holes=Array.from({length:18},()=>['A','B','halve'][Math.floor(Math.random()*3)]);
 const s=score(holes);assert.equal(s.reduce((n,x)=>n+x.a+x.b,0),3);
 const flipped=score(holes.map(x=>x==='A'?'B':x==='B'?'A':x));
 assert.deepEqual(s.map(x=>x.a),flipped.map(x=>x.b));
}
// Exercise form handlers without creating accounts or changing live tournament data.
const vm=require('node:vm'),fs=require('node:fs');
let owner=true,notice='',saved=0;const handlers={},panel={addEventListener:(t,f)=>handlers[t]=f};
const state={players:['a','b','c','d'].map(id=>({id,name:id})),seasons:[{year:2027,roster:{}}]};
const g={getState:()=>state,isOwner:()=>owner,player:id=>state.players.find(p=>p.id===id),save:()=>saved++,notify:x=>notice=x};
vm.runInNewContext(fs.readFileSync(require.resolve('../live-scoring.js'),'utf8'),{window:{GGA:g},document:{createElement:()=>panel,querySelector:()=>({appendChild(){}})},crypto:require('node:crypto').webcrypto,FormData:class{constructor(f){this.f=f}get(k){return this.f.values[k]}}});
const submit=f=>handlers.submit({preventDefault(){},target:f});
submit({id:'live-round-form',values:{title:'Morning'}});const r=state.liveCup.rounds[0];assert(r);
submit({dataset:{liveAdd:r.id},values:{format:'2',A0:'a',A1:'b',B0:'c',B1:'d'}});assert.equal(r.matches.length,1);
submit({dataset:{liveAdd:r.id},values:{format:'1',A0:'a',B0:'c'}});assert.equal(r.matches.length,1);assert(notice.includes('one matchup'));
handlers.click({target:{closest:()=>({dataset:{liveStart:r.id}})}});assert(r.started);
handlers.change({target:{dataset:{liveRound:r.id,liveMatch:r.matches[0].id,liveHole:'0'},value:'A'}});assert.equal(r.matches[0].holes[0],'A');
owner=false;const before=saved;handlers.change({target:{dataset:{liveRound:r.id,liveMatch:r.matches[0].id,liveHole:'0'},value:'B'}});assert.equal(saved,before);assert.equal(r.matches[0].holes[0],'A');
console.log('PASS: scoring, ties, early clinches, 2v2 setup, duplicate prevention, start, score update, owner gating');
