import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {locate,readNoticeLocations,type HousingLocation} from '../lib/notice-locations';
type Candidate={id:string;name:string;region:string[];query:string;evidence:string;page:number;localUrl:string};
const compact=(s:string)=>s.replace(/[\s()·,.-]/g,'').replace(/아파트/g,'');
async function main(){
 const root='.cache/document-address-review';
 const candidates=JSON.parse(await fs.readFile(root+'/complex-name-candidates.json','utf8')) as Candidate[];
 const listings=JSON.parse(await fs.readFile('lib/listings-api.json','utf8')) as {id:string;sourceUrl:string}[];
 const cache=new Map<string,{road:string;building:string}|null>();const report:object[]=[];
 const grouped=new Map<string,HousingLocation[]>();
 for(const c of candidates){
  const query=[c.region[1],c.region[2],c.name.replace(/\(\d+\)$/,'')].join(' ').replace(/대구시/g,'대구').replace(/부산시/g,'부산');
  let match=cache.get(query);
  if(match===undefined){
   match=null;
   const params=new URLSearchParams({confmKey:process.env.JUSO_API_KEY!,currentPage:'1',countPerPage:'100',keyword:query,resultType:'json'});
   try{
    const data=await(await fetch('https://business.juso.go.kr/addrlink/addrLinkApi.do?'+params,{signal:AbortSignal.timeout(10000)})).json();
    const r=data.results;const all=r?.juso??[];
    if(String(r?.common?.errorCode)==='0'&&Number(r.common.totalCount)===all.length&&all.length){
     const eligible=all.filter((a:{bdNm:string;detBdNmList:string;jibunAddr:string})=>{
      const names=compact((a.bdNm??'')+' '+(a.detBdNmList??''));const name=compact(c.name.replace(/\(\d+\)$/,''));
      const city=c.region[1].replace(/시$/,'');
      return name.length>=3&&names.length>=3&&!(name==='한성필하우스'&&names!=='한성필하우스')&&a.jibunAddr.includes(city)&&a.jibunAddr.includes(c.region[2]);
     });
     const roads=[...new Set(eligible.map((a:{roadAddrPart1:string})=>a.roadAddrPart1))] as string[];
     if(roads.length===1)match={road:roads[0],building:eligible[0].bdNm};
    }
   }catch{/* unresolved is retained in report */}
   cache.set(query,match);
  }
  if(!match){report.push({id:c.id,query,status:'단지명·지역·단일 도로명주소 일치 미확인'});continue;}
  const locations=grouped.get(c.id)??[];if(locations.some(l=>l.address===match.road))continue;
  locations.push({address:match.road,units:0,sourceLabel:'공고문 임대대상 단지 · 행정안전부 주소 확인',localUrl:c.localUrl+`#page=${c.page}`,evidence:`${c.evidence} · 주소 API 건물명: ${match.building}`, ...await locate(match.road)});
  grouped.set(c.id,locations);
 }
 for(const [id,locations] of grouped){
  const sourceUrl=listings.find(l=>l.id===id)!.sourceUrl;const old=await readNoticeLocations(id,sourceUrl);
  if(old?.locations.length){for(const l of old.locations)if(!locations.some(n=>n.address===l.address))locations.push(l);}
  const file='lib/notice-locations/'+createHash('sha256').update(id).digest('hex')+'.json';await fs.writeFile(file+'.tmp',JSON.stringify({sourceUrl,collectedAt:new Date().toISOString(),locations},null,2));await fs.rename(file+'.tmp',file);
  console.log(id,locations.length+'개 단지 주소 확인');
 }
 await fs.writeFile(root+'/complex-unresolved.json',JSON.stringify(report,null,2));
}
main().catch(()=>{console.error('단지 주소 확인 중 오류');process.exitCode=1;});
