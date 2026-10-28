/* Three independent match-play contests: front, back, and overall. */
(()=>{'use strict';
function contest(holes){
 const played=holes.filter(x=>['A','B','halve'].includes(x)).length;
 const lead=holes.reduce((n,x)=>n+(x==='A'?1:x==='B'?-1:0),0),remaining=holes.length-played;
 const settled=remaining===0||Math.abs(lead)>remaining;
 return {played,lead,remaining,settled,a:settled?(lead>0?1:lead<0?0:.5):0,b:settled?(lead<0?1:lead>0?0:.5):0};
}
function score(holes){return [contest(holes.slice(0,9)),contest(holes.slice(9,18)),contest(holes)];}
if(typeof module!=='undefined')module.exports={contest,score};
if(typeof window==='undefined'||!window.GGA)return;
const g=window.GGA,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=()=>{const s=g.getState();return s.liveCup||(s.liveCup={year:2027,rounds:[]});};
const team=s=>g.getState().seasons.find(x=>x.year===2027)?.teams?.[s]?.name||'Team '+s;
const names=ids=>ids.map(id=>g.player(id)?.name||'Unknown golfer').join(' & ');
const panel=document.createElement('section');panel.id='live';panel.className='view';document.querySelector('main.shell').appendChild(panel);
const uid=()=>crypto.randomUUID();
function commit(message){g.save();render();g.notify(message);}
function render(){
 const d=data(),owner=g.isOwner();let totalA=0,totalB=0;
 for(const r of d.rounds)if(r.started)for(const m of r.matches)for(const c of score(m.holes)){totalA+=c.a;totalB+=c.b;}
 panel.innerHTML='<div class="panel panel-pad"><div class="kicker">2027 Ryder Cup</div><h2>Live Scoring</h2><p>Each matchup: front nine 1 point · back nine 1 point · full match 1 point. Tied contests award ½ point to each side.</p><div class="live-total"><strong>'+esc(team('A'))+'<br>'+totalA+'</strong><span>POINTS SECURED</span><strong>'+esc(team('B'))+'<br>'+totalB+'</strong></div><p class="hint">'+(window.GGA_BACKEND_CONFIGURED?'Shared updates use the clubhouse connection status above.':'Device-only preview: scores are saved here; other devices will not receive them until cloud sync is connected.')+'</p><p class="hint">Record the agreed hole winner after applying your chosen handicap and 2v2 format rules. No strokes or handicap allowances are calculated here. Keep playing both nines even if the overall match is decided.</p></div>'+
 (owner?'<form id="live-round-form" class="panel panel-pad"><h3>Matthew’s matchup desk</h3><label class="form-field">Round name<input name="title" maxlength="70" required placeholder="Saturday morning"></label><button class="btn" type="submit">Create round</button></form>':'<p class="hint">Matthew creates matchups and records hole results.</p>')+
 (!d.rounds.length?'<div class="panel panel-pad"><h3>Waiting for the opening tee shot</h3><p>Matchups will appear here when Matthew sets up the rounds.</p></div>':'')+
 d.rounds.map(r=>'<article class="panel panel-pad live-round"><h3>'+esc(r.title)+'</h3><p>'+(!r.started?'Setup':r.matches.length&&r.matches.every(m=>m.holes.every(h=>h!==null))?'Round complete':'In progress')+'</p>'+
 (owner&&!r.started?'<form data-live-add="'+r.id+'"><div class="form-row"><label class="form-field">Match format<select name="format"><option value="1">1v1 match play</option><option value="2">2v2 match play</option></select></label>'+['A','B'].map(s=>[0,1].map(i=>'<label class="form-field" '+(i?'data-partner hidden':'')+'>'+esc(team(s))+' · golfer '+(i+1)+'<select name="'+s+i+'"><option value="">Select golfer</option>'+g.getState().players.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label>').join('')).join('')+'</div><button class="btn" type="submit">Add matchup</button></form><button class="btn btn-gold" data-live-start="'+r.id+'" '+(!r.matches.length?'disabled':'')+'>Start round</button>':'')+
 r.matches.map(m=>{const results=score(m.holes);return '<div class="live-match"><h4>'+esc(names(m.a))+' <span>vs</span> '+esc(names(m.b))+'</h4><p>'+m.a.length+'v'+m.b.length+' · '+m.holes.filter(h=>h!==null).length+'/18 holes recorded</p><div class="live-points">'+results.map((c,i)=>'<div><small>'+['Front 9','Back 9','Full match'][i]+'</small><strong>'+(c.settled?c.a+' – '+c.b:!c.played?'Not started':c.lead===0?'All square':esc(team(c.lead>0?'A':'B'))+' '+Math.abs(c.lead)+' UP')+'</strong><small>'+(c.settled?'Point awarded':'Point pending')+'</small></div>').join('')+'</div><div class="live-holes">'+m.holes.map((h,i)=>'<label>Hole '+(i+1)+(owner&&r.started?'<select data-live-round="'+r.id+'" data-live-match="'+m.id+'" data-live-hole="'+i+'" aria-label="Hole '+(i+1)+' winner">'+[['','Not played'],['A',team('A')],['B',team('B')],['halve','Tied']].map(([v,l])=>'<option value="'+v+'" '+((h||'')===v?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select>':'<strong>'+esc(h==='halve'?'Tied':h?team(h):'—')+'</strong>')+'</label>').join('')+'</div>'+(owner&&!r.started?'<button class="btn btn-secondary" data-live-remove="'+m.id+'" data-live-round="'+r.id+'">Remove matchup</button>':'')+'</div>';}).join('')+'</article>').join('');
}
panel.addEventListener('submit',e=>{
 e.preventDefault();if(!g.isOwner())return;const f=e.target,v=new FormData(f);
 if(f.id==='live-round-form'){const title=String(v.get('title')||'').trim();if(!title)return;data().rounds.push({id:uid(),title,started:false,matches:[]});commit('Round created.');return;}
 const r=data().rounds.find(r=>r.id===f.dataset.liveAdd);if(!r||r.started)return;
 const size=Number(v.get('format'));if(![1,2].includes(size))return;
 const a=Array.from({length:size},(_,i)=>v.get('A'+i)),b=Array.from({length:size},(_,i)=>v.get('B'+i)),ids=[...a,...b];
 if(ids.some(id=>!g.player(id))||new Set(ids).size!==ids.length)return g.notify('Select a different golfer for every slot.');
 if(r.matches.some(m=>[...m.a,...m.b].some(id=>ids.includes(id))))return g.notify('A golfer can only play one matchup in this round.');
 const roster=g.getState().seasons.find(s=>s.year===2027)?.roster||{};
 if([...a].some(id=>roster[id]&&roster[id]!=='A')||[...b].some(id=>roster[id]&&roster[id]!=='B'))return g.notify('Assign golfers to their drafted team.');
 r.matches.push({id:uid(),a,b,holes:Array(18).fill(null)});commit('Matchup added.');
});
panel.addEventListener('change',e=>{
 const t=e.target;if(t.name==='format'){t.form.querySelectorAll('[data-partner]').forEach(x=>x.hidden=t.value!=='2');return;}
 if(!g.isOwner()||t.dataset.liveHole===undefined)return;
 const r=data().rounds.find(x=>x.id===t.dataset.liveRound),m=r?.matches.find(x=>x.id===t.dataset.liveMatch),i=Number(t.dataset.liveHole);
 if(!r?.started||!m||!Number.isInteger(i)||i<0||i>17||!['','A','B','halve'].includes(t.value))return;
 m.holes[i]=t.value||null;commit('Hole result saved.');
});
panel.addEventListener('click',e=>{
 if(!g.isOwner())return;const t=e.target.closest('[data-live-start],[data-live-remove]');if(!t)return;
 const r=data().rounds.find(x=>x.id===(t.dataset.liveStart||t.dataset.liveRound));if(!r||r.started)return;
 if(t.dataset.liveStart){if(!r.matches.length)return;r.started=true;commit('Round started. Matchups locked; hole results remain editable.');}
 else{r.matches=r.matches.filter(m=>m.id!==t.dataset.liveRemove);commit('Unstarted matchup removed.');}
});
const prior=window.GGA_UPGRADE_RENDER;window.GGA_UPGRADE_RENDER=()=>{prior?.();render();};
const priorTab=window.GGA_ON_TAB;window.GGA_ON_TAB=t=>{priorTab?.(t);if(t==='live')render();};
window.GGA_LIVE={render,score};render();
})();
