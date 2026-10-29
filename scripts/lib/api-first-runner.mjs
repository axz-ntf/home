/** A failed upstream stage must never advance to normalization or enrichment. */
export async function runStages(stages, run, update) {
  const results=[];
  for(const [id,label,args] of stages){
    await update(label,results);
    const code=await run(args);
    results.push({id,label,status:code===0?'completed':'failed'});
    await update(label,results);
    if(code!==0)throw new Error(label+' 실패: 다음 단계를 실행하지 않습니다.');
  }
  return results;
}
/** Oldest or never-downloaded documents first, so a batch limit cannot starve the tail. */
export function orderDocuments(documents,index){
 return [...documents].sort((a,b)=>(index[a.url]?.downloadedAt??'').localeCompare(index[b.url]?.downloadedAt??''));
}
