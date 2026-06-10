import { LH_ADMIN_LISTINGS, needsSupplyReview } from "@/lib/lh-adapter";
import { OVERRIDES } from "@/lib/manual-overrides";
import AdminShell, { type NavItem } from "../admin-shell";
import { getAdminUser } from "@/lib/admin-user";

export default function ComplexesPage() {
  const needsReview = LH_ADMIN_LISTINGS.filter(
    (l) => !(l.id in OVERRIDES) && needsSupplyReview(l),
  ).length;

  const navItems: NavItem[] = [
    { href: "/admin/review", label: "대시보드", icon: "dash" },
    { href: "/admin/review?filter=review", label: "검수 큐", icon: "listing", badge: needsReview, badgeKind: "danger" },
    { href: "/admin/activity", label: "검수 내역", icon: "history", badge: Object.keys(OVERRIDES).length, badgeKind: "subtle" },
    { href: "/admin/complexes", label: "단지 관리", icon: "building" },
    { href: "/admin/settings", label: "설정", icon: "settings" },
  ];

  return (
    <AdminShell pageTitle="단지 관리" pageSub="단지별 사진 / 위치 / 모집공고 이력" navItems={navItems} user={getAdminUser()}>
      <div className="a-card" style={{ padding: "60px 40px", textAlign: "center", maxWidth: 560, margin: "40px auto" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🏗️</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.025em" }}>
          준비 중
        </div>
        <div style={{ fontSize: 13, color: "var(--a-ink-3)", lineHeight: 1.6 }}>
          단지별 기본정보 · 사진 · 위치를 한 곳에서 관리하는 화면이에요.<br />
          현재는 모집공고 검수가 우선이라 다음 스프린트로 미뤄놨어요.
        </div>
      </div>
    </AdminShell>
  );
}
