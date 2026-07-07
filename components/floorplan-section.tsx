"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import floorplanSpecs from "@/lib/floorplan-specs.json";
import type { FloorPlanSpec } from "@/lib/floorplan-spec";

// 평면도 3D 섹션 (디테일) — 검수 저장된 스펙이 있는 매물만 노출.
// three.js(수백 KB)는 섹션이 뷰포트에 들어올 때 자동 로드 — 탭 없이 바로 보이면서도
// 스크롤로 여기까지 안 온 사용자에겐 로드하지 않는다 (모바일 성능 보호).
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
  // 값이 문자열이면 같은 공고 페이지를 공유하는 대표 매물 id 별칭 (분리 핀)
  const specs = floorplanSpecs as Record<string, FloorPlanSpec | string>;
  const raw = specs[listingId];
  const spec = typeof raw === "string" ? (specs[raw] as FloorPlanSpec | undefined) : raw;
  const hostRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  // 섹션이 뷰포트 근처(200px 전)에 오면 3D 뷰어 마운트 — 한 번 로드되면 유지.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  if (!spec) return null;

  const dims = `${spec.meta.widthMm.toLocaleString()}×${spec.meta.depthMm.toLocaleString()}mm`;
  return (
    <section className="detail-section">
      <h3>
        평면도 3D{" "}
        <span style={{ fontWeight: 500, fontSize: 12, color: "var(--ink-3, #888)" }}>
          {spec.meta.label} · {dims} · 마우스·터치로 돌려볼 수 있어요
        </span>
      </h3>
      <div ref={hostRef} style={{ minHeight: 380 }}>
        {inView ? (
          <FloorPlan3D spec={spec} height={380} />
        ) : (
          <div
            style={{
              height: 380,
              display: "grid",
              placeItems: "center",
              border: "1px dashed var(--line, #ddd)",
              borderRadius: 12,
              background: "var(--bg-2, #fafafa)",
              color: "var(--ink-3, #999)",
              fontSize: 13,
            }}
          >
            평면도 준비 중…
          </div>
        )}
      </div>
    </section>
  );
}
