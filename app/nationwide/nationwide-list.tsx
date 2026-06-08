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

  const types = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.type)));
  }, [rows]);

  const filtered = useMemo(() => {
    return type === "all" ? rows : rows.filter((r) => r.type === type);
  }, [rows, type]);

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
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 80px" }}>
        {/* 헤더 */}
        <header style={{ marginBottom: 20 }}>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            color: "var(--seed-scale-color-gray-600)", fontSize: 13, fontWeight: 600,
            textDecoration: "none", marginBottom: 12,
          }}>
            ← 지도로 돌아가기
          </Link>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>
            전국 모집
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--seed-scale-color-gray-600)", lineHeight: 1.5 }}>
            여러 지역에서 동시 모집하는 광역 공고예요. 매입임대·전세임대·든든전세 등 지도에 표시되지 않는 매물입니다.
          </p>
        </header>

        {/* 유형 필터 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
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

        {/* 카드 그리드 */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 64, color: "var(--seed-scale-color-gray-500)" }}>
            현재 모집 중인 전국 공고가 없어요
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}>
            {filtered.map((r) => (
              <Card key={r.id} r={r} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Card({ r }: { r: NationwideRow }) {
  const sc = STATUS_COLOR[r.status];
  const dday = formatDday(r.deadline);
  const isSale = r.type === "sale";

  return (
    <a
      href={r.sourceUrl}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        background: "var(--seed-scale-color-gray-00)",
        border: "1px solid var(--seed-scale-color-gray-200)",
        borderRadius: 14,
        padding: 18,
        textDecoration: "none",
        color: "inherit",
        transition: "box-shadow 160ms ease, transform 160ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{
          padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: sc.bg, color: sc.fg,
        }}>
          {STATUS_LABEL[r.status]}
        </span>
        <span style={{
          padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
          background: "var(--seed-scale-color-gray-100)", color: "var(--seed-scale-color-gray-700)",
        }}>
          {TYPE_LABEL[r.type] ?? r.type}
        </span>
        {dday && dday !== "마감" && (
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: dday === "D-Day" || (dday.startsWith("D-") && Number(dday.slice(2)) <= 7) ? "var(--seed-scale-color-red-600)" : "var(--seed-scale-color-gray-500)" }}>
            {dday}
          </span>
        )}
      </div>

      <h2 style={{
        margin: "0 0 10px", fontSize: 15, fontWeight: 700, lineHeight: 1.4, letterSpacing: "-0.01em",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {r.title}
      </h2>

      <div style={{ fontSize: 13, color: "var(--seed-scale-color-gray-700)", display: "flex", flexDirection: "column", gap: 4 }}>
        <Row label="지역" value={r.district} />
        {r.supplyUnits != null && r.supplyUnits > 1 && <Row label="모집" value={`${r.supplyUnits.toLocaleString()}호`} />}
        {isSale
          ? (r.salePriceManwon ? <Row label="분양가" value={`${r.salePriceManwon.toLocaleString()}만원`} /> : null)
          : (r.deposit || r.rent
              ? <Row label="보증금/월세" value={`${r.deposit.toLocaleString()} / ${r.rent.toLocaleString()}만원`} />
              : null)}
        {r.area && <Row label="면적" value={r.area} />}
        {r.deadline && <Row label="마감" value={r.deadline} />}
      </div>

      {r.eligible.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 12 }}>
          {r.eligible.slice(0, 4).map((e) => (
            <span key={e} style={{
              fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6,
              background: "var(--seed-scale-color-carrot-50)", color: "var(--seed-scale-color-carrot-700)",
            }}>{e}</span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: "var(--seed-scale-color-carrot-600)" }}>
        LH 공고 보기 ↗
      </div>
    </a>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: "var(--seed-scale-color-gray-500)", minWidth: 64 }}>{label}</span>
      <span style={{ fontWeight: 600, color: "var(--seed-scale-color-gray-900)" }}>{value}</span>
    </div>
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
        padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
