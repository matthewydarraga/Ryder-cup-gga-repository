/* Manual player stats replace the retired GHIN screenshot import. */
(()=>{
'use strict';
const gga=window.GGA;if(!gga)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.GGA_GHIN_SNAPSHOTS={};window.GGA_GHIN_PANEL=()=>'';
// One-time reset: never erase values entered using the new manual editor.
for(const p of gga.getState().players){
 if(p.manualStats?.version!==1){p.handicap=null;p.manualStats=null;}
 delete p.handicapChecked;delete p.handicapSource;delete p.ghinSnapshotRevision;
 delete p.scores;delete p.roundHistory;delete p.ghinScores;
}
window.GGA_MANUAL_STATS_PANEL=(p,editor)=>{
 const d=p.manualStats?.version===1?p.manualStats:{},year=d.year||new Date().getFullYear();
 const input=(id,label,value,type='text',extra='')=>`<label class="form-field">${label}<input id="${id}" type="${type}" value="${esc(value??'')}" ${extra}></label>`;
 const round=(key,label)=>`<fieldset style="border:1px solid #707887;border-radius:10px;padding:14px;margin:14px 0"><legend>${label} of the year · 18 holes</legend><div class="form-row">${input('manual-'+key+'-score','Score',d[key]?.score,'number','min="18" max="300" step="1"')}${input('manual-'+key+'-course','Golf course',d[key]?.course,'text','maxlength="120"')}${input('manual-'+key+'-location','Course location (city / state)',d[key]?.location,'text','maxlength="120"')}</div></fieldset>`;
 const summary=key=>d[key]?`${esc(d[key].score)} · ${esc(d[key].course)} · ${esc(d[key].location)}`:'Not entered';
 if(!editor)return `<section class="gga-dossier-panel"><h3>Manually entered stats · ${year}</h3><p>Best round: ${summary('best')}</p><p>Worst round: ${summary('worst')}</p></section>`;
 return `<section class="gga-dossier-panel" style="grid-column:1/-1"><h3>My handicap & yearly rounds</h3><p class="hint">Enter your own handicap and best/worst 18-hole rounds. Edit or clear them here at any time. No GHIN imports or automatic score calculations.</p><form id="gga-manual-stats" data-player-id="${esc(p.id)}"><div class="form-row">${input('manual-handicap','Handicap',p.handicap,'number','min="-10" max="54" step="0.1" placeholder="Not entered"')}${input('manual-year','Year',year,'number','min="2020" max="2100" step="1" required')}</div>${round('best','Best round')}${round('worst','Worst round')}<p class="hint">Leave all three fields of a round blank to clear it. Changing the year replaces the displayed annual record.</p><button class="btn" type="submit">Save my stats</button><p id="manual-stats-status" role="status" aria-live="polite"></p></form></section>`;
};
window.GGA_VALIDATE_MANUAL_STATS=d=>{
 if(d.handicap!==null&&(!Number.isFinite(d.handicap)||d.handicap< -10||d.handicap>54))throw Error('Handicap must be between -10 and 54.');
 if(!Number.isInteger(d.year)||d.year<2020||d.year>2100)throw Error('Enter a year from 2020 to 2100.');
 for(const key of ['best','worst']){const r=d[key];if(r===null)continue;if(!Number.isInteger(r.score)||r.score<18||r.score>300||!r.course.trim()||!r.location.trim()||r.course.length>120||r.location.length>120)throw Error('For each round, enter a whole-number score (18–300), course and location, or leave all three blank.');}
 if(d.best&&d.worst&&d.best.score>d.worst.score)throw Error('Best round must be the same score as or lower than worst round.');
 return d;
};
document.addEventListener('submit',async e=>{
 const form=e.target;if(form.id!=='gga-manual-stats')return;e.preventDefault();
 const status=form.querySelector('[role="status"]'),button=form.querySelector('button[type="submit"]');
 const p=gga.getState().players.find(p=>p.id===form.dataset.playerId);
 if(!p||!(gga.isOwner()||gga.getUser()?.id===p.id)){status.textContent='Sign in to edit your profile.';return;}
 const val=id=>form.querySelector('#manual-'+id).value.trim();
 const readRound=key=>{const score=val(key+'-score'),course=val(key+'-course'),location=val(key+'-location');return !score&&!course&&!location?null:{score:score===''?null:Number(score),course,location};};
 try{
 const d=window.GGA_VALIDATE_MANUAL_STATS({version:1,handicap:val('handicap')===''?null:Number(val('handicap')),year:Number(val('year')),best:readRound('best'),worst:readRound('worst')});
 button.disabled=true;status.textContent='Saving…';
 if(window.GGA_BACKEND_CONFIGURED){if(!window.GGA_SAVE_MANUAL_STATS)throw Error('Sign-in is still loading. Try again.');await window.GGA_SAVE_MANUAL_STATS(p,d);}
 p.manualStats=d;p.handicap=d.handicap;gga.save();gga.render();
 const message=window.GGA_BACKEND_CONFIGURED?'Stats saved and confirmed.':'Stats saved on this device.';
 const current=document.querySelector('#manual-stats-status');if(current)current.textContent=message;gga.notify(message);
 }catch(err){status.textContent='Not saved: '+err.message;}finally{button.disabled=false;}
});
gga.save();gga.render();
})();
