/* Deterministic model projections. See PROJECT_REVAMP.md for assumptions. */
(function(root){'use strict';
const results=typeof module!=='undefined'?require('./results-core.js'):root.GGA_RESULTS;
const formats={'match-play':'Match play','best-ball':'Best ball',scramble:'Scramble',shamble:'Shamble','alternate-shot':'Alternate shot'};
const formatKey=value=>Object.hasOwn(formats,value)?value:'match-play';
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=-10&&n<=54;
const median=values=>{const xs=values.filter(valid).sort((a,b)=>a-b),i=Math.floor(xs.length/2);return xs.length?(xs[i]+xs[Math.floor((xs.length-1)/2)])/2:0;};
function validSnapshot(s,m){
 if(!s||s.version!==1||!valid(s.fieldMedian)||!s.players||typeof s.players!=='object'||Array.isArray(s.players))return false;
 const ids=[...m.a,...m.b];
 return Object.keys(s.players).length===ids.length&&ids.every(id=>Object.hasOwn(s.players,id)&&(s.players[id]===null||valid(s.players[id])));
}
function snapshot(match,lookup,field,prior){
 const players=Object.fromEntries([...match.a,...match.b].map(id=>{
  const n=prior&&Object.hasOwn(prior.players,id)?prior.players[id]:lookup(id);
  return [id,valid(n)?n:null];
 }));
 return {version:1,players,fieldMedian:prior?.fieldMedian??median(field)};
}
function holeOdds(a,b,format,fieldMedian){
 const key=formatKey(format),known=[...a,...b].filter(valid).length;
 const baseline=fieldMedian??median([...a,...b]);
 const side=values=>{
  if(!values.length)return baseline;
  const xs=values.map(n=>valid(n)?n:baseline).sort((a,b)=>a-b);
  const avg=xs.reduce((sum,n)=>sum+n,0)/xs.length;
  if(xs.length===1||key==='match-play')return avg;
  if(key==='alternate-shot')return avg+.15*(xs.at(-1)-avg);
  const decay={'best-ball':.50,scramble:.65,shamble:.78}[key];
  const weights=xs.map((_,i)=>decay**i);
  return xs.reduce((sum,n,i)=>sum+n*weights[i],0)/weights.reduce((sum,n)=>sum+n,0);
 };
 const edge=known?Math.max(-2,Math.min(2,(side(b)-side(a))*Math.sqrt(known/(a.length+b.length))/18)):0;
 const tie=a.length===1&&b.length===1?.30:({'match-play':.30,'best-ball':.34,scramble:.38,shamble:.34,'alternate-shot':.27}[key]);
 const split=1/(1+Math.exp(-edge));
 return {a:(1-tie)*split,b:(1-tie)*(1-split),tie,known};
}
const add=(map,key,p)=>map.set(key,(map.get(key)||0)+p);
function margins(c,p){
 let dist=new Map([[c.lead,1]]);
 for(let i=0;i<c.remaining;i++){
  const next=new Map();
  for(const [lead,q] of dist){add(next,lead+1,q*p.a);add(next,lead-1,q*p.b);add(next,lead,q*p.tie);}
  dist=next;
 }
 return dist;
}
const fraction=lead=>lead>0?1:lead<0?0:.5;
function outcomes(dist,total){
 const out={a:0,b:0,tie:0};
 for(const [units,p] of dist)out[2*units>total?'a':2*units<total?'b':'tie']+=p;
 return out;
}
function project(holes,points,p,{final=false}={}){
 const scored=results.score(holes,points),fixed=scored.filter(c=>c.settled);
 const secured=fixed.reduce((n,c)=>n+c.a*4,0);
 const unresolved=final?scored.filter(c=>!c.settled).reduce((n,c)=>n+c.points*4,0):0;
 const total=scored.reduce((n,c)=>n+c.points*4,0);
 const pending=final?[]:scored.filter(c=>!c.settled),dist=new Map();
 if(!pending.length)dist.set(0,1);
 else{
  // The same two nine-hole margins decide all three contests.
  const front=margins(results.contest(holes.slice(0,9)),p),back=margins(results.contest(holes.slice(9)),p);
  for(const [f,pf] of front)for(const [b,pb] of back){
   const margin={front:f,back:b,match:f+b};
   const units=pending.reduce((n,c)=>n+fraction(margin[c.key])*c.points*4,0);
   add(dist,units,pf*pb);
  }
 }
 return {...outcomes(new Map([...dist].map(([n,q])=>[n+secured,q])),total-unresolved),secured,total:total-unresolved,unresolved,dist,settled:!pending.length};
}
function cup(matches){
 const secured=matches.reduce((n,m)=>n+m.secured,0),total=matches.reduce((n,m)=>n+m.total,0);
 let dist=new Map([[secured,1]]);
 for(const m of matches){
  if(m.settled)continue;
  const next=new Map();
  for(const [n,p] of dist)for(const [k,q] of m.dist)add(next,n+k,p*q);
  dist=next;
 }
 return {...outcomes(dist,total),total,unresolved:matches.reduce((n,m)=>n+(m.unresolved||0),0),settled:matches.every(m=>m.settled)};
}
const api={formats,formatKey,validSnapshot,snapshot,holeOdds,project,cup};
if(typeof module!=='undefined')module.exports=api;else root.GGA_PREDICTIONS=api;
})(typeof window==='undefined'?globalThis:window);
