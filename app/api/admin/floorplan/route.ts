import { NextResponse } from "next/server";
import { mutateJsonFile, persistMode } from "@/lib/admin-json-file";
import { validateSpec, sliceJson, extractFloorplanRaw } from "@/lib/floorplan-extract";
import { hasAiKey } from "@/lib/ai-provider";

// 평면도 3D Phase 2 — 평면도 이미지 → Claude 비전 → FloorPlanSpec(JSON).
// AI 는 스펙만 생성하고 렌더는 고정 제너레이터(floor-plan-3d)가 한다 — 검수자가
// 어드민에서 미리보기로 확인·교정 후 저장 (가격추출과 동일한 human-in-the-loop).
//   POST (multipart: file) → { ok, spec }   — 추출만, 저장 안함
//   PUT  (json: { id, spec|null })          → lib/floorplan-specs.json 저장/삭제
export const runtime = "nodejs";
export const maxDuration = 300;

const SPECS_PATH = "lib/floorplan-specs.json";
const MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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
  if (!hasAiKey()) {
    return NextResponse.json({ error: "TIMELY_ROUTER_API_KEY 또는 ANTHROPIC_API_KEY 가 설정되지 않았습니다" }, { status: 500 });
  }

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await extractFloorplanRaw(data, mediaType);
    if ("refusal" in result) {
      return NextResponse.json({ error: "모델이 이미지를 처리할 수 없다고 응답했습니다" }, { status: 422 });
    }
    const spec = JSON.parse(sliceJson(result.text));
    if (spec?.error === "no_floorplan") {
      return NextResponse.json({ error: "이미지에서 평면도를 찾지 못했습니다 (위치도/조감도 아님?)" }, { status: 422 });
    }
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
