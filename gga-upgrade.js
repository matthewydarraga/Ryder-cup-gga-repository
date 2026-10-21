/* GGA 2027 Clubhouse: archive, draft, owner controls. Uses the existing local-only application model. */
(()=>{'use strict';
const core=window.GGA;if(!core){console.error('GGA clubhouse core missing');return;}
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const state=core.getState();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const resolvePlayer=id=>state.players.find(p=>p.id===id);
const placeholder={hero:'A new year. The same brotherhood. Thirteen golfers enter the conversation. Only twelve make the two teams.',announcement:'The board is set. Captains and draft details coming soon.',announcementLabel:'2027 Draft watch'};
const baseOrder=['A','B','B','A','A','B','B','A','A','B','B','A'];
if(!state.clubhouse||typeof state.clubhouse!=='object')state.clubhouse={...placeholder};
if(!state.draft2027||typeof state.draft2027!=='object')state.draft2027={phase:'pre',picks:[]};
const draft=state.draft2027;
if(!Array.isArray(draft.picks))draft.picks=[];
const matches2026=()=>state.seasons.find(s=>s.year===2026);
const cup2027=()=>state.seasons.find(s=>s.year===2027);
const teamName=side=>cup2027()?.teams?.[side]?.name||'Team '+side;
const hasPick=id=>draft.picks.some(p=>p.playerId===id);
const nameOf=id=>resolvePlayer(id)?.name||'Unassigned';
function recordById(){
 const map=new Map(state.players.map(p=>[p.id,{player:p,played:0,w:0,l:0,h:0,singles:0,team:0}]));
 const season=matches2026();
 for(const round of season?.rounds||[])for(const match of round.matches||[]){
   const win=match.manualWinner; if(!win)continue;
   for(const side of ['a','b'])for(const pid of match[side]||[]){
     if(!pid||!map.has(pid))continue;
     const stat=map.get(pid);stat.played++;if((round.teamSize||1)===1)stat.singles++;else stat.team++;
     if(win==='handicap'){if(side==='a')stat.l++;continue;}
     if(win==='halve')stat.h++;else if(win===side.toUpperCase())stat.w++;else stat.l++;
   }
 }
 return [...map.values()].sort((a,b)=>b.w-a.w||a.l-b.l||a.player.name.localeCompare(b.player.name));
}
const statCard=(value,label)=>'<div><strong>'+esc(value)+'</strong><small>'+esc(label)+'</small></div>';
function summary(){
 const s=matches2026(),rounds=s?.rounds||[],decided=rounds.flatMap(r=>r.matches||[]).filter(m=>!!m.manualWinner);
 const roster=recordById(),wins=roster.reduce((n,x)=>n+x.w,0),leaders=roster.filter(x=>x.w===Math.max(...roster.map(r=>r.w)));
 $('#gga-home-stats').innerHTML=statCard(state.players.length,'GGA golfers')+statCard(decided.length,'2026 results')+statCard(rounds.length,'Tournament formats')+statCard('2027','Next Cup');
 $('#gga-history-stats').innerHTML=statCard(decided.length,'Recorded 2026 contests')+statCard(roster.filter(x=>x.played).length,'Golfer records')+statCard(rounds.length,'Rounds played')+statCard(leaders.length&&wins?leaders[0].w:'—','Top match-win count');
 $('#gga-history-players').innerHTML=roster.map(x=>'<tr><td><strong>'+esc(x.player.name)+'</strong></td><td>'+x.played+'</td><td>'+x.w+'–'+x.l+'–'+x.h+'</td><td>'+x.singles+'</td><td>'+x.team+'</td></tr>').join('');
 $('#gga-history-rounds').innerHTML=rounds.map((r,i)=>'<h3 class="gga-history-section">Round '+(i+1)+' · '+esc(r.format||r.title)+'</h3><div class="gga-round-grid">'+(r.matches||[]).map(m=>{
   const a=(m.a||[]).map(nameOf).filter(x=>x!=='Unassigned').join(' & ')||'—';
   const b=(m.b||[]).map(nameOf).filter(x=>x!=='Unassigned').join(' & ')||'Handicap benchmark';
   const winner=m.manualWinner==='handicap'?'Handicap challenge':m.manualWinner==='A'?a:m.manualWinner==='B'?b:'Result pending';
   return '<article class="gga-result"><small>'+esc(a)+' vs '+esc(b)+'</small><h4>'+esc(winner)+(m.manualWinner&&m.manualWinner!=='handicap'?' wins':'')+'</h4><p>'+esc(m.manualMargin||'')+'</p><p>'+esc(m.manualNote||'')+'</p></article>';
 }).join('')+'</div>').join('');
}
function populateDraft(){
 const s=cup2027(),picks=draft.picks.filter(p=>resolvePlayer(p.playerId)).slice(0,12);draft.picks=picks;
 const n=picks.length,side=baseOrder[n]||null;
 const phase=n>=12?'complete':draft.phase||'pre';
 const isLive=phase==='live'&&n<12;
 $('#gga-draft-badge').textContent=phase==='live'?'DRAFT LIVE':phase==='complete'?'DRAFT COMPLETE':'PRE-DRAFT';
 $('#gga-draft-badge').classList.toggle('live',phase==='live');
 $('#gga-draft-a-label').textContent=$('#gga-draft-a-name').textContent=teamName('A');
 $('#gga-draft-b-label').textContent=$('#gga-draft-b-name').textContent=teamName('B');
 $('#gga-on-clock').textContent=n>=12?'The teams are set':isLive?teamName(side):'Awaiting the first pick';
 $('#gga-pick-number').textContent=n>=12?'12 selections complete':'Pick '+(n+1)+' / 12';
 $('#gga-draft-status-home').textContent=n>=12?'The draft has concluded. View both six-golfer teams and the alternate.':isLive?teamName(side)+' is on the clock for pick '+(n+1)+'.':'The draft board is ready. Waiting for the owner to open the 2027 draft.';
 for(const letter of ['A','B']){
   const sidePicks=picks.map((p,i)=>({...p,index:i})).filter(p=>p.team===letter);
   $('#gga-draft-'+letter.toLowerCase()+'-count').textContent=sidePicks.length+' / 6';
   $('#gga-draft-'+letter.toLowerCase()+'-picks').innerHTML=Array.from({length:6},(_,i)=>{
     const p=sidePicks[i],golfer=p?resolvePlayer(p.playerId):null;
     return '<div class="gga-pick"><span class="gga-slot-number">'+(i+1)+'</span>'+(golfer?core.avatar(golfer,'md')+'<div><strong>'+esc(golfer.name)+'</strong><br><small>Pick #'+(p.index+1)+'</small></div>':'<small>Available slot</small>')+'</div>';
   }).join('');
 }
 const pool=state.players.filter(p=>!picks.some(x=>x.playerId===p.id));
 $('#gga-draft-pool').innerHTML=pool.map(p=>'<div class="gga-pick">'+core.avatar(p,'md')+'<div><strong>'+esc(p.name)+'</strong><br><small>'+(p.handicap===null?'HCP pending':'HCP '+Number(p.handicap).toFixed(1))+'</small></div></div>').join('')||'<p class="quiet">The draft pool is empty.</p>';
 $('#gga-draft-history').innerHTML=baseOrder.map((side,i)=>'<span class="'+(i<n?'done':'')+'">#'+(i+1)+' · '+esc(teamName(side))+(i<n?' · '+esc(nameOf(picks[i].playerId)):'')+'</span>').join('');
 const pickSelect=$('#gga-owner-pick-select');
 const old=pickSelect.value;
 pickSelect.innerHTML=pool.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
 if(pool.some(p=>p.id===old))pickSelect.value=old;
 $('#gga-make-pick').disabled=n>=12||!pool.length;
 $('#gga-undo-pick').disabled=n===0;
 $('#gga-owner-draft-state').value=draft.phase||'pre';
 $('#gga-next-location').textContent='Location · '+esc(s?.location||'To be announced');
 $('#gga-next-date').textContent='Date · '+(s?.date?new Date(s.date+'T12:00:00').toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}):'To be announced');
}
function ownerEditor(){
 $('#gga-owner-hero').value=state.clubhouse.hero??placeholder.hero;
 $('#gga-owner-announcement').value=state.clubhouse.announcement??placeholder.announcement;
 $('#gga-owner-announcement-label').value=state.clubhouse.announcementLabel??placeholder.announcementLabel;
 const r=matches2026()?.rounds||[];
 $('#gga-owner-history').innerHTML=r.map((round,ri)=>'<h4>'+esc(round.title)+'</h4>'+round.matches.map((m,mi)=>'<div class="gga-admin-result"><div><strong>'+esc((m.a||[]).map(nameOf).join(' & '))+'</strong><br><small>vs '+esc((m.b||[]).map(nameOf).join(' & ')||'Benchmark')+'</small></div><select data-hist-round="'+ri+'" data-hist-match="'+mi+'" aria-label="Match winner"><option value="" '+(!m.manualWinner?'selected':'')+'>Unknown</option><option value="A" '+(m.manualWinner==='A'?'selected':'')+'>Side A</option><option value="B" '+(m.manualWinner==='B'?'selected':'')+'>Side B</option><option value="halve" '+(m.manualWinner==='halve'?'selected':'')+'>Halved</option><option value="handicap" '+(m.manualWinner==='handicap'?'selected':'')+'>Handicap loss</option></select><input data-hist-note="'+ri+'" data-hist-index="'+mi+'" aria-label="Match note" value="'+esc(m.manualNote||'')+'" placeholder="Historical note"></div>').join('')).join('');
 let pins={};try{pins=JSON.parse(localStorage.getItem(core.AUTH_STORE))||{}}catch{}
 $('#gga-owner-account-controls').innerHTML=state.players.map(p=>'<div><span><strong>'+esc(p.name)+'</strong><br><small>'+esc(p.username||'')+' · '+(pins[p.username]?'PIN set on this device':'No local PIN')+'</small></span><button class="btn btn-secondary btn-tiny" data-reset-pin="'+esc(p.username||'')+'" '+(!pins[p.username]?'disabled':'')+'>Reset local PIN</button></div>').join('');
}
function visibility(){
 const owner=core.isOwner();
 $$('.gga-owner-only').forEach(e=>{e.hidden=!owner;e.style.display=owner?'':'none'});
 $('#gga-draft-controls').hidden=!owner;
 const active=$('#tabs [data-tab].active');
 if(!owner&&active&&['matches','roster','owner'].includes(active.dataset.tab))core.showTab('home');
}
function renderUpgrade(){
 visibility();
 const copy=state.clubhouse;
 $('#gga-hero-copy').textContent=copy.hero||placeholder.hero;
 $('#gga-announcement').textContent=copy.announcement||placeholder.announcement;
 $('#gga-announce-label').textContent=copy.announcementLabel||placeholder.announcementLabel;
 summary();populateDraft();
 if(core.isOwner()&&$('#owner').classList.contains('active'))ownerEditor();
}
window.GGA_UPGRADE_RENDER=renderUpgrade;
document.addEventListener('click',event=>{
 const nav=event.target.closest('[data-open-tab]');if(nav){core.showTab(nav.dataset.openTab);if(nav.dataset.openTab==='owner')ownerEditor();return;}
 if(!core.isOwner())return;
 if(event.target.closest('#gga-make-pick')){
   if(draft.picks.length>=12)return core.notify('All twelve selections are complete.');
   const pid=$('#gga-owner-pick-select').value;if(!pid||hasPick(pid))return core.notify('Choose an available golfer.');
   draft.picks.push({playerId:pid,team:baseOrder[draft.picks.length]});if(draft.picks.length===12)draft.phase='complete';core.save();core.render();core.notify('Draft pick recorded.');return;
 }
 if(event.target.closest('#gga-undo-pick')){draft.picks.pop();if(draft.phase==='complete')draft.phase='live';core.save();core.render();return;}
 if(event.target.closest('#gga-reset-draft')){if(!confirm('Reset all 2027 draft picks?'))return;draft.picks=[];draft.phase='pre';core.save();core.render();return;}
 if(event.target.closest('#gga-save-home')){state.clubhouse.hero=$('#gga-owner-hero').value.trim();state.clubhouse.announcement=$('#gga-owner-announcement').value.trim();state.clubhouse.announcementLabel=$('#gga-owner-announcement-label').value.trim();core.save();core.render();core.notify('Clubhouse content updated on this device.');return;}
 const reset=event.target.closest('[data-reset-pin]');if(reset){if(!confirm('Reset this local PIN? Anyone accessing a fresh device can claim the account.'))return;let pins={};try{pins=JSON.parse(localStorage.getItem(core.AUTH_STORE))||{}}catch{}delete pins[reset.dataset.resetPin];localStorage.setItem(core.AUTH_STORE,JSON.stringify(pins));core.notify('Local PIN reset. Reload to sync the login dialog.');ownerEditor();}
});
$('#gga-owner-draft-state').addEventListener('change',event=>{if(!core.isOwner())return;draft.phase=event.target.value;core.save();core.render()});
$('#gga-owner-history').addEventListener('change',e=>{if(!core.isOwner())return;const el=e.target,ri=el.dataset.histRound??el.dataset.histNote,mi=el.dataset.histMatch??el.dataset.histIndex;if(ri===undefined||mi===undefined)return;const m=matches2026()?.rounds?.[+ri]?.matches?.[+mi];if(!m)return;if(el.dataset.histRound!==undefined)m.manualWinner=el.value||null;else m.manualNote=el.value.trim();core.save();core.render();});
$('#tabs').addEventListener('click',e=>{const el=e.target.closest('[data-tab]');if(el?.dataset.tab==='owner'&&core.isOwner())ownerEditor()});
renderUpgrade();core.showTab('home');
})();