// 국토부 아파트 전월세 실거래가 — 같은 법정동 최근 3개월 전세 평균 보증금.
// 서버 전용(MOLIT_API_KEY). 좌표→법정동코드는 coord2region(카카오) 사용.
// 주의: 행복주택 보증금 ≠ 아파트 전세라 1:1 비교는 아님 → "인근 시세 앵커"로만 제공.
import { coord2region } from "./kakao-local";

const URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent";

export type MarketRent = {
  scope: string; // 비교 기준 지역명(법정동 또는 시군구)
  jeonseAvg: number | null; // 전세 평균 보증금(만원)
  jeonsePerM2: number | null; // 전세 ㎡당 평균(만원/㎡) — 매물 비교용
  jeonseCount: number;
  months: string[];
};

type Item = { umd: string; deposit: number; rent: number; area: number };

function parseItems(xml: string): Item[] {
  return xml
    .split("<item>")
    .slice(1)
    .map((chunk) => {
      const get = (tag: string) => (chunk.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? "").trim();
      const num = (s: string) => parseInt(s.replace(/,/g, ""), 10) || 0;
      return {
        umd: get("umdNm"),
        deposit: num(get("deposit")),
        rent: num(get("monthlyRent")),
        area: parseFloat(get("excluUseAr")) || 0,
      };
    });
}

// 최근 n개월(완료된 달 기준, 이번 달 제외) YYYYMM 배열.
function recentMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

async function fetchMonth(key: string, lawdCd: string, ymd: string): Promise<Item[]> {
  const qs = new URLSearchParams({
    serviceKey: key, // URLSearchParams가 한 번만 인코딩
    LAWD_CD: lawdCd,
    DEAL_YMD: ymd,
    numOfRows: "800",
    pageNo: "1",
  });
  try {
    const r = await fetch(`${URL}?${qs}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return [];
    return parseItems(await r.text());
  } catch {
    return [];
  }
}

// 시군구(lawdCd)별 최근 3개월 거래목록 캐시 — 같은 구 매물은 MOLIT 재호출 안 함.
const sigunguCache = new Map<string, Item[]>();

async function itemsForSigungu(key: string, lawdCd: string): Promise<Item[]> {
  const hit = sigunguCache.get(lawdCd);
  if (hit) return hit;
  const months = recentMonths(3);
  const all = (await Promise.all(months.map((m) => fetchMonth(key, lawdCd, m)))).flat();
  sigunguCache.set(lawdCd, all);
  return all;
}

export async function marketRent(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<MarketRent | null> {
  const key = process.env.MOLIT_API_KEY?.trim();
  if (!key || !lat || !lng) return null;
  const region = await coord2region(lat, lng);
  if (!region) return null;

  const all = await itemsForSigungu(key, region.lawdCd);
  if (!all.length) return null;

  // 같은 법정동 우선, 표본 부족하면 시군구 전체로 확장.
  let scoped = all.filter((x) => x.umd === region.umd);
  let scope = region.umd || region.sigungu || "인근";
  if (scoped.length < 5) {
    scoped = all;
    scope = region.sigungu || "인근";
  }

  const jeonse = scoped.filter((x) => x.rent === 0 && x.deposit > 0);
  const jeonseAvg = jeonse.length
    ? Math.round(jeonse.reduce((s, x) => s + x.deposit, 0) / jeonse.length)
    : null;

  // ㎡당 평균(만원/㎡) — 면적 있는 전세 거래만
  const withArea = jeonse.filter((x) => x.area > 0);
  const jeonsePerM2 = withArea.length
    ? Math.round(withArea.reduce((s, x) => s + x.deposit / x.area, 0) / withArea.length)
    : null;

  return { scope, jeonseAvg, jeonsePerM2, jeonseCount: jeonse.length, months: recentMonths(3) };
}
