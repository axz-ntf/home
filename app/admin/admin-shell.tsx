"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AIcon } from "./icons";
import "./admin.css";

type IconKey = "dash" | "listing" | "building" | "settings" | "history";

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  badge?: number | string;
  badgeKind?: "danger" | "subtle";
}

const ICONS: Record<IconKey, () => React.ReactNode> = {
  dash: AIcon.Dash,
  listing: AIcon.Listing,
  building: AIcon.Building,
  settings: AIcon.Settings,
  history: AIcon.History,
};

interface AdminShellProps {
  pageTitle: string;
  pageSub?: string;
  navItems: NavItem[];
  cta?: React.ReactNode;
  user?: { name: string; role: string; initial: string };
  children: React.ReactNode;
}

const DEFAULT_USER = { name: "운영자", role: "어드민", initial: "운" };

// 메인 어드민 shell — sidebar + topbar + content.
export default function AdminShell({ pageTitle, pageSub, navItems, cta, user = DEFAULT_USER, children }: AdminShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get("filter") || "";
  const [sideOpen, setSideOpen] = useState(false);

  // 경로 변경되면 자동 닫기 (모바일).
  useEffect(() => { setSideOpen(false); }, [pathname]);

  // 정확 매칭: path 와 (filter query) 둘 다 같을 때만 active.
  // 같은 path 에 query 만 다른 메뉴 (대시보드 vs 검수 큐) 가 둘 다 active 되던 버그 해결.
  function isActive(href: string): boolean {
    const [hPath, hQuery = ""] = href.split("?");
    if (pathname !== hPath) {
      // 하위 경로 매칭 — /admin/review/[id] 도 대시보드 그룹에 속함.
      if (hPath === "/admin/review" && pathname.startsWith("/admin/review/")) {
        // 단, 그 detail 페이지가 검수 큐(?filter=review) 흐름인지 여부는 알 수 없으므로 대시보드만 active.
        return hQuery === "";
      }
      return false;
    }
    // path 같음 → query 비교
    const hFilter = new URLSearchParams(hQuery).get("filter") || "";
    return hFilter === currentFilter;
  }

  return (
    <div className="a-app-admin">
      <div className="a-side-backdrop" data-open={sideOpen} onClick={() => setSideOpen(false)} />
      <aside className="a-side" data-open={sideOpen}>
        <div className="a-brand">
          <div className="a-brand-mark">둥</div>
          <div className="a-brand-name">다음부동산</div>
          <div className="a-brand-tag">ADMIN</div>
        </div>

        <div className="a-nav-section">
          <div className="a-nav-label">운영</div>
          {navItems.map((it) => {
            const active = isActive(it.href);
            const Icon = ICONS[it.icon];
            return (
              <Link key={it.href} href={it.href} className={`a-nav-item ${active ? "on" : ""}`}>
                <span className="a-nav-icon"><Icon /></span>
                {it.label}
                {it.badge != null && (
                  <span className={`a-nav-badge ${it.badgeKind === "subtle" ? "subtle" : ""}`}>
                    {typeof it.badge === "number" ? it.badge.toLocaleString() : it.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="a-side-foot">
          <button className="a-user" type="button">
            <div className="a-user-av">{user.initial}</div>
            <div className="a-user-info">
              <div className="a-user-name">{user.name}</div>
              <div className="a-user-role">{user.role}</div>
            </div>
          </button>
        </div>
      </aside>

      <main className="a-main">
        <header className="a-topbar">
          <button type="button" className="a-menu-btn" onClick={() => setSideOpen((v) => !v)} aria-label="메뉴">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M 3 5 H 15 M 3 9 H 15 M 3 13 H 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <span className="a-page-title">{pageTitle}</span>
            {pageSub && <span className="a-page-sub">{pageSub}</span>}
          </div>
          {cta}
        </header>

        <div className="a-content">{children}</div>
      </main>
    </div>
  );
}
