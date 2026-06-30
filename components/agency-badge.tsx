import type { Agency } from "@/lib/types";

// 공급기관 브랜드 배지 — 기관별 컬러 마크. 카드·디테일·핀 공통.
const AGENCY: Record<Agency, { cls: string; label: string }> = {
  LH: { cls: "ag-lh", label: "LH" },
  SH: { cls: "ag-sh", label: "SH" },
  GH: { cls: "ag-gh", label: "GH" },
  "서울시": { cls: "ag-seoul", label: "서울시" },
};

export function AgencyBadge({ agency, className = "" }: { agency: Agency; className?: string }) {
  const m = AGENCY[agency] ?? { cls: "agency", label: agency };
  return <span className={`badge ${m.cls} ${className}`.trim()}>{m.label}</span>;
}
