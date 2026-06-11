import { EXAMPLE_SPEC } from "./floorplan-spec";

// 평면도 이미지 → FloorPlanSpec 변환 프롬프트 + 검증.
// 어드민 단건 추출(app/api/admin/floorplan)과 일괄 추출(scripts/extract-floorplans.ts)이 공유 —
// 프롬프트가 갈라지면 두 경로의 추출 품질이 달라지므로 단일 출처로 유지한다.
export const FLOORPLAN_SYSTEM = `한국 아파트/원룸 모집공고의 평면도 이미지를 3D 렌더용 구조화 스펙(JSON)으로 변환하는 전문가.

좌표계: 단위 미터(m), 원점은 평면도 좌상단, x=가로(오른쪽+), z=세로(아래+), y=높이(위+).
평면도에 치수(mm)가 있으면 그대로 사용하고, 없으면 문 폭 0.9m 기준으로 비례 추정하라.

출력 스키마 (TypeScript 타입):
- meta: { label: string(평형명), widthMm, depthMm, wallHeightMm(기본 2300), wallThicknessMm(기본 130) }
- floors: { x, z, w, d, material, y? }[]  — 바닥 패치. material: "wood"(거실/침실) | "tile"(욕실) | "entry"(현관)
- walls: { x, z, w, d, h?, y? }[] — 벽 박스(corner 기준). 문/창 개구부는 벽을 위/옆 세그먼트로 쪼개 표현(h=윗벽 높이, y=시작높이)
- glass: { cx, cy, cz, w, h, d }[] — 창 유리(중심 기준, d=0.04)
- doors: { w, h, hingeX, hingeZ, angle }[] — 문(경첩 위치, angle 라디안으로 살짝 연 상태)
- fixtures: { x, y, z, w, h, d, material }[] — 가구/설비(싱크대·변기·세면대·붙박이장 등). material: "white"|"dark"|"metal"|"door"|{color:16진수,roughness?}
- labels: { text, x, z, y? }[] — 공간 이름(현관/욕실/주방/거실 등)

규칙:
- 외벽 4면은 반드시 닫고(개구부 제외), 벽 두께는 meta.wallThicknessMm/1000 사용.
- 평면도에 보이는 공간 구획(욕실·현관·발코니 칸막이)을 빠뜨리지 말 것.
- 평면도에 그려진 설비(변기·세면대·싱크·욕조)는 fixtures 로 배치.
- 보이지 않는 것을 지어내지 말 것 — 가구는 평면도에 표기된 것만.
- 이미지에 평면도가 여러 개면 가장 크고 명확한 하나만 변환.
- 이미지에 평면도가 아예 없으면(위치도·조감도만 있으면) {"error":"no_floorplan"} 만 출력.
- JSON 만 출력 (마크다운 코드펜스 없이).

좋은 출력 예시 (2,900×7,195mm 원룸):
${JSON.stringify(EXAMPLE_SPEC)}`;

interface SpecShape {
  meta?: { label?: unknown; widthMm?: unknown; depthMm?: unknown };
  floors?: unknown[];
  walls?: unknown[];
  glass?: unknown[];
  doors?: unknown[];
  fixtures?: unknown[];
  labels?: unknown[];
}

export function validateSpec(raw: unknown): string | null {
  const s = raw as SpecShape;
  if (!s || typeof s !== "object") return "스펙이 객체가 아닙니다";
  if (typeof s.meta?.widthMm !== "number" || typeof s.meta?.depthMm !== "number") return "meta.widthMm/depthMm 누락";
  for (const k of ["floors", "walls", "glass", "doors", "fixtures", "labels"] as const) {
    if (!Array.isArray(s[k])) return `${k} 가 배열이 아닙니다`;
  }
  if ((s.walls as unknown[]).length < 4) return "벽이 4개 미만 — 외벽이 닫히지 않았습니다";
  return null;
}

// 모델 응답 텍스트에서 JSON 본문만 잘라낸다 (코드펜스 방어 포함).
export function sliceJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const body = fence ? fence[1] : text;
  return body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1);
}
