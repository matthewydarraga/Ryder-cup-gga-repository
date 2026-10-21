/* GGA athlete dossier, inspired by professional player statistics dashboards. */
(function(){
 'use strict';
 const gga=window.GGA;if(!gga)return;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const member=id=>gga.getState().players.find(p=>p.id===id);
 function getResults(p){
  const season=gga.getState().seasons.find(s=>s.year===2026),arr=[];
  (season?.rounds||[]).forEach((round,ri)=>(round.matches||[]).forEach(m=>{
   const side=(m.a||[]).includes(p.id)?'A':(m.b||[]).includes(p.id)?'B':null;
   if(!side||!m.manualWinner)return;
   const opponents=(side==='A'?m.b:m.a||[]).map(id=>member(id)?.name).filter(Boolean);
   const teammates=(side==='A'?m.a:m.b||[]).filter(id=>id!==p.id).map(id=>member(id)?.name).filter(Boolean);
   arr.push({format:['Singles','Scramble','Shamble'][ri]||round.title,opponent:opponents.join(' & ')||'Handicap benchmark',teammate:teammates.join(' & '),result:m.manualWinner==='handicap'?'Loss':m.manualWinner==='halve'?'Halved':m.manualWinner===side?'Win':'Loss',margin:m.manualMargin||'',note:m.manualNote||''});
  }));
  return arr;
 }
 function radar(values){
  const rings=[25,45,65,85,100].map(radius=>{
   const polygon=Array.from({length:5},(_,i)=>{const t=i*2*Math.PI/5-Math.PI/2;return (130+radius*Math.cos(t)).toFixed(1)+','+(130+radius*Math.sin(t)).toFixed(1)}).join(' ');
   return '<polygon points="'+polygon+'" fill="none" stroke="#7c8496" stroke-opacity=".23"/>';
  }).join('');
  const pts=values.map((n,i)=>{const theta=i*2*Math.PI/5-Math.PI/2,r=15+Math.max(0,Math.min(n,100))*.82;return [(130+r*Math.cos(theta)).toFixed(1),(130+r*Math.sin(theta)).toFixed(1)]});
  const axes=Array.from({length:5},(_,i)=>{const t=i*2*Math.PI/5-Math.PI/2;return '<line x1="130" y1="130" x2="'+(130+100*Math.cos(t)).toFixed(1)+'" y2="'+(130+100*Math.sin(t)).toFixed(1)+'" stroke="#7c8496" stroke-opacity=".24"/>'}).join('');
  const polygon=pts.map(v=>v.join(',')).join(' ');
  const labels=[['OVERALL',130,12],['SINGLES',239,95],['SCRAMBLE',207,250],['SHAMBLE',53,250],['MATCHES',21,95]];
  return '<svg class="gga-dossier-radar" viewBox="0 0 260 265" role="img" aria-label="Radar showing 2026 match win rates and appearances"><defs><radialGradient id="gga-radar-yellow"><stop offset="0%" stop-color="#ffe338" stop-opacity=".27"/><stop offset="100%" stop-color="#ffe338" stop-opacity=".07"/></radialGradient></defs>'+rings+axes+'<polygon points="'+polygon+'" fill="url(#gga-radar-yellow)" stroke="#ffdb32" stroke-width="2.8"/>'+pts.map(a=>'<circle cx="'+a[0]+'" cy="'+a[1]+'" r="4" stroke="#161a26" stroke-width="1.5" fill="#ffe044"/>').join('')+labels.map(a=>'<text x="'+a[1]+'" y="'+a[2]+'" text-anchor="middle">'+a[0]+'</text>').join('')+'</svg>';
 }
 const card=(n,label,detail='')=>'<div class="gga-dossier-metric"><small>'+escape(label)+'</small><strong>'+escape(n)+'</strong>'+(detail?'<span>'+escape(detail)+'</span>':'')+'</div>';
 const fallbackImage=(p)=>{
  const photo=p.customPhoto||p.officialPhoto||'',fallback=p.customPhoto?'':p.officialPhotoFallback||'';
  if(!photo)return '<div class="gga-dossier-initials">'+escape(p.name.split(' ').map(s=>s[0]).join(''))+'</div>';
  return '<img class="gga-dossier-photo" src="'+escape(photo)+'" alt="Portrait of '+escape(p.name)+'" referrerpolicy="no-referrer" loading="lazy" '+(fallback?'data-fallback="'+escape(fallback)+'"':'')+' onerror="if(!this.dataset.tried&&this.dataset.fallback){this.dataset.tried=1;this.src=this.dataset.fallback}else this.style.opacity=0">';
 };
 function render(p,editor){
  const state=gga.getState(),season=state.seasons.find(s=>s.year===2026),matches=getResults(p),record=gga.statsFor(season).get(p.id)||{matches:0,w:0,l:0,h:0,singles:0,teamMatches:0};
  const ranking=gga.ranks().arr,found=ranking.find(x=>x.id===p.id),rank=ranking.indexOf(found)+1;
  const knownHcp=p.handicap!==null&&p.handicap!==''&&Number.isFinite(Number(p.handicap));
  const overall=record.matches?Math.round(100*(record.w+.5*record.h)/record.matches):null;
  const groups=['Singles','Scramble','Shamble'].map(format=>{
   const filtered=matches.filter(m=>m.format===format),wins=filtered.filter(m=>m.result==='Win').length,halves=filtered.filter(m=>m.result==='Halved').length;
   return {format,count:filtered.length,wins,halves,pct:filtered.length?Math.round(100*(wins+.5*halves)/filtered.length):0};
  });
  const radarGraphic=radar([overall??0,...groups.map(g=>g.pct),Math.min(100,Math.round(100*record.matches/3))]);
  const first=p.name.split(' ').slice(0,-1).join(' '),last=p.name.split(' ').slice(-1)[0];
  const bio=p.football?'<a href="'+escape(p.football)+'" target="_blank" rel="noopener noreferrer">View LA Tech roster profile ↗</a>':'GGA original member';
  const yearRank=found?.rating==null?'UNRANKED':'#'+rank+' SEED';
  const resultsRows=matches.map((r,i)=>'<tr><td class="gga-dossier-no">'+String(i+1).padStart(2,'0')+'</td><td><b>'+escape(r.format)+'</b><small>'+escape(r.teammate?'With '+r.teammate:'Singles match')+'</small></td><td>'+escape(r.opponent)+'</td><td><span class="gga-dossier-result '+r.result.toLowerCase()+'">'+escape(r.result)+'</span></td><td>'+escape(r.margin||'—')+'</td></tr>').join('');
  const account=editor?'<label class="form-field">Handicap Index<input id="my-handicap" type="number" min="-10" max="54" step="0.1" '+(window.GGA_BACKEND_CONFIGURED&&!gga.isOwner()?'disabled':'')+' value="'+(knownHcp?Number(p.handicap):'')+'" placeholder="Not entered"></label><div class="pfile-controls">'+(!window.GGA_BACKEND_CONFIGURED||gga.isOwner()?'<button class="btn btn-tiny" id="save-my-handicap">Save handicap</button>':'')+'<label class="btn btn-secondary btn-tiny" for="photo-file">Change profile picture</label><input id="photo-file" type="file" accept="image/*" hidden></div><p class="hint">'+(window.GGA_BACKEND_CONFIGURED?'Photos sync to every member. Official handicaps are owner-managed.':'Preview only: photo updates remain on your device.')+'</p>':'<p class="hint">Sign into your player account to update your own profile photo and fantasy character.</p><button class="btn btn-secondary btn-tiny" id="login-as-player" data-login-id="'+escape(p.id)+'">Sign in as '+escape(p.name)+'</button>';
  const markup='<div class="gga-dossier">'+
   '<section class="gga-dossier-hero"><div class="gga-dossier-bio"><div class="gga-dossier-kicker">GGA ATHLETE PROFILE <i></i> 2026 RYDER CUP ORIGINAL</div><h2>'+escape(first)+'<span>'+escape(last)+'</span></h2><p class="gga-dossier-affiliation">'+escape(p.position||'GGA Ryder Cup golfer')+'</p><div class="gga-dossier-biogrid"><div><small>TOURNAMENT</small><b>Lake Charles 2026</b></div><div><small>HANDICAP INDEX</small><b>'+(knownHcp?Number(p.handicap).toFixed(1):'Pending')+'</b></div><div><small>2027 STATUS</small><b>'+escape(yearRank)+'</b></div></div><div class="gga-dossier-link">'+bio+'</div></div><div class="gga-dossier-portrait"><div class="gga-dossier-light"></div>'+fallbackImage(p)+'<b class="gga-dossier-watermark">'+String(rank||13).padStart(2,'0')+'</b></div></section>'+
   '<div class="gga-dossier-layout"><section class="gga-dossier-panel gga-dossier-appearances"><div class="gga-dossier-panelhead"><h3>2026 Match Appearances</h3><span>OFFICIAL RECORD</span></div><div class="gga-dossier-table-scroll"><table class="gga-dossier-table"><thead><tr><th>NO.</th><th>FORMAT</th><th>OPPONENT</th><th>RESULT</th><th>MARGIN</th></tr></thead><tbody>'+(resultsRows||'<tr><td colspan="5">No verified match appearances recorded.</td></tr>')+'</tbody></table></div></section>'+
   '<section class="gga-dossier-panel gga-dossier-form"><div class="gga-dossier-panelhead"><h3>2026 Performance</h3><span>SEASON RECORD</span></div><div class="gga-dossier-rate"><strong>'+(overall===null?'—':overall+'%')+'</strong><span>Full match win rate</span></div><div class="gga-dossier-bars">'+groups.map(g=>'<div><div class="gga-dossier-bar-label"><b>'+g.format+'</b><span>'+g.wins+' W / '+g.count+' played</span></div><div class="gga-dossier-track"><i style="width:'+g.pct+'%"></i></div></div>').join('')+'</div></section>'+
   '<section class="gga-dossier-panel gga-dossier-analytics"><div class="gga-dossier-panelhead"><h3>Career Performance</h3><span>2026 BASELINE</span></div><div class="gga-dossier-radar-area">'+radarGraphic+'</div><p class="gga-dossier-legend">Radar: match win percentage by format, overall win rate, and participation relative to three tournament rounds. No simulated golf-skill scores.</p></section>'+
   '<section class="gga-dossier-panel gga-dossier-statistics"><div class="gga-dossier-panelhead"><h3>2026 Career Statistics</h3><span>GGA DATA</span></div><div class="gga-dossier-metrics">'+card(record.matches,'Matches played')+card(record.w+'–'+record.l+'–'+record.h,'Win / Loss / Halve')+card(record.singles,'Singles')+card(record.teamMatches,'Team matches')+card(knownHcp?Number(p.handicap).toFixed(1):'—','Current HCP')+card(found?.rating==null?'—':found.rating.toFixed(1),'2027 Power rating')+'</div></section>'+
   '<section class="gga-dossier-panel gga-dossier-achievements"><div class="gga-dossier-panelhead"><h3>GGA Honors & Legacy</h3><span>THE RECORD BOOK</span></div><div class="gga-dossier-trophies"><div><span>♛</span><b>2026 Original</b><small>Founding field member</small></div><div><span>♜</span><b>'+record.w+' Match '+(record.w===1?'Win':'Wins')+'</b><small>2026 verified results</small></div><div><span>◆</span><b>2027 Contender</b><small>Next Ryder Cup field</small></div></div></section>'+
   '<section class="gga-dossier-panel gga-dossier-personal"><div class="gga-dossier-panelhead"><h3>My Player Profile</h3><span>CUSTOMIZE</span></div><div class="gga-dossier-personal-inner"><p class="gga-dossier-character-label">YOUR GGA CHARACTER</p><div id="gga-dossier-character-slot"></div>'+account+'</div></section></div></div>';
  const host=document.querySelector('#player-detail');
  if(!host)return;host.innerHTML=markup;
  document.querySelectorAll('#player-grid [data-profile]').forEach(btn=>{const selected=btn.dataset.profile===p.id;btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));});
  // Existing fantasy character card is rebuilt using the current game character system.
  const slot=host.querySelector('#gga-dossier-character-slot');
  if(slot){const current=state.players.find(x=>x.id===p.id);slot.innerHTML=window.GGA_CHARACTER_HTML?window.GGA_CHARACTER_HTML(current):'<button type="button" class="btn btn-secondary btn-tiny" id="view-forge">Explore the 50 fantasy characters →</button>';}
 }
 window.GGA_RENDER_DOSSIER=render;
 gga.render();
})();