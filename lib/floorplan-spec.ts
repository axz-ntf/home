// 평면도 3D 스펙 — AI 비전(Phase 2)이 평면도 이미지에서 채우고, 검수자가 교정하는 "데이터".
// 이 스펙을 FloorPlan3D 제너레이터가 결정적으로 3D 씬으로 렌더한다.
// 좌표/길이 단위는 미터(m). 원점은 평면도의 좌상단(가로=x, 세로=z), y=위.

// 재질 — 이름으로 참조하거나, 커스텀 색을 직접 지정.
export type MaterialRef =
  | "wall"
  | "wood"
  | "tile"
  | "entry"
  | "white"
  | "dark"
  | "door"
  | "glass"
  | "metal"
  | { color: number; roughness?: number; metalness?: number };

// 바닥 패치 — 영역별 마감재(거실 마루 / 욕실 타일 / 현관 타일).
export interface FloorPatch {
  x: number;
  z: number;
  w: number;
  d: number;
  material: MaterialRef;
  y?: number; // 살짝 단차를 줄 때
}

// 벽 — corner(x,z)에서 시작하는 박스. h(벽고)·y(시작높이) 생략 시 전체고/바닥.
// 개구부(문/창)는 위/아래/옆 벽 세그먼트로 쪼개서 표현.
export interface WallSeg {
  x: number;
  z: number;
  w: number;
  d: number;
  h?: number;
  y?: number;
}

// 유리(창) 패널 — 중심 좌표 기준.
export interface GlassPane {
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
}

// 문 — 경첩(hinge) 위치와 열림 각도(rad). 살짝 열린 상태로 공간감을 준다.
export interface DoorSpec {
  w: number;
  h: number;
  hingeX: number;
  hingeZ: number;
  angle: number;
}

// 가구/설비 — corner(x,z) + 바닥에서 y 높이에 놓인 박스.
export interface Fixture {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  material: MaterialRef;
}

// 공간 라벨 — 평면도 위 떠 있는 스프라이트(현관/욕실/주방 등).
export interface RoomLabel {
  text: string;
  x: number;
  z: number;
  y?: number;
}

export interface FloorPlanSpec {
  meta: {
    label: string;
    widthMm: number;
    depthMm: number;
    wallHeightMm: number;
    wallThicknessMm: number;
  };
  floors: FloorPatch[];
  walls: WallSeg[];
  glass: GlassPane[];
  doors: DoorSpec[];
  fixtures: Fixture[];
  labels: RoomLabel[];
}

// ── 예시 스펙 #1 — 보내주신 원룸(2,900 × 7,195mm). AI 코드를 스펙으로 분해한 것. ──
const T = 0.13; // 벽 두께
const W = 2.9;
const D = 7.195;
const H = 2.3;

export const EXAMPLE_SPEC: FloorPlanSpec = {
  meta: { label: "원룸 평면도", widthMm: 2900, depthMm: 7195, wallHeightMm: 2300, wallThicknessMm: 130 },
  floors: [
    { x: 0, z: 0, w: W, d: D, material: "wood" },
    { x: 0.95, z: 0, w: 1.35, d: 1.0, material: "entry", y: 0.002 },
    { x: 0, z: 0.9, w: 1.3, d: 2.1, material: "tile", y: 0.004 },
  ],
  walls: [
    // 상단 외벽 (현관문 개구부 1.15~2.05)
    { x: -T, z: -T, w: 1.15 + T, d: T },
    { x: 2.05, z: -T, w: W - 2.05 + T, d: T },
    { x: 1.15, z: -T, w: 0.9, d: T, h: H - 2.1, y: 2.1 },
    // 하단 외벽 (창 개구부 0.9~2.0)
    { x: -T, z: D, w: 0.9 + T, d: T },
    { x: 2.0, z: D, w: W - 2.0 + T, d: T },
    { x: 0.9, z: D, w: 1.1, d: T, h: 0.5, y: 0 },
    { x: 0.9, z: D, w: 1.1, d: T, h: H - 2.0, y: 2.0 },
    // 좌우 외벽
    { x: -T, z: 0, w: T, d: D },
    { x: W, z: 0, w: T, d: D },
    // 욕실 내벽
    { x: 0, z: 0.9, w: 1.3, d: T },
    { x: 0, z: 3.0, w: 1.3 + T, d: T },
    { x: 1.3, z: 0.9, w: T, d: 0.55 },
    { x: 1.3, z: 2.15, w: T, d: 0.85 + T },
    { x: 1.3, z: 1.45, w: T, d: 0.7, h: H - 2.0, y: 2.0 },
    // 현관 칸막이
    { x: 0.95, z: 0, w: T, d: 0.9 },
  ],
  glass: [{ cx: 1.45, cy: 1.25, cz: D + T / 2, w: 1.1, h: 1.5, d: 0.04 }],
  doors: [
    { w: 0.9, h: 2.05, hingeX: 1.15, hingeZ: 0, angle: -Math.PI * 0.35 },
    { w: 0.7, h: 1.95, hingeX: 1.3 + T / 2, hingeZ: 2.15, angle: Math.PI * 0.62 },
  ],
  fixtures: [
    { x: 2.42, y: 0, z: 1.15, w: 0.46, h: 0.87, d: 2.15, material: "white" }, // 주방 카운터
    { x: 2.5, y: 0.875, z: 1.35, w: 0.34, h: 0.02, d: 0.5, material: "dark" }, // 쿡탑
    { x: 2.5, y: 0.875, z: 2.15, w: 0.34, h: 0.025, d: 0.55, material: "metal" }, // 싱크
    { x: 2.42, y: 1.55, z: 1.15, w: 0.4, h: 0.6, d: 2.15, material: "white" }, // 상부장
    { x: 0.3, y: 0, z: 2.45, w: 0.42, h: 0.42, d: 0.5, material: "white" }, // 변기 몸체
    { x: 0.32, y: 0.42, z: 2.82, w: 0.38, h: 0.3, d: 0.14, material: "white" }, // 변기 탱크
    { x: 0.85, y: 0, z: 2.5, w: 0.4, h: 0.78, d: 0.4, material: "white" }, // 세면대
    { x: 0.06, y: 0, z: 0.06, w: 0.84, h: 2.2, d: 0.78, material: { color: 0xb9b0a0, roughness: 0.7 } }, // 붙박이장
    { x: 0.18, y: 0, z: 5.45, w: 1.15, h: 0.4, d: 1.95, material: { color: 0x8fa3b8, roughness: 0.85 } }, // 침대
    { x: 0.28, y: 0.4, z: 5.55, w: 0.95, h: 0.12, d: 0.55, material: "white" }, // 베개
    { x: 1.5, y: 0, z: 6.55, w: 0.45, h: 0.45, d: 0.45, material: "door" }, // 협탁
  ],
  labels: [
    { text: "현관", x: 1.6, z: 0.5 },
    { text: "욕실", x: 0.65, z: 1.95 },
    { text: "주방/식당", x: 1.95, z: 2.1, y: 1.9 },
    { text: "거실/침실", x: 1.45, z: 5.1 },
  ],
};
