/* Self-ranked skills: transparent GGA estimates, not measured strokes gained. */
(function(){
 'use strict';
 const skills=['Driving','Approach','Chipping','Putting'];
 const valid=order=>Array.isArray(order)&&order.length===4&&new Set(order).size===4&&order.every(x=>skills.includes(x));
 function ratings(handicap,order){
  if(handicap===null||handicap===undefined||handicap===''||!Number.isFinite(Number(handicap))||!valid(order))return null;
  const h=Math.max(-10,Math.min(54,Number(handicap)));
  const baseline=Math.max(10,Math.min(95,85-1.3*h));
  const spread=Math.min(9,100-baseline,baseline);
  return skills.map(skill=>Math.round((baseline+[1,1/3,-1/3,-1][order.indexOf(skill)]*spread)*10)/10);
 }
 function chart(values){
  const point=(i,r)=>[160+Math.cos(i*Math.PI/2-Math.PI/2)*r,150+Math.sin(i*Math.PI/2-Math.PI/2)*r];
  const polygon=r=>skills.map((_,i)=>point(i,r).join(',')).join(' ');
  return '<svg viewBox="0 0 320 300" style="display:block;width:100%;max-width:380px;margin:auto" role="img" aria-label="Estimated golf strengths: '+skills.map((s,i)=>s+' '+values[i]+' out of 100').join(',')+'">'+[20,40,60,80,100].map(r=>'<polygon points="'+polygon(r)+'" fill="none" stroke="#687187" stroke-opacity=".4"/><text x="164" y="'+(150-r)+'" fill="#9ba6bb" font-size="9">'+r+'</text>').join('')+skills.map((_,i)=>'<line x1="160" y1="150" x2="'+point(i,100)[0]+'" y2="'+point(i,100)[1]+'" stroke="#687187" stroke-opacity=".4"/>').join('')+'<polygon points="'+values.map((n,i)=>point(i,n).join(',')).join(' ')+'" fill="#ffdb32" fill-opacity=".2" stroke="#ffdb32" stroke-width="3"/>'+[['Driving',160,25],['Approach',275,150],['Chipping',160,280],['Putting',45,150]].map(([s,x,y],i)=>'<text x="'+x+'" y="'+y+'" text-anchor="middle" fill="#edf0f6" font-size="12">'+s+'<tspan x="'+x+'" dy="17" fill="#ffdb32">'+values[i]+'</tspan></text>').join('')+'</svg>';
 }
 window.GGA_STRENGTHS={valid,ratings};
 window.GGA_STRENGTH_PANEL=function(p){
  const own=window.GGA.getUser()?.id===p.id;
  const ranked=valid(p.strengthOrder),order=ranked?p.strengthOrder:skills;
  const values=ratings(p.handicap,p.strengthOrder);
  return '<div class="gga-dossier-panelhead"><h3>Game Strengths</h3><span>HCP-WEIGHTED ESTIMATE</span></div>'+(values?chart(values):'<p class="hint" style="padding:24px 0">'+(ranked?'Add a Handicap Index to calculate the spider chart.':'Awaiting this player’s strength ranking. No skills have been assumed.')+'</p>')+(ranked?'<p class="hint">Strongest → developing: '+order.join(' → ')+'</p>':'')+(own?'<form data-strength-player="'+p.id+'"><p>Rank your game: 1 = strongest, 4 = most room to improve.</p><div style="display:grid;gap:10px">'+order.map((s,i)=>'<label style="display:flex;align-items:center;gap:12px"><b style="min-width:20px">'+(i+1)+'</b><select aria-label="Strength rank '+(i+1)+'" data-strength-rank="'+i+'" style="flex:1;min-height:44px;background:#151c2b;color:#f5f5fa;border:1px solid #555e72;border-radius:8px;padding:8px">'+skills.map(v=>'<option'+(v===s?' selected':'')+'>'+v+'</option>').join('')+'</select></label>').join('')+'</div><button class="btn btn-tiny" type="submit" style="margin-top:14px">Save my strengths</button><p class="hint" data-strength-status aria-live="polite"></p><p class="hint">'+(window.GGA_BACKEND_CONFIGURED?'Saved to your player profile.':'Saved on this device; shared profile syncing is not active.')+'</p></form>':'<p class="hint">Only this player can set their strength order. Sign in to your own profile to edit yours.</p>')+'<details style="margin-top:16px"><summary>How the estimate works</summary><p class="hint">GGA scale: 0–100, not a percentile or measured competency. Baseline = 85 − (1.3 × Handicap Index), limited to 10–95. Ranked strengths receive offsets of +9, +3, −3, −9, reduced near the scale limits. The average stays at the baseline, so changing the order cannot inflate the overall rating. Lower handicaps produce higher estimates. Handicap and self-ranking cannot establish actual skill in each area; round-level statistics would be needed.</p></details>';
 };
 document.addEventListener('change',e=>{
  const select=e.target.closest('[data-strength-rank]');if(!select)return;
  const form=select.closest('form'),fields=[...form.querySelectorAll('[data-strength-rank]')];
  const missing=skills.find(s=>!fields.some(f=>f.value===s));
  const duplicate=fields.find(f=>f!==select&&f.value===select.value);
  if(duplicate&&missing)duplicate.value=missing;
  form.querySelector('[data-strength-status]').textContent='Unsaved changes — save to update your chart.';
 });
 document.addEventListener('submit',async e=>{
  const form=e.target.closest('[data-strength-player]');if(!form)return;e.preventDefault();
  const gga=window.GGA,p=gga.player(form.dataset.strengthPlayer),status=form.querySelector('[data-strength-status]');
  if(!p||gga.getUser()?.id!==p.id){status.textContent='Sign in as this player to save.';return;}
  const order=[...form.querySelectorAll('[data-strength-rank]')].map(f=>f.value);
  if(!valid(order)){status.textContent='Use each skill exactly once.';return;}
  const button=form.querySelector('button');button.disabled=true;
  try{
   if(window.GGA_BACKEND_CONFIGURED){
    if(!window.GGA_SAVE_STRENGTHS)throw Error('Shared profile connection is not ready. Please try again.');
    await window.GGA_SAVE_STRENGTHS(p,order);
   }
   p.strengthOrder=order;gga.save();gga.render();gga.notify('Your strength ranking is saved.');
  }catch(error){status.textContent=error.message;button.disabled=false;}
 });
})();
