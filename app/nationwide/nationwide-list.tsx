"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface NationwideRow {
  id: string;
  title: string;
  type: string;
  district: string;
  status: "open" | "upcoming" | "closing" | "closed";
  deadline: string;
  announceDate: string;
  supplyUnits: number | null;
  deposit: number;
  rent: number;
  salePriceManwon: number | null;
  area: string;
  eligible: string[];
  sourceUrl: string;
}

const TYPE_LABEL: Record<string, string> = {
  happy: "행복주택", nation: "국민임대", integ: "통합공공임대", perm: "영구임대",
  buy: "매입임대", jeonse: "전세임대", fifty: "50년임대", sale: "분양",
};
const STATUS_LABEL: Record<NationwideRow["status"], string> = {
  open: "모집중", upcoming: "모집예정", closing: "마감임박", closed: "마감",
};
const STATUS_COLOR: Record<NationwideRow["status"], { bg: string; fg: string }> = {
  open:     { bg: "var(--seed-scale-color-green-50)",  fg: "var(--seed-scale-color-green-700)" },
  upcoming: { bg: "var(--seed-scale-color-blue-50)",   fg: "var(--seed-scale-color-blue-700)" },
  closing:  { bg: "var(--seed-scale-color-red-50)",    fg: "var(--seed-scale-color-red-700)" },
  closed:   { bg: "var(--seed-scale-color-gray-100)",  fg: "var(--seed-scale-color-gray-600)" },
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
    <main style={{
      // body 가 overflow:hidden(지도 풀스크린용)이라 이 페이지는 자체 스크롤 컨테이너로 둔다.
      height: "100dvh",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      background: "var(--seed-scale-color-gray-50)",
      fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
      color: "var(--seed-scale-color-gray-900)",
    }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "20px 16px 80px" }}>
        {/* 헤더 */}
        <header style={{ marginBottom: 18 }}>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            color: "var(--seed-scale-color-gray-600)", fontSize: 13, fontWeight: 600,
            textDecoration: "none", marginBottom: 12,
          }}>
            ← 지도로 돌아가기
          </Link>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: "-0.03em" }}>
            전체 공고
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--seed-scale-color-gray-600)", lineHeight: 1.5 }}>
            모집 중인 공공임대·분양 공고를 최근 공고일 순으로 모았어요. 지도에 표시되는 단지부터 전국 단위 광역 공고까지 한눈에.
          </p>
        </header>

        {/* 유형 필터 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
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
          <div style={{ textAlign: "center", padding: 64, color: "var(--seed-scale-color-gray-500)" }}>
            현재 모집 중인 전국 공고가 없어요
          </div>
        ) : (
          <div style={{
            background: "var(--seed-scale-color-gray-00)",
            border: "1px solid var(--seed-scale-color-gray-200)",
            borderRadius: 12,
            overflow: "hidden",
          }}>
            {/* 컬럼 헤더 (넓은 화면) */}
            <div className="nw-head">
              <span>유형</span>
              <span>공고</span>
              <span style={{ textAlign: "right" }}>공고일</span>
              <span style={{ textAlign: "right" }}>마감</span>
            </div>
            {filtered.map((r) => <NoticeRow key={r.id} r={r} />)}
          </div>
        )}
      </div>

      <style>{`
        .nw-head, .nw-row {
          display: grid;
          grid-template-columns: 84px 1fr 96px 92px;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
        }
        .nw-head {
          font-size: 12px; font-weight: 700;
          color: var(--seed-scale-color-gray-500);
          background: var(--seed-scale-color-gray-50);
          border-bottom: 1px solid var(--seed-scale-color-gray-200);
        }
        .nw-row {
          border-bottom: 1px solid var(--seed-scale-color-gray-100);
          text-decoration: none; color: inherit;
          transition: background 120ms ease;
        }
        .nw-row:last-child { border-bottom: 0; }
        .nw-row:hover { background: var(--seed-scale-color-gray-50); }
        @media (max-width: 640px) {
          .nw-head { display: none; }
          .nw-row {
            grid-template-columns: 1fr auto;
            grid-template-areas: "type meta" "title title";
            row-gap: 8px;
          }
          .nw-row .nw-type { grid-area: type; }
          .nw-row .nw-title { grid-area: title; }
          .nw-row .nw-announce { display: none; }
          .nw-row .nw-deadline { grid-area: meta; text-align: right; }
        }
      `}</style>
    </main>
  );
}

function NoticeRow({ r }: { r: NationwideRow }) {
  const sc = STATUS_COLOR[r.status];
  const dday = formatDday(r.deadline);
  const urgent = dday === "D-Day" || (dday.startsWith("D-") && Number(dday.slice(2)) <= 7);
  const isSale = r.type === "sale";

  const meta: string[] = [r.district];
  if (r.supplyUnits != null && r.supplyUnits > 1) meta.push(`${r.supplyUnits.toLocaleString()}호`);
  if (isSale && r.salePriceManwon) meta.push(`분양 ${r.salePriceManwon.toLocaleString()}만`);
  else if (!isSale && r.deposit && r.rent) meta.push(`보증 ${r.deposit.toLocaleString()}/월 ${r.rent.toLocaleString()}만`);
  else if (!isSale && r.deposit) meta.push(`보증금 ${r.deposit.toLocaleString()}만`);
  else if (!isSale && r.rent) meta.push(`월세 ${r.rent.toLocaleString()}만`);
  if (r.area) meta.push(r.area); // formatArea 가 이미 ㎡ 포함

  return (
    <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="nw-row">
      <span className="nw-type" style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <span style={{
          padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: sc.bg, color: sc.fg, whiteSpace: "nowrap",
        }}>
          {STATUS_LABEL[r.status]}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--seed-scale-color-gray-600)" }}>
          {TYPE_LABEL[r.type] ?? r.type}
        </span>
      </span>

      <span className="nw-title" style={{ minWidth: 0 }}>
        <span style={{
          display: "block", fontSize: 14.5, fontWeight: 600, lineHeight: 1.35,
          letterSpacing: "-0.01em",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {r.title}
        </span>
        <span style={{ display: "block", marginTop: 3, fontSize: 12, color: "var(--seed-scale-color-gray-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta.join(" · ")}
        </span>
      </span>

      <span className="nw-announce" style={{ textAlign: "right", fontSize: 12.5, color: "var(--seed-scale-color-gray-500)", fontVariantNumeric: "tabular-nums" }}>
        {r.announceDate || "—"}
      </span>

      <span className="nw-deadline" style={{ textAlign: "right" }}>
        <span style={{ display: "block", fontSize: 12.5, color: "var(--seed-scale-color-gray-700)", fontVariantNumeric: "tabular-nums" }}>
          {r.deadline || "—"}
        </span>
        {dday && dday !== "마감" && (
          <span style={{ display: "block", marginTop: 2, fontSize: 12, fontWeight: 800, color: urgent ? "var(--seed-scale-color-red-600)" : "var(--seed-scale-color-gray-500)" }}>
            {dday}
          </span>
        )}
      </span>
    </a>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        border: "1px solid",
        borderColor: active ? "var(--seed-scale-color-gray-900)" : "var(--seed-scale-color-gray-200)",
        background: active ? "var(--seed-scale-color-gray-900)" : "var(--seed-scale-color-gray-00)",
        color: active ? "#fff" : "var(--seed-scale-color-gray-700)",
        padding: "7px 13px", borderRadius: 999, fontSize: 13, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
