import { NextResponse } from "next/server";

// 주소 → 좌표(lat/lng). 다음 우편번호 팝업이 고른 주소를 VWORLD 로 지오코딩한다.
// mapped-points-editor 의 "주소검색" 이 호출 — 사람이 위도/경도를 손으로 안 치게.
// (지오코딩 로직은 scripts/geocode-sh.mjs 와 동일 계열, 서울 경계 검증은 안 함:
//  팝업이 고른 명시 주소라 결과가 그 주소를 정확히 가리킨다.)
export const runtime = "nodejs";

const KEY = (process.env.VWORLD_API_KEY ?? "").trim();

let lastStatus = "";

async function vworld(address: string, type: "road" | "parcel"): Promise<{ lat: number; lng: number } | null> {
  const u = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&type=${type}&address=${encodeURIComponent(address)}&format=json&key=${KEY}`;
  const j = await (await fetch(u)).json();
  // 진단 — VWORLD 가 키/IP 거부(ERROR)인지, 주소 미존재(NOT_FOUND)인지 구분해 에러에 노출.
  lastStatus = j?.response?.status ?? "";
  const p = j?.response?.result?.point;
  return p ? { lat: Number(p.y), lng: Number(p.x) } : null;
}

export async function GET(req: Request) {
  if (!KEY) return NextResponse.json({ error: "VWORLD_API_KEY 없음" }, { status: 500 });
  const { searchParams } = new URL(req.url);
  const road = (searchParams.get("road") ?? "").trim();
  const jibun = (searchParams.get("jibun") ?? "").trim();
  if (!road && !jibun) return NextResponse.json({ error: "road 또는 jibun 필요" }, { status: 400 });

  // 도로명(road) → 지번(parcel) 순. 한쪽이 없으면 다른 쪽으로 대체 시도.
  const tries: [string, "road" | "parcel"][] = [];
  if (road) tries.push([road, "road"]);
  if (jibun) tries.push([jibun, "parcel"]);
  if (!jibun && road) tries.push([road, "parcel"]);

  lastStatus = "";
  for (const [address, type] of tries) {
    try {
      const r = await vworld(address, type);
      if (r && Number.isFinite(r.lat) && Number.isFinite(r.lng)) return NextResponse.json({ ok: true, ...r });
    } catch { /* 다음 시도 */ }
  }
  // status=ERROR 면 키/IP 거부(서버 리전 문제), NOT_FOUND 면 주소 자체가 안 풀림.
  const hint = lastStatus === "ERROR" ? " (VWORLD 거부 — 서버 리전/키 문제)" : "";
  return NextResponse.json({ error: `좌표를 찾지 못했습니다.${hint}`, vworldStatus: lastStatus }, { status: 404 });
}
