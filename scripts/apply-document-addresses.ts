import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readHousingAddresses,readNoticeLocations,locate,type HousingLocation} from '../lib/notice-locations';
import {addressSearchKeyword} from '../lib/juso-address';
type Doc={id:string;name:string;localUrl:string;textFile:string;sha256:string;kind:string};
const root='.cache/document-address-review';
async function main(){
 const targets=JSON.parse(await fs.readFile(root+'/targets.json','utf8')) as {id:string;sourceUrl:string;addresses:number}[];
 const manifest=JSON.parse(await fs.readFile(root+'/manifest.json','utf8')) as Doc[];
 const pdf=JSON.parse(await fs.readFile(root+'/pdf-table-addresses.json','utf8')) as (Doc&{address:string;units:number;evidence:string})[];
 const edits:Record<string,{suffix:string;addresses:string[]}>={
 'lh-sale-0000061178':{suffix:'-0.txt',addresses:['전북특별자치도 익산시 익산대로8길 9']},
 'lh-sale-0000061155':{suffix:'-0.txt',addresses:['전북특별자치도 익산시 익산대로8길 9']},
 'lh-sale-0000061171':{suffix:'-0.txt',addresses:['대전광역시 동구 대동 33']},
 'lh-sale-0000061154':{suffix:'-0.txt',addresses:['경상북도 영천시 충효로 39']},
 'lh-sale-0000061157':{suffix:'-0.txt',addresses:['울산광역시 울주군 범서읍 다운서사로 240']},
 'lh-rental-2015122300020727':{suffix:'-0.txt',addresses:['경기도 양주시 고덕로 92']},
 'lh-rental-0000061163':{suffix:'-0.txt',addresses:['부산광역시 북구 상학로 36']},
 'lh-rental-2015122300020711':{suffix:'-0.txt',addresses:['경남 함양군 서하면 송계앞길 7-2']},
 'lh-rental-2015122300020560':{suffix:'-0.txt',addresses:['수원시 팔달구 인계동 1046-12','수원시 권선구 권선동 1016-8']},
 'lh-rental-2015122300020526':{suffix:'-0.txt',addresses:['부산시 금정구 기찰로102번길 41']},
 };
 for(const id of ['lh-rental-0000061177','lh-rental-0000061173'])edits[id]={suffix:'-0.txt',addresses:['경기도 화성시 동탄대로12길 71','경기도 화성시 동탄순환대로20길 115','경기도 화성시 동탄순환대로17길 15','경기도 화성시 동탄순환대로20길 69','경기도 화성시 동탄대로1길 96','경기도 화성시 동탄대로1길 20','경기도 화성시 동탄신리천로 786','경기도 화성시 동탄순환대로12길 67']};
 const cache=new Map<string,Awaited<ReturnType<typeof locate>>>();
 const report:object[]=[];
 for(const t of targets){
  const old=await readNoticeLocations(t.id,t.sourceUrl);
  let locations=old?.locations??[];
  let extracted:HousingLocation[]=[];
  if(!locations.length){
   for(const d of manifest.filter(d=>d.id===t.id&&d.localUrl?.endsWith('.xlsx')))extracted.push(...await readHousingAddresses(await fs.readFile('public'+d.localUrl),d.name,d.localUrl));
   for(const p of pdf.filter(p=>p.id===t.id))extracted.push({address:p.address,units:p.units,evidence:p.evidence,sourceLabel:p.name,localUrl:p.localUrl,coordinateStatus:'공고문 주소 확인 · 좌표 조회 대기'});
  }
  const edit=edits[t.id];
  if(edit){
   const d=manifest.find(d=>d.id===t.id&&d.textFile.endsWith(edit.suffix))!;
   const text=await fs.readFile(d.textFile,'utf8');
   extracted=edit.addresses.map(address=>{
    const start=text.indexOf(address);if(start<0)throw new Error('공고문 근거 불일치 '+t.id);
    const page=text.slice(0,start).split('\f').length;
    return {address,units:0,sourceLabel:d.name,localUrl:d.localUrl+(d.localUrl.endsWith('.pdf')?`#page=${page}`:''),evidence:`${d.localUrl.endsWith('.pdf')?'PDF '+page+'쪽':'HWPX 본문'} 공급위치 확인: ${text.slice(Math.max(0,start-35),start+address.length+60).replace(/\s+/g,' ')}`,coordinateStatus:'공고문 주소 확인 · 좌표 조회 대기'};
   });
  }
  if(extracted.length){
   const grouped=new Map<string,HousingLocation>();
   for(const l of extracted){const existing=grouped.get(l.address);if(existing)existing.units+=l.units;else grouped.set(l.address,l);}
   locations=[...grouped.values()];
  }
  for(const l of locations){
   if(l.lat!=null&&l.lng!=null)continue;
   let result=cache.get(l.address);
   if(!result){result=await locate(l.address);cache.set(l.address,result);}
   Object.assign(l,result);
   // Historical/combined province label: accept only one exact address result across both official region names.
   if(l.lat==null&&l.address.startsWith('전남광주통합특별시 ')){
    const candidates=[];
    for(const prefix of ['광주광역시','전라남도']){
     const query=addressSearchKeyword(l.address.replace('전남광주통합특별시',prefix));
     const r=await locate(query);if(r.lat!=null&&r.lng!=null)candidates.push({...r,query});
    }
    if(candidates.length===1){const c=candidates[0];Object.assign(l,{lat:c.lat,lng:c.lng,coordinateStatus:'원문 행정구역 표기 보완 · 단일 주소 일치'});l.evidence+=` · 좌표 조회 주소: ${c.query}`;}
   }
  }
  if(locations.length){
   const file='lib/notice-locations/'+createHash('sha256').update(t.id).digest('hex')+'.json';
   const data=extracted.length?{sourceUrl:t.sourceUrl,collectedAt:new Date().toISOString(),locations}:{...old,collectedAt:new Date().toISOString(),locations};
   await fs.writeFile(file+'.tmp',JSON.stringify(data,null,2)+'\n');await fs.rename(file+'.tmp',file);
  }
  const row={id:t.id,addresses:locations.length,coordinates:locations.filter(l=>l.lat!=null&&l.lng!=null).length};report.push(row);console.log(row);
 }
 await fs.writeFile(root+'/applied-report.json',JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
