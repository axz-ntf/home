// 천단위 콤마 — 로케일 무관. Vercel 서버리스 Node(small-icu)에서 toLocaleString 이
// 구분자를 생략해 SSR≠CSR 텍스트 불일치(hydration #418)를 일으키던 문제를 근본 차단.
export function comma(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const neg = n < 0 ? "-" : "";
  return neg + Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 만원 단위 금액 → 한국식 억 표기.
// 예) 25322 → "2억 5,322만원", 20000 → "2억원", 1788 → "1,788만원".
// 0/누락은 빈 문자열 — 호출부에서 fallback 처리.
export function formatManwon(manwon: number | null | undefined): string {
  if (manwon == null || !Number.isFinite(manwon) || manwon <= 0) return "";
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok > 0 && rest > 0) return `${eok}억 ${comma(rest)}만원`;
  if (eok > 0) return `${eok}억원`;
  return `${comma(rest)}만원`;
}
