/* Append-only score changes. Undo is a new, conditional change, never a deletion. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.GGA_SCORE_HISTORY=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const winner=x=>[null,'A','B','halve'].includes(x);
 function change({matchId,hole,current,before,value,actor,generation,updatedAt,undoOf=0,roundIndex=0,matchIndex=0}){
  if(!winner(before)||!winner(value)||!Number.isInteger(hole)||hole<0||hole>17)throw Error('Invalid hole result.');
  const revision=(current?.revision||0)+1,id=matchId+'_'+hole+'_'+revision;
  return {id,record:{matchId,hole,before,winner:value,actor,generation,revision,undoOf,roundIndex,matchIndex,updatedAt},score:{matchId,hole,winner:value,generation,revision,updatedAt}};
 }
 function undoValue(current,entry,generation){
  if(!current||current.revision!==entry.revision||current.winner!==entry.winner||current.generation!==generation||entry.generation!==generation)throw Error('This hole changed or the match reopened. Review the latest score before correcting it.');
  return entry.before;
 }
 return {change,undoValue};
});
