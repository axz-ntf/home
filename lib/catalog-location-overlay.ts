import {searchText, type CatalogRecord} from './housing-catalog';
import {readNoticeLocations} from './notice-locations';
import {readNoticeInformation} from './notice-information';
export async function withCatalogLocations(records:CatalogRecord[]):Promise<CatalogRecord[]> {
 return Promise.all(records.map(async record=>{
  const [saved,info]=await Promise.all([readNoticeLocations(record.id,record.sourceUrl),readNoticeInformation(record.id)]);
  const addresses=saved?.locations.map(l=>l.address) ?? (info?.sourceUrl===record.sourceUrl&&info?.fields.address?[info.fields.address]:[]);
  if(!addresses.length)return saved?.review?.status==='not-published' ? {...record,issues:[...record.issues.filter(i=>i!=='주소 미수집'&&i!=='좌표 미수집'),'공고문 상세주소 미공개']} : record;
  const complete=!!saved?.locations.length&&saved.locations.every(l=>l.lat!=null&&l.lng!=null);
  const issues=record.issues.filter(i=>i!=='주소 미수집'&&!(complete&&i==='좌표 미수집'));
  if(saved?.locations.length&&!complete&&!issues.includes('좌표 미수집'))issues.push('일부 공급주택 좌표 미확인');
  if(saved?.review?.status==='partial')issues.push('일부 단지 주소 확인 중');
  return {...record,address:addresses.length===1?addresses[0]:`${addresses[0]} 외 ${addresses.length-1}개 주소`,search:record.search+' '+searchText(addresses.join(' ')),issues};
 }));
}
