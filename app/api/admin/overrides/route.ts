import { NextResponse } from "next/server";
import { mutateJsonFile, persistMode } from "@/lib/admin-json-file";

// 검수값을 lib/manual-overrides.json 에 반영. 저장 경로(로컬 fs / Vercel GitHub 커밋)는
// lib/admin-json-file.ts 공용 헬퍼 — mapped 라우트와 공유.
export const runtime = "nodejs";

const GH_PATH = "lib/manual-overrides.json";

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
  address?: string;
  rows?: PayloadRow[];
  // 유형별 가격 모델 (3-3) — 구조는 lib/manual-overrides.ts 참고. 패스스루 저장.
  priceModel?: string;
  tiers?: unknown;
  householdTypes?: unknown;
  supportLimit?: unknown;
  conversion?: unknown;
  schedule?: unknown;
  status?: "open" | "upcoming" | "closing" | "closed";
  noticeStatus?: string;
  progressStatus?: string;
  deadline?: string;
  _note?: string;
}

const mutate = (message: string, mutator: (data: Record<string, unknown>) => boolean) =>
  mutateJsonFile(GH_PATH, message, mutator);

// Solar 추출 출력이 옵셔널 자리에 null 을 내는 경우가 있어(rateUp 등) 저장 전 정리.
// perHouseType 은 필수 숫자 셋이 모두 있어야 행으로 의미가 있다.
function sanitizeConversion(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as { rateUp?: number | null; rateDown?: number | null; perHouseType?: { houseType?: string; limitManwon?: number | null; maxDeposit?: number | null; minRent?: number | null }[] };
  const out: Record<string, unknown> = {};
  if (typeof c.rateUp === "number") out.rateUp = c.rateUp;
  if (typeof c.rateDown === "number") out.rateDown = c.rateDown;
  if (Array.isArray(c.perHouseType)) {
    const rows = c.perHouseType.filter(
      (p) => p && typeof p.houseType === "string" && typeof p.limitManwon === "number" && typeof p.maxDeposit === "number" && typeof p.minRent === "number",
    );
    if (rows.length > 0) out.perHouseType = rows;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeSchedule(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const k of ["applyStart", "applyEnd", "docResultAt", "winnerAt"] as const) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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

  // undefined 필드는 저장 안 함 (자동값 유지). null 은 "명시적으로 비움" 의미라 저장.
  const entry: Record<string, unknown> = { _reviewedAt: new Date().toISOString().slice(0, 10) };
  if (body.supplyUnits !== undefined) entry.supplyUnits = body.supplyUnits;
  if (body.deposit !== undefined) entry.deposit = body.deposit;
  if (body.rent !== undefined) entry.rent = body.rent;
  if (body.salePriceManwon !== undefined) entry.salePriceManwon = body.salePriceManwon;
  if (body.area !== undefined) entry.area = body.area;
  if (typeof body.address === "string" && body.address.trim()) entry.address = body.address.trim();
  if (Array.isArray(body.rows) && body.rows.length > 0) {
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
  // 유형별 가격 모델 (3-3) — 구조화 데이터 패스스루.
  if (body.priceModel !== undefined) entry.priceModel = body.priceModel;
  if (Array.isArray(body.tiers) && body.tiers.length > 0) entry.tiers = body.tiers;
  if (Array.isArray(body.householdTypes) && body.householdTypes.length > 0) entry.householdTypes = body.householdTypes;
  if (body.supportLimit && Array.isArray((body.supportLimit as { byHousehold?: unknown }).byHousehold)) entry.supportLimit = body.supportLimit;
  // 추출 출력의 null 이 그대로 저장되면 ManualOverride 타입(number|undefined)과 어긋나
  // 다음 빌드(=데이터 배포)가 타입체크에서 죽는다. 옵셔널 자리의 null 은 여기서 걸러 저장.
  if (body.conversion !== undefined) entry.conversion = sanitizeConversion(body.conversion);
  if (body.schedule !== undefined) entry.schedule = sanitizeSchedule(body.schedule);
  if (body.status !== undefined) entry.status = body.status;
  if (body.noticeStatus !== undefined) entry.noticeStatus = body.noticeStatus;
  if (body.progressStatus !== undefined) entry.progressStatus = body.progressStatus;
  if (body.deadline !== undefined) entry.deadline = body.deadline;
  if (body._note) entry._note = body._note;

  try {
    await mutate(`data(review): override ${body.id}`, (data) => {
      // 부분 머지 — 폼이 보내지 않은 기존 필드(legacy rows, schedule 등)를 보존.
      // 통째 교체였을 때 모델 폼(tiers 등)에서 저장 시 기존 검수값이 유실됐다 (감사 H1).
      const prev = (data[body.id] as Record<string, unknown> | undefined) ?? {};
      data[body.id] = { ...prev, ...entry };
      return true;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: body.id, persisted: persistMode() });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id 필요" }, { status: 400 });
  }
  let deleted = false;
  try {
    await mutate(`data(review): remove override ${body.id}`, (data) => {
      if (!(body.id in data)) return false;
      delete data[body.id];
      deleted = true;
      return true;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: body.id, deleted });
}
