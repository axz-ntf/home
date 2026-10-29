// An API list may omit still-valid and historical announcements. Never silently drop them.
const normalize=s=>String(s??'').replace(/\s+/g,'').replace(/^\[정정공고\]/,'');
const plain=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function parseOfficialNotice(html,item){
 const areas=[...html.matchAll(/<ul\b[^>]*class=["'][^"']*\bbbsV_data\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi)].map(m=>m[1]).filter(s=>/<strong[^>]*>\s*공고상태\s*<\/strong>/i.test(s));
 if(areas.length!==1)throw Error('공고별 상태 영역 미확인');
 const text=plain(areas[0]),match=text.match(/공고상태\s*(정정공고중|접수마감|공고마감|모집중지|공고종료|공고중|접수중|상담요청)/);
 if(!match)throw Error('공식 공고 상태 미확인');
 const title=normalize(item.noticeTitle||item.title);if(!title||!normalize(plain(html)).includes(title))throw Error('공고 제목 불일치');
 const officialStatus=match[1];return {officialStatus,status:/접수마감|공고마감|모집중지|공고종료/.test(officialStatus)?'closed':/접수중|정정공고중|상담요청/.test(officialStatus)?'open':'upcoming',deadline:text.match(/마감일\s*(\d{4}[.\-/]\d{2}[.\-/]\d{2})/)?.[1]??null};
}
export async function reconcileMissingNotices(current,previous,{fetcher=globalThis.fetch,now=Date.now(),delay=300}={}){
 const known=new Set(current.map(x=>String(x.pblancId??x.id)));const pending=previous.filter(x=>!known.has(String(x.pblancId??x.id)));let recovered=0;const out=[...current];
 for(const item of pending){
  const id=String(item.pblancId??item.id);if(known.has(id))continue;
  const last=Date.parse(item.officialStatusCheckedAt??'');const knownClosed=item.status==='closed'&&/접수마감|공고마감|모집중지|공고종료/.test(item.officialNoticeStatus??'');
  const recentlyChecked=Number.isFinite(last)&&last<=now&&now-last<86400000;
  let verified;
  if((knownClosed||recentlyChecked)&&item.collectionMethod==='official-detail-reconciliation')verified={status:item.status,officialStatus:item.officialNoticeStatus,deadline:item.deadline,checkedAt:item.officialStatusCheckedAt};
  else{
   const u=new URL(item.sourceUrl);if(u.protocol!=='https:'||u.hostname!=='apply.lh.or.kr'||u.searchParams.get('panId')!==String(item.pblancId))throw Error(`LH ${id} 공식 출처 확인 실패 — 기존 데이터 보존`);
   let lastError;
   for(let attempt=0;attempt<2;attempt++)try{
    const response=await fetcher(u,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{'User-Agent':'public-housing-notice-verifier/1.0'}});if(!response.ok)throw Error(`HTTP ${response.status}`);
    verified={...parseOfficialNotice(await response.text(),item),checkedAt:new Date(now).toISOString()};break;
   }catch(e){lastError=e;if(attempt===0)await new Promise(r=>setTimeout(r,1000));}
   if(!verified)throw Error(`LH ${id} 공식 확인 실패 — 기존 데이터 보존: ${lastError?.message??'unknown'}`);
   if(delay)await new Promise(r=>setTimeout(r,delay));
  }
  out.push({...item,status:verified.status,deadline:verified.deadline??item.deadline,officialNoticeStatus:verified.officialStatus,officialStatusCheckedAt:verified.checkedAt,collectionMethod:'official-detail-reconciliation'});known.add(id);recovered++;
 }
 return {listings:out,recovered};
}
