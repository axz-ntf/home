import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// 검수값을 lib/manual-overrides.json 에 반영.
//   - 로컬 dev: 파일 직접 write (기존 흐름 — 커밋은 사람이).
//   - 배포(Vercel): fs 가 read-only 라 GitHub Contents API 로 커밋 → 자동 재배포 → 메인앱 반영(~1분).
// 메인앱은 manual-overrides.json 을 빌드시 static import 하므로 읽기 경로는 변경 불필요.
export const runtime = "nodejs";

const FILE = path.join(process.cwd(), "lib", "manual-overrides.json");
const GH_TOKEN = (process.env.GITHUB_TOKEN ?? "").trim();
const GH_REPO = process.env.GITHUB_REPO ?? "bobbypark-axz/home";
const GH_BRANCH = process.env.GITHUB_BRANCH ?? "main";
const GH_PATH = "lib/manual-overrides.json";
// Vercel 런타임(VERCEL=1)이고 토큰이 있을 때만 GitHub 모드. 그 외(로컬)는 fs.
const useGitHub = Boolean(GH_TOKEN) && Boolean(process.env.VERCEL);

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

// 안정적 정렬 — 검수 diff 가 git 에서 깔끔하게.
function serialize(data: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const k of Object.keys(data).sort()) ordered[k] = data[k];
  return JSON.stringify(ordered, null, 2) + "\n";
}

const GH_HEADERS = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "doongji-admin",
  "X-GitHub-Api-Version": "2022-11-28",
};
const GH_CONTENTS = `https://api.github.com/repos/${GH_REPO}/contents/${GH_PATH}`;

// 현재 overrides + (GitHub 모드일 때) 파일 sha.
async function readOverrides(): Promise<{ data: Record<string, unknown>; sha: string | null }> {
  if (useGitHub) {
    const r = await fetch(`${GH_CONTENTS}?ref=${GH_BRANCH}`, { headers: GH_HEADERS, cache: "no-store" });
    if (r.status === 404) return { data: {}, sha: null };
    if (!r.ok) throw new Error(`GitHub 읽기 실패 (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const decoded = Buffer.from(j.content ?? "", "base64").toString("utf8");
    return { data: decoded.trim() ? JSON.parse(decoded) : {}, sha: j.sha };
  }
  try {
    return { data: JSON.parse(await fs.readFile(FILE, "utf8")), sha: null };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { data: {}, sha: null };
    throw e;
  }
}

async function writeOverrides(data: Record<string, unknown>, sha: string | null, message: string) {
  const content = serialize(data);
  if (!useGitHub) {
    await fs.writeFile(FILE, content, "utf8");
    return;
  }
  const r = await fetch(GH_CONTENTS, {
    method: "PUT",
    headers: { ...GH_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: GH_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) throw new Error(`GitHub 커밋 실패 (${r.status}): ${(await r.text()).slice(0, 200)}`);
}

// sha 충돌(다른 커밋이 끼어듦) 시 1회 재시도하며 read-modify-write.
// mutator 가 false 를 반환하면(변경 없음) write/commit 을 건너뛴다 — 빈 커밋 방지.
async function mutate(message: string, mutator: (data: Record<string, unknown>) => boolean) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, sha } = await readOverrides();
    if (!mutator(data)) return;
    try {
      await writeOverrides(data, sha, message);
      return;
    } catch (e) {
      const conflict = /\b409\b/.test((e as Error).message);
      if (conflict && attempt === 0) continue;
      throw e;
    }
  }
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
  if (body.conversion !== undefined) entry.conversion = body.conversion;
  if (body.schedule !== undefined) entry.schedule = body.schedule;
  if (body.status !== undefined) entry.status = body.status;
  if (body.noticeStatus !== undefined) entry.noticeStatus = body.noticeStatus;
  if (body.progressStatus !== undefined) entry.progressStatus = body.progressStatus;
  if (body.deadline !== undefined) entry.deadline = body.deadline;
  if (body._note) entry._note = body._note;

  try {
    await mutate(`data(review): override ${body.id}`, (data) => {
      data[body.id] = entry;
      return true;
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: body.id, persisted: useGitHub ? "github" : "fs" });
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
