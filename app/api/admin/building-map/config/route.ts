export const dynamic='force-dynamic';
// Public SDK configuration has no CORS header. Fetch only this fixed public resource.
export async function GET(){
 try{
  const r=await fetch('https://map.vworld.kr/dtkmap/vworldJson.do?device=pc&output=json',{signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(!r.ok)return Response.json({error:'VWorld 지도 설정 응답 오류'},{status:502});
  const data=await r.json();if(!data.terrain)return Response.json({error:'VWorld 지도 설정 형식 오류'},{status:502});
  return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'VWorld 지도 설정 연결 실패'},{status:502});}
}
