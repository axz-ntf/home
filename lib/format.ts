// 만원 단위 금액 → 한국식 억 표기.
// 예) 25322 → "2억 5,322만원", 20000 → "2억원", 1788 → "1,788만원".
// 0/누락은 빈 문자열 — 호출부에서 fallback 처리.
export function formatManwon(manwon: number | null | undefined): string {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return "";
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  return `${rest.toLocaleString()}만원`;
}
