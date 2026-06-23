import { OVERRIDES } from "./manual-overrides";
import type { NavItem } from "@/app/admin/admin-shell";

// 어드민 사이드바. ("검수 큐"는 제거 — 결손은 파이프라인이 자동 채우고 매일 회전해
//  사람이 비우는 to-do 가 아니라 허수 카운터였음. 수정은 대시보드 행 클릭 → 편집으로.)
export function adminNav(): NavItem[] {
  const reviewed = Object.keys(OVERRIDES).length;
  return [
    { href: "/admin/review", label: "대시보드", icon: "dash" },
    { href: "/admin/activity", label: "수정 내역", icon: "history", badge: reviewed, badgeKind: "subtle" },
    { href: "/admin/complexes", label: "단지 관리", icon: "building" },
    { href: "/admin/settings", label: "설정", icon: "settings" },
  ];
}
