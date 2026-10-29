import type { NavItem } from "@/app/admin/admin-shell";

export function adminNav(): NavItem[] {
  return [
    { href: "/admin/data", label: "공공주택 데이터", icon: "building" },
    { href: "/admin/review", label: "공고 관리", icon: "dash" },
    { href: "/admin/automation", label: "수집 현황", icon: "automation" },
    { href: "/admin/activity", label: "저장된 수정", icon: "history" },
  ];
}
