/* GGA match desk. Metadata is owner-controlled; hole documents sync independently. */
(()=>{'use strict';
const legacyPoints={front:0,back:0,match:1};
const results=typeof module!=='undefined'?require('./results-core.js'):window.GGA_RESULTS;
const contest=results.contest,score=results.score;
const model=typeof module!=='undefined'?require('./predictions.js'):window.GGA_PREDICTIONS;
function predict(holes,a,b){return model.project(holes,legacyPoints,model.holeOdds(a.map(p=>p?.handicap),b.map(p=>p?.handicap)));}
function canScore(m,started,owner,playerId){return !!started&&(owner||[...m.a,...m.b].includes(playerId));}
if(typeof module!=='undefined')module.exports={contest,score,predict,canScore};
if(typeof window==='undefined'||!window.GGA)return;
const g=window.GGA,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=()=>{const s=g.getState();return s.liveCup||(s.liveCup={year:2027,rounds:[]});};
const team=s=>g.getState().seasons.find(x=>x.year===2027)?.teams?.[s]?.name||'Team '+s;
const names=ids=>ids.map(id=>g.player(id)?.name||'Unknown golfer').join(' & ');
const panel=document.createElement('section');panel.id='live';panel.className='view';document.querySelector('main.shell').appendChild(panel);
const localDay=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
let liveView='mine',liveDay=localDay();
let selectedRound='all',selectedMatch='',mode='official',busy=false,editing='';
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),points=m=>m.points||legacyPoints;
const rounds=()=>data().rounds.filter(r=>!!r.test===(mode==='test'));
const holes=m=>results.effectiveHoles(m,window.GGA_LIVE_RESULTS);
const editable=(m,r)=>lifecycle(m).status==='live'&&canScore(m,r.started,g.isOwner(),g.getUser?.()?.id)&&(!window.GGA_BACKEND_CONFIGURED||!!window.GGA_BACKEND_API?.canScore(m.id));
const labels={front:'Front 9',back:'Back 9',match:'Overall match'};
const lifecycle=m=>window.GGA_MATCH_STATES?.get(m.id)||{status:'live',confirmed:[],generation:0,revision:0};
const stateLabel=(r,m)=>({live:r.started?'Live':'Scheduled',awaiting:'Awaiting Confirmation',final:'Final'}[lifecycle(m).status]);
function lifecyclePanel(r,m){
 const s=lifecycle(m),player=g.getUser?.()?.id,participants=[...m.a,...m.b],owner=g.isOwner(),can=participants.includes(player);
 const button=(action,label)=>'<button class="btn btn-secondary" data-match-action="'+action+'" data-match-revision="'+s.revision+'" data-match-id="'+m.id+'">'+label+'</button>';
 const lineage=new Set([m.id,...(data().lineupHistory||[]).filter(h=>h.lineageId===(m.lineageId||m.id)).map(h=>h.before.matchId)]);
 const archived=(data().lifecycleArchive||[]).flatMap(a=>(a.audit||[]).filter(x=>a.mapping[x.matchId]===m.id));
 const records=[...(window.GGA_MATCH_AUDIT?.values()||[])].filter(x=>lineage.has(x.matchId)).concat(archived).sort((a,b)=>b.revision-a.revision);
 return '<section class="panel panel-pad"><strong>'+stateLabel(r,m)+'</strong>'+(s.status==='awaiting'?'<p>Scores are frozen for review. Confirmed: '+s.confirmed.length+'/'+participants.length+' · '+esc(names(s.confirmed))+'</p>':'')+
 (r.started&&s.status==='live'&&(can||owner)?'<p>Submit the agreed scorecard when play is complete. This locks hole edits while every participant confirms.</p>'+button('submit','Submit for confirmation'):'')+
 (s.status==='awaiting'&&can&&!s.confirmed.includes(player)?button('confirm','Confirm this scorecard'):'')+
 (s.status==='awaiting'&&owner&&participants.every(p=>s.confirmed.includes(p))?button('finalize','Finalize match'):'')+
 (owner&&s.status!=='live'?button('reopen','Reopen with reason'):'')+
 (records.length?'<details><summary>Match audit history ('+records.length+')</summary>'+records.map(x=>'<p>#'+x.revision+' · '+esc(x.action)+(x.matchId!==m.id?' (previous scorecard)':'')+' · '+esc(names([x.actor]))+(x.reason?' · '+esc(x.reason):'')+' · '+esc(x.updatedAt?.toDate?.().toLocaleString()||'Server confirmed')+'</p>').join('')+'</details>':'')+'</section>';
}
function commit(message){g.save();if(g.refreshResults)g.refreshResults();else render();g.notify(message);}
function total(rs){const ids=new Set(rs.map(r=>r.id)),model=results.event(g.getState(),2027,{practice:mode==='test',overlay:window.GGA_LIVE_RESULTS});let a=0,b=0;for(const r of model.rounds)if(ids.has(r.id))for(const m of r.matches){a+=m.secured.a;b+=m.secured.b;}return [a,b];}
const formatInput=(r,m)=>'<label class="form-field">Playing format<select name="playing-format" '+(m&&started(r,m,holes(m))?'disabled':'')+'>'+Object.entries(model.formats).map(([key,label])=>'<option value="'+key+'" '+(key===formatFor(r,m||{})?'selected':'')+'>'+label+'</option>').join('')+'</select></label>';
const pointInputs=p=>['front','back','match'].map(k=>'<label class="form-field">'+labels[k]+' points<input name="points-'+k+'" type="number" min="0" max="100" step="0.5" value="'+p[k]+'" required></label>').join('');
function matchForm(r,m){const size=m?.a.length||1;return '<form data-live-add="'+r.id+'" data-edit="'+(m?.id||'')+'"><h4>'+(m?'Edit matchup':'New matchup')+'</h4><div class="form-row"><label class="form-field">Team size<select name="format">'+[1,2,3,4].map(n=>'<option value="'+n+'" '+(n===size?'selected':'')+'>'+n+'v'+n+'</option>').join('')+'</select></label>'+['A','B'].map(s=>[0,1,2,3].map(i=>'<label class="form-field" '+(i?'data-partner="'+i+'" '+(i>=size?'hidden':''):'')+'>'+esc(team(s))+' · golfer '+(i+1)+'<select name="'+s+i+'"><option value="">Select golfer</option>'+g.getState().players.map(p=>'<option value="'+esc(p.id)+'" '+(m?.[s.toLowerCase()][i]===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>').join('')).join('')+formatInput(r,m)+pointInputs(m?points(m):{front:1,back:1,match:1})+'</div><p class="hint">Ties split that contest’s points equally. Set a contest to 0 to disable it.</p>'+(m?'<fieldset style="margin:16px 0;padding:14px;border:1px solid #707887;border-radius:10px"><legend>When changing players</legend><p class="hint">Choose what happens to the current scorecard. Retained results stay with the team sides, not individual golfers. The previous lineup and scorecard are kept in history.</p><label class="form-field">Existing results<select name="lineup-policy"><option value="">Choose before changing players</option><option value="retain">Keep current results for the updated lineup</option><option value="fresh">Start fresh with an empty scorecard</option></select></label><label class="form-field">Lineup change reason<input name="lineup-reason" maxlength="500" placeholder="Substitution, corrected pairing, or new match"></label></fieldset>':'')+'<button class="btn" type="submit">'+(m?'Save matchup':'Add matchup')+'</button>'+(m?'<button type="button" class="btn btn-secondary" data-live-cancel>Cancel edit</button>':'')+'</form>';}
function status(c){return !c.played?'Not started':c.lead===0?'All square':esc(team(c.lead>0?'A':'B'))+' '+Math.abs(c.lead)+' UP';}
function history(m){
 const entries=(data().lineupHistory||[]).filter(x=>x.lineageId===(m.lineageId||m.id));if(!entries.length)return '';
 return '<details><summary>Lineup history ('+entries.length+(entries.length===1?' change':' changes')+')</summary>'+entries.slice().reverse().map(x=>'<article class="panel panel-pad"><strong>'+esc(x.policy==='retain'?'Results retained':'Fresh match started')+'</strong><p>'+esc(names(x.before.a))+' vs '+esc(names(x.before.b))+' → '+esc(names(x.after.a))+' vs '+esc(names(x.after.b))+'</p><p>'+esc(x.reason)+'</p><small>By '+esc(g.getState().players.find(p=>p.username===x.actor)?.name||x.actor)+' · '+esc(new Date(x.at).toLocaleString())+'</small><p class="hint">Previous scorecard · '+x.before.holes.filter(h=>h!==null).length+' recorded holes · historical results do not add to current standings.</p><div class="live-holes">'+x.before.holes.map((h,i)=>'<label>Hole '+(i+1)+'<strong>'+esc(h==='halve'?'Tied':h?team(h):'—')+'</strong></label>').join('')+'</div></article>').join('')+'</details>';
}
const indexFor=id=>g.getState().seasons.find(s=>s.year===2027)?.handicapSnapshot?.[id]??g.player(id)?.manualStats?.handicap??g.player(id)?.handicap??null;
const field=()=>g.getState().players.map(p=>indexFor(p.id));
const formatFor=(r,m)=>model.formatKey(m.format||r.format);
const formatLabel=(r,m)=>m.a.length+'v'+m.b.length+' '+model.formats[formatFor(r,m)];
const started=(r,m,hs)=>r.started||!!m.predictionSnapshot||hs.some(h=>h!==null)||lifecycle(m).status!=='live';
function projection(r,m,hs=holes(m)){
 const locked=model.validSnapshot(m.predictionSnapshot,m)?m.predictionSnapshot:null;
 const legacy=started(r,m,hs)&&!locked;
 const inputs=locked||model.snapshot(m,legacy?()=>null:indexFor,legacy?[]:field());
 const p=model.holeOdds(m.a.map(id=>inputs.players[id]),m.b.map(id=>inputs.players[id]),formatFor(r,m),inputs.fieldMedian);
 return {...model.project(hs,points(m),p,{final:lifecycle(m).status==='final'}),known:p.known};
}
const pct=p=>p===0?'0%':p>=1?'100%':p<.001?'<0.1%':p>.999?'>99.9%':(p*100).toFixed(1)+'%';
const odds=(a,b,p,tie)=>esc(a)+' '+esc(pct(p.a))+' / '+esc(b)+' '+esc(pct(p.b))+' / '+tie+' '+esc(pct(p.tie));
function matchOdds(r,m,hs,p){
 if(p.unresolved)return '<p class="hint">Final scorecard · '+p.unresolved/4+' unresolved points excluded from projections.</p>';
 if(p.settled)return '<p class="hint">All enabled point contests decided.</p>';
 return '<p class="hint"><strong>'+(started(r,m,hs)?'Live win chance':'Pre-match odds')+'</strong> · '+odds(names(m.a),names(m.b),p,'Tie')+'<br>Model projection for winning more matchup points · '+(p.known?p.known+' of '+(m.a.length+m.b.length)+' Handicap Indexes known':'Even strength prior; no saved Handicap Index inputs')+'</p>';
}
function segments(hs,m){
 return '<div class="live-points">'+score(hs,points(m)).map(c=>'<div><small>'+labels[c.key]+'</small><strong>'+(c.settled?c.a+' – '+c.b+' · '+(c.lead===0?'Halved':c.remaining?'Clinched':'Decided'):status(c)+(c.remaining>0&&Math.abs(c.lead)===c.remaining?' · Dormie':''))+'</strong><small>'+c.played+' recorded · '+c.points+' pts</small></div>').join('')+'</div>';
}
function spectatorSummary(r,m,p){
 const hs=holes(m),c=contest(hs),a=hs.filter(h=>h==='A').length,b=hs.filter(h=>h==='B').length;
 return '<article class="live-match" aria-label="Match status"><h4>'+esc(names(m.a))+' <span>vs</span> '+esc(names(m.b))+'</h4><p><strong>'+status(c)+'</strong> · '+esc(stateLabel(r,m))+' · '+esc(formatLabel(r,m))+' · '+c.played+'/18 holes recorded</p><p class="hint">Holes won: '+esc(names(m.a))+' '+a+' – '+b+' '+esc(names(m.b))+' · Tied '+(c.played-a-b)+'</p>'+segments(hs,m)+matchOdds(r,m,hs,p||projection(r,m,hs))+'<p class="hint">Read-only spectator view</p></article>';
}
function cupOdds(a,b,projections){
 const p=model.cup(projections);
 if(!p.total)return '<p class="hint">'+(p.unresolved?'No Cup points can be projected from the finalized scorecards.':'Cup projections appear when matchups are scheduled.')+'</p>';
 return '<div aria-label="Ryder Cup projections"><h3>'+(p.settled?'Scheduled Cup points decided':'Ryder Cup win chance')+'</h3><p><strong>'+odds(team('A'),team('B'),p,'Cup tie')+'</strong></p><p class="hint">'+(p.total/4-a-b)+' of '+p.total/4+' points remaining'+(p.unresolved?' · '+p.unresolved/4+' unresolved points on final scorecards excluded':'')+' · Model projection based on all scheduled matchups and recorded holes. A tied Cup is shown separately.</p></div>';
}
const scoreHistory=new Map();
window.GGA_CLEAR_SCORE_HISTORY=()=>scoreHistory.clear();
function scoreHistoryPanel(m){
 if(!window.GGA_SCORE_HISTORY)return '';
 const entries=scoreHistory.get(m.id);
 const result=value=>value==='halve'?'Tied':value?team(value):'No result';
 return '<section class="panel panel-pad"><h4>Hole score history</h4><button class="btn btn-secondary" data-score-history="'+m.id+'">'+(entries?'Refresh history':'Load history')+'</button>'+
 (entries?.length?'<ul>'+entries.map(e=>'<li><strong>Hole '+(e.hole+1)+'</strong> · '+esc(result(e.before))+' → '+esc(result(e.after))+' · '+esc(names([e.actor]))+' · '+esc(e.updatedAt?.toDate?.().toLocaleString()||'Server confirmed')+
 (e.undoOf?' · Undo':'')+(window.GGA_CAN_UNDO_SCORE?.(m.id,e)?' <button class="btn btn-secondary btn-tiny" data-score-undo="'+e.id+'" data-score-match="'+m.id+'">Undo</button>':'')+'</li>').join('')+'</ul><p class="hint">Showing up to 50 recent synced changes.</p>':
 entries?'<p>No recorded changes yet.</p>':'')+'</section>';
}
const holePositions=new Map();
function currentHole(m){if(!holePositions.has(m.id)){const next=holes(m).findIndex(h=>h==null);holePositions.set(m.id,next<0?17:next);}return holePositions.get(m.id);}
function card(r,m,detail,p){
 if(!g.isOwner()&&![...m.a,...m.b].includes(g.getUser?.()?.id))return spectatorSummary(r,m,p);
 const hs=holes(m),can=editable(m,r),c=contest(hs),i=currentHole(m),course=r.course||window.GGA_COURSES?.getForYear?.(2027),h=course?.holes?.find(h=>h.number===i+1);
 const nav=(n,label)=>'<button class="btn btn-secondary" data-hole-nav="'+n+'" data-hole-match="'+m.id+'" '+(n<0||n>17?'disabled':'')+'>'+label+'</button>';
 const choices=[['A',names(m.a)],['halve','Hole tied'],['B',names(m.b)]];
 return '<article class="live-match round-app"><div class="round-status">'+esc(stateLabel(r,m))+' · '+esc(formatLabel(r,m))+'</div><h3>'+esc(names(m.a))+' <span>vs</span> '+esc(names(m.b))+'</h3><div class="match-standing">'+status(c)+'<small>'+c.played+' of 18 holes recorded</small></div>'+
 (!detail?'<button class="btn btn-gold" data-live-open="'+m.id+'">Open match & scorecard</button>':
 '<div class="hole-stage"><div class="hole-aerial" data-aerial-course="'+esc(course?.sourceId||'')+'" data-aerial-hole="'+(i+1)+'"></div><div class="hole-navigation">'+nav(i-1,'←')+'<div><small>CURRENT HOLE</small><h2>Hole '+(i+1)+'</h2></div>'+nav(i+1,'→')+'</div><div class="hole-metrics"><div><strong>'+esc(h?.par??'—')+'</strong><small>PAR</small></div><div><strong>'+esc(h?.yards??'—')+'</strong><small>YARDS</small></div><div><strong>'+esc(h?.strokeIndex??'—')+'</strong><small>INDEX</small></div></div><p class="hint">'+esc(course?course.name+' · '+course.tee+' tees':'Select a course in Golf Courses for hole details.')+'</p><button class="btn btn-secondary" data-map-round="'+r.id+'" data-hole-map="'+(i+1)+'">Satellite view ↗</button><p class="hint" id="hole-map-status-'+m.id+'"></p></div><div class="hole-entry"><h4>Who won this hole?</h4><div class="winner-buttons">'+choices.map(([value,label])=>'<button class="btn '+(hs[i]===value?'btn-gold':'btn-secondary')+'" aria-pressed="'+(hs[i]===value)+'" data-hole-result="'+value+'" data-score-match="'+m.id+'" data-score-round="'+r.id+'" data-score-hole="'+i+'" '+(!can||busy?'disabled':'')+'>'+esc(label)+'</button>').join('')+'</div><p class="hint">'+(can?'Tap the agreed result. Saved scores sync to the leaderboard.':!r.started?'This round has not started.':'Scoring is locked for this match.')+'</p>'+(can?'<button class="btn btn-secondary btn-tiny" data-hole-result="clear" data-score-match="'+m.id+'" data-score-round="'+r.id+'" data-score-hole="'+i+'">Clear hole result</button>':'')+'</div><details class="round-scorecard"><summary>Full scorecard · '+c.played+'/18</summary><div class="hole-strip">'+hs.map((v,n)=>'<button class="hole-chip '+(n===i?'selected':'')+'" data-hole-nav="'+n+'" data-hole-match="'+m.id+'" aria-label="Hole '+(n+1)+'"><small>Hole '+(n+1)+'</small><strong>'+esc(v==='halve'?'AS':v?team(v):'—')+'</strong></button>').join('')+'</div></details>')+
 segments(hs,m)+matchOdds(r,m,hs,p||projection(r,m,hs))+
 '<p class="hint">Holes won: '+hs.filter(h=>h==='A').length+' – '+hs.filter(h=>h==='B').length+' · Tied '+hs.filter(h=>h==='halve').length+'</p>'+lifecyclePanel(r,m)+(detail?scoreHistoryPanel(m)+history(m):'')+(g.isOwner()?'<details><summary>Owner controls</summary><button class="btn btn-secondary" data-live-edit="'+m.id+'">Edit players & points</button><button class="btn btn-danger" data-live-remove="'+m.id+'" data-live-round="'+r.id+'">Remove matchup</button></details>':'')+'</article>';
}
async function saveResult(roundId,matchId,i,value){
 const r=data().rounds.find(x=>x.id===roundId),m=r?.matches.find(x=>x.id===matchId);
 if(busy||!m||!editable(m,r)||!Number.isInteger(i)||i<0||i>17||![null,'A','B','halve'].includes(value))return;
 if(window.GGA_BACKEND_CONFIGURED){busy=true;render();try{const result=await window.GGA_SAVE_HOLE(m.id,i,value,holes(m)[i]);g.notify(result?.pending?'Saved on this device. Waiting to sync.':'Hole saved and confirmed by server.');}catch(e){g.notify('Hole did not save: '+String(e.message||e));}finally{busy=false;render();}}
 else{m.holes[i]=value;commit('Hole saved on this device.');}
}
async function openSatellite(hole,button){
 const course=data().rounds.find(r=>r.id===button.dataset.mapRound)?.course||window.GGA_COURSES?.getForYear?.(2027);if(!course?.sourceId)return g.notify('Select a course first in Golf Courses.');
 button.disabled=true;button.textContent='Checking hole location…';
 try{
 const response=await fetch('https://api.opengolfapi.org/api/v1/courses/'+encodeURIComponent(course.sourceId));if(!response.ok)throw Error('Course map is unavailable.');
 const raw=await response.json(),detail=raw.data||raw.course||raw,hs=detail.holes_data;
 if(!Array.isArray(hs)||hs.length!==18||new Set(hs.map(h=>h.number)).size!==18)throw Error('The API has no reliable 18-hole map for this course.');
 const center=hs.find(h=>h.number===hole)?.green?.center;
 const lat=center?.lat??center?.latitude,lon=center?.lng??center?.lon??center?.longitude;
 if(typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('The API has no mapped location for this hole yet.');
 const url='https://www.google.com/maps/@?api=1&map_action=map&center='+lat+','+lon+'&zoom=18&basemap=satellite';
 const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.className='btn btn-gold';a.textContent='Open hole '+hole+' satellite view ↗';button.replaceWith(a);
 }catch(e){g.notify(e.message);button.textContent='Satellite view unavailable';button.disabled=false;}
}
let roundCourseResults=[],roundCourseDetail=null,roundCourseCard=null,roundCourseRequest=0,roundCourseMessage='Search for the course you will play.';
function roundCoursePicker(){return '<fieldset class="round-course-picker"><legend>Course & tees</legend><div class="flex"><input name="course-search" placeholder="Search golf courses" aria-label="Search golf courses"><button type="button" class="btn btn-secondary" data-round-course-search>Search</button></div><p role="status">'+esc(roundCourseMessage)+'</p><label class="form-field">Course<select name="round-course"><option value="">Choose course</option>'+roundCourseResults.map((c,i)=>'<option value="'+i+'" '+(roundCourseDetail?.id===(c.id||c.course_id)?'selected':'')+'>'+esc((c.name||c.course_name)+' · '+(c.city||'')+' '+(c.state||''))+'</option>').join('')+'</select></label><label class="form-field">Tees<select name="round-tee"><option value="">Choose tees</option>'+(roundCourseDetail?window.GGA_COURSE_CORE.teeArray(roundCourseDetail).map((t,i)=>'<option value="'+i+'" '+(roundCourseCard?.tee===(t.name||t.tee_name||t.color||'')?'selected':'')+'>'+esc((t.name||t.tee_name||t.color||'Unnamed tees')+(t.gender?' · '+t.gender:''))+'</option>').join(''):'')+'</select></label>'+(roundCourseCard?'<p><strong>'+esc(roundCourseCard.name)+' · '+esc(roundCourseCard.tee)+'</strong><br>18 holes · Par '+roundCourseCard.holes.reduce((n,h)=>n+h.par,0)+' · '+(roundCourseCard.holes.every(h=>h.yards!==null)?roundCourseCard.holes.reduce((n,h)=>n+h.yards,0)+' yards':'Some yardages unavailable')+'</p>':'')+'</fieldset>';}
async function fetchRoundCourse(url){const response=await fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)throw Error('Course service returned '+response.status);return response.json();}
async function searchRoundCourses(query){
 const version=++roundCourseRequest;roundCourseCard=null;roundCourseDetail=null;roundCourseResults=[];
 if(query.trim().length<2){roundCourseMessage='Enter at least two characters.';refreshLive();return;}
 roundCourseMessage='Searching…';refreshLive();
 try{const raw=await fetchRoundCourse('https://api.opengolfapi.org/v1/courses/search?q='+encodeURIComponent(query.trim())+'&limit=25');if(version!==roundCourseRequest)return;roundCourseResults=Array.isArray(raw)?raw:raw.courses||raw.results||raw.data?.courses||[];roundCourseMessage=roundCourseResults.length?'Choose the course layout, then tees.':'No courses found.';}catch(e){if(version!==roundCourseRequest)return;roundCourseMessage=e.message;}refreshLive();
}
async function selectRoundCourse(index){
 const version=++roundCourseRequest,selected=roundCourseResults[Number(index)];roundCourseDetail=null;roundCourseCard=null;
 if(index===''||!selected){roundCourseMessage='Choose a course.';refreshLive();return;}
 roundCourseMessage='Loading tees…';refreshLive();
 try{const raw=await fetchRoundCourse('https://api.opengolfapi.org/api/v1/courses/'+encodeURIComponent(selected.id||selected.course_id));if(version!==roundCourseRequest)return;roundCourseDetail=raw.data||raw.course||raw;roundCourseMessage='Choose your tee set.';}catch(e){if(version!==roundCourseRequest)return;roundCourseMessage=e.message;}refreshLive();
}
function selectRoundTee(index){
 roundCourseCard=null;const core=window.GGA_COURSE_CORE,t=index===''?null:core.teeArray(roundCourseDetail)[Number(index)];
 if(!t){roundCourseMessage='Choose your tee set.';refreshLive();return;}
 const problem=core.importProblem(t,roundCourseDetail);if(problem){roundCourseMessage=problem+' Select another course or tee set.';refreshLive();return;}
 const c={source:'OpenGolfAPI',sourceId:String(roundCourseDetail.id||roundCourseDetail.course_id||''),name:roundCourseDetail.name||roundCourseDetail.course_name||'',tee:t.name||t.tee_name||t.color||'',rating:core.number(t.rating,t.course_rating),slope:core.number(t.slope,t.slope_rating),holes:core.holeArray(t,roundCourseDetail),importedAt:new Date().toISOString()};
 if(!core.validCourse(c)){roundCourseMessage='This scorecard has invalid fields.';refreshLive();return;}roundCourseCard=c;roundCourseMessage='Ready. This course and tee set will be saved with this round.';refreshLive();
}
function render(){
 const owner=g.isOwner(),rs=rounds();if(selectedRound!=='all'&&!rs.some(r=>r.id===selectedRound))selectedRound='all';
 const shown=rs.filter(r=>liveView==='day'?r.date===liveDay:selectedRound==='all'||r.id===selectedRound).map(r=>({...r,matches:liveView==='mine'?r.matches.filter(m=>[...m.a,...m.b].includes(g.getUser?.()?.id)):r.matches})),[a,b]=total(rs),[ra,rb]=total(shown);
 const projected=new Map(rs.flatMap(r=>r.matches.map(m=>[m.id,projection(r,m)])));
 const focus=rs.flatMap(r=>r.matches.map(m=>({r,m}))).find(x=>x.m.id===selectedMatch);if(!focus)selectedMatch='';
 panel.innerHTML='<div class="panel panel-pad"><div class="kicker">2027 Ryder Cup'+(mode==='test'?' · PRACTICE ONLY':'')+'</div><h2>Live Scoring</h2><div class="live-tabs" role="tablist" aria-label="Live round views">'+[['mine','My Round'],['day','All Rounds Today'],['all','Event & Setup']].map(([id,label])=>'<button class="btn '+(liveView===id?'btn-gold':'btn-secondary')+'" role="tab" aria-selected="'+(liveView===id)+'" data-live-view="'+id+'">'+label+'</button>').join('')+'</div>'+(liveView==='day'?'<label class="form-field">Day<input type="date" id="live-day" value="'+esc(liveDay)+'"></label>':'')+'<div class="flex"><button class="btn '+(mode==='official'?'btn-gold':'btn-secondary')+'" data-live-mode="official">Official Cup</button><button class="btn '+(mode==='test'?'btn-gold':'btn-secondary')+'" data-live-mode="test">Mock 2027 test</button></div><p>'+(mode==='test'?'Practice scores are separate from the official Cup.':'Custom points for the front 9, back 9 and overall match. Ties split the points.')+'</p><div class="live-total"><strong>'+esc(team('A'))+'<br>'+a+'</strong><span>POINTS SECURED</span><strong>'+esc(team('B'))+'<br>'+b+'</strong></div>'+cupOdds(a,b,[...projected.values()])+'<p class="hint">'+(window.GGA_BACKEND_CONFIGURED?'Wait for server confirmation after each change.':'Device-only preview — changes do not sync.')+' Record agreed hole winners after your handicap and format rules; strokes are not calculated here.</p></div>'+
 (owner&&liveView==='all'?'<form id="live-round-form" class="panel panel-pad"><h3>Matthew’s matchup desk</h3><label class="form-field">Round name<input name="title" maxlength="70" required placeholder="Saturday morning"></label><label class="form-field">Date<input name="date" type="date"></label>'+roundCoursePicker()+'<button class="btn" type="submit">Create '+(mode==='test'?'practice ':'')+'round</button>'+(mode==='test'?'<button class="btn btn-secondary" type="button" data-live-mock>Create mock 2027 tournament</button>':'')+'</form>':'')+
 (liveView==='day'?'':'<div class="panel panel-pad"><p class="hint">'+'Course and tees are shown on each round’s scorecard.'+'</p><label class="form-field">Round / day<select id="live-filter"><option value="all">All rounds</option>'+rs.map(r=>'<option value="'+r.id+'" '+(selectedRound===r.id?'selected':'')+'>'+esc((r.date?r.date+' · ':'')+r.title)+'</option>').join('')+'</select></label>'+(selectedRound!=='all'?'<p>Selected round points: '+ra+' – '+rb+'</p>':'')+'</div>')+(focus?'<button class="btn btn-secondary" data-live-overview>← All matches</button>':'')+
 (!(liveView==='day'?shown.length:shown.some(r=>r.matches.length))&&liveView!=='all'?'<div class="panel panel-pad"><h3>'+(liveView==='mine'?'No round assigned to you yet':'No rounds scheduled for this day')+'</h3><p>'+(liveView==='mine'?'Sign in with your player PIN to see your assigned matches.':'Choose another date or open Event & Setup to see undated rounds.')+'</p></div>':'')+
 (!rs.length?'<div class="panel panel-pad"><h3>'+(mode==='test'?'Ready for a test run':'Waiting for the opening tee shot')+'</h3><p>'+(owner?'Create a round'+(mode==='test'?' or generate the mock tournament.':'.'):'Matthew will set up the matchups.')+'</p></div>':'')+
 (focus?'<article class="panel panel-pad"><h3>'+esc(focus.r.title)+'</h3>'+card(focus.r,focus.m,true,projected.get(focus.m.id))+(editing===focus.m.id?matchForm(focus.r,focus.m):'')+'</article>':shown.filter(r=>liveView!=='mine'||r.matches.length).map(r=>'<article class="panel panel-pad live-round"><h3>'+esc(r.title)+'</h3>'+(r.course?'<p>'+esc(r.course.name)+' · '+esc(r.course.tee)+' tees</p>':'')+'<p>'+esc(r.date||'')+' · '+(r.started?'Round open for scoring':r.matches.some(m=>started(r,m,holes(m)))?'Scoring paused':'Setup')+' · Round points '+total([r]).join(' – ')+'</p>'+(owner&&liveView==='all'?'<div class="flex"><button class="btn btn-gold" data-live-start="'+r.id+'" '+(!r.matches.length?'disabled':'')+'>'+(r.started?'Pause round':'Start round')+'</button><button class="btn btn-secondary" data-live-rename="'+r.id+'">Rename round</button><button class="btn btn-danger" data-live-delete-round="'+r.id+'">Remove round</button></div>'+(!r.started?matchForm(r):''):'')+r.matches.map(m=>(liveView==='day'?spectatorSummary(r,m,projected.get(m.id))+'<button class="btn btn-secondary" data-live-open="'+m.id+'">View round</button>':card(r,m,liveView==='mine',projected.get(m.id)))+(editing===m.id?matchForm(r,m):'')).join('')+'</article>').join(''));
 panel.querySelectorAll?.('[data-aerial-hole]').forEach(host=>window.GGA_HOLE_IMAGERY?.mount(host,host.dataset.aerialCourse,Number(host.dataset.aerialHole)));
 if(busy)panel.querySelectorAll?.('button,input,select').forEach(el=>el.disabled=true);
}
panel.addEventListener('submit',async e=>{
 e.preventDefault();if(!g.isOwner()||busy)return;const f=e.target,v=new FormData(f);
 if(f.id==='live-round-form'){const title=String(v.get('title')||'').trim();if(!title)return;if(data().rounds.length>=30)return g.notify('Maximum 30 rounds.');if(window.GGA_COURSE_CORE&&!roundCourseCard)return g.notify('Select a valid course and tee set for this round.');const id=uid();data().rounds.push({id,title,date:String(v.get('date')||''),test:mode==='test',started:false,matches:[],...(roundCourseCard?{course:JSON.parse(JSON.stringify(roundCourseCard))}:{})});roundCourseCard=null;roundCourseDetail=null;roundCourseResults=[];roundCourseMessage='Search for the course you will play.';selectedRound=id;commit('Round created. Add the matchups below; each player will see this course in My Round.');return;}
 const r=data().rounds.find(r=>r.id===f.dataset.liveAdd);if(!r)return;
 const size=Number(v.get('format'));if(![1,2,3,4].includes(size))return;
 const a=Array.from({length:size},(_,i)=>v.get('A'+i)),b=Array.from({length:size},(_,i)=>v.get('B'+i)),ids=[...a,...b],p=Object.fromEntries(['front','back','match'].map(k=>[k,Number(v.get('points-'+k))]));
 if(Object.values(p).some(n=>!Number.isFinite(n)||n<0||n>100||n*2%1)||!Object.values(p).some(n=>n>0))return g.notify('Use points from 0–100 in half-point steps, with at least one contest enabled.');
 if(ids.some(id=>!g.player(id))||new Set(ids).size!==ids.length)return g.notify('Select a different golfer for every slot.');
 if(r.matches.some(m=>m.id!==f.dataset.edit&&[...m.a,...m.b].some(id=>ids.includes(id))))return g.notify('A golfer can only play one matchup in this round.');
 const roster=g.getState().seasons.find(s=>s.year===2027)?.roster||{};
 if(!r.test&&(a.some(id=>roster[id]&&roster[id]!=='A')||b.some(id=>roster[id]&&roster[id]!=='B')))return g.notify('Assign golfers to their drafted team.');
 const existing=r.matches.find(m=>m.id===f.dataset.edit);
 const format=existing&&started(r,existing,holes(existing))?formatFor(r,existing):model.formatKey(v.get('playing-format')||existing?.format||r.format);
 if(existing){
  const changed=JSON.stringify(existing.a)!==JSON.stringify(a)||JSON.stringify(existing.b)!==JSON.stringify(b);
  if(changed){
   const policy=String(v.get('lineup-policy')||''),reason=String(v.get('lineup-reason')||'').trim();
   if(!['retain','fresh'].includes(policy)||!reason||reason.length>500)return g.notify('Choose whether to keep results or start fresh, and enter a reason.');
   if(!confirm('Change '+names(existing.a)+' vs '+names(existing.b)+' to '+names(a)+' vs '+names(b)+'? '+(policy==='retain'?'All current results will carry over with their team sides.':'The new match starts with no results.')+' The old lineup and results will be preserved in history.'))return;
   const request={roundId:r.id,matchId:existing.id,before:{a:[...existing.a],b:[...existing.b]},a,b,points:p,format,policy,reason,...(started(r,existing,holes(existing))?{predictionSnapshot:model.snapshot({a,b},indexFor,field(),model.validSnapshot(existing.predictionSnapshot,existing)?existing.predictionSnapshot:model.snapshot(existing,()=>null,[]))}:{})},wasOpen=selectedMatch===existing.id;
   busy=true;render();
   try{
    let matchId;
    if(window.GGA_BACKEND_CONFIGURED){if(!window.GGA_CHANGE_LINEUP)throw Error('Lineup tools are still loading.');({matchId}=await window.GGA_CHANGE_LINEUP(request));}
    else{const next=window.GGA_LINEUP.makeChange(data(),request,{holes:holes(existing),actor:'matthew.ydarraga',newId:uid(),players:g.getState().players.map(p=>p.id),roster});g.getState().liveCup=next.cup;matchId=next.replacement.id;g.save();}
    editing='';if(wasOpen)selectedMatch=matchId;g.notify(policy==='retain'?'Lineup changed; current results retained and previous lineup saved.':'Fresh match created; previous lineup and results saved in history.');
   }catch(e){g.notify('Lineup was not changed: '+String(e.message||e));}
   finally{busy=false;render();}return;
  }
  existing.points=p;existing.format=format;
 }else{if(r.started)return;r.matches.push({id:uid(),a,b,points:p,format,holes:Array(18).fill(null)});}
 editing='';commit(existing?'Matchup updated.':'Matchup added.');
});
panel.addEventListener('change',async e=>{
 if(busy)return;const t=e.target;if(t.name==='round-course'){await selectRoundCourse(t.value);return;}if(t.name==='round-tee'){selectRoundTee(t.value);return;}if(t.name==='format'){t.form.querySelectorAll('[data-partner]').forEach(x=>x.hidden=Number(x.dataset.partner)>=Number(t.value));return;}
 if(t.id==='live-day'){liveDay=t.value;selectedMatch='';render();return;}
 if(t.id==='live-filter'){selectedRound=t.value;selectedMatch='';render();return;}
 if(t.dataset.liveHole===undefined)return;
 await saveResult(t.dataset.liveRound,t.dataset.liveMatch,Number(t.dataset.liveHole),t.value||null);
});
panel.addEventListener('click',async e=>{
 if(e.target.closest('[data-match-action]')?.dataset.matchAction){
  if(busy)return;const t=e.target.closest('[data-match-action]'),action=t.dataset.matchAction,id=t.dataset.matchId;
  const reason=action==='reopen'?prompt('Why are you reopening this match? (required, up to 500 characters)'):'';if(action==='reopen'&&!reason)return;
  if(!confirm(action==='reopen'?'Reopen scoring and clear all confirmations?':'Confirm this match action: '+action+'?'))return;
  busy=true;render();try{
   if(window.GGA_BACKEND_CONFIGURED){if(!window.GGA_MATCH_ACTION)throw Error('Match tools are still loading.');await window.GGA_MATCH_ACTION(id,action,reason,Number(t.dataset.matchRevision));}
   else throw Error('Sign in online to manage confirmed match states.');
   g.notify('Match action confirmed by server.');
  }catch(e){g.notify('Match unchanged: '+e.message);}finally{busy=false;render();}return;
 }
 if(busy)return;const t=e.target.closest('button');if(!t)return;
 if(t.hasAttribute('data-round-course-search')){await searchRoundCourses(t.closest('form').elements.namedItem('course-search').value);return;}
 if(t.dataset.scoreHistory||t.dataset.scoreUndo){
  const id=t.dataset.scoreHistory||t.dataset.scoreMatch;
  const entry=scoreHistory.get(id)?.find(e=>e.id===t.dataset.scoreUndo);
  if(t.dataset.scoreUndo&&(!entry||!confirm('Undo the latest result change on hole '+(entry.hole+1)+'?')))return;
  busy=true;render();
  try{
   if(entry){await window.GGA_UNDO_SCORE(id,entry);g.notify('Hole result restored.');}
   const entries=await window.GGA_SCORE_HISTORY(id);
   scoreHistory.set(id,entries);
  }catch(error){g.notify(error.message);}
  finally{busy=false;render();}
  return;
 }
 if(t.dataset.holeNav!==undefined){const n=Number(t.dataset.holeNav);if(Number.isInteger(n)&&n>=0&&n<18){holePositions.set(t.dataset.holeMatch,n);render();}return;}
 if(t.dataset.holeResult){await saveResult(t.dataset.scoreRound,t.dataset.scoreMatch,Number(t.dataset.scoreHole),t.dataset.holeResult==='clear'?null:t.dataset.holeResult);return;}
 if(t.dataset.holeMap){await openSatellite(Number(t.dataset.holeMap),t);return;}
 if(t.dataset.liveView){liveView=t.dataset.liveView;selectedRound='all';selectedMatch='';editing='';render();return;}
 if(t.dataset.liveMode){mode=t.dataset.liveMode;selectedRound='all';selectedMatch='';editing='';render();return;}
 if(t.dataset.liveOpen){selectedMatch=t.dataset.liveOpen;editing='';render();return;}
 if(t.hasAttribute('data-live-overview')){selectedMatch='';editing='';render();return;}
 if(!g.isOwner())return;
 if(t.hasAttribute('data-live-cancel')){editing='';render();return;}
 if(t.dataset.liveEdit&&lifecycle(data().rounds.flatMap(r=>r.matches).find(m=>m.id===t.dataset.liveEdit)).status!=='live')return g.notify('Reopen the match before editing.');
 if(t.dataset.liveEdit){editing=t.dataset.liveEdit;render();return;}
 if(t.hasAttribute('data-live-mock')){
  if(data().rounds.some(r=>r.test))return g.notify('A mock tournament already exists. Open its rounds to test or customize it.');
  if(data().rounds.length>26)return g.notify('Make room for four mock rounds first.');
  const players=g.getState().players.map(p=>p.id);
  for(const size of [1,2,3,4])data().rounds.push({id:uid(),title:'Mock 2027 · '+size+'v'+size,date:localDay(),test:true,started:true,matches:[{id:uid(),a:players.slice(0,size),b:players.slice(size,size*2),points:{front:1,back:1,match:1},holes:Array(18).fill(null)}]});
  for(const r of data().rounds.filter(r=>r.test))for(const m of r.matches)m.predictionSnapshot=model.snapshot(m,indexFor,field());
  commit('Four practice rounds created. Official scores are unchanged.');return;
 }
 const r=data().rounds.find(x=>x.id===(t.dataset.liveStart||t.dataset.liveRound||t.dataset.liveRename||t.dataset.liveDeleteRound));if(!r)return;
 if(t.dataset.liveDeleteRound){if(!confirm('Remove this round and its matchups from the Cup?'))return;data().rounds=data().rounds.filter(x=>x.id!==r.id);editing='';commit('Round removed.');}
 else if(t.dataset.liveStart){if(!r.matches.length)return;if(!r.started){
   const indexes=field();
   for(const m of r.matches)if(!model.validSnapshot(m.predictionSnapshot,m)){
    const legacy=started(r,m,holes(m));
    m.predictionSnapshot=model.snapshot(m,legacy?()=>null:indexFor,legacy?[]:indexes);
   }
  }
  r.started=!r.started;commit(r.started?'Round started.':'Round paused.');}
 else if(t.dataset.liveRename){const title=prompt('Round name',r.title);if(title?.trim()&&title.trim().length<=70){r.title=title.trim();commit('Round renamed.');}}
 else if(t.dataset.liveRemove){if(!confirm('Remove this matchup from the round? Its results will no longer count.'))return;r.matches=r.matches.filter(m=>m.id!==t.dataset.liveRemove);editing='';commit('Matchup removed.');}
});
// Preserve owner drafts during remote score refreshes. Explicit user actions still
// render normally, so successful saves and Cancel discard their old form state.
function refreshLive(){
 const active=document.activeElement;
 const drafts=Array.from(panel.querySelectorAll?.('form')||[]).map(form=>({
  id:form.id,round:form.dataset.liveAdd,edit:form.dataset.edit,
  fields:Array.from(form.elements||[]).filter(el=>el.name&&!['round-course','round-tee'].includes(el.name)).map(el=>({name:el.name,value:el.value,focused:el===active,start:el.selectionStart,end:el.selectionEnd}))
 }));
 render();
 for(const draft of drafts){
  const form=Array.from(panel.querySelectorAll?.('form')||[]).find(f=>f.id===draft.id&&f.dataset.liveAdd===draft.round&&f.dataset.edit===draft.edit);
  if(!form)continue;
  for(const field of draft.fields){
   const el=form.elements.namedItem(field.name);if(!el)continue;
   el.value=field.value;
   if(field.focused){el.focus({preventScroll:true});if(typeof field.start==='number'&&el.setSelectionRange)el.setSelectionRange(field.start,field.end);}
  }
  const size=Number(form.elements.namedItem('format')?.value);
  if(size)form.querySelectorAll('[data-partner]').forEach(el=>el.hidden=Number(el.dataset.partner)>=size);
 }
}
const prior=window.GGA_UPGRADE_RENDER;window.GGA_UPGRADE_RENDER=()=>{prior?.();refreshLive();};
const priorTab=window.GGA_ON_TAB;window.GGA_ON_TAB=t=>{priorTab?.(t);if(t==='live')render();};
window.GGA_LIVE={render,score,contest};render();
})();
