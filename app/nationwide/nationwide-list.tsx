"use client";

import { useCallback, useMemo, useState } from "react";
import { DdsIcon } from "@/components/dds-icon";
import "./nationwide.css";
import { comma } from "@/lib/format";
import Link from "next/link";
import { depositText, rentText } from "@/lib/price-label";

export interface NationwideRow {
  id: string;
  title: string;
  type: string;
  district: string;
  status: "open" | "upcoming" | "closing" | "closed";
  deadline: string;
  announceDate: string;
  winnerAt: string;
  supplyUnits: number | null;
  deposit: number;
  rent: number;
  depositRange?: [number, number] | null;
  rentRange?: [number, number] | null;
  salePriceManwon: number | null;
  area: string;
  eligible: string[];
  sourceUrl: string;
}

const TYPE_LABEL: Record<string, string> = {
  public: "공공임대", rental: "임대 · 유형 확인", happy: "행복주택", nation: "국민임대", integ: "통합공공임대", perm: "영구임대",
  buy: "매입임대", jeonse: "전세임대", fifty: "50년임대", sale: "분양", youth: "청년주택",
};
const STATUS_LABEL: Record<NationwideRow["status"], string> = {
  open: "모집중", upcoming: "모집예정", closing: "마감임박", closed: "마감",
};
const STATUS_COLOR: Record<NationwideRow["status"], { bg: string; fg: string }> = {
  open:     { bg: "var(--dds-background-state-info-subtle)",  fg: "var(--dds-text-state-info)" },
  upcoming: { bg: "var(--dds-background-state-info-subtle)",   fg: "var(--dds-text-state-info)" },
  closing:  { bg: "var(--dds-background-state-accent-subtle)",    fg: "var(--dds-text-state-accent)" },
  closed:   { bg: "var(--dds-background-surface-on)",  fg: "var(--dds-text-quaternary)" },
};

function formatDday(deadline: string): string {
  const m = deadline.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  if (!m) return "";
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59+09:00`).getTime();
  const days = Math.ceil((d - Date.now()) / 86400000);
  if (days < 0) return "마감";
  if (days === 0) return "D-Day";
  if (days > 365) return "";
  return `D-${days}`;
}

export default function NationwideList({ rows }: { rows: NationwideRow[] }) {
  const [type, setType] = useState<string>("all");

  const types = useMemo(() => Array.from(new Set(rows.map((r) => r.type))), [rows]);
  const filtered = useMemo(
    () => (type === "all" ? rows : rows.filter((r) => r.type === type)),
    [rows, type],
  );

  return (
    <main className="nw-page">
      <div className="nw-container">
        <header className="nw-page-heading">
          <Link href="/" className="nw-back"><DdsIcon name="arrow-left" size={20} /> 지도로 돌아가기</Link>
          <h1>전체 공고</h1>
          <p>모집 중인 공공임대·분양 공고를 최근 공고일 순으로 모았어요. 지도에 표시되는 단지부터 전국 단위 광역 공고까지 한눈에.</p>
        </header>

        {/* 유형 필터 */}
        <div className="nw-filters" aria-label="임대 유형 필터">
          <FilterChip active={type === "all"} onClick={() => setType("all")}>전체 {rows.length}</FilterChip>
          {types.map((t) => {
            const count = rows.filter((r) => r.type === t).length;
            return (
              <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
                {TYPE_LABEL[t] ?? t} {count}
              </FilterChip>
            );
          })}
        </div>

        {/* 공고 게시판 */}
        {filtered.length === 0 ? (
          <div className="nw-empty">
            현재 모집 중인 전국 공고가 없어요
          </div>
        ) : (
          <div className="nw-board">
            {/* 컬럼 헤더 (넓은 화면) */}
            <div className="nw-head">
              <span>유형</span>
              <span>공고</span>
              <span style={{ textAlign: "right" }}>공고일</span>
              <span style={{ textAlign: "right" }}>마감</span>
              <span style={{ textAlign: "right" }}>당첨 발표</span>
            </div>
            {filtered.map((r) => <NoticeRow key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </main>
  );
}

function NoticeRow({ r }: { r: NationwideRow }) {
  const sc = STATUS_COLOR[r.status];
  const dday = formatDday(r.deadline);
  const urgent = dday === "D-Day" || (dday.startsWith("D-") && Number(dday.slice(2)) <= 7);
  const isSale = r.type === "sale";

  const meta: string[] = [r.district];
  if (r.supplyUnits != null && r.supplyUnits > 1) meta.push(`${comma(r.supplyUnits)}호`);
  if (isSale && r.salePriceManwon) meta.push(`분양 ${comma(r.salePriceManwon)}만`);
  else if (!isSale) {
    const dt = depositText(r), rt = rentText(r);
    if (dt && rt) meta.push(`보증 ${dt}/월 ${rt}`);
    else if (dt) meta.push(`보증금 ${dt}`);
    else if (rt) meta.push(`월세 ${rt}`);
  }
  if (r.area) meta.push(r.area); // formatArea 가 이미 ㎡ 포함

  return (
    <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="nw-row">
      <span className="nw-type">
        <span className="nw-status" style={{ background: sc.bg, color: sc.fg }}>
          {STATUS_LABEL[r.status]}
        </span>
        <span className="nw-type-label">
          {TYPE_LABEL[r.type] ?? r.type}
        </span>
      </span>

      <span className="nw-title">
        <span className="nw-listing-title">
          {r.title}
        </span>
        <span className="nw-meta">
          {meta.join(" · ")}
        </span>
      </span>

      <span className="nw-announce">
        {r.announceDate || "—"}
      </span>

      <span className="nw-deadline">
        <span className="nw-deadline-date">
          {r.deadline || "—"}
        </span>
        {dday && dday !== "마감" && (
          <span suppressHydrationWarning className={`nw-dday ${urgent ? "is-urgent" : ""}`}>
            {dday}
          </span>
        )}
      </span>

      <span className="nw-winner">
        {r.winnerAt || "—"}
      </span>
    </a>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const chipRef = useCallback((element: (HTMLElement & { selected?: boolean }) | null) => {
    if (!element) return;
    const sync = () => { element.selected = active; };
    sync();
    customElements.whenDefined("dds-chip").then(sync);
  }, [active]);
  return (
    <dds-chip ref={chipRef} color={active ? "primary" : "neutral"} size="lg" selected={active} onClick={(event) => { (event.currentTarget as HTMLElement & { selected: boolean }).selected = true; onClick(); }}>
      {children}
    </dds-chip>
  );
}
