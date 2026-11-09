/* Project Revamp — Step 3: one read-only results model for every consumer. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),LIVE_LEGACY={front:0,back:0,match:1},ARCHIVE={front:1,back:1,match:2};
function effectiveHoles(m,overlay){return Array.from({length:18},(_,i)=>overlay?.has(m.id+'_'+i)?overlay.get(m.id+'_'+i):m.holes?.[i]??null);}
function materializeCup(cup,overlay){const next=clone(cup);for(const r of next.rounds||[])for(const m of r.matches||[])m.holes=effectiveHoles(m,overlay);return next;}
function contest(holes){const played=holes.filter(h=>['A','B','halve'].includes(h)).length,lead=holes.reduce((n,h)=>n+(h==='A'?1:h==='B'?-1:0),0),remaining=holes.length-played,settled=remaining===0||Math.abs(lead)>remaining;return {played,lead,remaining,settled,a:settled?(lead>0?1:lead<0?0:.5):0,b:settled?(lead<0?1:lead>0?0:.5):0};}
function score(holes,points=LIVE_LEGACY,manualWinner=null){
 const manual=!holes.some(h=>['A','B','halve'].includes(h))&&['A','B','halve'].includes(manualWinner);
 return [['front',holes.slice(0,9)],['back',holes.slice(9,18)],['match',holes]].filter(([key])=>points[key]>0).map(([key,hs])=>{let c=contest(hs);if(manual&&key==='match')c={...c,settled:true,a:manualWinner==='A'?1:manualWinner==='halve'?.5:0,b:manualWinner==='B'?1:manualWinner==='halve'?.5:0};return {...c,key,points:points[key],a:c.a*points[key],b:c.b*points[key]};});
}
function describe(m,r,{live,overlay,roster}){
 const a=(m.a||[]).filter(Boolean),b=(m.b||[]).filter(Boolean),holes=effectiveHoles(m,overlay),weights=live?(m.points||LIVE_LEGACY):ARCHIVE,contests=score(holes,weights,live?null:m.manualWinner),full=contest(holes),manual=!holes.some(h=>h!==null)&&!live;
 let outcome=full.settled?(full.lead>0?'A':full.lead<0?'B':'halve'):null;
 const benchmark=!live&&m.manualWinner==='handicap';if(manual&&['A','B','halve'].includes(m.manualWinner))outcome=m.manualWinner;if(benchmark)outcome='handicap';
 const scored=holes.some(h=>h!==null)||!live&&!!m.manualWinner,kind=(live?Math.max(a.length,b.length):r.teamSize||Math.max(a.length,b.length))===1?'Singles':'Team matches';
 const format=m.format||r.format||(kind==='Singles'?'Singles':'Team match play'),available=Object.values(weights).reduce((n,x)=>n+x,0),secured={a:contests.reduce((n,c)=>n+c.a,0),b:contests.reduce((n,c)=>n+c.b,0)};
 const teamKnown=live||!benchmark&&(!m.manualWinner||a.length+b.length>0&&[...a,...b].every(id=>!!roster[id]));
 const margin=!live&&m.manualMargin?m.manualMargin:manual&&outcome?'Recorded result':full.played===0?'Not started':full.lead===0?'All square':full.settled?(full.remaining?Math.abs(full.lead)+'&'+full.remaining:Math.abs(full.lead)+' UP'):Math.abs(full.lead)+' UP';
 return {...m,a,b,holes,roundId:r.id,roundTitle:r.title,format,kind,weights,contests,overall:full,outcome,benchmark,scored,available,secured,decided:contests.filter(c=>c.settled).reduce((n,c)=>n+c.points,0),teamKnown,margin,creditSize:live?null:r.teamSize||null};
}
function event(state,year,{practice=false,overlay}={}){
 const season=state.seasons?.find(s=>s.year===year),live=year===2027||state.liveCup?.year===year,source=live?'live':'archive';
 const raw=live?(state.liveCup?.year===year?state.liveCup.rounds:[]).filter(r=>!!r.test===!!practice):practice?[]:season?.rounds||[],roster=season?.roster||{};
 const rounds=raw.map(r=>({...r,matches:(r.matches||[]).map(m=>describe(m,r,{live,overlay:live?overlay:null,roster}))})),matches=rounds.flatMap(r=>r.matches);
 const stats=new Map(state.players.map(p=>[p.id,{id:p.id,name:p.name,team:roster[p.id]||'',matches:0,w:0,l:0,h:0,holesW:0,holesL:0,holesH:0,points:0,possible:0,singles:0,teamMatches:0,inProgress:0}]));
 const totals={a:0,b:0,available:0,decided:0,remaining:0};
 for(const m of matches){totals.available+=m.available;if(m.teamKnown){totals.a+=m.secured.a;totals.b+=m.secured.b;totals.decided+=m.decided;}
  for(const side of ['a','b'])for(const pid of m[side]){const s=stats.get(pid);if(!s)continue;const cap=m.creditSize||m[side].length||1,letter=side.toUpperCase();
   if(m.benchmark){if(side==='a'){s.matches++;s.singles++;s.l++;s.possible+=2;}continue;}
   s.points+=m.secured[side]/cap;s.possible+=m.decided/cap;
   if(m.scored){s.matches++;if(m.kind==='Singles')s.singles++;else s.teamMatches++;if(!m.outcome)s.inProgress++;}
   if(m.outcome==='halve')s.h++;else if(m.outcome===letter)s.w++;else if(m.outcome)s.l++;
   for(const h of m.holes)if(h==='halve')s.holesH++;else if(h===letter)s.holesW++;else if(h!==null)s.holesL++;
   if(live&&!roster[pid]){if(!s.team)s.team=letter;else if(s.team!==letter)s.team='Mixed';}
  }
 }
 totals.remaining=totals.available-totals.decided;return {year,source,practice,season,rounds,matches,stats,totals};
}
function playerMatches(model,id){return model.matches.filter(m=>m.scored&&[...m.a,...m.b].includes(id)).map(m=>{const side=m.a.includes(id)?'A':'B';return {...m,side,result:m.outcome==='handicap'?'Loss':m.outcome==='halve'?'Halved':m.outcome===side?'Win':m.outcome?'Loss':'In progress',teammates:(side==='A'?m.a:m.b).filter(x=>x!==id),opponents:side==='A'?m.b:m.a};});}
function rankingIndex(value){
 if(typeof value!=='number'&&!(typeof value==='string'&&value.trim()))return null;
 const index=Number(value);
 return Number.isFinite(index)&&index>=-10&&index<=54?index:null;
}
function rankings(state,year,{overlay}={}){
 const model=event(state,year-1,{overlay});
 const indexes=new Map(state.players.map(p=>[p.id,rankingIndex(p.handicap)]));
 const eligible=[...indexes.values()].filter(index=>index!==null).sort((a,b)=>a-b);
 const weight=state.handicapWeight/100;
 const arr=state.players.map(p=>{
  const record=model.stats.get(p.id),index=indexes.get(p.id);
  const first=index===null?-1:eligible.indexOf(index);
  const seed=first===-1?null:1+(first+eligible.lastIndexOf(index))/2;
  // Same Handicap Index scale as the player strength charts.
  const skill=index===null?null:Math.max(10,Math.min(95,85-1.3*index));
  const adjust=100*(record.points+2)/(record.possible+4);
  const rating=skill===null?null:weight*skill+(1-weight)*adjust;
  return {...p,seed,skill,adjust,rating,record};
 });
 arr.sort((a,b)=>(b.rating??-999)-(a.rating??-999)||(+a.handicap||0)-(+b.handicap||0)||a.name.localeCompare(b.name));
 return {year,arr,source:model.season,eligible:eligible.length};
}
const api={effectiveHoles,materializeCup,contest,score,event,playerMatches,rankings};if(typeof module!=='undefined')module.exports=api;else root.GGA_RESULTS=api;
})(typeof window==='undefined'?globalThis:window);
