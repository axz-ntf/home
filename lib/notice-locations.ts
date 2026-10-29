import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type ExcelJS from 'exceljs';
import { getSavedDocuments } from './saved-documents';
import { searchRoadAddress, addressSearchKeyword } from './juso-address';

export type HousingLocation = { address:string; units:number; evidence:string; sourceLabel:string; localUrl:string; lat?:number; lng?:number; coordinateStatus:string };
export type NoticeLocations = { sourceUrl:string; collectedAt:string; review?: {status:"not-published"|"partial";message:string;evidence:string;localUrl:string;sourceLabel:string}; sourceHashes?:string[]; parserVersion?:number; locations:HousingLocation[] };
const filename=(id:string)=>path.join(process.cwd(),'lib/notice-locations',createHash('sha256').update(id).digest('hex')+'.json');
export async function readNoticeLocations(id:string,sourceUrl?:string|null):Promise<NoticeLocations|null>{
 try{const data=JSON.parse(await fs.readFile(filename(id),'utf8')) as NoticeLocations;return sourceUrl && data.sourceUrl===sourceUrl?data:null;}catch{return null;}
}
export async function readHousingAddresses(bytes:Buffer,sourceLabel:string,localUrl:string):Promise<HousingLocation[]> {
 const {default: Excel}=await import('exceljs');
 const workbook=new Excel.Workbook();await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
 const found=new Map<string,HousingLocation>();
 const cellText=(cell:ExcelJS.Cell)=>cell.value==null?"":cell.text;
 workbook.eachSheet(sheet=>{
  let addressCol=0,regionCol=0,numberCol=0;
  sheet.eachRow((row,rowNumber)=>{
   if(!numberCol || !/^\d+$/.test(cellText(row.getCell(numberCol)).trim())){
    let best=0;
    row.eachCell((cell,col)=>{const t=cellText(cell).replace(/\s/g,'');
     const rank=t==='도로명주소'?3:['주소','주택소재지'].includes(t)?2:['소재지','지번주소'].includes(t)?1:0;
     if(rank>best){best=rank;addressCol=col;}
     if(['지역','광역지자체','시도'].includes(t))regionCol=col;
     if(['순번','연번','번호'].includes(t))numberCol=col;
    });return;
   }
   if(!addressCol)return;
   const raw=cellText(row.getCell(addressCol)).trim().replace(/\s+/g,' ');
   if(!/(?:로|길)\s*\d|(?:동|리)\s*\d/.test(raw))return;
   const region=regionCol?cellText(row.getCell(regionCol)).trim():'';
   const province=/^(?:[가-힣]+(?:도|특별시|광역시|특별자치시)|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s/;
   const regionIsProvince=/^(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도))$/.test(region);
   const address=regionIsProvince && !province.test(raw)?`${region} ${raw}`:raw;
   const previous=found.get(address);
   if(previous){previous.units++;return;}
   found.set(address,{address,units:1,evidence:`${sheet.name}!${row.getCell(addressCol).address} (행 ${rowNumber}): ${raw}`,sourceLabel,localUrl,coordinateStatus:'주소 확인 · 좌표 조회 대기'});
  });
 });
 return [...found.values()];
}
export async function locate(address:string):Promise<Pick<HousingLocation,'lat'|'lng'|'coordinateStatus'>>{
 const direct=await locateWithKakao(address);
 if(direct.lat!=null&&direct.lng!=null)return direct;
 if(!process.env.KAKAO_REST_API_KEY)return direct;
 const keyword=addressSearchKeyword(address);
 if(keyword!==address.trim()){
  const cleaned=await locateWithKakao(keyword);
  if(cleaned.lat!=null&&cleaned.lng!=null)return {...cleaned,coordinateStatus:'원문 도로명·건물번호 검색 · 카카오 단일 주소 일치'};
 }
 const road=await searchRoadAddress(address);
 if(!road)return direct;
 const normalized=await locateWithKakao(road);
 return normalized.lat!=null&&normalized.lng!=null
  ? {...normalized,coordinateStatus:'행정안전부 도로명주소 확인 · 카카오 단일 주소 일치'}
  : normalized;
}
async function locateWithKakao(address:string):Promise<Pick<HousingLocation,'lat'|'lng'|'coordinateStatus'>>{
 const key=process.env.KAKAO_REST_API_KEY;
 if(!key)return {coordinateStatus:'주소 확인 · 좌표 API 키 미설정'};
 try{
  const query=address.replace(/\([^)]*\).*$/,'').trim();
  const r=await fetch(`https://dapi.kakao.com/v2/local/search/address.json?analyze_type=exact&query=${encodeURIComponent(query)}`,{headers:{Authorization:`KakaoAK ${key}`},signal:AbortSignal.timeout(10000)});
  if(!r.ok)return {coordinateStatus:`주소 확인 · 좌표 API 응답 ${r.status}`};
  const data=await r.json();const d=data.documents?.[0];
  if(data.meta?.total_count!==1 || !d?.address || !d.address.main_address_no)return {coordinateStatus:'주소 확인 · 정확한 좌표 재확인 필요'};
  const lat=Number(d.y),lng=Number(d.x);
  if(!(lat>33&&lat<39&&lng>124&&lng<132))return {coordinateStatus:'주소 확인 · 좌표 범위 확인 필요'};
  return {lat,lng,coordinateStatus:'카카오 주소 검색 · 단일 주소 일치'};
 }catch{return {coordinateStatus:'주소 확인 · 좌표 조회 실패'};}
}
export async function collectNoticeLocations(id:string,sourceUrl:string){
 const savedFiles=await getSavedDocuments(sourceUrl);
 const files=savedFiles.filter(f=>f.localUrl.endsWith('.xlsx')&&/주택목록|주택보유목록|주택내역|공급대상|공급목록/.test(f.name.replace(/[_\s]/g,"")));
 if(!files.length)return null;
 const previous=await readNoticeLocations(id,sourceUrl);
 const hashes=files.map(f=>f.sha256).sort();
 if(previous?.parserVersion===2 && previous.locations.length && (previous.locations.every(l=>l.lat!=null&&l.lng!=null) || Date.now()-Date.parse(previous.collectedAt)<86400000) && JSON.stringify(previous.sourceHashes)===JSON.stringify(hashes))return previous;
 const locations:HousingLocation[]=[];
 for(const file of files){
  const bytes=await fs.readFile(path.join(process.cwd(),'public',file.localUrl));
  if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('주택목록 파일 무결성 확인 실패');
  locations.push(...await readHousingAddresses(bytes,file.name,file.localUrl));
 }
 // Preserve document-reviewed locations while their exact source file is still current.
 for(const old of previous?.locations??[]){
  if(!locations.some(l=>l.address===old.address) && /\.(pdf|hwpx)(?:#|$)/.test(old.localUrl) && savedFiles.some(f=>f.localUrl===old.localUrl.split('#')[0]))locations.push(old);
 }
 if(!locations.length)return null;
 for(const location of locations){
  const old=previous?.locations.find(l=>l.address===location.address&&l.lat!=null&&l.lng!=null);
  Object.assign(location,old?{lat:old.lat,lng:old.lng,coordinateStatus:old.coordinateStatus}:await locate(location.address));
 }
 const review=previous?.review && savedFiles.some(f=>f.localUrl===previous.review?.localUrl.split('#')[0])?previous.review:undefined;
 const data:NoticeLocations={sourceUrl,review,parserVersion:2,sourceHashes:hashes,collectedAt:new Date().toISOString(),locations};
 const dest=filename(id);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest+'.tmp',JSON.stringify(data,null,2)+'\n');await fs.rename(dest+'.tmp',dest);
 return data;
}
