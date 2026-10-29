import type { Listing } from "./types";

export function budgetMatch(l: Listing, deposit: number, rent: number) {
  const verify = { text: "금액 확인 필요", tone: "neutral" };
  if (l.type === "sale") return { text: "분양 조건 별도 확인", tone: "neutral" };
  if (l.priceDetail || l.priceUnverified || !Number.isFinite(deposit) || !Number.isFinite(rent)) return verify;
  // 각각의 최저가를 합치면 실제로 없는 임대조건이 된다. 같은 주택형의 가격쌍으로 판단.
  const rows = l.complexes?.flatMap(c => c.rows) ?? [];
  if (!rows.length || rows.some(r => r.deposit == null || r.rent == null || !Number.isFinite(r.deposit) || !Number.isFinite(r.rent) || r.deposit < 0 || r.rent < 0)) return verify;
  const fits = rows.filter(r => r.deposit! <= Math.round(deposit * 10000) && r.rent! <= Math.round(rent * 10000));
  if (!fits.length) return { text: "설정한 예산 초과", tone: "amber" };
  if (fits.length !== rows.length) return { text: "일부 주택형만 예산 충족", tone: "amber" };
  return { text: "보증금·월세 예산 안에 있어요", tone: "green" };
}
