import { z } from "zod";
import { computeInsight, insightCacheKey, isFreshInsight, type InsightResult } from "@/lib/insight";
import seedCache from "@/lib/insight-cache.json";

export const maxDuration = 30;

const requestSchema = z.object({
  lat: z.number().finite().min(-90).max(90).refine((value) => value !== 0),
  lng: z.number().finite().min(-180).max(180).refine((value) => value !== 0),
  name: z.string().max(500).optional().default(""),
  address: z.string().max(1000).optional().default(""),
  type: z.enum(["happy", "nation", "public", "rental", "integ", "perm", "buy", "jeonse", "fifty", "sale", "youth"]).optional(),
});

// 구버전·만료 시드는 버린다. 정상 AI 요약 24시간, 데이터 대체 응답은 1분만 재사용한다.
const cache = new Map<string, InsightResult>(
  Object.entries(seedCache as unknown as Record<string, InsightResult>).filter(([, value]) => isFreshInsight(value)),
);
const pending = new Map<string, Promise<InsightResult>>();

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "유효한 좌표와 공고 정보를 입력해 주세요." }, { status: 400 });
  const { lat, lng, name, address, type } = parsed.data;
  const key = insightCacheKey(lat, lng, type);
  const cached = cache.get(key);
  if (isFreshInsight(cached)) return Response.json(cached);
  cache.delete(key);

  try {
    let job = pending.get(key);
    if (!job) {
      job = computeInsight(lat, lng, name, address, type)
        .then((result) => {
          cache.set(key, result);
          return result;
        })
        .finally(() => { pending.delete(key); });
      pending.set(key, job);
    }
    return Response.json(await job);
  } catch {
    return Response.json({ error: "주변 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
