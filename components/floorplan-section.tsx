"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import floorplanSpecs from "@/lib/floorplan-specs.json";
import type { FloorPlanSpec } from "@/lib/floorplan-spec";

// 평면도 3D 섹션 (디테일) — 검수 저장된 스펙이 있는 매물만 노출.
// three.js(수백 KB)는 사용자가 "보기"를 눌렀을 때만 동적 로드 — 모바일 성능 보호.
// 조감도와 달리 보편 제공 데이터가 아니라, 미보유 매물에선 섹션 자체를 생략한다.
const FloorPlan3D = dynamic(() => import("./floor-plan-3d"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3, #999)", fontSize: 13 }}>
      3D 뷰어 불러오는 중…
    </div>
  ),
});

export function FloorplanSection({ listingId }: { listingId: string }) {
  const spec = (floorplanSpecs as Record<string, FloorPlanSpec>)[listingId];
  const [open, setOpen] = useState(false);
  if (!spec) return null;

  const dims = `${spec.meta.widthMm.toLocaleString()}×${spec.meta.depthMm.toLocaleString()}mm`;
  return (
    <section className="detail-section">
      <h3>
        평면도 3D{" "}
        <span style={{ fontWeight: 500, fontSize: 12, color: "var(--ink-3, #888)" }}>
          {spec.meta.label} · {dims}
        </span>
      </h3>
      {open ? (
        <FloorPlan3D spec={spec} height={380} />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: "100%",
            padding: "18px 14px",
            border: "1px dashed var(--line, #ddd)",
            borderRadius: 12,
            background: "var(--bg-2, #fafafa)",
            cursor: "pointer",
            fontSize: 13.5,
            fontWeight: 700,
            color: "var(--ink-2, #555)",
          }}
        >
          🧊 평면도 3D 보기 — 마우스·터치로 돌려볼 수 있어요
        </button>
      )}
    </section>
  );
}
