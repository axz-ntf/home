"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AIcon } from "./icons";
import { DdsIcon } from "@/components/dds-icon";
import "./admin.css";
import "./admin-dds.css";

type IconKey = "automation" | "dash" | "listing" | "building" | "settings" | "history";

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  badge?: number | string;
  badgeKind?: "danger" | "subtle";
}

const ICONS: Record<IconKey, () => React.ReactNode> = {
  automation: AIcon.Automation,
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
  const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
  const sideOpen = openMenuPath === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sideOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuPath(null);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sideOpen]);

  // 정확 매칭: path 와 (filter query) 둘 다 같을 때만 active.
  // 같은 path 에 query 만 다른 메뉴 (대시보드 vs 검수 큐) 가 둘 다 active 되던 버그 해결.
  function isActive(href: string): boolean {
    const [hPath, hQuery = ""] = href.split("?");
    if (pathname !== hPath) {
      // 하위 경로 매칭 — /admin/review/[id] 도 대시보드 그룹에 속함.
      if ((hPath === "/admin/review" && pathname.startsWith("/admin/review/")) || (hPath === "/admin/data" && pathname.startsWith("/admin/data/"))) {
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
    <div className="a-app-admin a-admin-workspace">
      <button className="a-side-backdrop" type="button" tabIndex={-1} aria-label="메뉴 닫기" data-open={sideOpen} onClick={() => setOpenMenuPath(null)} />
      <aside id="admin-navigation" className="a-side" data-open={sideOpen}>
        {/* 로고 클릭 → 어드민 홈 (대시보드) */}
        <Link href="/admin/data" className="a-brand" onClick={() => setOpenMenuPath(null)}>
          <span className="a-brand-symbol"><DdsIcon name="home" size={24}/></span>
          <span className="a-brand-copy"><span className="a-brand-name">부동산</span><span className="a-brand-subtitle">공공주택 운영 센터</span></span>
        </Link>

        <nav className="a-nav-section" aria-label="어드민 메뉴">
          <div className="a-nav-label">워크스페이스</div>
          {navItems.map((it) => {
            const active = isActive(it.href);
            const Icon = ICONS[it.icon];
            return (
              <Link key={it.href} href={it.href} className={`a-nav-item ${active ? "on" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setOpenMenuPath(null)}>
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
        </nav>

        <div className="a-side-foot">
          <div className="a-user">
            <div className="a-user-av">{user.initial}</div>
            <div className="a-user-info">
              <div className="a-user-name">{user.name}</div>
              <div className="a-user-role">{user.role}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="a-main">
        <header className="a-topbar">
          <button ref={menuButton} type="button" className="a-menu-btn" onClick={() => setOpenMenuPath(sideOpen ? null : pathname)} aria-label={sideOpen ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={sideOpen} aria-controls="admin-navigation">
            <DdsIcon name={sideOpen ? "close" : "menu"} size={20}/>
          </button>
          <div className="a-topbar-heading">
            <span className="a-page-title">{pageTitle}</span>
            {pageSub && <span className="a-page-sub">{pageSub}</span>}
          </div>
          {cta}
          <Link className="a-service-link" href="/" target="_blank" rel="noreferrer">서비스 보기 <DdsIcon name="arrow-up-right" size={16}/></Link>
        </header>

        <div className="a-content">{children}</div>
      </main>
    </div>
  );
}
