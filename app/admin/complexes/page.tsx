import AdminShell from "../admin-shell";
import { adminNav } from "@/lib/admin-nav";
import { getAdminUser } from "@/lib/admin-user";

export default function ComplexesPage() {
  const navItems = adminNav();

  return (
    <AdminShell pageTitle="단지 관리" pageSub="단지별 사진 / 위치 / 모집공고 이력" navItems={navItems} user={getAdminUser()}>
      <div className="a-card" style={{ padding: "60px 40px", textAlign: "center", maxWidth: 560, margin: "40px auto" }}>
        <div style={{ marginBottom: 8, color: "var(--a-ink-4)", display: "flex", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M4 21h17M8 8h3M8 12h3M8 16h3" /></svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
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
