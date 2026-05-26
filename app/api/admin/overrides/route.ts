import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// 검수값을 lib/manual-overrides.json 에 저장. fs.write 가 필요해서 nodejs runtime.
// Vercel 배포 환경은 fs 가 read-only → 어드민은 로컬 dev 에서만 동작 (현재 운영 흐름과 일치).
export const runtime = "nodejs";

const FILE = path.join(process.cwd(), "lib", "manual-overrides.json");

interface PayloadRow {
  houseType: string;
  area?: string;
  supplyUnits?: number | null;
  deposit?: number | null;
  rent?: number | null;
  salePriceManwon?: number | null;
}

interface OverridePayload {
  id: string;
  supplyUnits?: number | null;
  deposit?: number | null;
  rent?: number | null;
  salePriceManwon?: number | null;
  area?: string;
  rows?: PayloadRow[];
  status?: "open" | "upcoming" | "closing" | "closed";
  noticeStatus?: string;
  progressStatus?: string;
  deadline?: string;
  _note?: string;
}

async function readOverrides(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function writeOverrides(data: Record<string, unknown>) {
  // JSON.stringify 안정적 정렬 — 검수 diff 가 git 에서 깔끔하게 보이도록.
  const keys = Object.keys(data).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = data[k];
  await fs.writeFile(FILE, JSON.stringify(ordered, null, 2) + "\n", "utf8");
}

export async function POST(req: Request) {
  let body: OverridePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON parse 실패" }, { status: 400 });
  }
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }
  const overrides = await readOverrides();
  // undefined 필드는 저장 안 함 (자동값 유지). null 은 "명시적으로 비움" 의미라 저장.
  const entry: Record<string, unknown> = { _reviewedAt: new Date().toISOString().slice(0, 10) };
  if (body.supplyUnits !== undefined) entry.supplyUnits = body.supplyUnits;
  if (body.deposit !== undefined) entry.deposit = body.deposit;
  if (body.rent !== undefined) entry.rent = body.rent;
  if (body.salePriceManwon !== undefined) entry.salePriceManwon = body.salePriceManwon;
  if (body.area !== undefined) entry.area = body.area;
  if (Array.isArray(body.rows) && body.rows.length > 0) {
    // 유효한 행만 (houseType 있고 최소 한 값) 필터
    const cleanRows = body.rows
      .filter((r) => r && typeof r.houseType === "string" && r.houseType.trim())
      .map((r) => {
        const row: Record<string, unknown> = { houseType: r.houseType.trim() };
        if (r.area !== undefined) row.area = r.area;
        if (r.supplyUnits !== undefined) row.supplyUnits = r.supplyUnits;
        if (r.deposit !== undefined) row.deposit = r.deposit;
        if (r.rent !== undefined) row.rent = r.rent;
        if (r.salePriceManwon !== undefined) row.salePriceManwon = r.salePriceManwon;
        return row;
      });
    if (cleanRows.length > 0) entry.rows = cleanRows;
  }
  if (body.status !== undefined) entry.status = body.status;
  if (body.noticeStatus !== undefined) entry.noticeStatus = body.noticeStatus;
  if (body.progressStatus !== undefined) entry.progressStatus = body.progressStatus;
  if (body.deadline !== undefined) entry.deadline = body.deadline;
  if (body._note) entry._note = body._note;
  overrides[body.id] = entry;
  await writeOverrides(overrides);
  return NextResponse.json({ ok: true, id: body.id });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }
  const overrides = await readOverrides();
  if (!(body.id in overrides)) {
    return NextResponse.json({ ok: true, id: body.id, deleted: false });
  }
  delete overrides[body.id];
  await writeOverrides(overrides);
  return NextResponse.json({ ok: true, id: body.id, deleted: true });
}
