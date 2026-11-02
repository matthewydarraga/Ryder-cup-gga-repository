/* Each pairing plays for exactly one Ryder Cup point. */
(()=>{'use strict';
function contest(holes){
 const played=holes.filter(x=>['A','B','halve'].includes(x)).length;
 const lead=holes.reduce((n,x)=>n+(x==='A'?1:x==='B'?-1:0),0),remaining=holes.length-played;
 const settled=remaining===0||Math.abs(lead)>remaining;
 return {played,lead,remaining,settled,a:settled?(lead>0?1:lead<0?0:.5):0,b:settled?(lead<0?1:lead>0?0:.5):0};
}
function score(holes){return [contest(holes)];}
// Illustrative model: average team HCP (preferred), otherwise complete GGA ratings.
// Fixed 30% hole tie assumption; independent remaining holes, not calibrated betting odds.
function predict(holes,a,b){
 const c=contest(holes),valid=x=>typeof x==='number'&&Number.isFinite(x);
 const all=[...a,...b],hcp=all.length>0&&all.every(p=>valid(p?.handicap)),rating=all.length>0&&all.every(p=>valid(p?.rating));
 const avg=(xs,key)=>xs.reduce((n,p)=>n+p[key],0)/xs.length;
 const edge=a.length&&b.length?(hcp?(avg(b,'handicap')-avg(a,'handicap'))/18:rating?(avg(a,'rating')-avg(b,'rating'))/40:0):0;
 const win=.7/(1+Math.exp(-Math.max(-2,Math.min(2,edge))));
 let dist=new Map([[c.lead,1]]);
 if(!c.settled)for(let i=0;i<c.remaining;i++){const next=new Map();for(const [lead,p]of dist)for(const [delta,q]of [[1,win],[0,.3],[-1,.7-win]])next.set(lead+delta,(next.get(lead+delta)||0)+p*q);dist=next;}
 let A=0,B=0,tie=0;for(const [lead,p]of dist){if(lead>0)A+=p;else if(lead<0)B+=p;else tie+=p;}
 return {a:A,b:B,tie,basis:hcp?'average Handicap Index':rating?'average GGA rating':'score only — ratings incomplete',settled:c.settled};
}
if(typeof module!=='undefined')module.exports={contest,score,predict};
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
 panel.innerHTML='<div class="panel panel-pad"><div class="kicker">2027 Ryder Cup</div><h2>Live Scoring</h2><p>Each pairing versus pairing is worth 1 Ryder Cup point total. Tied contests award ½ point to each side.</p><div class="live-total"><strong>'+esc(team('A'))+'<br>'+totalA+'</strong><span>POINTS SECURED</span><strong>'+esc(team('B'))+'<br>'+totalB+'</strong></div><p class="hint">'+(window.GGA_BACKEND_CONFIGURED?'Shared updates use the clubhouse connection status above.':'Device-only preview: scores are saved here; other devices will not receive them until cloud sync is connected.')+'</p><p class="hint">Record the agreed hole winner after applying your agreed handicap and team-format rules. No strokes or handicap allowances are calculated here. A clinched match awards its single point; you can correct any recorded hole. Predictions are illustrative, not calibrated odds or handicap stroke calculations.</p></div>'+
 (owner?'<form id="live-round-form" class="panel panel-pad"><h3>Matthew’s matchup desk</h3><label class="form-field">Round name<input name="title" maxlength="70" required placeholder="Saturday morning"></label><button class="btn" type="submit">Create round</button></form>':'<p class="hint">Matthew creates matchups and records hole results.</p>')+
 (!d.rounds.length?'<div class="panel panel-pad"><h3>Waiting for the opening tee shot</h3><p>Matchups will appear here when Matthew sets up the rounds.</p></div>':'')+
 d.rounds.map(r=>'<article class="panel panel-pad live-round"><h3>'+esc(r.title)+'</h3><p>'+(!r.started?'Setup':r.matches.length&&r.matches.every(m=>contest(m.holes).settled)?'Round complete':'In progress')+'</p>'+
 (owner&&!r.started?'<form data-live-add="'+r.id+'"><div class="form-row"><label class="form-field">Match format<select name="format"><option value="1">1v1 match play</option><option value="2">2v2 match play</option><option value="3">3v3 match play</option><option value="4">4v4 match play</option></select></label>'+['A','B'].map(s=>[0,1,2,3].map(i=>'<label class="form-field" '+(i?'data-partner="'+i+'" hidden':'')+'>'+esc(team(s))+' · golfer '+(i+1)+'<select name="'+s+i+'"><option value="">Select golfer</option>'+g.getState().players.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label>').join('')).join('')+'</div><button class="btn" type="submit">Add matchup</button></form><button class="btn btn-gold" data-live-start="'+r.id+'" '+(!r.matches.length?'disabled':'')+'>Start round</button>':'')+
 r.matches.map(m=>{const results=score(m.holes);const ratings=g.ranks?g.ranks().arr:[];const rated=id=>({...g.player(id),rating:ratings.find(p=>p.id===id)?.rating});const prediction=predict(m.holes,m.a.map(rated),m.b.map(rated));return '<div class="live-match"><h4>'+esc(names(m.a))+' <span>vs</span> '+esc(names(m.b))+'</h4><p>'+m.a.length+'v'+m.b.length+' · '+m.holes.filter(h=>h!==null).length+'/18 holes recorded</p><div class="live-points">'+results.map((c,i)=>'<div><small>'+'Match · 1 point'+'</small><strong>'+(c.settled?c.a+' – '+c.b:!c.played?'Not started':c.lead===0?'All square':esc(team(c.lead>0?'A':'B'))+' '+Math.abs(c.lead)+' UP')+'</strong><small>'+(c.settled?'Point awarded':'Point pending')+'</small></div>').join('')+'</div><p class="hint" aria-live="polite">'+(prediction.settled?'Result':'Estimated chances')+' · '+esc(team('A'))+' '+(prediction.a*100).toFixed(1)+'% · Tie '+(prediction.tie*100).toFixed(1)+'% · '+esc(team('B'))+' '+(prediction.b*100).toFixed(1)+'%<br>Based on current score and '+esc(prediction.basis)+'. Assumes 30% tied holes; team averages do not model scramble/best-ball advantages.</p><div class="live-holes">'+m.holes.map((h,i)=>'<label>Hole '+(i+1)+(owner&&r.started?'<select data-live-round="'+r.id+'" data-live-match="'+m.id+'" data-live-hole="'+i+'" aria-label="Hole '+(i+1)+' winner">'+[['','Not played'],['A',team('A')],['B',team('B')],['halve','Tied']].map(([v,l])=>'<option value="'+v+'" '+((h||'')===v?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select>':'<strong>'+esc(h==='halve'?'Tied':h?team(h):'—')+'</strong>')+'</label>').join('')+'</div>'+(owner&&!r.started?'<button class="btn btn-secondary" data-live-remove="'+m.id+'" data-live-round="'+r.id+'">Remove matchup</button>':'')+'</div>';}).join('')+'</article>').join('');
}
panel.addEventListener('submit',e=>{
 e.preventDefault();if(!g.isOwner())return;const f=e.target,v=new FormData(f);
 if(f.id==='live-round-form'){const title=String(v.get('title')||'').trim();if(!title)return;if(data().rounds.length>=30)return g.notify('Maximum 30 rounds. Export a backup before reorganizing.');data().rounds.push({id:uid(),title,started:false,matches:[]});commit('Round created.');return;}
 const r=data().rounds.find(r=>r.id===f.dataset.liveAdd);if(!r||r.started)return;
 const size=Number(v.get('format'));if(![1,2,3,4].includes(size))return;
 const a=Array.from({length:size},(_,i)=>v.get('A'+i)),b=Array.from({length:size},(_,i)=>v.get('B'+i)),ids=[...a,...b];
 if(ids.some(id=>!g.player(id))||new Set(ids).size!==ids.length)return g.notify('Select a different golfer for every slot.');
 if(r.matches.some(m=>[...m.a,...m.b].some(id=>ids.includes(id))))return g.notify('A golfer can only play one matchup in this round.');
 const roster=g.getState().seasons.find(s=>s.year===2027)?.roster||{};
 if([...a].some(id=>roster[id]&&roster[id]!=='A')||[...b].some(id=>roster[id]&&roster[id]!=='B'))return g.notify('Assign golfers to their drafted team.');
 r.matches.push({id:uid(),a,b,holes:Array(18).fill(null)});commit('Matchup added.');
});
panel.addEventListener('change',e=>{
 const t=e.target;if(t.name==='format'){t.form.querySelectorAll('[data-partner]').forEach(x=>x.hidden=Number(x.dataset.partner)>=Number(t.value));return;}
 if(!g.isOwner()||t.dataset.liveHole===undefined)return;
 const r=data().rounds.find(x=>x.id===t.dataset.liveRound),m=r?.matches.find(x=>x.id===t.dataset.liveMatch),i=Number(t.dataset.liveHole);
 if(!r?.started||!m||!Number.isInteger(i)||i<0||i>17||!['','A','B','halve'].includes(t.value))return;
 m.holes[i]=t.value||null;commit(window.GGA_BACKEND_CONFIGURED?'Hole updated locally — check cloud confirmation above.':'Hole saved on this device.');
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
