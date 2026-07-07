import { computeInsight, insightCacheKey, type InsightResult } from "@/lib/insight";
import type { HousingTypeId } from "@/lib/types";
import seedCache from "@/lib/insight-cache.json";

export const maxDuration = 30;

// 좌표 기준 캐시 (입지 데이터는 안정적이라 TTL 불필요).
// 야간 파이프라인이 갱신하는 lib/insight-cache.json 을 시드로 로드 → 대부분 즉시 응답.
const cache = new Map<string, InsightResult>(
  Object.entries(seedCache as unknown as Record<string, InsightResult>),
);

export async function POST(req: Request) {
  let body: { lat?: number; lng?: number; name?: string; address?: string; type?: HousingTypeId };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const { lat, lng, name = "", address = "", type } = body;
  if (!lat || !lng) return Response.json({ error: "좌표가 없습니다" }, { status: 400 });

  const ckey = insightCacheKey(lat, lng, type);
  const cached = cache.get(ckey);
  if (cached) return Response.json(cached);

  try {
    const result = await computeInsight(lat, lng, name, address, type);
    cache.set(ckey, result);
    return Response.json(result);
  } catch {
    return Response.json({ error: "분석 생성 실패" }, { status: 502 });
  }
}
