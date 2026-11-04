'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{makeChange}=require('../lineup-tools.js'),b=require('../backup-core.js'),{fixture}=require('./test-backups.cjs');
(async()=>{
 const f=fixture(),cup=f.state.liveCup,m=cup.rounds[0].matches[0],request={roundId:'practice-round',matchId:m.id,before:{a:m.a,b:m.b},a:[f.ids[2]],b:[f.ids[3]],points:{front:1,back:1,match:1},policy:'retain',reason:'Player unavailable'},holes=Array(18).fill(null);holes[0]='halve';holes[5]='B';
 const options={holes,actor:'matthew.ydarraga',newId:'new-match',players:f.ids};
 const next=makeChange(cup,request,options);assert.deepEqual(next.replacement.holes,holes);assert.equal(next.record.reason,request.reason);assert.deepEqual(next.record.before.a,m.a);assert.deepEqual(next.record.before.holes,holes);assert.equal(cup.lineupHistory,undefined,'Pure plan never mutates original');
 const reset=makeChange(cup,{...request,policy:'fresh'},options);assert(reset.replacement.holes.every(h=>h===null));assert.deepEqual(reset.record.before.holes,holes);
 for(const size of [1,2,3,4]){const base=b.clone(cup),old=base.rounds[0].matches[0];old.a=f.ids.slice(0,size);old.b=f.ids.slice(size,size*2);const a=f.ids.slice(1,size+1),bb=f.ids.slice(size+1,size*2+1);const result=makeChange(base,{...request,before:{a:old.a,b:old.b},a,b:bb},options);assert.equal(result.replacement.a.length,size);}
 assert.throws(()=>makeChange(cup,{...request,policy:''},options),/Choose whether/);assert.throws(()=>makeChange(cup,{...request,reason:'  '},options),/Choose whether/);
 assert.throws(()=>makeChange(cup,request,{...options,actor:'michael.rodriguez'}),/Only Matthew/);
 assert.throws(()=>makeChange(cup,request,{...options,newId:m.id}),/fresh match/);
 assert.throws(()=>makeChange(cup,{...request,a:[f.ids[2]],b:[f.ids[2]]},options),/different known/);
 assert.throws(()=>makeChange(cup,{...request,before:{a:[],b:[]}},options),/lineup changed/);
 const withOther=b.clone(cup);withOther.rounds[0].matches.push({id:'other',a:[f.ids[2]],b:[f.ids[4]],holes:Array(18).fill(null)});assert.throws(()=>makeChange(withOther,request,options),/one matchup/);
 const repeated=makeChange(next.cup,{...request,matchId:'new-match',before:{a:request.a,b:request.b},a:[f.ids[4]],b:[f.ids[5]],policy:'fresh'}, {...options,newId:'third-match'});assert.equal(repeated.cup.lineupHistory.length,2);assert.equal(repeated.replacement.lineageId,m.id);
 const payload={state:{...f.state,liveCup:repeated.cup},profiles:{},liveScores:[],liveMatches:[],sourceRevision:7};const backup=await b.create(payload,f.state.players,'gga-ryder-cup');const parsed=await b.parse(JSON.stringify(backup),f.state.players,'gga-ryder-cup');const restored=b.restorePlan(parsed,f.state.players,()=> 'restored-id');assert.deepEqual(restored.state.liveCup.lineupHistory,repeated.cup.lineupHistory);assert.equal(restored.state.liveCup.rounds[0].matches[0].lineageId,m.id);
 // Browser handlers: no default decision; cancelled/missing-choice changes do nothing.
 const state=b.clone(f.state),handlers={},panel={addEventListener:(k,v)=>handlers[k]=v};let owner=true,confirmed=true,saves=0,notice='';
 const win={GGA:{getState:()=>state,isOwner:()=>owner,getUser:()=>state.players[0],player:id=>state.players.find(p=>p.id===id),save:()=>saves++,notify:x=>notice=x},GGA_RESULTS:require('../results-core.js'),GGA_LINEUP:require('../lineup-tools.js'),GGA_LIVE_RESULTS:new Map([[m.id+'_0','halve'],[m.id+'_1',null]])};
 vm.runInNewContext(fs.readFileSync('live-scoring.js','utf8'),{window:win,document:{createElement:()=>panel,querySelector:()=>({appendChild(){}})},crypto:require('node:crypto').webcrypto,confirm:()=>confirmed,FormData:class{constructor(f){this.values=f.values}get(k){return this.values[k]??null}}});
 const values={format:'1',A0:f.ids[2],B0:f.ids[3],'points-front':1,'points-back':1,'points-match':1,'lineup-policy':'retain','lineup-reason':'Sub <script> test'};
 const submit=(id,vals)=>handlers.submit({preventDefault(){},target:{dataset:{liveAdd:'practice-round',edit:id},values:vals}});
 await submit(m.id,{...values,'lineup-policy':''});assert.equal(saves,0);assert.match(notice,/Choose whether/);
 confirmed=false;await submit(m.id,values);assert.equal(saves,0);confirmed=true;
 handlers.click({target:{closest:()=>({dataset:{liveMode:'test'},hasAttribute:()=>false})}});handlers.click({target:{closest:()=>({dataset:{liveOpen:m.id},hasAttribute:()=>false})}});
 await submit(m.id,values);assert.equal(saves,1);const changed=state.liveCup.rounds[0].matches[0];assert.equal(changed.holes[0],'halve');assert.equal(changed.holes[1],null);assert(panel.innerHTML.includes('Lineup history (1 change)'));assert(panel.innerHTML.includes('&lt;script&gt;'));
 owner=false;await submit(changed.id,{...values,A0:f.ids[5]});assert.equal(saves,1);
 console.log('PASS: 1v1–4v4 substitutions, explicit keep/fresh decision and reason, cancellation, owner gating, latest/cleared score carryover, fresh ID, old scorecard/history, repeated lineage, escaped audit UI and complete-backup round trip');
})().catch(e=>{console.error(e);process.exitCode=1;});
