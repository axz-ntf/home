import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { localCounts, type LocalCounts } from "@/lib/kakao-local";
import { marketRent, type MarketRent } from "@/lib/molit-rent";
import { nearbyStations } from "@/lib/subway";
import { nearbySchools } from "@/lib/schools";
import type { HousingTypeId } from "@/lib/types";
import seedCache from "@/lib/insight-cache.json";

export const maxDuration = 30;

const anthropic = createAnthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim() });
const MODEL_ID = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const RADIUS = 500;

// 유형별 시세 대비 임대료 수준(제도 기준). 확신 있는 유형만, 나머지는 일반 문구.
const VALUE_RATIO: Partial<Record<HousingTypeId, string>> = {
  happy: "시세의 약 60~80%",
  nation: "시세의 약 60~80%",
  integ: "시세의 약 35~80% (소득분위별 차등)",
  perm: "시세의 약 30% 수준",
  buy: "시세의 약 30~50%",
  fifty: "시세의 약 60~90%",
};

// 좌표 기준 캐시 (입지 데이터는 안정적이라 TTL 불필요).
// 빌드 시 사전 계산된 lib/insight-cache.json 을 시드로 로드 → 첫 요청도 즉시 응답.
const cache = new Map<string, InsightResult>(
  Object.entries(seedCache as unknown as Record<string, InsightResult>),
);

const schema = z.object({
  summary: z.string().describe("2~3문장. '여기 살면 어떤지'를 사람 말로 해석. 숫자 나열 금지."),
  tags: z.array(z.string()).max(5).describe("데이터로 뒷받침되는 짧은 키워드 3~5개"),
});

type Tone = "rich" | "good" | "mid" | "low";
type GroupItem = { value: string; level: string; tone: Tone };
type Groups = { transit: GroupItem; life: GroupItem | null; edu: GroupItem | null; medical: GroupItem | null };
type NearLite = { name: string; walkMin: number };

type InsightResult = {
  valueText: string | null;
  marketText: string | null;
  marketPerM2: number | null; // 인근 아파트 전세 ㎡당 평균(만원) — 매물 비교용
  summary: string;
  tags: string[];
  groups: Groups;
  signals: { radius: number; counts: LocalCounts | null; stations: NearLite[]; schools: NearLite[] };
};

// 만원 → "6.6억" / "8,000만원"
function fmtKRW(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1).replace(/\.0$/, "")}억`;
  return `${manwon.toLocaleString()}만원`;
}

function buildMarketText(m: MarketRent | null): string | null {
  if (!m || !m.jeonseAvg || m.jeonseCount < 3) return null;
  return `인근 ${m.scope} 아파트 전세 평균 ${fmtKRW(m.jeonseAvg)} (최근 3개월 ${m.jeonseCount}건)`;
}

const SYSTEM = `너는 공공임대주택 매물의 "여기 살면 실제로 어떤지"를 알려주는 도우미다.
규칙(엄수):
- 제공된 '실측 데이터'에 있는 사실만 근거로 한다. 학군 평판/배정, 치안, 시세 전망, 개발 호재 등 데이터에 없는 건 절대 지어내지 않는다.
- "음식점 828개" 같은 숫자 나열을 하지 마라. "생활편의가 풍부한 편", "조용한 주거지", "초역세권" 처럼 사람이 궁금해하는 해석으로 풀어라.
- 교통·생활편의·의료·교육 중 이 위치의 특징을 2~3문장으로. 과장 금지, 단정 금지.
- tags는 데이터로 뒷받침되는 짧은 한국어 키워드 3~5개.`;

// 개수 → 레벨(라벨 + 색 tone)
function rank(n: number, mid: number, high: number): { level: string; tone: Tone } {
  if (n >= high) return { level: "풍부", tone: "rich" };
  if (n >= mid) return { level: "양호", tone: "good" };
  if (n > 0) return { level: "보통", tone: "mid" };
  return { level: "적음", tone: "low" };
}

function buildGroups(
  counts: LocalCounts | null,
  stations: { name: string; walkMin: number }[],
  schools: { name: string; walkMin: number }[],
): Groups {
  // 교통 — 가장 가까운 역 도보시간 기준
  let transit: GroupItem;
  if (stations.length) {
    const w = stations[0].walkMin;
    const tone: Tone = w <= 5 ? "rich" : w <= 10 ? "good" : "mid";
    const level = w <= 5 ? "우수" : w <= 10 ? "양호" : "보통";
    transit = {
      value: `${stations[0].name}역 도보 ${w}분${stations.length > 1 ? ` 외 ${stations.length - 1}개` : ""}`,
      level,
      tone,
    };
  } else {
    transit = { value: "도보권 지하철역 없음", level: "없음", tone: "low" };
  }

  let life: GroupItem | null = null;
  let medical: GroupItem | null = null;
  if (counts) {
    const l = rank(counts.cvs + counts.mart + counts.food + counts.cafe + counts.bank, 80, 250);
    life = { value: l.tone === "low" ? "생활시설 적음" : "편의점·마트·음식점 도보권", ...l };
    const m = rank(counts.hospital + counts.pharmacy, 15, 60);
    medical = { value: m.tone === "low" ? "병원·약국 적음" : "병원·약국 도보권", ...m };
  }

  // 교육 — 도보권 초등학교 + 학원 밀집
  let edu: GroupItem | null = null;
  if (schools.length || counts) {
    const hasSchool = schools.length > 0;
    const academy = counts?.academy ?? 0;
    let value = hasSchool ? `초등학교 도보 ${schools[0].walkMin}분` : "도보권 초등학교 없음";
    if (academy >= 80) value += " · 학원가";
    else if (academy > 0) value += " · 학원가 인접";
    let level: string, tone: Tone;
    if (hasSchool && academy >= 80) [level, tone] = ["우수", "rich"];
    else if (hasSchool) [level, tone] = ["양호", "good"];
    else if (academy > 0) [level, tone] = ["보통", "mid"];
    else [level, tone] = ["적음", "low"];
    edu = { value, level, tone };
  }

  return { transit, life, edu, medical };
}

function buildPrompt(
  name: string,
  address: string,
  valueText: string | null,
  marketText: string | null,
  counts: LocalCounts | null,
  stations: { name: string; walkMin: number; distM: number }[],
  schools: { name: string; walkMin: number; distM: number }[],
): string {
  const lines: string[] = [`매물: ${name || "(이름 미상)"}${address ? ` · ${address}` : ""}`, ""];
  if (valueText) lines.push(`[임대료] 공공임대라 ${valueText} 수준 (제도 기준)`);
  if (marketText) lines.push(`[인근 시세] ${marketText} — 참고 앵커(공공임대 보증금과 1:1 비교는 아님)`);
  lines.push("", `[주변 실측 — 반경 ${RADIUS}m]`);

  lines.push(
    stations.length
      ? `- 지하철: ${stations.map((x) => `${x.name}역 도보 ${x.walkMin}분`).join(", ")}`
      : `- 지하철: 도보 15분 내 없음`,
  );
  lines.push(
    schools.length
      ? `- 초등학교: ${schools.map((x) => `${x.name} 도보 ${x.walkMin}분`).join(", ")}`
      : `- 초등학교: 도보 15분 내 없음`,
  );
  if (counts) {
    lines.push(
      `- 시설 수: 편의점 ${counts.cvs}, 마트 ${counts.mart}, 음식점 ${counts.food}, 카페 ${counts.cafe}, ` +
        `병원 ${counts.hospital}, 약국 ${counts.pharmacy}, 은행 ${counts.bank}, 학원 ${counts.academy}, 문화 ${counts.culture}`,
    );
  }
  return lines.join("\n");
}

export async function POST(req: Request) {
  let body: { lat?: number; lng?: number; name?: string; address?: string; type?: HousingTypeId };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const { lat, lng, name = "", address = "", type } = body;
  if (!lat || !lng) return Response.json({ error: "좌표가 없습니다" }, { status: 400 });

  const ckey = `${lat.toFixed(4)},${lng.toFixed(4)},${type ?? ""}`;
  const cached = cache.get(ckey);
  if (cached) return Response.json(cached);

  const valueText = (type && VALUE_RATIO[type]) || null;

  const [counts, stations, schools, market] = await Promise.all([
    localCounts(lat, lng, RADIUS),
    Promise.resolve(nearbyStations(lat, lng, 15, 3)),
    nearbySchools(lat, lng, 15, 3),
    marketRent(lat, lng),
  ]);
  const marketText = buildMarketText(market);

  try {
    const { object } = await generateObject({
      model: anthropic(MODEL_ID),
      schema,
      system: SYSTEM,
      prompt: buildPrompt(name, address, valueText, marketText, counts, stations, schools),
    });
    const result: InsightResult = {
      valueText,
      marketText,
      marketPerM2: market?.jeonsePerM2 ?? null,
      summary: object.summary,
      tags: object.tags,
      groups: buildGroups(counts, stations, schools),
      signals: {
        radius: RADIUS,
        counts,
        stations: stations.map((s) => ({ name: s.name, walkMin: s.walkMin })),
        schools: schools.map((s) => ({ name: s.name, walkMin: s.walkMin })),
      },
    };
    cache.set(ckey, result);
    return Response.json(result);
  } catch {
    return Response.json({ error: "분석 생성 실패" }, { status: 502 });
  }
}
