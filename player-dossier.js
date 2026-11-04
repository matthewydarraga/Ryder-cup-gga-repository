/* GGA athlete dossier, inspired by professional player statistics dashboards. */
(function(){
 'use strict';
 const gga=window.GGA;if(!gga)return;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const member=id=>gga.getState().players.find(p=>p.id===id);
 function getResults(p){
  const model=gga.getResults();return window.GGA_RESULTS.playerMatches(model,p.id).map(m=>({format:m.format,kind:m.kind,opponent:m.opponents.map(id=>member(id)?.name).filter(Boolean).join(' & ')||'Handicap benchmark',teammate:m.teammates.map(id=>member(id)?.name).filter(Boolean).join(' & '),result:m.result,margin:m.margin,note:m.manualNote||''}));
 }
 const card=(n,label,detail='')=>'<div class="gga-dossier-metric"><small>'+escape(label)+'</small><strong>'+escape(n)+'</strong>'+(detail?'<span>'+escape(detail)+'</span>':'')+'</div>';
 const fallbackImage=(p)=>{
  const photo=p.customPhoto||p.officialPhoto||'',fallback=p.customPhoto?'':p.officialPhotoFallback||'';
  if(!photo)return '<div class="gga-dossier-initials">'+escape(p.name.split(' ').map(s=>s[0]).join(''))+'</div>';
  return '<img class="gga-dossier-photo" src="'+escape(photo)+'" alt="Portrait of '+escape(p.name)+'" referrerpolicy="no-referrer" loading="lazy" '+(fallback?'data-fallback="'+escape(fallback)+'"':'')+' onerror="if(!this.dataset.tried&&this.dataset.fallback){this.dataset.tried=1;this.src=this.dataset.fallback}else this.style.opacity=0">';
 };
 function render(p,editor){
  const state=gga.getState(),model=gga.getResults(),season=model.season,year=model.year,matches=getResults(p),record=model.stats.get(p.id)||{matches:0,w:0,l:0,h:0,singles:0,teamMatches:0};
  const rankingInfo=gga.ranks(),ranking=rankingInfo.arr,found=ranking.find(x=>x.id===p.id),rank=ranking.indexOf(found)+1;
  const knownHcp=p.handicap!==null&&p.handicap!==''&&Number.isFinite(Number(p.handicap));
  const completed=record.w+record.l+record.h,overall=completed?Math.round(100*(record.w+.5*record.h)/completed):null;
  const groups=(model.source==='live'?['Singles','Team matches']:['Singles','Scramble','Shamble']).map(format=>{
   const filtered=matches.filter(m=>(model.source==='live'?m.kind:m.format)===format&&m.result!=='In progress'),wins=filtered.filter(m=>m.result==='Win').length,halves=filtered.filter(m=>m.result==='Halved').length;
   return {format,count:filtered.length,wins,halves,pct:filtered.length?Math.round(100*(wins+.5*halves)/filtered.length):0};
  });
  const first=p.name.split(' ').slice(0,-1).join(' '),last=p.name.split(' ').slice(-1)[0];
  const honors=gga.playerHonors(p);
  const honorsMarkup=honors.map(h=>'<div class="gga-championship-honor"><span aria-hidden="true">🏆</span><b>'+escape(h.title)+'</b><small>GGA tournament champion</small></div>').join('');
  const bio='GGA original member';
  const yearRank=found?.rating==null?'UNRANKED':'#'+rank+' SEED';
  const resultsRows=matches.map((r,i)=>'<tr><td class="gga-dossier-no">'+String(i+1).padStart(2,'0')+'</td><td><b>'+escape(r.format)+'</b><small>'+escape(r.teammate?'With '+r.teammate:'Singles match')+'</small></td><td>'+escape(r.opponent)+'</td><td><span class="gga-dossier-result '+r.result.toLowerCase().replace(/ /g,'-')+'">'+escape(r.result)+'</span></td><td>'+escape(r.margin||'—')+'</td></tr>').join('');
  const account=editor?'<div class="pfile-controls"><label class="btn btn-secondary btn-tiny" for="photo-file">Change profile picture</label><input id="photo-file" type="file" accept="image/*" hidden></div>':'<p class="hint">Sign in to edit your own profile settings.</p><button class="btn btn-secondary btn-tiny" id="login-as-player" data-login-id="'+escape(p.id)+'">Sign in as '+escape(p.name)+'</button>';
  const ghinPanel=window.GGA_MANUAL_STATS_PANEL?window.GGA_MANUAL_STATS_PANEL(p,editor):'';
  const markup='<div class="gga-dossier">'+
   '<section class="gga-dossier-hero"><div class="gga-dossier-bio"><div class="gga-dossier-kicker">GGA ATHLETE PROFILE <i></i> OFFICIAL '+year+' RESULTS</div><h2>'+escape(first)+'<span>'+escape(last)+'</span></h2><p class="gga-dossier-affiliation">'+escape('GGA Ryder Cup golfer')+'</p><div class="gga-dossier-biogrid"><div><small>TOURNAMENT</small><b>'+escape((season?.location||'Location pending')+' · '+year)+'</b></div><div><small>HANDICAP INDEX</small><b>'+(knownHcp?Number(p.handicap).toFixed(1):'Pending')+'</b></div><div><small>'+rankingInfo.year+' DRAFT STATUS</small><b>'+escape(yearRank)+'</b></div></div><div class="gga-dossier-link">'+bio+'</div></div><div class="gga-dossier-portrait"><div class="gga-dossier-light"></div>'+fallbackImage(p)+'<b class="gga-dossier-watermark">'+String(rank||13).padStart(2,'0')+'</b></div></section>'+
   '<div class="gga-dossier-layout"><section class="gga-dossier-panel gga-dossier-appearances"><div class="gga-dossier-panelhead"><h3>'+year+' Match Appearances</h3><span>OFFICIAL RECORD</span></div><div class="gga-dossier-table-scroll"><table class="gga-dossier-table"><thead><tr><th>NO.</th><th>FORMAT</th><th>OPPONENT</th><th>RESULT</th><th>MARGIN</th></tr></thead><tbody>'+(resultsRows||'<tr><td colspan="5">No official matches recorded for '+year+'.</td></tr>')+'</tbody></table></div></section>'+
   '<section class="gga-dossier-panel gga-dossier-form"><div class="gga-dossier-panelhead"><h3>'+year+' Performance</h3><span>SEASON RECORD</span></div><div class="gga-dossier-rate"><strong>'+(overall===null?'—':overall+'%')+'</strong><span>Decided matches · ties count half</span></div><div class="gga-dossier-bars">'+groups.map(g=>'<div><div class="gga-dossier-bar-label"><b>'+g.format+'</b><span>'+g.wins+' W / '+g.count+' decided</span></div><div class="gga-dossier-track"><i style="width:'+g.pct+'%"></i></div></div>').join('')+'</div></section>'+
   '<section class="gga-dossier-panel gga-dossier-analytics">'+(window.GGA_STRENGTH_PANEL?window.GGA_STRENGTH_PANEL(p):'<p>Game strengths are loading.</p>')+'</section>'+
   '<section class="gga-dossier-panel gga-dossier-statistics"><div class="gga-dossier-panelhead"><h3>'+year+' Tournament Statistics</h3><span>GGA DATA</span></div><div class="gga-dossier-metrics">'+card(record.matches,'Matches played')+card(record.w+'–'+record.l+'–'+record.h,'Win / Loss / Halve')+card(record.singles,'Singles')+card(record.teamMatches,'Team matches')+card(gga.fmt(record.points),'Player point credit')+card(gga.fmt(record.possible),'Decided point credit')+card(knownHcp?Number(p.handicap).toFixed(1):'—','Current HCP')+card(found?.rating==null?'—':found.rating.toFixed(1),rankingInfo.year+' Draft rating')+'</div><p class="hint">Official current lineups receive the result; point credit is split among teammates and rounded for display. Practice and previous lineup snapshots are excluded.</p></section>'+
   '<section class="gga-dossier-panel gga-dossier-achievements"><div class="gga-dossier-panelhead"><h3>GGA Honors & Legacy</h3><span>THE RECORD BOOK</span></div><div class="gga-dossier-trophies">'+honorsMarkup+'<div><span>♛</span><b>2026 Original</b><small>Founding field member</small></div><div><span>♜</span><b>'+record.w+' Match '+(record.w===1?'Win':'Wins')+'</b><small>'+year+' official match results</small></div><div><span>◆</span><b>2027 Contender</b><small>Next Ryder Cup field</small></div></div></section>'+
   ghinPanel+'<section class="gga-dossier-panel gga-dossier-personal"><div class="gga-dossier-panelhead"><h3>My Player Profile</h3><span>CUSTOMIZE</span></div><div class="gga-dossier-personal-inner"><p class="gga-dossier-character-label">YOUR GGA CHARACTER</p><div id="gga-dossier-character-slot"></div>'+account+'</div></section></div></div>';
  const host=document.querySelector('#player-detail');
  if(!host)return;host.innerHTML=markup;
  document.querySelectorAll('#player-grid [data-profile]').forEach(btn=>{const selected=btn.dataset.profile===p.id;btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));});
  // Existing golf character card is rebuilt using the current game character system.
  const slot=host.querySelector('#gga-dossier-character-slot');
  if(slot){const current=state.players.find(x=>x.id===p.id);slot.innerHTML=window.GGA_CHARACTER_HTML?window.GGA_CHARACTER_HTML(current):'<button type="button" class="btn btn-secondary btn-tiny" id="view-forge">Explore the 13 Golf Legends →</button>';}
 }
 window.GGA_RENDER_DOSSIER=render;
 gga.render();
})();

