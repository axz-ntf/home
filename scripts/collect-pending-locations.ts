// Extract addresses from official spreadsheets without an AI service.
import {collectNoticeLocations} from '../lib/notice-locations';
import {LH_ADMIN_LISTINGS} from '../lib/lh-adapter';
import {effectiveStatus} from '../lib/dday';
async function main(){
 const i=process.argv.indexOf('--limit');const limit=i<0?100:Number(process.argv[i+1]);
 if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('limit must be 1..500');
 let checked=0,found=0,failed=0;const seen=new Set<string>();
 for(const listing of LH_ADMIN_LISTINGS){
  if(!listing.sourceUrl||seen.has(listing.sourceUrl)||effectiveStatus(listing.status,listing.deadline,listing.beginDate)==='closed')continue;
  seen.add(listing.sourceUrl);if(checked>=limit)break;checked++;
  try{const result=await collectNoticeLocations(listing.id,listing.sourceUrl);if(result?.locations.length)found++;}
  catch(error){failed++;console.error(`주소 수집 실패 ${listing.id}: ${error instanceof Error?error.message:'unknown'}`);}
 }
 console.log(JSON.stringify({checked,found,failed}));if(failed)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1});
