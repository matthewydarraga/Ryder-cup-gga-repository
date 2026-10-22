/* Matthew's in-person draft desk. Shared persistence uses the existing owner adapter. */
(()=>{'use strict';
const core=window.GGA,$=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state=()=>core.getState(),season=()=>state().seasons.find(s=>s.year===2027);
function data(){return state().draft2027||(state().draft2027={phase:'pre',picks:[]});}
function config(){const c=data().config||{};return {size:6,first:'A',mode:'snake',captainA:'',captainB:'',...c};}
function order(c){const total=2*(c.size-(c.captainA&&c.captainB?1:0));return Array.from({length:total},(_,i)=>{const a=c.mode==='alternating'?i%2===0:i%4===0||i%4===3;return a?c.first:c.first==='A'?'B':'A';});}
function members(side){const c=config(),captain=c['captain'+side];return [...(captain?[{playerId:captain,team:side,captain:true}]:[]),...data().picks.filter(p=>p.team===side)];}
const team=s=>season()?.teams?.[s]?.name||'Team '+s;
const golfer=id=>state().players.find(p=>p.id===id);
function available(){const used=new Set(['A','B'].flatMap(s=>members(s).map(p=>p.playerId)));return state().players.filter(p=>!used.has(p.id));}
function ready(){const c=config();return Number.isInteger(c.size)&&c.size>=1&&c.size<=6&&state().players.length>=c.size*2&&['A','B'].includes(c.first)&&['snake','alternating'].includes(c.mode)&&((!c.captainA&&!c.captainB)||(c.captainA!==c.captainB&&golfer(c.captainA)&&golfer(c.captainB)));}
const option=(v,label,chosen)=>'<option value="'+esc(v)+'"'+(v===chosen?' selected':'')+'>'+esc(label)+'</option>';
function render(){
 const d=data();if(!Array.isArray(d.picks))d.picks=[];const c=config(),sequence=order(c),n=d.picks.length,full=n===sequence.length,phase=d.phase||'pre',owner=core.isOwner();
 $('#gga-draft-badge').textContent=({pre:'PRE-DRAFT',live:'DRAFT LIVE',paused:'PAUSED',complete:'FINALIZED'})[phase]||'PRE-DRAFT';
 $('#gga-draft-badge').classList.toggle('live',phase==='live');
 $('#gga-on-clock').textContent=phase==='complete'?'The teams are set':full?'Ready to finalize':phase==='live'?team(sequence[n]):phase==='paused'?'Draft paused':'Waiting for Matthew to start';
 $('#gga-pick-number').textContent=full?n+' selections complete':'Pick '+(n+1)+' / '+sequence.length;
 $('#gga-draft-status-home').textContent=phase==='complete'?'Draft finalized. The teams and alternates are set.':phase==='live'&&!full?team(sequence[n])+' is on the clock.':phase==='paused'?'The draft is paused.':'Matthew controls when the GGA draft begins.';
 for(const side of ['A','B']){const key=side.toLowerCase(),roster=members(side);$('#gga-draft-'+key+'-label').textContent=$('#gga-draft-'+key+'-name').textContent=team(side);$('#gga-draft-'+key+'-count').textContent=roster.length+' / '+c.size;$('#gga-draft-'+key+'-picks').innerHTML=Array.from({length:c.size},(_,i)=>{const pick=roster[i],p=pick&&golfer(pick.playerId);return '<div class="gga-pick"><span class="gga-slot-number">'+(i+1)+'</span>'+(p?core.avatar(p,'md')+'<div><strong>'+esc(p.name)+'</strong><br><small>'+(pick.captain?'Captain':'Drafted')+'</small></div>':'<small>Available slot</small>')+'</div>';}).join('');}
 const pool=available();$('#gga-draft-pool').innerHTML=(full?'<p class="hint">Undrafted / alternates</p>':'')+pool.map(p=>'<div class="gga-pick">'+core.avatar(p,'md')+'<div><strong>'+esc(p.name)+'</strong><br><small>'+(p.handicap==null?'HCP pending':'HCP '+Number(p.handicap).toFixed(1))+'</small></div></div>').join('');
 $('#gga-draft-history').innerHTML=sequence.map((s,i)=>'<span class="'+(i<n?'done':'')+'">#'+(i+1)+' · '+esc(team(s))+(i<n?' · '+esc(golfer(d.picks[i].playerId)?.name||'Unavailable player'):'')+'</span>').join('');
 $('#draft-order-summary').textContent=(c.mode==='snake'?'Snake':'Alternating')+' draft · '+c.size+' golfers per team'+(c.captainA?' including captains':'')+' · Undrafted golfers remain alternates.';
 const controls=$('#gga-draft-controls');controls.hidden=!owner;
 if(owner){const locked=phase!=='pre'||n>0,disabled=locked?' disabled':'';
 controls.innerHTML='<h3>Matthew’s draft desk</h3><p class="hint">'+(window.GGA_BACKEND_CONFIGURED?'Owner-controlled shared draft board.':'In-person mode: run the draft on this device and show it on a screen. Other devices do not sync yet.')+'</p><form id="draft-setup"><fieldset'+disabled+' style="border:0;padding:0"><div class="form-row">'+['A','B'].map(s=>'<label class="form-field">Team '+s+' name<input name="name'+s+'" maxlength="40" required value="'+esc(team(s))+'"></label><label class="form-field">Team '+s+' captain<select name="captain'+s+'">'+option('','No reserved captain',c['captain'+s])+state().players.map(p=>option(p.id,p.name,c['captain'+s])).join('')+'</select></label>').join('')+'<label class="form-field">Golfers per team<input name="size" type="number" min="1" max="6" value="'+c.size+'" required></label><label class="form-field">First pick<select name="first">'+['A','B'].map(s=>option(s,'Team '+s,c.first)).join('')+'</select></label><label class="form-field">Pick order<select name="mode">'+option('snake','Snake (A B B A…)',c.mode)+option('alternating','Alternating (A B A B…)',c.mode)+'</select></label></div><button class="btn btn-secondary" type="submit">Save draft setup</button></fieldset><p class="hint">Captains occupy one roster spot each. Reserve both captains or neither. Save setup before starting. Setup locks when the draft starts.</p></form><div class="flex" style="margin:16px 0">'+(phase==='pre'?'<button class="btn btn-gold" data-draft-action="start">Start draft</button>':phase==='paused'?'<button class="btn btn-gold" data-draft-action="resume">Resume draft</button>':phase==='live'?'<button class="btn btn-secondary" data-draft-action="pause">Pause draft</button>':'')+'<button class="btn btn-secondary" data-draft-action="undo" '+(!n||phase==='complete'?'disabled':'')+'>Undo last pick</button><button class="btn btn-gold" data-draft-action="finalize" '+(!full||phase==='pre'||phase==='complete'?'disabled':'')+'>Finalize teams</button><button class="btn btn-secondary" data-draft-action="backup">Download draft backup</button><button class="btn btn-danger" data-draft-action="reset">Reset draft</button></div>'+(phase==='live'&&!full?'<div class="flex"><label class="form-field">Select golfer for '+esc(team(sequence[n]))+'<select id="draft-pick-player">'+pool.map(p=>option(p.id,p.name,'')).join('')+'</select></label><button class="btn btn-gold" data-draft-action="pick">Confirm pick</button></div>':'')+'<p class="hint">Finalizing writes the teams to the 2027 roster. Resetting clears that draft roster; a copy is kept for recovery.</p>';
 }
 $('#gga-next-location').textContent='Location · '+(season()?.location||'To be announced');$('#gga-next-date').textContent='Date · '+(season()?.date||'To be announced');
}
function commit(message){core.save();core.render();core.notify(message);}
function act(action,pid){
 if(!core.isOwner())return false;const d=data(),seq=order(config());
 if(action==='start'){if(d.phase!=='pre'||!ready())return false;d.phase='live';}
 else if(action==='pause'){if(d.phase!=='live')return false;d.phase='paused';}
 else if(action==='resume'){if(d.phase!=='paused')return false;d.phase='live';}
 else if(action==='pick'){if(d.phase!=='live'||d.picks.length>=seq.length||!available().some(p=>p.id===pid))return false;d.picks.push({playerId:pid,team:seq[d.picks.length]});}
 else if(action==='undo'){if(d.phase==='complete'||!d.picks.length)return false;d.picks.pop();}
 else if(action==='finalize'){if(d.phase==='pre'||d.phase==='complete'||d.picks.length!==seq.length||!ready())return false;d.previousRoster={...season().roster};season().roster=Object.fromEntries(['A','B'].flatMap(s=>members(s).map(p=>[p.playerId,s])));d.phase='complete';}
 else return false;return true;
}
document.addEventListener('submit',event=>{
 if(event.target.id!=='draft-setup')return;event.preventDefault();if(!core.isOwner()||data().phase!=='pre'||data().picks.length)return;
 const f=new FormData(event.target),c={size:Number(f.get('size')),first:f.get('first'),mode:f.get('mode'),captainA:f.get('captainA'),captainB:f.get('captainB')},old=data().config;data().config=c;
 if(!ready()||!String(f.get('nameA')).trim()||!String(f.get('nameB')).trim()){data().config=old;core.notify('Choose valid team sizes and two different captains, or no captains.');return;}
 for(const s of ['A','B'])season().teams[s].name=String(f.get('name'+s)).trim().slice(0,40);commit('Draft setup saved.');
});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-draft-action]');if(!button||!core.isOwner())return;const action=button.dataset.draftAction;
 if(action==='backup'){core.exportFile();return;}
 if(action==='reset'){if(!confirm('Reset the 2027 draft? Current picks will be saved in a recovery copy.'))return;const d=data();d.lastResetBackup=JSON.parse(JSON.stringify({config:d.config||null,picks:d.picks,phase:d.phase,roster:season().roster,previousRoster:d.previousRoster||null}));if(d.phase==='complete')season().roster=d.previousRoster||{};d.picks=[];d.phase='pre';commit('Draft reset. Recovery copy retained in your data backup.');return;}
 if(action==='finalize'&&!confirm('Finalize these teams and apply them to the 2027 roster?'))return;
 if(action==='start'&&!confirm('Start the live draft using the saved setup?'))return;
 if(act(action,$('#draft-pick-player')?.value))commit(({start:'Draft is live.',resume:'Draft resumed.',pause:'Draft paused.',pick:'Pick confirmed.',undo:'Last pick undone.',finalize:'Teams finalized.'})[action]);else core.notify('Action unavailable. Check the saved setup and draft state.');
});
window.GGA_DRAFT={render,order,act,ready};
})();
