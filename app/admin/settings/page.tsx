import { LH_LISTINGS } from "@/lib/lh-adapter";
import { OVERRIDES } from "@/lib/manual-overrides";
import AdminShell, { type NavItem } from "../admin-shell";
import { getAdminUser } from "@/lib/admin-user";

export default function SettingsPage() {
  const needsReview = LH_LISTINGS.filter(
    (l) => !(l.id in OVERRIDES) && (l.supplyUnits == null || l.supplyUnits === 1),
  ).length;

  const navItems: NavItem[] = [
    { href: "/admin/review", label: "대시보드", icon: "dash" },
    { href: "/admin/review?filter=review", label: "검수 큐", icon: "listing", badge: needsReview, badgeKind: "danger" },
    { href: "/admin/activity", label: "검수 내역", icon: "history", badge: Object.keys(OVERRIDES).length, badgeKind: "subtle" },
    { href: "/admin/complexes", label: "단지 관리", icon: "building" },
    { href: "/admin/settings", label: "설정", icon: "settings" },
  ];

  const overrideCount = Object.keys(OVERRIDES).length;

  return (
    <AdminShell pageTitle="설정" pageSub="시스템 · daily sync · 검수 데이터" navItems={navItems} user={getAdminUser()}>
      <div style={{ display: "grid", gap: 14, maxWidth: 760 }}>
        <div className="a-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">데이터 sync</div>
              <div className="a-card-sub">GitHub Actions · 매일 KST 00:00 자동</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "var(--a-ink-2)", lineHeight: 1.7 }}>
            <div>• Phase 1: LH 공고 목록 (data.go.kr)</div>
            <div>• Phase 2: 상세 페이지 스크래핑 (좌표 · 사진 · 일정)</div>
            <div>• Phase 3: PDF → markdown (Solar)</div>
            <div>• Phase 4–5: 임베딩 / 자격 추출 (Claude)</div>
            <div>• Phase 6: Blob 업로드</div>
          </div>
        </div>

        <div className="a-card">
          <div className="a-card-head">
            <div>
              <div className="a-card-title">검수 데이터</div>
              <div className="a-card-sub">사용자가 직접 정정한 override 값</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "var(--a-ink-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--a-line)" }}>
              <span>전체 override</span>
              <strong style={{ color: "var(--a-ink)", fontVariantNumeric: "tabular-nums" }}>{overrideCount.toLocaleString()}건</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
              <span>저장 위치</span>
              <code style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: "var(--a-ink-3)" }}>
                lib/manual-overrides.json
              </code>
            </div>
          </div>
        </div>

        <div className="a-card" style={{ padding: "40px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--a-ink-3)" }}>
            ⚙️ 추가 설정 (권한 · 알림 · 환경변수) 은 다음 스프린트
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
