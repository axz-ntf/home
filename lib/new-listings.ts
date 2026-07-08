// 신규 공고 판정 — 공고일(announceDate) 기준 최근 N일 이내.
// 싱크가 firstSeen 을 기록하지 않아 공고일이 유일한 신규성 근거 (파이프라인 무수정).
// 시간 의존 → 호출부에서 mounted 게이트 필수 (SSR/hydration 불일치 방지).

import type { Listing } from "./types";

export const NEW_WINDOW_DAYS = 7;

// "YYYY.MM.DD" (또는 -) → epoch ms. 파싱 불가 시 null.
function announceEpoch(item: Listing): number | null {
  const m = item.announceDate?.match(/^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(t) ? t : null;
}

// nowMs 기본값 내부 처리 — effectiveStatus 와 같은 패턴 (호출부 useMemo 순수성 린트 회피,
// 시간 의존이므로 호출부 mounted 게이트는 여전히 필수).
export function isNewListing(item: Listing, nowMs = Date.now()): boolean {
  const t = announceEpoch(item);
  return t != null && nowMs - t <= NEW_WINDOW_DAYS * 86_400_000;
}
