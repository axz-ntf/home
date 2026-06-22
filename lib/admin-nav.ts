import { LH_ADMIN_LISTINGS, listingIssues } from "./lh-adapter";
import { OVERRIDES } from "./manual-overrides";
import type { NavItem } from "@/app/admin/admin-shell";

// 어드민 사이드바 — 모든 페이지가 동일 기준으로 배지를 표시한다.
// (이전: 페이지마다 검수 큐 배지 계산식이 needsSupplyReview / listingIssues 로 달라
//  네비게이션 시 숫자가 바뀌던 불일치 버그. 대시보드 "검수 큐" 필터와 같은 정의로 통일.)
export function adminNav(): NavItem[] {
  const review = LH_ADMIN_LISTINGS.filter(
    (l) => !(l.id in OVERRIDES) && listingIssues(l).length > 0,
  ).length;
  const reviewed = Object.keys(OVERRIDES).length;
  return [
    { href: "/admin/review", label: "대시보드", icon: "dash" },
    { href: "/admin/review?filter=review", label: "검수 큐", icon: "listing", badge: review, badgeKind: "danger" },
    { href: "/admin/activity", label: "검수 내역", icon: "history", badge: reviewed, badgeKind: "subtle" },
    { href: "/admin/complexes", label: "단지 관리", icon: "building" },
    { href: "/admin/settings", label: "설정", icon: "settings" },
  ];
}
