import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { mutateJsonFile, persistMode } from "@/lib/admin-json-file";
import { EXAMPLE_SPEC } from "@/lib/floorplan-spec";

// 평면도 3D Phase 2 — 평면도 이미지 → Claude 비전 → FloorPlanSpec(JSON).
// AI 는 스펙만 생성하고 렌더는 고정 제너레이터(floor-plan-3d)가 한다 — 검수자가
// 어드민에서 미리보기로 확인·교정 후 저장 (가격추출과 동일한 human-in-the-loop).
//   POST (multipart: file) → { ok, spec }   — 추출만, 저장 안함
//   PUT  (json: { id, spec|null })          → lib/floorplan-specs.json 저장/삭제
export const runtime = "nodejs";
export const maxDuration = 300;

const SPECS_PATH = "lib/floorplan-specs.json";
const MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const SYSTEM = `한국 아파트/원룸 모집공고의 평면도 이미지를 3D 렌더용 구조화 스펙(JSON)으로 변환하는 전문가.

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

function validateSpec(raw: unknown): string | null {
  const s = raw as SpecShape;
  if (!s || typeof s !== "object") return "스펙이 객체가 아닙니다";
  if (typeof s.meta?.widthMm !== "number" || typeof s.meta?.depthMm !== "number") return "meta.widthMm/depthMm 누락";
  for (const k of ["floors", "walls", "glass", "doors", "fixtures", "labels"] as const) {
    if (!Array.isArray(s[k])) return `${k} 가 배열이 아닙니다`;
  }
  if ((s.walls as unknown[]).length < 4) return "벽이 4개 미만 — 외벽이 닫히지 않았습니다";
  return null;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "평면도 이미지(file) 필요" }, { status: 400 });
  }
  const mediaType = MEDIA_TYPES.has(file.type) ? (file.type as "image/png") : null;
  if (!mediaType) {
    return NextResponse.json({ error: `지원하지 않는 이미지 형식 (${file.type || "unknown"})` }, { status: 400 });
  }
  if (!(process.env.ANTHROPIC_API_KEY ?? "").trim()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY 가 설정되지 않았습니다" }, { status: 500 });
  }

  try {
    const client = new Anthropic();
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: "이 평면도를 FloorPlanSpec JSON 으로 변환하라. JSON만." },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "모델이 이미지를 처리할 수 없다고 응답했습니다" }, { status: 422 });
    }
    let text = "";
    for (const block of response.content) if (block.type === "text") text += block.text;
    const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (fence) text = fence[1];
    const spec = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const invalid = validateSpec(spec);
    if (invalid) {
      return NextResponse.json({ error: `추출 스펙 검증 실패: ${invalid}` }, { status: 422 });
    }
    return NextResponse.json({ ok: true, spec, ms: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }
  if (body.spec != null) {
    const invalid = validateSpec(body.spec);
    if (invalid) return NextResponse.json({ error: `스펙 검증 실패: ${invalid}` }, { status: 400 });
  }
  try {
    await mutateJsonFile(SPECS_PATH, `data(floorplan): ${body.id}`, (data) => {
      if (body.spec == null) {
        if (!(body.id in data)) return false;
        delete data[body.id];
        return true;
      }
      data[body.id] = body.spec;
      return true;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: body.id, persisted: persistMode() });
}
