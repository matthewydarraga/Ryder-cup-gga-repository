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
function populateDraft(){window.GGA_DRAFT.render();}
function ownerEditor(){
 $('#gga-owner-hero').value=state.clubhouse.hero??placeholder.hero;
 $('#gga-owner-announcement').value=state.clubhouse.announcement??placeholder.announcement;
 $('#gga-owner-announcement-label').value=state.clubhouse.announcementLabel??placeholder.announcementLabel;
 if($('#gga-owner-headline'))$('#gga-owner-headline').value=state.clubhouse.headline||'The rivalry never rests.';
 if($('#gga-owner-theme'))$('#gga-owner-theme').value=state.clubhouse.theme||'midnight';
 const r=matches2026()?.rounds||[];
 $('#gga-owner-history').innerHTML=r.map((round,ri)=>'<h4>'+esc(round.title)+'</h4>'+round.matches.map((m,mi)=>'<div class="gga-admin-result"><div><strong>'+esc((m.a||[]).map(nameOf).join(' & '))+'</strong><br><small>vs '+esc((m.b||[]).map(nameOf).join(' & ')||'Benchmark')+'</small></div><select data-hist-round="'+ri+'" data-hist-match="'+mi+'" aria-label="Match winner"><option value="" '+(!m.manualWinner?'selected':'')+'>Unknown</option><option value="A" '+(m.manualWinner==='A'?'selected':'')+'>Side A</option><option value="B" '+(m.manualWinner==='B'?'selected':'')+'>Side B</option><option value="halve" '+(m.manualWinner==='halve'?'selected':'')+'>Halved</option><option value="handicap" '+(m.manualWinner==='handicap'?'selected':'')+'>Handicap loss</option></select><input data-hist-note="'+ri+'" data-hist-index="'+mi+'" aria-label="Match note" value="'+esc(m.manualNote||'')+'" placeholder="Historical note"></div>').join('')).join('');
 let pins={};try{pins=JSON.parse(localStorage.getItem(core.AUTH_STORE))||{}}catch{}
 $('#gga-owner-account-controls').innerHTML=(window.GGA_BACKEND_CONFIGURED?'<div id="gga-generated-invite" class="gga-invite-output" hidden></div>':'')+state.players.map(p=>'<div><span><strong>'+esc(p.name)+'</strong><br><small>'+esc(p.username||'')+' · '+(window.GGA_BACKEND_CONFIGURED?'Invitations and PINs verified on the server':pins[p.username]?'PIN set on this device':'No local PIN')+'</small></span><span class="gga-action-pair">'+(window.GGA_BACKEND_CONFIGURED?(p.username==='matthew.ydarraga'?'<small>Verified owner</small>':'<button class="btn btn-gold btn-tiny" data-cloud-invite="'+esc(p.username||'')+'">Invite</button><button class="btn btn-secondary btn-tiny" data-cloud-reset="'+esc(p.username||'')+'">Reset PIN</button>'):'<button class="btn btn-secondary btn-tiny" data-reset-pin="'+esc(p.username||'')+'" '+(!pins[p.username]?'disabled':'')+'>Reset local PIN</button>')+'</span></div>').join('');
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
 applyBranding();renderMobileTab();
 summary();populateDraft();
 if(core.isOwner()&&$('#owner').classList.contains('active'))ownerEditor();
}
window.GGA_UPGRADE_RENDER=renderUpgrade;
document.addEventListener('click',event=>{
 const nav=event.target.closest('[data-open-tab]');if(nav){core.showTab(nav.dataset.openTab);if(nav.dataset.openTab==='owner')ownerEditor();return;}
 if(!core.isOwner())return;
 if(event.target.closest('#gga-save-home')){state.clubhouse.hero=$('#gga-owner-hero').value.trim();state.clubhouse.announcement=$('#gga-owner-announcement').value.trim();state.clubhouse.announcementLabel=$('#gga-owner-announcement-label').value.trim();state.clubhouse.headline=$('#gga-owner-headline')?.value.trim()||'The rivalry never rests.';state.clubhouse.theme=$('#gga-owner-theme')?.value||'midnight';core.save();core.render();core.notify('Clubhouse design and content saved.');return;}
 const reset=event.target.closest('[data-reset-pin]');if(reset){if(!confirm('Reset this local PIN? Anyone accessing a fresh device can claim the account.'))return;let pins={};try{pins=JSON.parse(localStorage.getItem(core.AUTH_STORE))||{}}catch{}delete pins[reset.dataset.resetPin];localStorage.setItem(core.AUTH_STORE,JSON.stringify(pins));core.notify('Local PIN reset. Reload to sync the login dialog.');ownerEditor();}
});
$('#gga-owner-history').addEventListener('change',e=>{if(!core.isOwner())return;const el=e.target,ri=el.dataset.histRound??el.dataset.histNote,mi=el.dataset.histMatch??el.dataset.histIndex;if(ri===undefined||mi===undefined)return;const m=matches2026()?.rounds?.[+ri]?.matches?.[+mi];if(!m)return;if(el.dataset.histRound!==undefined)m.manualWinner=el.value||null;else m.manualNote=el.value.trim();core.save();core.render();});
$('#tabs').addEventListener('click',e=>{const el=e.target.closest('[data-tab]');if(el?.dataset.tab==='owner'&&core.isOwner())ownerEditor()});
/* Mobile home-screen navigation, account sign-out, and owner art direction. */
const mobile=document.createElement('nav');mobile.className='gga-mobile-nav';mobile.setAttribute('aria-label','Mobile GGA navigation');
mobile.innerHTML=[['home','⌂','Clubhouse'],['history','▤','History'],['draft','♜','Draft'],['players','♟','Players'],['rankings','▥','Rankings']].map(([id,icon,name])=>'<button type="button" data-mobile-tab="'+id+'" aria-label="'+name+'"><span aria-hidden="true">'+icon+'</span>'+name+'</button>').join('');
document.body.appendChild(mobile);
mobile.addEventListener('click',e=>{const b=e.target.closest('[data-mobile-tab]');if(b)core.showTab(b.dataset.mobileTab);});
const accountArea=document.querySelector('.account-area');
const signout=document.createElement('button');signout.type='button';signout.id='gga-signout';signout.className='gga-signout';signout.textContent='Sign out';accountArea?.appendChild(signout);
signout.addEventListener('click',()=>{if(window.GGA_BACKEND_CONFIGURED){if(window.GGA_CLOUD_SIGNOUT)window.GGA_CLOUD_SIGNOUT();else core.notify('Secure sign-out is loading.');}else core.logout();});
function renderMobileTab(){const active=document.querySelector('#tabs button.active')?.dataset.tab;document.querySelectorAll('[data-mobile-tab]').forEach(b=>b.classList.toggle('active',b.dataset.mobileTab===active));signout.hidden=!core.getUser();}
window.GGA_ON_TAB=()=>renderMobileTab();
const ownerPanel=document.createElement('div');ownerPanel.className='panel panel-pad gga-owner-brand';ownerPanel.innerHTML='<div class="kicker">Art direction</div><h3>Clubhouse branding & visuals</h3><div class="form-row"><label class="form-field">2027 headline<input id="gga-owner-headline" maxlength="100" placeholder="The rivalry never rests."></label><label class="form-field">Visual theme<select id="gga-owner-theme"><option value="midnight">Midnight & Gold</option><option value="forest">Pine Green & Gold</option><option value="royal">Royal Blue & Gold</option><option value="carbon">Carbon Black & Platinum</option></select></label></div><p class="subtext" style="margin:15px 0 10px">Replace the 2027 promotional cover with your own GGA image. The original 2026 group photo remains in the history archive.</p><div class="flex"><label for="gga-owner-cover" class="btn btn-secondary">Upload new 2027 cover</label><input type="file" id="gga-owner-cover" accept="image/*" hidden><button class="btn btn-secondary" id="gga-owner-reset-cover" type="button">Restore group photo</button></div>';
$('#owner').insertBefore(ownerPanel,$('#owner').querySelector('.panel'));
$('#gga-owner-cover').addEventListener('change',async e=>{const file=e.target.files[0];if(!file||!core.isOwner())return;if(window.GGA_BACKEND_CONFIGURED){if(window.GGA_UPLOAD_BRANDING)await window.GGA_UPLOAD_BRANDING(file);else core.notify('Cloud storage is loading.');}else{const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=1400;c.height=Math.round(img.naturalHeight*1400/img.naturalWidth);c.getContext('2d').drawImage(img,0,0,c.width,c.height);state.clubhouse.coverData=c.toDataURL('image/jpeg',.75);core.save();core.render();core.notify('2027 cover saved to this device.');};img.src=reader.result;};reader.readAsDataURL(file);}e.target.value='';});
$('#gga-owner-reset-cover').addEventListener('click',()=>{if(!core.isOwner())return;delete state.clubhouse.coverPath;delete state.clubhouse.coverData;document.documentElement.style.removeProperty('--gga-hero-photo');document.documentElement.style.setProperty('--gga-default-cover-opacity','1');core.save();core.render();core.notify('Original 2026 photo restored on the 2027 homepage.');});
function applyBranding(){
 const copy=state.clubhouse||{};
 const label=$('#home .gga-promo h2');if(label)label.textContent=copy.headline||'The rivalry never rests.';
 const themes={midnight:['#dfbb72','#f1cd81','#081725'],forest:['#cfb472','#f5d995','#071d1c'],royal:['#dbb97a','#f5d391','#0a1731'],carbon:['#bfc8d0','#e5e8ed','#101214']};
 const palette=themes[copy.theme]||themes.midnight;
 document.documentElement.style.setProperty('--gga-gold',palette[0]);
 document.documentElement.style.setProperty('--gga-gold-strong',palette[1]);
 document.documentElement.dataset.ggaTheme=copy.theme||'midnight';
 document.documentElement.style.setProperty('--gga-bg',palette[2]);
 if(copy.coverData&&!window.GGA_BACKEND_CONFIGURED){document.documentElement.style.setProperty('--gga-hero-photo','url("'+copy.coverData+'")');document.documentElement.style.setProperty('--gga-default-cover-opacity','0');}
 else if(!copy.coverPath){document.documentElement.style.removeProperty('--gga-hero-photo');document.documentElement.style.setProperty('--gga-default-cover-opacity','1');}
}
renderUpgrade();const initialTab=new URLSearchParams(window.location.search).get('tab');core.showTab(['home','history','draft','players','rankings','forge','stats'].includes(initialTab)?initialTab:'home');
})();
