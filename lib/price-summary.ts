// 매물의 가격 정보를 모델과 무관하게 {보증금·월세·면적} 범위로 정규화.
// 디테일 "임대 조건" 1차 노출 — 어떤 공고든 같은 골격으로 보여주기 위함.
// 값이 전혀 없는 항목은 undefined — 호출부에서 행 자체를 숨긴다 (스펙: 정보 없으면 미표시).

import type { Listing } from "./types";

export type Range = { min: number; max: number }; // 만원 (면적은 ㎡)

export type PriceSummary = {
  deposit?: Range;       // 보증금 (만원)
  rent?: Range;          // 월세 (만원)
  areaM2?: Range;        // 전용면적 (㎡)
  supportLimit?: Range;  // 전세임대 지원한도 (만원) — deposit/rent 대신
};

function toRange(values: number[]): Range | undefined {
  const v = values.filter((n) => Number.isFinite(n) && n > 0);
  if (!v.length) return undefined;
  return { min: Math.min(...v), max: Math.max(...v) };
}

function pushFlat(acc: number[], v: number | [number, number] | null | undefined) {
  if (v == null) return;
  if (Array.isArray(v)) acc.push(v[0], v[1]);
  else acc.push(v);
}

// "84.917~84.99" / "26" 식 area 문자열 → 숫자들
function parseAreaString(area: string | undefined): number[] {
  if (!area) return [];
  return (area.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

export function summarizePrice(item: Listing): PriceSummary {
  const pd = item.priceDetail;

  // 전세임대 — 보증금/월세가 아니라 지원한도 모델
  if (pd?.model === "support-limit" && pd.supportLimit?.byHousehold?.length) {
    return {
      supportLimit: toRange(pd.supportLimit.byHousehold.map((b) => b.limitManwon)),
      areaM2: toRange(parseAreaString(item.area)),
    };
  }

  const deposits: number[] = [];
  const rents: number[] = [];
  const areas: number[] = [];

  for (const t of pd?.tiers ?? []) {
    for (const inc of t.incomes) {
      pushFlat(deposits, inc.deposit);
      pushFlat(rents, inc.rent);
    }
  }
  for (const h of pd?.householdTypes ?? []) {
    pushFlat(deposits, h.deposit);
    pushFlat(rents, h.rent);
  }
  for (const c of item.complexes ?? []) {
    for (const r of c.rows ?? []) {
      // ComplexRow 금액은 원 단위
      if (r.deposit) deposits.push(Math.round(r.deposit / 10000));
      if (r.rent) rents.push(Math.round(r.rent / 10000));
      if (r.area) areas.push(r.area);
    }
  }
  // 구조화 데이터가 전혀 없으면 대표 단일가로
  // 구조화 데이터 없으면 추출 범위(depositRange) → 단일가 순으로 fallback.
  if (!deposits.length) {
    if (item.depositRange) deposits.push(item.depositRange[0], item.depositRange[1]);
    else if (item.deposit > 0) deposits.push(item.deposit);
  }
  if (!rents.length) {
    if (item.rentRange) rents.push(item.rentRange[0], item.rentRange[1]);
    else if (item.rent > 0) rents.push(item.rent);
  }
  if (!areas.length) areas.push(...parseAreaString(item.area));

  return {
    deposit: toRange(deposits),
    rent: toRange(rents),
    areaM2: toRange(areas),
  };
}
