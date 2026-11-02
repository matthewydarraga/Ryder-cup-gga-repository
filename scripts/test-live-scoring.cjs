const assert=require('node:assert/strict');
const {score,predict}=require('../live-scoring.js');
const empty=()=>Array(18).fill(null);
assert(score(empty()).every(s=>!s.settled));
assert.deepEqual(score(Array(18).fill('halve')).map(s=>[s.a,s.b]),[[.5,.5]]);
assert.deepEqual(score([...Array(9).fill('A'),...Array(9).fill('B')]).map(s=>[s.a,s.b]),[[.5,.5]]);
const early=score([...Array(10).fill('A'),...Array(8).fill(null)]);
assert.equal(early[0].a,1);
assert.equal(score([...Array(9).fill('A'),...Array(9).fill(null)])[0].settled,false);
for(let n=0;n<100;n++){
 const holes=Array.from({length:18},()=>['A','B','halve'][Math.floor(Math.random()*3)]);
 const s=score(holes);assert.equal(s.reduce((n,x)=>n+x.a+x.b,0),1);
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

for(const size of [1,2,3,4]){owner=true;state.players=Array.from({length:size*2},(_,i)=>({id:'p'+i,name:'p'+i}));submit({id:'live-round-form',values:{title:'Size '+size}});const round=state.liveCup.rounds.at(-1),values={format:String(size)};for(let i=0;i<size;i++){values['A'+i]='p'+i;values['B'+i]='p'+(i+size);}submit({dataset:{liveAdd:round.id},values});assert.equal(round.matches[0].a.length,size);assert.equal(round.matches[0].b.length,size);}
const p=predict(empty(),[{handicap:5}],[{handicap:20}]);assert(p.a>p.b);assert(Math.abs(p.a+p.b+p.tie-1)<1e-9);
const neutral=predict(empty(),[{}],[{}]);assert(Math.abs(neutral.a-neutral.b)<1e-9);
const done=predict(Array(18).fill('A'),[{handicap:54}],[{handicap:0}]);assert.equal(done.a,1);
assert(predict(['A',...Array(17).fill(null)],[{}],[{}]).a>neutral.a);
console.log('PASS: 1v1–4v4, one-point totals, rating and score predictions, missing ratings and settled results');
