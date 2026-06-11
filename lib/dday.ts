import type { StatusId } from "./types";

// 마감임박으로 간주할 일수 — open 상태이면서 D-7 이내인 경우 closing 으로 derive.
const CLOSING_THRESHOLD_DAYS = 7;

function parseDeadline(deadline: string): Date | null {
  if (!deadline) return null;
  // "YYYY.MM.DD" 와 "YYYY-MM-DD" 둘 다 허용 — 어드민 입력/SH 데이터 포맷 혼재 (감사 L2)
  const parts = deadline.split(/[.\-]/).map((s) => Number(s.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

function diffDays(target: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** deadline 이 1년 이상 미래면 "정례/수시모집"의 프로그램 전체 만료일이라고 간주.
 *  실제 라운드별 마감과 무관하므로 D-N 같은 표시는 의미 없음. */
export function isRegularRecruitment(deadline: string, status: StatusId): boolean {
  if (status !== "open") return false;
  const target = parseDeadline(deadline);
  if (!target) return false;
  return diffDays(target) > 365;
}

export function dDayText(deadline: string, status: StatusId): string {
  if (status === "upcoming") return "모집 예정";
  if (status === "closed") {
    // 개선안1차: 마감 직후엔 D+N(회색) — 30일 지난 마감은 그냥 "마감".
    const target = parseDeadline(deadline);
    if (target) {
      const diff = diffDays(target);
      if (diff < 0 && diff >= -30) return `D+${-diff}`;
    }
    return "마감";
  }
  if (isRegularRecruitment(deadline, status)) return "정례모집";
  // status === "open" + deadline 이 과거: "마감" 대신 빈 문자열 →
  // listing-panel 쪽에서 "수시모집" 으로 fallback.
  const target = parseDeadline(deadline);
  if (!target) return "";
  const diff = diffDays(target);
  if (diff < 0) return "";
  if (diff === 0) return "D-DAY";
  return `D-${diff}`;
}

/** status 를 표시 계층에서 재해석 — sync 와 sync 사이 stale 자동 보정:
 *  1) upcoming → 공고일 지났고 마감 안 됐으면 open
 *  2) upcoming/open → 마감일 지났으면 closed
 *  3) open → D-N(임계값) 이내면 closing (마감임박)
 *  주의: 정례/수시모집(D > 365)은 closing 아님.
 *  데이터에는 closing 이 없고 LH API 도 마감임박을 따로 안 보내므로 표시/필터 계층에서 derived. */
export function effectiveStatus(status: StatusId, deadline: string, beginDate?: string): StatusId {
  let s = status;
  const target = parseDeadline(deadline);
  const todayDiff = target ? diffDays(target) : null;

  // upcoming 보정
  if (s === "upcoming") {
    const begin = beginDate ? parseDeadline(beginDate) : null;
    if (begin && target) {
      const beginDiff = diffDays(begin);
      const endDiff = todayDiff ?? 0;
      // 마감 지났음 → closed
      if (endDiff < 0) return "closed";
      // 공고일 지났고 마감 안 됨 → open
      if (beginDiff <= 0 && endDiff >= 0) s = "open";
    }
  }

  // raw 가 open 외(특히 closing) 인데 deadline 이 과거면 closed 로 정정.
  // LH 가 "마감임박" 으로 분류한 상태에서 sync 후 시간이 지나 실제론 마감된 경우 자주 발생.
  if (s !== "open") {
    if (todayDiff != null && todayDiff < 0) return "closed";
    return s;
  }
  if (todayDiff == null) return s;
  // open 인데 마감 지났음 → closed (sync stale 자동 정정)
  if (todayDiff < 0) return "closed";
  // 정례/수시모집은 closing 아님
  if (todayDiff > 365) return s;
  if (todayDiff <= CLOSING_THRESHOLD_DAYS) return "closing";
  return s;
}

export function calcDday(deadline: string): string {
  const target = parseDeadline(deadline);
  if (!target) return "";
  const diff = diffDays(target);
  if (diff < 0) return diff >= -30 ? `D+${-diff}` : "마감";
  // 1년 이상 미래는 정례/수시모집의 프로그램 만료일일 가능성이 높음 — D-N 숨김
  if (diff > 365) return "";
  if (diff === 0) return "D-DAY";
  return `D-${diff}`;
}
