import { NextResponse } from 'next/server';
import { LH_ADMIN_LISTINGS } from '@/lib/lh-adapter';
import { collectNoticeInformation } from '@/lib/collect-notice-information';
export const runtime='nodejs';
export const maxDuration=300;
const running=new Set<string>();
export async function POST(request:Request){
 if(process.env.NODE_ENV==='production' && process.env.VERCEL)return NextResponse.json({error:'이 환경에는 추출 결과 저장소가 아직 연결되지 않았습니다.'},{status:503});
 const body=await request.json().catch(()=>null);
 const listing=typeof body?.id==='string'?LH_ADMIN_LISTINGS.find(l=>l.id===body.id):null;
 if(!listing)return NextResponse.json({error:'공고를 찾을 수 없습니다.'},{status:404});
 if(running.has(listing.id))return NextResponse.json({error:'이미 이 공고를 수집하고 있습니다. 잠시 후 새로고침해 주세요.'},{status:409});
 if(!process.env.SOLAR_API_KEY?.trim())return NextResponse.json({error:'AI 연결 설정이 필요합니다.'},{status:503});
 running.add(listing.id);
 try{
  const {collectedAt}=await collectNoticeInformation(listing,true);
  return NextResponse.json({ok:true,collectedAt,message:'원문 정보를 수집해 저장했습니다. AI 추출 정보에 표시됩니다.'});
 }catch(error){console.error('[collect-information]',error);return NextResponse.json({error:error instanceof Error?error.message:'정보 수집에 실패했습니다.'},{status:500});}
 finally{running.delete(listing.id);}
}
