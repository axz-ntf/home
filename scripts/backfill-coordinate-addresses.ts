import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readNoticeLocations,type HousingLocation,type NoticeLocations} from '../lib/notice-locations';
type Point={lat?:number;lng?:number;name?:string};
type Listing=Point & {id:string;sourceUrl:string;district:string;geocoded:string;complexes?:Point[]};
const aliases:Record<string,string>={'서울특별시':'서울','부산광역시':'부산','대구광역시':'대구','인천광역시':'인천','광주광역시':'광주','대전광역시':'대전','울산광역시':'울산','세종특별자치시':'세종','경기도':'경기','강원특별자치도':'강원','충청북도':'충북','충청남도':'충남','전북특별자치도':'전북','전라남도':'전남','경상북도':'경북','경상남도':'경남','제주특별자치도':'제주'};
async function main(){
 const key=process.env.KAKAO_REST_API_KEY;if(!key)throw new Error('좌표 API 키 미설정');
 const listings=JSON.parse(await fs.readFile('lib/listings-api.json','utf8')) as Listing[];
 const report:{id:string;addresses:number;reason:string}[]=[];
 for(const l of listings){
  if(await readNoticeLocations(l.id,l.sourceUrl))continue;
  if(!['official-page','page-coords'].includes(l.geocoded))continue;
  const points=(l.complexes??[]).filter(p=>p.lat&&p.lng);
  if(!points.length && (l.complexes??[]).length<=1 && l.lat&&l.lng)points.push(l);
  const locations:HousingLocation[]=[];
  for(const p of [...new Map(points.map(p=>[`${p.lat},${p.lng}`,p])).values()]){
   if(!(p.lat!>33&&p.lat!<39&&p.lng!>124&&p.lng!<132))continue;
   try{
    const r=await fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${p.lng}&y=${p.lat}`,{headers:{Authorization:`KakaoAK ${key}`},signal:AbortSignal.timeout(10000)});if(!r.ok)continue;
    const data=await r.json();const d=data.documents?.[0];if(data.documents?.length!==1)continue;
    const address=(d?.road_address?.address_name ?? (d?.address?.main_address_no ? d.address.address_name : null)) as string|null;
    if(!address)continue;
    const region=l.district.replace(/\s*외.*$/,'');const short=aliases[region];
    if(!address.startsWith(region+' ')&&!(short&&address.startsWith(short+' ')))continue;
    locations.push({address,lat:p.lat,lng:p.lng,units:0,sourceLabel:d.road_address?.address_name?'기존 공식 상세 좌표 → 카카오 도로명주소':'기존 공식 상세 좌표 → 카카오 지번주소',localUrl:l.sourceUrl,evidence:`${p.name??l.id} · 공식 좌표 ${p.lat}, ${p.lng}`,coordinateStatus:'공식 수집 좌표 · 주소 역변환 (공고문 주소와 별도)'});
   }catch{/* preserve unresolved */}
  }
  if(locations.length){
   const filename='lib/notice-locations/'+createHash('sha256').update(l.id).digest('hex')+'.json';
   const record:NoticeLocations={sourceUrl:l.sourceUrl,collectedAt:new Date().toISOString(),locations};await fs.writeFile(filename+'.tmp',JSON.stringify(record,null,2));await fs.rename(filename+'.tmp',filename);
  }
  report.push({id:l.id,addresses:locations.length,reason:locations.length?'공식좌표 역변환':'도로명주소 또는 지역 일치 미확인'});
 }
 await fs.writeFile('.cache/location-backfill/reverse-report.json',JSON.stringify(report,null,2));console.log({attempted:report.length,filled:report.filter(r=>r.addresses).length});
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
