/* OpenGolfAPI normalization. Never substitute a different tee's yardage. */
(function(root){'use strict';
const number=(...values)=>{for(const v of values)if(v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))return Number(v);return null;};
function teeArray(c){const t=c?.tees||c?.tee_sets||c?.teeSets||[];const a=Array.isArray(t)?t:Object.entries(t).map(([name,value])=>({name,...value}));return a.length?a:(Array.isArray(c?.scorecard)?[{name:'Course scorecard (tee unspecified)',holes:c.scorecard}]:[]);}
function holeArray(t,c){
 let h=t?.holes||t?.scorecard?.holes||c?.holes_data||c?.scorecard||(Array.isArray(c?.holes)?c.holes:[]);
 if(h&&!Array.isArray(h)&&Array.isArray(h.holes))h=h.holes;if(!Array.isArray(h))h=Object.values(h||{});
 const own=Array.isArray(t?.holes)||Array.isArray(t?.scorecard?.holes);
 const keys=[t.tee_key,t.name||t.tee_name||t.color||t.tee_color].filter(Boolean).map(x=>String(x).toLowerCase());
 return h.map((x,i)=>{const yardages=x.yardages||{};const key=keys.find(k=>Object.hasOwn(yardages,k));return {number:number(x.number,x.hole,x.hole_number,i+1),par:number(x.par,t?.pars?.[i]),yards:number(key?yardages[key]:null,t?.yardages?.[i],t?.distances?.[i],own?number(x.yards,x.yardage,x.distance_yards):null),strokeIndex:number(x.stroke_index,x.strokeIndex,x.handicap_index,x.handicap,x.hcp,x.si,t?.stroke_indexes?.[i])};}).sort((a,b)=>a.number-b.number);
}
function validHoles(h){return Array.isArray(h)&&h.length===18&&h.every((x,i)=>x.number===i+1&&Number.isInteger(x.par)&&x.par>=3&&x.par<=6&&(x.yards===null||Number.isInteger(x.yards)&&x.yards>=1&&x.yards<=1000)&&(x.strokeIndex===null||Number.isInteger(x.strokeIndex)&&x.strokeIndex>=1&&x.strokeIndex<=18));}
function validCourse(c){return !!c&&c.source==='OpenGolfAPI'&&typeof c.sourceId==='string'&&c.sourceId.length<=120&&typeof c.name==='string'&&c.name.length>0&&c.name.length<=200&&typeof c.tee==='string'&&c.tee.length<=120&&(c.rating===null||Number.isFinite(c.rating)&&c.rating>=20&&c.rating<=100)&&(c.slope===null||Number.isFinite(c.slope)&&c.slope>=55&&c.slope<=155)&&typeof c.importedAt==='string'&&c.importedAt.length<=40&&validHoles(c.holes);}
function importProblem(t,c){
 const hs=holeArray(t,c);if(!validHoles(hs))return 'The source does not contain a valid 18-hole scorecard for this layout.';
 const par=number(t?.par,c?.par),sum=hs.reduce((n,h)=>n+h.par,0);
 if(par!==null&&par!==sum)return 'The listed course par does not match the hole-by-hole pars.';
 const indexes=hs.map(h=>h.strokeIndex).filter(x=>x!==null);
 if(new Set(indexes).size!==indexes.length)return 'The source repeats stroke indexes. Check the official scorecard.';
 return '';
}
function createPublisher({sdk,db}){return async course=>{
 if(!validCourse(course))throw Error('Invalid course scorecard.');
 const recordId=Array.from(root.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 for(const start of [1,7,13])await sdk.setDoc(sdk.doc(db,'courseParts',recordId+'_'+start),{start,holes:course.holes.slice(start-1,start+5)});
 const saved={...course,recordId};await sdk.setDoc(sdk.doc(db,'courseCards',recordId),saved);return saved;
};}
const api={number,teeArray,holeArray,validHoles,validCourse,importProblem,createPublisher};if(typeof module!=='undefined')module.exports=api;else root.GGA_COURSE_CORE=api;
})(typeof window==='undefined'?globalThis:window);
