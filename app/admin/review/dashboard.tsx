"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import AdminShell, { type NavItem } from "../admin-shell";
import { AIcon } from "../icons";

export interface DashboardRow {
  id: string;
  pblancId?: string;
  title: string;
  district: string;
  type: string;
  agency: string;
  suplyTyNm: string;
  status: "open" | "upcoming" | "closing" | "closed";
  noticeStatus: string;
  progressStatus: string;
  deadline: string;
  beginDate: string;
  announceDate: string;
  supplyUnits: number | null;
  deposit: number;
  rent: number;
  salePriceManwon: number | null;
  sourceUrl: string;
  reviewed: boolean;
  issues: string[];
  needsReview: boolean;
  hasDraft: boolean;
  pinCount: number | null;
  note: string;
}

type FilterKey = "all" | "review" | "open" | "upcoming" | "closing" | "closed";

const STATUS_LABEL: Record<DashboardRow["status"], string> = {
  open: "모집중", upcoming: "모집예정", closing: "마감임박", closed: "마감",
};
const TYPE_LABEL: Record<string, string> = {
  happy: "행복주택", nation: "국민임대", integ: "통합공공임대", perm: "영구임대",
  buy: "매입임대", jeonse: "전세임대", fifty: "50년임대", sale: "분양",
};

function formatDday(deadline: string): { text: string; urgent: boolean } | null {
  if (!deadline) return null;
  const m = deadline.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59+09:00`);
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  const days = Math.ceil((d.getTime() - now) / (1000 * 60 * 60 * 24));
  // 마감 30일 지난 건 D+N 대신 표기 생략 — 메인앱 dday.ts 와 정책 통일 (감사 L1)
  if (days < -30) return null;
  if (days < 0) return { text: `D+${Math.abs(days)}`, urgent: false };
  if (days === 0) return { text: "D-Day", urgent: true };
  return { text: `D-${days}`, urgent: days <= 7 };
}

// 소스 헬스 (P4) — 마지막 sync 가 오래되면 데이터가 썩고 있다는 뜻. 24h 노랑 / 48h 빨강.
interface SyncEntry { at: string; count: number }
const SYNC_SOURCES: { key: string; label: string }[] = [
  { key: "lh", label: "LH" },
  { key: "sh", label: "SH" },
  { key: "youth", label: "청년안심" },
];

function SyncHealthStrip({ meta }: { meta: Record<string, SyncEntry | undefined> }) {
  // 마운트 시각 기준 신선도 — 렌더 중 Date.now() 호출(불순) 금지 룰 준수.
  const [now] = useState(() => Date.now());
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--a-ink-2)", margin: "2px 0 10px" }}>
      {SYNC_SOURCES.map(({ key, label }) => {
        const e = meta[key];
        if (!e) {
          return (
            <span key={key} style={{ color: "var(--a-ink-3)" }}>
              <strong>{label}</strong> 기록 없음 — 다음 daily sync 부터
            </span>
          );
        }
        const hours = (now - new Date(e.at).getTime()) / 3600000;
        const tone = hours >= 48 ? "var(--a-red)" : hours >= 24 ? "var(--a-yellow)" : "var(--a-green, #1a9c5b)";
        const ago = hours < 1 ? "방금" : hours < 24 ? `${Math.floor(hours)}시간 전` : `${Math.floor(hours / 24)}일 전`;
        return (
          <span key={key}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: tone, marginRight: 5, verticalAlign: "middle" }} />
            <strong>{label}</strong> {ago} · {e.count}건
          </span>
        );
      })}
    </div>
  );
}

export default function Dashboard({ rows, user, syncMeta, activePins }: { rows: DashboardRow[]; user?: { name: string; role: string; initial: string }; syncMeta?: Record<string, SyncEntry | undefined>; activePins?: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const urlFilter = (params.get("filter") || "all") as FilterKey;
  const urlQuery = params.get("q") || "";
  const [filter, setFilter] = useState<FilterKey>(urlFilter);
  const [query, setQuery] = useState(urlQuery);

  // URL ↔ local state 동기화 — 사이드바 "검수 큐" 클릭 시 filter 자동 적용.
  useEffect(() => { setFilter(urlFilter); }, [urlFilter]);
  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);

  // filter chip 클릭 → URL 도 같이 업데이트 (사이드바 active state 즉시 반영).
  function changeFilter(next: FilterKey) {
    setFilter(next);
    const sp = new URLSearchParams(params.toString());
    if (next === "all") sp.delete("filter");
    else sp.set("filter", next);
    const qs = sp.toString();
    router.replace(qs ? `/admin/review?${qs}` : "/admin/review", { scroll: false });
  }

  const stats = useMemo(() => {
    const s = { total: rows.length, open: 0, upcoming: 0, closing: 0, closed: 0, review: 0, reviewed: 0 };
    for (const r of rows) {
      s[r.status]++;
      if (r.needsReview && !r.reviewed) s.review++;
      if (r.reviewed) s.reviewed++;
    }
    return s;
  }, [rows]);

  // 이슈 종류별 미검수 건수 (P2) — "검수 필요 N"이 아니라 무엇이 비었는지로 큐를 본다.
  const issueCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      if (r.reviewed) continue;
      for (const issue of r.issues) m[issue] = (m[issue] ?? 0) + 1;
    }
    return m;
  }, [rows]);
  const [issueFilter, setIssueFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "review" && !(r.needsReview && !r.reviewed)) return false;
      if (filter !== "all" && filter !== "review" && r.status !== filter) return false;
      if (issueFilter && (r.reviewed || !r.issues.includes(issueFilter))) return false;
      // 청년안심처럼 유형명이 제목에 없는 공고도 "청년안심"·"서울시"로 찾히게 — suplyTyNm·agency 포함.
      if (
        q &&
        !r.title.toLowerCase().includes(q) &&
        !r.district.toLowerCase().includes(q) &&
        !r.suplyTyNm.toLowerCase().includes(q) &&
        !r.agency.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, filter, query, issueFilter]);

  // ── 페이지네이션 ──
  const PAGE_SIZE = 50;
  const pageFromUrl = Math.max(1, Number(params.get("page") || "1"));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pageFromUrl, totalPages);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  // 필터/검색이 바뀌면 page=1 로 자동 리셋.
  useEffect(() => {
    if (pageFromUrl !== 1 && (filter !== urlFilter || query !== urlQuery)) {
      const sp = new URLSearchParams(params.toString());
      sp.delete("page");
      router.replace(sp.toString() ? `/admin/review?${sp.toString()}` : "/admin/review", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query]);

  function goToPage(p: number) {
    const sp = new URLSearchParams(params.toString());
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    const qs = sp.toString();
    router.replace(qs ? `/admin/review?${qs}` : "/admin/review", { scroll: false });
    // 페이지 변경 시 테이블 상단으로 스크롤
    document.querySelector(".a-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][today.getDay()];

  const navItems: NavItem[] = [
    { href: "/admin/review", label: "대시보드", icon: "dash" },
    { href: "/admin/review?filter=review", label: "검수 큐", icon: "listing", badge: stats.review, badgeKind: "danger" },
    { href: "/admin/activity", label: "검수 내역", icon: "history", badge: stats.reviewed, badgeKind: "subtle" },
    { href: "/admin/complexes", label: "단지 관리", icon: "building" },
    { href: "/admin/settings", label: "설정", icon: "settings" },
  ];

  return (
    <AdminShell
      pageTitle="대시보드"
      pageSub={`${todayStr} ${weekday}요일 · 실시간`}
      navItems={navItems}
      user={user}
    >
      <SearchInTopbarSync onChange={setQuery} />

      {syncMeta && <SyncHealthStrip meta={syncMeta} />}

      <section className="a-kpi-row">
        <KpiCard label="전체 공고" value={stats.total} sub={`모집중 ${stats.open}건 · 마감임박 ${stats.closing}건`} />
        {/* 공고 단위 vs 지도 핀 단위 병기 — 메가공고 1건이 PC 지도에선 단지별 N핀이라 수가 다르다 */}
        <KpiCard
          label="모집중 (공고)"
          value={stats.open + stats.closing}
          sub={activePins != null ? `PC 지도 핀 ${activePins}개 · 마감임박 ${stats.closing} 포함` : `예정 ${stats.upcoming} · 마감 ${stats.closed}`}
          accent
        />
        <KpiCard label="검수 필요" value={stats.review} sub={stats.review > 0 ? "PDF 확인해서 정정 필요" : "모두 검수됨 ✓"} warn={stats.review > 0} highlight="warn" />
        <KpiCard label="검수됨" value={stats.reviewed} sub="사용자가 정정한 매물" highlight="success" />
      </section>

      <div className="a-table-wrap">
        <div className="a-table-head">
          <div className="a-table-filters">
            <FilterChip active={filter === "all"} onClick={() => changeFilter("all")} count={stats.total}>전체</FilterChip>
            <FilterChip active={filter === "review"} onClick={() => changeFilter("review")} count={stats.review}>검수 필요</FilterChip>
            <FilterChip active={filter === "open"} onClick={() => changeFilter("open")} count={stats.open}>모집중</FilterChip>
            <FilterChip active={filter === "upcoming"} onClick={() => changeFilter("upcoming")} count={stats.upcoming}>예정</FilterChip>
            <FilterChip active={filter === "closing"} onClick={() => changeFilter("closing")} count={stats.closing}>마감임박</FilterChip>
            <FilterChip active={filter === "closed"} onClick={() => changeFilter("closed")} count={stats.closed}>마감</FilterChip>
          </div>
          {/* 이슈별 검수 큐 (P2) — 미검수 active 공고의 결손 종류. 클릭 토글로 교차 필터. */}
          {Object.keys(issueCounts).length > 0 && (
            <div className="a-table-filters" style={{ marginTop: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--a-ink-3)", alignSelf: "center" }}>이슈:</span>
              {(["가격", "좌표", "PDF", "마감일", "자격", "세대수"] as const)
                .filter((k) => issueCounts[k])
                .map((k) => (
                  <FilterChip
                    key={k}
                    active={issueFilter === k}
                    onClick={() => setIssueFilter((cur) => (cur === k ? null : k))}
                    count={issueCounts[k]}
                  >
                    {k}
                  </FilterChip>
                ))}
            </div>
          )}
          <div className="a-card-actions">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·지역 검색"
              style={{
                padding: "7px 12px",
                border: "1px solid var(--a-line-2)",
                borderRadius: 7,
                fontSize: 12,
                outline: "none",
                fontFamily: "inherit",
                color: "var(--a-ink)",
                background: "white",
                minWidth: 200,
              }}
            />
          </div>
        </div>

        <table className="a-table">
          <thead>
            <tr>
              <th style={{ width: 120 }}>공고 ID</th>
              <th>공고</th>
              <th>유형</th>
              <th>지역</th>
              <th>마감</th>
              <th>상태</th>
              <th style={{ textAlign: "right" }}>세대수</th>
              <th>검수</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={9} className="a-empty">
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🔍</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--a-ink)", marginBottom: 4 }}>
                    해당하는 공고가 없어요
                  </div>
                  <div style={{ fontSize: 12, color: "var(--a-ink-3)", marginBottom: 12 }}>
                    {filter !== "all" && <>필터: <strong style={{ color: "var(--a-ink-2)" }}>{filter === "review" ? "검수 필요" : filter}</strong></>}
                    {filter !== "all" && query && " · "}
                    {query && <>검색어: <strong style={{ color: "var(--a-ink-2)" }}>&quot;{query}&quot;</strong></>}
                  </div>
                  {(filter !== "all" || query) && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setQuery(""); changeFilter("all"); }}
                      className="a-cta ghost"
                      style={{ background: "var(--a-bg-2)", color: "var(--a-ink-2)" }}
                    >
                      필터 초기화
                    </button>
                  )}
                </td>
              </tr>
            )}
            {paged.map((r) => {
              const dday = formatDday(r.deadline);
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/admin/review/${encodeURIComponent(r.id)}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td><span className="id-mono">{r.pblancId ?? r.id.slice(-12)}</span></td>
                  <td>
                    <div className="title">{r.title}</div>
                    <div className="sub">
                      {r.noticeStatus && (
                        <span className={`a-badge ${r.noticeStatus.includes("정정") ? "notice-correction" : "notice-normal"}`} style={{ marginRight: 6 }}>
                          {r.noticeStatus}
                        </span>
                      )}
                      {r.agency} · 공고일 {r.announceDate || "—"}
                      {r.pinCount != null && (
                        <span title={`PC 지도에선 단지별 ${r.pinCount}개 핀으로 표시 — 클릭해 핀 편집`} style={{ marginLeft: 6, fontWeight: 700, color: "var(--a-ink-2)" }}>
                          📍{r.pinCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td><TypeBadge type={r.type} /></td>
                  <td style={{ color: "var(--a-ink-2)" }}>{r.district}</td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--a-ink)" }}>
                      {r.deadline ? r.deadline.replace(/\./g, ". ") : "—"}
                    </div>
                    {dday && (
                      <div className="sub" style={{ color: dday.urgent ? "var(--a-red)" : "var(--a-ink-3)", fontWeight: 700 }}>
                        {dday.text}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`a-status ${r.status}`}>
                      <span className="dot" />
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="num">
                    {r.supplyUnits == null ? (
                      <span style={{ color: "var(--a-red)", fontWeight: 700 }}>없음</span>
                    ) : r.supplyUnits === 1 ? (
                      <span style={{ color: "var(--a-yellow)", fontWeight: 700 }}>1?</span>
                    ) : (
                      <span style={{ fontWeight: 700 }}>{r.supplyUnits.toLocaleString()}</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {r.reviewed ? (
                        <span className="a-review-chip done">✓ 검수</span>
                      ) : r.needsReview ? (
                        <span className="a-review-chip need" title={`이슈: ${r.issues.join(", ")}`}>
                          {r.hasDraft ? "🌙 " : ""}
                          {r.issues.slice(0, 2).join("·")}
                          {r.issues.length > 2 ? ` +${r.issues.length - 2}` : ""}
                        </span>
                      ) : (
                        <span className="a-review-chip muted">—</span>
                      )}
                      {r.note && (
                        <span
                          title={r.note}
                          aria-label={`메모: ${r.note}`}
                          style={{
                            display: "inline-flex",
                            width: 18, height: 18,
                            alignItems: "center", justifyContent: "center",
                            borderRadius: 4,
                            background: "var(--a-yellow-low)",
                            color: "var(--a-yellow)",
                            fontSize: 11,
                            cursor: "help",
                          }}
                        >📝</span>
                      )}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="a-row-actions">
                      <Link
                        href={`/admin/review/${encodeURIComponent(r.id)}`}
                        className="a-icon-btn"
                        aria-label="편집"
                        title="편집"
                      >
                        <AIcon.Edit />
                      </Link>
                      {r.sourceUrl && (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="a-icon-btn"
                          aria-label={`${r.agency} 공고 페이지`}
                          title={`${r.agency} 공고 페이지`}
                        >
                          <AIcon.External />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="a-table-foot">
          <div>
            총 <strong style={{ color: "var(--a-ink)" }}>{filtered.length.toLocaleString()}</strong>건 ·{" "}
            {filtered.length > 0 && (
              <>
                <strong style={{ color: "var(--a-ink)" }}>{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)}</strong>건 표시
              </>
            )}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
        </div>
      </div>
    </AdminShell>
  );
}

function KpiCard({
  label, value, sub, accent, warn, highlight,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
  highlight?: "warn" | "success";
}) {
  return (
    <div className={`a-kpi-card ${accent ? "accent" : ""} ${warn ? "warn" : ""}`}>
      <div className="a-kpi-label">{label}</div>
      <div className="a-kpi-value">{value.toLocaleString()}<small>건</small></div>
      {sub && <div className={`a-kpi-sub ${highlight ?? ""}`}>{sub}</div>}
    </div>
  );
}

function FilterChip({ active, onClick, count, children }: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`a-filter-chip ${active ? "on" : ""}`} onClick={onClick}>
      {children}
      <span className="count">{count.toLocaleString()}</span>
    </button>
  );
}

function TypeBadge({ type }: { type: string }) {
  return <span className={`a-badge ${type}`}>{TYPE_LABEL[type] ?? type}</span>;
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  // 표시 페이지: 현재 ± 2 + 양 끝 + ellipsis.
  const pages: (number | "...")[] = [];
  const add = (p: number) => { if (!pages.includes(p) && p >= 1 && p <= totalPages) pages.push(p); };
  add(1);
  if (page > 4) pages.push("...");
  for (let p = page - 2; p <= page + 2; p++) add(p);
  if (page < totalPages - 3) pages.push("...");
  add(totalPages);

  return (
    <div className="a-pagi">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="이전 페이지">‹</button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} style={{ padding: "0 4px", color: "var(--a-ink-4)" }}>…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={p === page ? "on" : ""}
            disabled={p === page}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="다음 페이지">›</button>
    </div>
  );
}

// topbar 의 search 와 dashboard 의 query state 를 동기화하지 않는 dummy — 추후 통합 가능.
function SearchInTopbarSync({ onChange: _onChange }: { onChange: (v: string) => void }) {
  return null;
}
