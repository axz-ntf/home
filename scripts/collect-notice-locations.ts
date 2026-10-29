import { collectNoticeLocations } from '../lib/notice-locations';
import { LH_ADMIN_LISTINGS } from '../lib/lh-adapter';
const id=process.argv[2];
const listing=LH_ADMIN_LISTINGS.find(l=>l.id===id);
if(!listing?.sourceUrl)throw new Error('정확한 공고 ID와 공식 출처가 필요합니다.');
collectNoticeLocations(listing.id,listing.sourceUrl).then(r=>console.log(JSON.stringify({addresses:r?.locations.length,rows:r?.locations.reduce((n,l)=>n+l.units,0),coordinates:r?.locations.filter(l=>l.lat!=null).length,statuses:[...new Set(r?.locations.map(l=>l.coordinateStatus))]}))).catch(e=>{console.error(e.message);process.exitCode=1;});
