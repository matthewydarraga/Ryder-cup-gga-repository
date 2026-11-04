/* GGA match desk. Metadata is owner-controlled; hole documents sync independently. */
(()=>{'use strict';
const legacyPoints={front:0,back:0,match:1};
const results=typeof module!=='undefined'?require('./results-core.js'):window.GGA_RESULTS;
const contest=results.contest,score=results.score;
function predict(holes,a,b){
 const c=contest(holes),valid=x=>typeof x==='number'&&Number.isFinite(x);
 const all=[...a,...b],hcp=all.length>0&&all.every(p=>valid(p?.handicap)),rating=all.length>0&&all.every(p=>valid(p?.rating));
 const avg=(xs,key)=>xs.reduce((n,p)=>n+p[key],0)/xs.length;
 const edge=a.length&&b.length?(hcp?(avg(b,'handicap')-avg(a,'handicap'))/18:rating?(avg(a,'rating')-avg(b,'rating'))/40:0):0;
 const win=.7/(1+Math.exp(-Math.max(-2,Math.min(2,edge))));let dist=new Map([[c.lead,1]]);
 if(!c.settled)for(let i=0;i<c.remaining;i++){const next=new Map();for(const [lead,p]of dist)for(const [delta,q]of [[1,win],[0,.3],[-1,.7-win]])next.set(lead+delta,(next.get(lead+delta)||0)+p*q);dist=next;}
 let A=0,B=0,tie=0;for(const [lead,p]of dist){if(lead>0)A+=p;else if(lead<0)B+=p;else tie+=p;}return {a:A,b:B,tie,basis:hcp?'average Handicap Index':rating?'average GGA rating':'score only — ratings incomplete',settled:c.settled};
}
function canScore(m,started,owner,playerId){return !!started&&(owner||[...m.a,...m.b].includes(playerId));}
if(typeof module!=='undefined')module.exports={contest,score,predict,canScore};
if(typeof window==='undefined'||!window.GGA)return;
const g=window.GGA,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=()=>{const s=g.getState();return s.liveCup||(s.liveCup={year:2027,rounds:[]});};
const team=s=>g.getState().seasons.find(x=>x.year===2027)?.teams?.[s]?.name||'Team '+s;
const names=ids=>ids.map(id=>g.player(id)?.name||'Unknown golfer').join(' & ');
const panel=document.createElement('section');panel.id='live';panel.className='view';document.querySelector('main.shell').appendChild(panel);
let selectedRound='all',selectedMatch='',mode='official',busy=false,editing='';
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),points=m=>m.points||legacyPoints;
const rounds=()=>data().rounds.filter(r=>!!r.test===(mode==='test'));
const holes=m=>results.effectiveHoles(m,window.GGA_LIVE_RESULTS);
const editable=(m,r)=>canScore(m,r.started,g.isOwner(),g.getUser?.()?.id)&&(!window.GGA_BACKEND_CONFIGURED||!!window.GGA_BACKEND_API?.canScore(m.id));
const labels={front:'Front 9',back:'Back 9',match:'Overall match'};
function commit(message){g.save();if(g.refreshResults)g.refreshResults();else render();g.notify(message);}
function total(rs){const ids=new Set(rs.map(r=>r.id)),model=results.event(g.getState(),2027,{practice:mode==='test',overlay:window.GGA_LIVE_RESULTS});let a=0,b=0;for(const r of model.rounds)if(ids.has(r.id))for(const m of r.matches){a+=m.secured.a;b+=m.secured.b;}return [a,b];}
const pointInputs=p=>['front','back','match'].map(k=>'<label class="form-field">'+labels[k]+' points<input name="points-'+k+'" type="number" min="0" max="100" step="0.5" value="'+p[k]+'" required></label>').join('');
function matchForm(r,m){const size=m?.a.length||1;return '<form data-live-add="'+r.id+'" data-edit="'+(m?.id||'')+'"><h4>'+(m?'Edit matchup':'New matchup')+'</h4><div class="form-row"><label class="form-field">Match format<select name="format">'+[1,2,3,4].map(n=>'<option value="'+n+'" '+(n===size?'selected':'')+'>'+n+'v'+n+' match play</option>').join('')+'</select></label>'+['A','B'].map(s=>[0,1,2,3].map(i=>'<label class="form-field" '+(i?'data-partner="'+i+'" '+(i>=size?'hidden':''):'')+'>'+esc(team(s))+' · golfer '+(i+1)+'<select name="'+s+i+'"><option value="">Select golfer</option>'+g.getState().players.map(p=>'<option value="'+esc(p.id)+'" '+(m?.[s.toLowerCase()][i]===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>').join('')).join('')+pointInputs(m?points(m):{front:1,back:1,match:1})+'</div><p class="hint">Ties split that contest’s points equally. Set a contest to 0 to disable it.</p>'+(m?'<fieldset style="margin:16px 0;padding:14px;border:1px solid #707887;border-radius:10px"><legend>When changing players</legend><p class="hint">Choose what happens to the current scorecard. Retained results stay with the team sides, not individual golfers. The previous lineup and scorecard are kept in history.</p><label class="form-field">Existing results<select name="lineup-policy"><option value="">Choose before changing players</option><option value="retain">Keep current results for the updated lineup</option><option value="fresh">Start fresh with an empty scorecard</option></select></label><label class="form-field">Lineup change reason<input name="lineup-reason" maxlength="500" placeholder="Substitution, corrected pairing, or new match"></label></fieldset>':'')+'<button class="btn" type="submit">'+(m?'Save matchup':'Add matchup')+'</button>'+(m?'<button type="button" class="btn btn-secondary" data-live-cancel>Cancel edit</button>':'')+'</form>';}
function status(c){return !c.played?'Not started':c.lead===0?'All square':esc(team(c.lead>0?'A':'B'))+' '+Math.abs(c.lead)+' UP';}
function history(m){
 const entries=(data().lineupHistory||[]).filter(x=>x.lineageId===(m.lineageId||m.id));if(!entries.length)return '';
 return '<details><summary>Lineup history ('+entries.length+(entries.length===1?' change':' changes')+')</summary>'+entries.slice().reverse().map(x=>'<article class="panel panel-pad"><strong>'+esc(x.policy==='retain'?'Results retained':'Fresh match started')+'</strong><p>'+esc(names(x.before.a))+' vs '+esc(names(x.before.b))+' → '+esc(names(x.after.a))+' vs '+esc(names(x.after.b))+'</p><p>'+esc(x.reason)+'</p><small>By '+esc(g.getState().players.find(p=>p.username===x.actor)?.name||x.actor)+' · '+esc(new Date(x.at).toLocaleString())+'</small><p class="hint">Previous scorecard · '+x.before.holes.filter(h=>h!==null).length+' recorded holes · historical results do not add to current standings.</p><div class="live-holes">'+x.before.holes.map((h,i)=>'<label>Hole '+(i+1)+'<strong>'+esc(h==='halve'?'Tied':h?team(h):'—')+'</strong></label>').join('')+'</div></article>').join('')+'</details>';
}
function card(r,m,detail){const hs=holes(m),results=score(hs,points(m)),can=editable(m,r),c=contest(hs);return '<div class="live-match"><h4>'+esc(names(m.a))+' <span>vs</span> '+esc(names(m.b))+'</h4><p>'+m.a.length+'v'+m.b.length+' · '+c.played+'/18 holes recorded · '+Object.values(points(m)).reduce((a,b)=>a+b,0)+' points available</p><div class="live-points">'+results.map(c=>'<div><small>'+labels[c.key]+' · '+c.points+' '+(c.points===1?'point':'points')+'</small><strong>'+(c.settled?c.a+' – '+c.b:status(c))+'</strong><small>'+(c.settled?'Points secured':'In progress')+'</small></div>').join('')+'</div><p class="hint">Holes won: '+esc(team('A'))+' '+hs.filter(h=>h==='A').length+' · '+esc(team('B'))+' '+hs.filter(h=>h==='B').length+' · Tied '+hs.filter(h=>h==='halve').length+'</p>'+
 (!detail?'<button class="btn btn-secondary" data-live-open="'+m.id+'">Open match & scorecard</button>':'<p class="hint">'+(can?'You can record and correct results for this match.':!r.started?'Matthew must start this round before scoring.':'Only participants in this matchup and Matthew can edit results.')+'</p><div class="live-holes">'+hs.map((h,i)=>'<label>Hole '+(i+1)+(can?'<select '+(busy?'disabled':'')+' data-live-round="'+r.id+'" data-live-match="'+m.id+'" data-live-hole="'+i+'" aria-label="Hole '+(i+1)+' winner">'+[['','Not played'],['A',team('A')],['B',team('B')],['halve','Tied']].map(([v,l])=>'<option value="'+v+'" '+((h||'')===v?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select>':'<strong>'+esc(h==='halve'?'Tied':h?team(h):'—')+'</strong>')+'</label>').join('')+'</div>')+
 (detail?history(m):'')+(g.isOwner()?'<div class="flex"><button class="btn btn-secondary" data-live-edit="'+m.id+'">Edit players & points</button><button class="btn btn-danger" data-live-remove="'+m.id+'" data-live-round="'+r.id+'">Remove matchup</button></div>':'')+'</div>';}
function render(){
 const owner=g.isOwner(),rs=rounds();if(selectedRound!=='all'&&!rs.some(r=>r.id===selectedRound))selectedRound='all';
 const shown=rs.filter(r=>selectedRound==='all'||r.id===selectedRound),[a,b]=total(rs),[ra,rb]=total(shown);
 const focus=rs.flatMap(r=>r.matches.map(m=>({r,m}))).find(x=>x.m.id===selectedMatch);if(!focus)selectedMatch='';
 panel.innerHTML='<div class="panel panel-pad"><div class="kicker">2027 Ryder Cup'+(mode==='test'?' · PRACTICE ONLY':'')+'</div><h2>Live Scoring</h2><div class="flex"><button class="btn '+(mode==='official'?'btn-gold':'btn-secondary')+'" data-live-mode="official">Official Cup</button><button class="btn '+(mode==='test'?'btn-gold':'btn-secondary')+'" data-live-mode="test">Mock 2027 test</button></div><p>'+(mode==='test'?'Practice scores are separate from the official Cup.':'Custom points for the front 9, back 9 and overall match. Ties split the points.')+'</p><div class="live-total"><strong>'+esc(team('A'))+'<br>'+a+'</strong><span>POINTS SECURED</span><strong>'+esc(team('B'))+'<br>'+b+'</strong></div><p class="hint">'+(window.GGA_BACKEND_CONFIGURED?'Wait for server confirmation after each change.':'Device-only preview — changes do not sync.')+' Record agreed hole winners after your handicap and format rules; strokes are not calculated here.</p></div>'+
 (owner?'<form id="live-round-form" class="panel panel-pad"><h3>Matthew’s matchup desk</h3><label class="form-field">Round name<input name="title" maxlength="70" required placeholder="Saturday morning"></label><label class="form-field">Date<input name="date" type="date"></label><button class="btn" type="submit">Create '+(mode==='test'?'practice ':'')+'round</button>'+(mode==='test'?'<button class="btn btn-secondary" type="button" data-live-mock>Create mock 2027 tournament</button>':'')+'</form>':'')+
 '<div class="panel panel-pad"><label class="form-field">Round / day<select id="live-filter"><option value="all">All rounds</option>'+rs.map(r=>'<option value="'+r.id+'" '+(selectedRound===r.id?'selected':'')+'>'+esc((r.date?r.date+' · ':'')+r.title)+'</option>').join('')+'</select></label>'+(selectedRound!=='all'?'<p>Selected round points: '+ra+' – '+rb+'</p>':'')+(focus?'<button class="btn btn-secondary" data-live-overview>← All matches</button>':'')+'</div>'+
 (!rs.length?'<div class="panel panel-pad"><h3>'+(mode==='test'?'Ready for a test run':'Waiting for the opening tee shot')+'</h3><p>'+(owner?'Create a round'+(mode==='test'?' or generate the mock tournament.':'.'):'Matthew will set up the matchups.')+'</p></div>':'')+
 (focus?'<article class="panel panel-pad"><h3>'+esc(focus.r.title)+'</h3>'+card(focus.r,focus.m,true)+(editing===focus.m.id?matchForm(focus.r,focus.m):'')+'</article>':shown.map(r=>'<article class="panel panel-pad live-round"><h3>'+esc(r.title)+'</h3><p>'+esc(r.date||'')+' · '+(r.started?'Round open for scoring':'Setup')+' · Round points '+total([r]).join(' – ')+'</p>'+(owner?'<div class="flex"><button class="btn btn-gold" data-live-start="'+r.id+'" '+(!r.matches.length?'disabled':'')+'>'+(r.started?'Pause round':'Start round')+'</button><button class="btn btn-secondary" data-live-rename="'+r.id+'">Rename round</button><button class="btn btn-danger" data-live-delete-round="'+r.id+'">Remove round</button></div>'+(!r.started?matchForm(r):''):'')+r.matches.map(m=>card(r,m,false)+(editing===m.id?matchForm(r,m):'')).join('')+'</article>').join(''));
 if(busy)panel.querySelectorAll?.('button,input,select').forEach(el=>el.disabled=true);
}
panel.addEventListener('submit',async e=>{
 e.preventDefault();if(!g.isOwner()||busy)return;const f=e.target,v=new FormData(f);
 if(f.id==='live-round-form'){const title=String(v.get('title')||'').trim();if(!title)return;if(data().rounds.length>=30)return g.notify('Maximum 30 rounds.');data().rounds.push({id:uid(),title,date:String(v.get('date')||''),test:mode==='test',started:false,matches:[]});commit('Round created.');return;}
 const r=data().rounds.find(r=>r.id===f.dataset.liveAdd);if(!r)return;
 const size=Number(v.get('format'));if(![1,2,3,4].includes(size))return;
 const a=Array.from({length:size},(_,i)=>v.get('A'+i)),b=Array.from({length:size},(_,i)=>v.get('B'+i)),ids=[...a,...b],p=Object.fromEntries(['front','back','match'].map(k=>[k,Number(v.get('points-'+k))]));
 if(Object.values(p).some(n=>!Number.isFinite(n)||n<0||n>100||n*2%1)||!Object.values(p).some(n=>n>0))return g.notify('Use points from 0–100 in half-point steps, with at least one contest enabled.');
 if(ids.some(id=>!g.player(id))||new Set(ids).size!==ids.length)return g.notify('Select a different golfer for every slot.');
 if(r.matches.some(m=>m.id!==f.dataset.edit&&[...m.a,...m.b].some(id=>ids.includes(id))))return g.notify('A golfer can only play one matchup in this round.');
 const roster=g.getState().seasons.find(s=>s.year===2027)?.roster||{};
 if(!r.test&&(a.some(id=>roster[id]&&roster[id]!=='A')||b.some(id=>roster[id]&&roster[id]!=='B')))return g.notify('Assign golfers to their drafted team.');
 const existing=r.matches.find(m=>m.id===f.dataset.edit);
 if(existing){
  const changed=JSON.stringify(existing.a)!==JSON.stringify(a)||JSON.stringify(existing.b)!==JSON.stringify(b);
  if(changed){
   const policy=String(v.get('lineup-policy')||''),reason=String(v.get('lineup-reason')||'').trim();
   if(!['retain','fresh'].includes(policy)||!reason||reason.length>500)return g.notify('Choose whether to keep results or start fresh, and enter a reason.');
   if(!confirm('Change '+names(existing.a)+' vs '+names(existing.b)+' to '+names(a)+' vs '+names(b)+'? '+(policy==='retain'?'All current results will carry over with their team sides.':'The new match starts with no results.')+' The old lineup and results will be preserved in history.'))return;
   const request={roundId:r.id,matchId:existing.id,before:{a:[...existing.a],b:[...existing.b]},a,b,points:p,policy,reason},wasOpen=selectedMatch===existing.id;
   busy=true;render();
   try{
    let matchId;
    if(window.GGA_BACKEND_CONFIGURED){if(!window.GGA_CHANGE_LINEUP)throw Error('Lineup tools are still loading.');({matchId}=await window.GGA_CHANGE_LINEUP(request));}
    else{const next=window.GGA_LINEUP.makeChange(data(),request,{holes:holes(existing),actor:'matthew.ydarraga',newId:uid(),players:g.getState().players.map(p=>p.id),roster});g.getState().liveCup=next.cup;matchId=next.replacement.id;g.save();}
    editing='';if(wasOpen)selectedMatch=matchId;g.notify(policy==='retain'?'Lineup changed; current results retained and previous lineup saved.':'Fresh match created; previous lineup and results saved in history.');
   }catch(e){g.notify('Lineup was not changed: '+String(e.message||e));}
   finally{busy=false;render();}return;
  }
  existing.points=p;
 }else{if(r.started)return;r.matches.push({id:uid(),a,b,points:p,holes:Array(18).fill(null)});}
 editing='';commit(existing?'Matchup updated.':'Matchup added.');
});
panel.addEventListener('change',async e=>{
 if(busy)return;const t=e.target;if(t.name==='format'){t.form.querySelectorAll('[data-partner]').forEach(x=>x.hidden=Number(x.dataset.partner)>=Number(t.value));return;}
 if(t.id==='live-filter'){selectedRound=t.value;selectedMatch='';render();return;}
 if(t.dataset.liveHole===undefined)return;
 const r=data().rounds.find(x=>x.id===t.dataset.liveRound),m=r?.matches.find(x=>x.id===t.dataset.liveMatch),i=Number(t.dataset.liveHole),value=t.value||null;
 if(!m||!editable(m,r)||!Number.isInteger(i)||i<0||i>17||![null,'A','B','halve'].includes(value))return;
 if(window.GGA_BACKEND_CONFIGURED){busy=true;render();try{const result=await window.GGA_SAVE_HOLE(m.id,i,value,holes(m)[i]);g.notify(result?.pending?'Score saved on this device; check the score queue for server confirmation.':'Hole saved and confirmed by server.');}catch(e){g.notify('Hole did not save: '+String(e.message||e));}finally{busy=false;render();}}
 else{m.holes[i]=value;commit('Hole saved on this device.');}
});
panel.addEventListener('click',e=>{
 if(busy)return;const t=e.target.closest('button');if(!t)return;
 if(t.dataset.liveMode){mode=t.dataset.liveMode;selectedRound='all';selectedMatch='';editing='';render();return;}
 if(t.dataset.liveOpen){selectedMatch=t.dataset.liveOpen;editing='';render();return;}
 if(t.hasAttribute('data-live-overview')){selectedMatch='';editing='';render();return;}
 if(!g.isOwner())return;
 if(t.hasAttribute('data-live-cancel')){editing='';render();return;}
 if(t.dataset.liveEdit){editing=t.dataset.liveEdit;render();return;}
 if(t.hasAttribute('data-live-mock')){
  if(data().rounds.some(r=>r.test))return g.notify('A mock tournament already exists. Open its rounds to test or customize it.');
  if(data().rounds.length>26)return g.notify('Make room for four mock rounds first.');
  const players=g.getState().players.map(p=>p.id);
  for(const size of [1,2,3,4])data().rounds.push({id:uid(),title:'Mock 2027 · '+size+'v'+size,date:'',test:true,started:true,matches:[{id:uid(),a:players.slice(0,size),b:players.slice(size,size*2),points:{front:1,back:1,match:1},holes:Array(18).fill(null)}]});
  commit('Four practice rounds created. Official scores are unchanged.');return;
 }
 const r=data().rounds.find(x=>x.id===(t.dataset.liveStart||t.dataset.liveRound||t.dataset.liveRename||t.dataset.liveDeleteRound));if(!r)return;
 if(t.dataset.liveDeleteRound){if(!confirm('Remove this round and its matchups from the Cup?'))return;data().rounds=data().rounds.filter(x=>x.id!==r.id);editing='';commit('Round removed.');}
 else if(t.dataset.liveStart){if(!r.matches.length)return;r.started=!r.started;commit(r.started?'Round started.':'Round paused.');}
 else if(t.dataset.liveRename){const title=prompt('Round name',r.title);if(title?.trim()&&title.trim().length<=70){r.title=title.trim();commit('Round renamed.');}}
 else if(t.dataset.liveRemove){if(!confirm('Remove this matchup from the round? Its results will no longer count.'))return;r.matches=r.matches.filter(m=>m.id!==t.dataset.liveRemove);editing='';commit('Matchup removed.');}
});
const prior=window.GGA_UPGRADE_RENDER;window.GGA_UPGRADE_RENDER=()=>{prior?.();render();};
const priorTab=window.GGA_ON_TAB;window.GGA_ON_TAB=t=>{priorTab?.(t);if(t==='live')render();};
window.GGA_LIVE={render,score,contest};render();
})();
