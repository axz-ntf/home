import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readNoticeInformation} from '../lib/notice-information';
import {readNoticeLocations,locate,type HousingLocation,type NoticeLocations} from '../lib/notice-locations';
type Row={id:string;pblancId?:string;sourceUrl:string;address?:string;complexes?:{address?:string}[]};
async function main(){
 const listings=JSON.parse(await fs.readFile('lib/listings-api.json','utf8')) as Row[];
 const notices=JSON.parse(await fs.readFile('lib/lh-notices-all.json','utf8')) as Row[];
 const mapped=JSON.parse(await fs.readFile('lib/mapped-regional.json','utf8')) as Record<string,{points?:{address?:string}[]}>;
 let completed=0;
 for(const r of listings){
  if(await readNoticeLocations(r.id,r.sourceUrl))continue;
  const info=await readNoticeInformation(r.id);
  const markdown=await fs.readFile(`lib/notice-texts/${r.id}.md`,'utf8').catch(()=>'');
  const compact=(s:string)=>s.replace(/\s+/g,'');
  const evidenced=(mapped[r.pblancId??'']?.points??[]).filter(p=>p.address&&compact(p.address).length>10&&compact(markdown).includes(compact(p.address))).map(p=>({address:p.address!,label:'공고문 본문 일치 주소',evidence:`${r.id}.md: ${p.address}`}));
  const candidates=[...evidenced,...(r.address?[{address:r.address,label:'서비스 API 원본',evidence:r.id}]:[]),...(r.complexes??[]).filter(c=>c.address).map(c=>({address:c.address!,label:'공식 단지별 수집 정보',evidence:r.id})),...notices.filter(n=>n.sourceUrl===r.sourceUrl&&n.address).map(n=>({address:n.address!,label:'동일 원문 공고 API',evidence:n.id})),...(info?.sourceUrl===r.sourceUrl&&info.fields.address?[{address:info.fields.address,label:info.sourceLabel,evidence:info.sourceHash}]:[])];
  const unique=[...new Map(candidates.filter(c=>!/(지역본부|접수처|상담센터)/.test(c.address)).map(c=>[c.address.trim(),c])).values()];
  if(!unique.length)continue;
  const locations:HousingLocation[]=[];
  for(const c of unique)locations.push({address:c.address,units:0,sourceLabel:c.label,evidence:c.evidence,localUrl:r.sourceUrl,...await locate(c.address)});
  const data:NoticeLocations={sourceUrl:r.sourceUrl,collectedAt:new Date().toISOString(),locations};
  await fs.mkdir('lib/notice-locations',{recursive:true});const filename='lib/notice-locations/'+createHash('sha256').update(r.id).digest('hex')+'.json';await fs.writeFile(filename+'.tmp',JSON.stringify(data,null,2));await fs.rename(filename+'.tmp',filename);completed++;
 }
 console.log({linkedNotices:completed});
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
