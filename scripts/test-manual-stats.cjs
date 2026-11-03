const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('ghin-snapshot.js','utf8');
function harness(){
 const p={id:'me',handicap:11.3,scores:[89],roundHistory:[97]},other={id:'other',handicap:19};
 const state={players:[p,other],seasons:[{year:2026,rounds:[{matches:[{manualWinner:'A'}]}]}]},events={};
 const values={'handicap':'14.2','year':'2026','best-score':'80','best-course':'Pine Dunes','best-location':'Frankston, TX','worst-score':'99','worst-course':'Westridge','worst-location':'McKinney, TX'};
 const status={textContent:''},button={disabled:false};let fail=false,saves=0,actor='me';
 const form={id:'gga-manual-stats',dataset:{playerId:'me'},querySelector:sel=>sel==='[role="status"]'?status:sel==='button[type="submit"]'?button:{value:values[sel.replace('#manual-','')]}};
 const gga={getState:()=>state,getUser:()=>({id:actor}),isOwner:()=>false,save(){},render(){},notify(){}};
 const ctx={window:{GGA:gga,GGA_BACKEND_CONFIGURED:true,GGA_SAVE_MANUAL_STATS:async()=>{if(fail)throw Error('permission-denied');saves++;}},document:{addEventListener:(event,fn)=>events[event]=fn,querySelector:()=>status},console};
 vm.runInNewContext(source,ctx);
 return {ctx,p,other,state,values,status,form,events,submit:()=>events.submit({target:form,preventDefault(){}}),get saves(){return saves},setFail:()=>fail=true,setActor:v=>actor=v};
}
(async()=>{
 const h=harness();assert.equal(h.p.handicap,null);assert.equal(h.other.handicap,null);assert.equal(h.p.scores,undefined);assert.equal(h.p.roundHistory,undefined);assert.equal(h.state.seasons[0].rounds[0].matches[0].manualWinner,'A');
 await h.submit();assert.equal(h.p.handicap,14.2);assert.equal(h.p.manualStats.best.score,80);assert.equal(h.saves,1);
 vm.runInNewContext(source,h.ctx);assert.equal(h.p.handicap,14.2,'Reload must preserve newly entered stats');
 h.values['best-score']='110';await h.submit();assert.equal(h.saves,1);assert.match(h.status.textContent,/Best round/);
 h.values['best-score']='80';h.setFail();h.values.handicap='20';await h.submit();assert.equal(h.p.handicap,14.2,'Failed server save must not change the stored value');
 const cleared=harness();for(const key of Object.keys(cleared.values))if(key!=='year')cleared.values[key]='';await cleared.submit();assert.equal(cleared.p.manualStats.handicap,null);assert.equal(cleared.p.manualStats.best,null);assert.equal(cleared.p.manualStats.worst,null);
 const denied=harness();denied.setActor('other');await denied.submit();assert.equal(denied.saves,0);
 assert(!h.ctx.window.GGA_MANUAL_STATS_PANEL(h.p,false).includes('<form'));
 console.log('PASS: personal-stat reset, preserved Cup archive, manual save/clear, reload retention, validation, failed-save rollback and self-only editing');
})().catch(e=>{console.error(e);process.exitCode=1;});
