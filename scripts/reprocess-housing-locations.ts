import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readNoticeLocations,locate,type NoticeLocations,type HousingLocation} from '../lib/notice-locations';
import {readLhSupplyAddresses} from '../lib/lh-supply-addresses';

async function main(){
 const listings=JSON.parse(await fs.readFile('lib/listings-api.json','utf8')) as {id:string;sourceUrl:string}[];
 const report:object[]=[];
 const cache=new Map<string,Awaited<ReturnType<typeof locate>>>();
 for(const [index,l] of listings.entries()){
  let data=await readNoticeLocations(l.id,l.sourceUrl);
  let changed=false,reason='기존 근거 유지';
  const reverseOnly=!!data?.locations.length&&data.locations.every(p=>p.sourceLabel.startsWith('기존 공식 상세 좌표'));
  if(!data?.locations.length || reverseOnly){
   try{
    const response=await fetch(l.sourceUrl,{redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const html=await response.text();
    const addresses=readLhSupplyAddresses(html);
    if(addresses.length){
     const locations:HousingLocation[]=addresses.map(address=>({address,units:0,sourceLabel:'LH 공식 상세 공급정보 · 소재지',localUrl:l.sourceUrl,evidence:`공급정보 > 소재지: ${address}`,coordinateStatus:'주소 확인 · 좌표 조회 대기'}));
     data={sourceUrl:l.sourceUrl,collectedAt:new Date().toISOString(),locations};changed=true;reason='공식 공급정보 주소 연결';
    }else reason='공식 공급정보 내 주소 없음';
   }catch{reason='공식 페이지 조회 실패';}
  }
  let filled=0;
  if(data){
   for(const location of data.locations){
    if(location.lat!=null&&location.lng!=null)continue;
    let result=cache.get(location.address);
    if(!result){result=await locate(location.address);cache.set(location.address,result);}
    Object.assign(location,result);changed=true;
    if(result.lat!=null&&result.lng!=null)filled++;
   }
   if(changed){
    const filename='lib/notice-locations/'+createHash('sha256').update(l.id).digest('hex')+'.json';
    const record:NoticeLocations={...data,collectedAt:new Date().toISOString()};
    await fs.writeFile(filename+'.tmp',JSON.stringify(record,null,2)+'\n');await fs.rename(filename+'.tmp',filename);
   }
  }
  report.push({id:l.id,reason,filled,addresses:data?.locations.length??0,coordinates:data?.locations.filter(p=>p.lat!=null&&p.lng!=null).length??0});
  if(filled||index%25===0)console.log(`${index+1}/${listings.length} ${l.id}: ${reason}, 좌표 ${filled}개 보완`);
 }
 await fs.writeFile('.cache/location-backfill/reprocess-report.json',JSON.stringify(report,null,2));
 console.log('전체 재처리 완료');
}
main().catch(()=>{console.error('재처리 실패: 저장 상태와 네트워크 확인 필요');process.exitCode=1;});
