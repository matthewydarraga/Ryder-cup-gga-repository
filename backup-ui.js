/* Project Revamp — Step 1: complete backups with preview and recovery-first restore. */
(()=>{'use strict';const g=window.GGA,b=window.GGA_BACKUP,panel=document.getElementById('gga-backup-panel');if(!g||!b||!panel)return;
let selected=null,prepared=null,busy=false;
panel.innerHTML='<div class="kicker">Project Revamp · Step 1</div><h3>Complete backup & restore</h3><p>Save tournament history, draft settings, player profiles and every recorded live hole. PINs and login accounts are excluded and stay unchanged.</p><div class="flex"><button class="btn btn-gold" id="export-data" type="button">Download complete backup</button><label class="btn btn-secondary" for="import-file">Choose backup to preview</label><input id="import-file" type="file" accept=".json,application/json" hidden></div><p id="gga-backup-status" role="status" aria-live="polite"></p><div id="gga-backup-preview" hidden><h4>Restore preview</h4><p id="gga-backup-summary"></p><p>Restore replaces shared event data and player profile settings. Current rounds must be paused first. A recovery backup downloads before anything is replaced. Restored rounds stay paused for review; login accounts and PINs stay unchanged.</p><label class="form-field">Type RESTORE to confirm<input id="gga-backup-confirm" autocomplete="off" spellcheck="false" maxlength="7"></label><button class="btn btn-danger" id="gga-backup-restore" type="button">Download recovery backup & restore</button></div><p class="hint">Only complete backups from this Firebase project can restore shared data. Older JSON files remain usable for separate historical recovery and are never silently applied here. Repository-hosted portraits and recap photos stay at their existing links; uploaded profile photos are included.</p>';
const $=id=>document.getElementById(id),status=message=>{$('gga-backup-status').textContent=message;};
function controls(value){busy=value;for(const id of ['export-data','import-file','gga-backup-confirm','gga-backup-restore'])$(id).disabled=value;}
function download(file,prefix='GGA-Complete-Backup'){const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=prefix+'-'+file.createdAt.replace(/[:.]/g,'-')+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function api(){if(!window.GGA_BACKUP_CLOUD)throw Error('Connect to Firebase and sign in as Matthew before using complete server backups.');return window.GGA_BACKUP_CLOUD;}
window.GGA_EXPORT_DEVICE_RECOVERY=async()=>{
 if(g.getUser()?.username!=='matthew.ydarraga')return g.notify('Sign in as Matthew to save owner recovery data.');
 try{
  const state=b.clone(g.getState()),profiles={},liveScores=[];
  for(const p of state.players){const d={};if(p.customPhoto)d.photoData=p.customPhoto;if(p.fantasyCharacterId)d.fantasyCharacterId=p.fantasyCharacterId;if(p.strengthOrder)d.strengthOrder=p.strengthOrder;if(p.manualStats)d.manualStats=p.manualStats;profiles[p.id]=d;}
  for(const r of state.liveCup?.rounds||[])for(const m of r.matches)m.holes=m.holes.map((h,i)=>{const key=m.id+'_'+i;if(window.GGA_LIVE_RESULTS?.has(key)){h=window.GGA_LIVE_RESULTS.get(key);liveScores.push({id:key,matchId:m.id,hole:i,winner:h});}return h;});
  state.liveCup||={year:2027,rounds:[]};state.clubhouse||={};state.draft2027||={picks:[]};
  const file=await b.create({state,profiles,liveScores,liveMatches:[],sourceRevision:null},state.players,window.FIREBASE_CONFIG.projectId,'device');download(file,'GGA-INCOMPLETE-Device-Recovery');g.notify('Device recovery downloaded. It is not a complete server backup and cannot restore shared data.');
 }catch(e){g.notify('Device recovery could not be created: '+e.message);}
};
window.GGA_EXPORT_COMPLETE_BACKUP=async()=>{
 if(busy)return;if(!g.isOwner())return g.notify('Only Matthew can download a complete clubhouse backup.');controls(true);status('Reading current server records…');
 try{const file=await api().capture();download(file);const n=b.summarize(file);status('Complete server backup downloaded: '+n.players+' players, '+n.matches+' live matches and '+n.holes+' recorded holes.');}
 catch(e){status('Backup not created: '+e.message);}finally{controls(false);}
};
window.GGA_PREVIEW_COMPLETE_BACKUP=async file=>{
 if(!file||busy)return;controls(true);selected=null;prepared=null;$('gga-backup-preview').hidden=true;$('gga-backup-confirm').value='';status('Checking file version and integrity…');
 try{if(!g.isOwner())throw Error('Sign in as Matthew.');if(file.size>b.MAX_BYTES)throw Error('Choose a backup smaller than 20 MB.');selected=await b.parse(await file.text(),g.getState().players,window.FIREBASE_CONFIG?.projectId||'gga-ryder-cup');prepared=await api().prepare(selected);const n=b.summarize(selected);$('gga-backup-summary').textContent=new Date(n.createdAt).toLocaleString()+' · '+n.players+' players · '+n.profiles+' saved profiles · '+n.seasons+' seasons · '+n.rounds+' live rounds ('+n.practiceRounds+' practice) · '+n.matches+' matches · '+n.holes+' recorded holes.';$('gga-backup-preview').hidden=false;status('Backup verified. Review the summary before restoring.');}
 catch(e){selected=null;prepared=null;status('Restore unavailable: '+e.message);}finally{controls(false);}
};
$('export-data').addEventListener('click',()=>window.GGA_EXPORT_COMPLETE_BACKUP());
$('import-file').addEventListener('change',e=>{void window.GGA_PREVIEW_COMPLETE_BACKUP(e.target.files[0]);e.target.value='';});
$('gga-backup-restore').addEventListener('click',async()=>{
 if(busy||!prepared||!selected)return;if($('gga-backup-confirm').value!=='RESTORE')return status('Type RESTORE exactly to confirm replacing shared data.');
 if(!confirm('Replace shared tournament data and player profiles with this verified backup? A recovery file downloads first. All restored rounds will be paused.'))return;
 controls(true);status('Downloading recovery backup and checking for newer server changes…');
 try{download(prepared.recovery,'GGA-Before-Restore');await api().restore(prepared);prepared=null;selected=null;$('gga-backup-preview').hidden=true;$('gga-backup-confirm').value='';status('Restore confirmed by server. Review the paused rounds in Live before starting them.');g.notify('Complete backup restored. Rounds are paused for review.');}
 catch(e){prepared=null;selected=null;$('gga-backup-preview').hidden=true;status('Restore did not complete: '+e.message+' Preview the backup again.');}
 finally{controls(false);}
});
})();
