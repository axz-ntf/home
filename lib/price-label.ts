// 보증금/월세 표시 텍스트 — 유형별 범위(depositRange/rentRange)가 있으면 "min만~max만",
// 없으면 단일값 "X만". 카드·상세 어디서나 동일 규칙으로 쓰도록 공용화.
import type { Listing } from "./types";

// 만원 → "X억 Y,YYY만" (1억 이상은 억 표기). 전세보증금 등 큰 금액 가독성.
const man = (n: number) => {
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const rem = n % 10000;
    return rem ? `${eok}억 ${rem.toLocaleString()}만` : `${eok}억`;
  }
  return `${n.toLocaleString()}만`;
};

/** 보증금 표시값 — "1,059만~2,100만" | "1,059만" | null(0/미상) */
export function depositText(item: Pick<Listing, "deposit" | "depositRange">): string | null {
  const r = item.depositRange;
  if (r && r[0] !== r[1]) return `${man(r[0])}~${man(r[1])}`;
  return item.deposit > 0 ? man(item.deposit) : null;
}

/** 월세 표시값 — "5만~12만" | "5만" | null(0) */
export function rentText(item: Pick<Listing, "rent" | "rentRange">): string | null {
  const r = item.rentRange;
  if (r && r[0] !== r[1]) return `${man(r[0])}~${man(r[1])}`;
  return item.rent > 0 ? man(item.rent) : null;
}
