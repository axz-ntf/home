import FloorPlan3D from "@/components/floor-plan-3d";
import { EXAMPLE_SPEC } from "@/lib/floorplan-spec";

// Phase 1 검증용 — 예시 스펙이 제너레이터로 동일하게 렌더되는지 확인.
export default function FloorPlanDemoPage() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>평면도 3D — 스펙 제너레이터</h1>
      <p style={{ fontSize: 13, color: "#7a6f60", marginBottom: 16 }}>
        AI가 만든 코드를 JSON 스펙으로 분해 → 고정 제너레이터가 렌더. 드래그 회전 · 휠 확대.
      </p>
      <FloorPlan3D spec={EXAMPLE_SPEC} />
    </main>
  );
}
