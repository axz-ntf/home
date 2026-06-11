import { NextResponse } from "next/server";
import { mutateJsonFile, persistMode } from "@/lib/admin-json-file";

// 다지점 분리 핀(points) 정정 — AI 추출+지오코딩 산출물의 사람 교정 경로 (P1).
//   file "sh" → lib/sh-mapped.json (key = seq), "lh" → lib/mapped-regional.json (key = pblancId).
// points 전체 교체 저장. 빈 배열이면 분리 해제(키 삭제). lh 는 기존 cfg(districtId 등) 보존.
export const runtime = "nodejs";

const FILES = { sh: "lib/sh-mapped.json", lh: "lib/mapped-regional.json" } as const;

interface PointPayload {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
  units?: number | null;
  depositManwon?: number | null;
  rentManwon?: number | null;
}

function cleanPoint(p: PointPayload): Record<string, unknown> | null {
  if (typeof p?.lat !== "number" || typeof p?.lng !== "number" || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  const out: Record<string, unknown> = { lat: p.lat, lng: p.lng };
  if (typeof p.label === "string" && p.label.trim()) out.label = p.label.trim();
  if (typeof p.address === "string" && p.address.trim()) out.address = p.address.trim();
  if (typeof p.units === "number") out.units = p.units;
  if (typeof p.depositManwon === "number") {
    out.depositManwon = p.depositManwon;
    out.rentManwon = typeof p.rentManwon === "number" ? p.rentManwon : 0;
  }
  return out;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const file = body?.file as keyof typeof FILES;
  const key = body?.key;
  if (!FILES[file] || typeof key !== "string" || !key.trim() || !Array.isArray(body?.points)) {
    return NextResponse.json({ error: "file(sh|lh)·key·points 필요" }, { status: 400 });
  }
  const points = (body.points as PointPayload[]).map(cleanPoint).filter(Boolean);
  if (points.length !== body.points.length) {
    return NextResponse.json({ error: "lat/lng 가 숫자가 아닌 핀이 있습니다." }, { status: 400 });
  }

  try {
    await mutateJsonFile(FILES[file], `data(review): mapped points ${file}:${key}`, (data) => {
      if (points.length === 0) {
        if (!(key in data)) return false;
        delete data[key];
        return true;
      }
      const prev = (data[key] as Record<string, unknown> | undefined) ?? {};
      data[key] = { ...prev, points };
      return true;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, file, key, count: points.length, persisted: persistMode() });
}
