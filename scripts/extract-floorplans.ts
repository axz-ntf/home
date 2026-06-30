// 모집중 공고 평면도 일괄 추출 — LH 공고 상세 페이지에서 "평면도" 이미지를 찾아
// Claude 비전으로 FloorPlanSpec 을 생성, lib/floorplan-specs.json 에 채운다.
// 평면도 이미지가 없는 공고는 스킵 (어드민 단건 업로드 경로는 그대로 유지).
//
// 실행: npx tsx scripts/extract-floorplans.ts
//   FORCE=1        → 이미 스펙 있는 공고도 재추출
//   LIMIT=N        → 앞에서 N건만 (테스트용)
//   CONCURRENCY=N  → Claude 동시 호출 수 (기본 3)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { execFileSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { LH_LISTINGS } from "../lib/lh-adapter";
import { effectiveStatus } from "../lib/dday";
import { FLOORPLAN_SYSTEM, validateSpec, sliceJson } from "../lib/floorplan-extract";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPECS_PATH = path.join(ROOT, "lib/floorplan-specs.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 daum-public-housing-app/1.0";
const LH_BASE = "https://apply.lh.or.kr";
const DELAY_MS = 400;
const FORCE = process.env.FORCE === "1";
const LIMIT = Number(process.env.LIMIT ?? 0);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 스크립트는 .env.local 을 자동 로드하지 않는다 — 직접 읽어 주입.
if (!process.env.ANTHROPIC_API_KEY) {
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^ANTHROPIC_API_KEY=(.+)$/);
      if (m) process.env.ANTHROPIC_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY 없음 (.env.local 확인)");
  process.exit(1);
}

// ── LH 페이지 이미지 메타 파싱 (scripts/enrich-photos-api.mjs 와 동일 패턴) ──
function parseLooseObject(body: string): Record<string, string | null> {
  const obj: Record<string, string | null> = {};
  const keyRe = /(?:^|,\s+)([a-zA-Z][a-zA-Z0-9]*)=/g;
  const matches = [...body.matchAll(keyRe)];
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const value = body.slice(start, end).trim();
    obj[key] = value === "null" || value === "" ? null : value;
  }
  return obj;
}

function extractImageEntries(html: string) {
  const entries: Record<string, string | null>[] = [];
  const re = /list\.push\("\{([\s\S]*?)\}"\)\s*;/g;
  let m;
  while ((m = re.exec(html))) {
    const obj = parseLooseObject(m[1]);
    if (obj.cmnAhflSn) entries.push(obj);
  }
  return entries;
}

const labelOf = (e: Record<string, string | null>) =>
  e.slPanAhflDsCdNm || e.lsSplInfUplFlDsCdNm || e.ahflDesc || e.cmnAhflNm || "";

// LH 상세 페이지의 평면도는 이미지 리스트가 아니라 `wrtancFloorplan` JS 변수에
// 주택형(htyNna) 탭별로 들어 있다. 첫 번째 항목을 대표 평면도로 쓴다.
function extractFloorplanEntries(html: string): { cmnAhflSn: string; htyNna?: string }[] {
  const m = html.match(/wrtancFloorplan\s*=\s*JSON\.parse\('([\s\S]*?)'\)/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1].replace(/\\'/g, "'")) as unknown[];
    return (arr as { cmnAhflSn?: string | number; htyNna?: string }[][])
      .flat()
      .filter((e) => e && e.cmnAhflSn != null && String(e.cmnAhflSn))
      .map((e) => ({ cmnAhflSn: String(e.cmnAhflSn), htyNna: e.htyNna }));
  } catch {
    return [];
  }
}

async function resolveFilePath(cmnAhflSn: string, referer: string): Promise<string | null> {
  const res = await fetch(`${LH_BASE}/lhapply/getFilePath.do`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: referer,
    },
    body: `cmnAhflSn=${encodeURIComponent(cmnAhflSn)}`,
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json?.cmnAhflPth || !json?.cmnPhyAhflNm) return null;
  return `${LH_BASE}/upload${json.cmnAhflPth}${json.cmnPhyAhflNm}`;
}

async function downloadImage(url: string, referer: string): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: referer } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.slice(0, 10).toString("utf8");
  if (buf.length < 10000 || head.startsWith("<!DOCTYPE") || head.startsWith("<html")) return null;
  return buf;
}

function bmpToPng(buf: Buffer): Buffer {
  const tmp = path.join(os.tmpdir(), `lh-fp-${Date.now()}.bmp`);
  fs.writeFileSync(tmp, buf);
  execFileSync("sips", ["-s", "format", "png", tmp, "--out", `${tmp}.png`], { stdio: "ignore" });
  const png = fs.readFileSync(`${tmp}.png`);
  fs.unlinkSync(tmp);
  fs.unlinkSync(`${tmp}.png`);
  return png;
}

function mediaTypeOf(buf: Buffer, name: string): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.slice(8, 12).toString("utf8") === "WEBP") return "image/webp";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  return null;
}

// ── Claude 추출 ──
const client = new Anthropic();

async function extractSpec(buf: Buffer, mediaType: "image/png" | "image/jpeg" | "image/webp") {
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: FLOORPLAN_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
          { type: "text", text: "이 평면도를 FloorPlanSpec JSON 으로 변환하라. JSON만." },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") return { error: "refusal" as const };
  let text = "";
  for (const block of response.content) if (block.type === "text") text += block.text;
  const spec = JSON.parse(sliceJson(text));
  if (spec?.error === "no_floorplan") return { error: "no_floorplan" as const };
  const invalid = validateSpec(spec);
  if (invalid) return { error: invalid };
  return { spec };
}

const save = (specs: Record<string, unknown>) =>
  fs.writeFileSync(SPECS_PATH, JSON.stringify(specs, null, 2) + "\n");

async function main() {
  const specs: Record<string, unknown> = JSON.parse(fs.readFileSync(SPECS_PATH, "utf8"));

  // 현재 사이트에 떠 있는(마감 아님) 공고 중 LH 상세 페이지가 있는 것.
  // -mN 분리 핀은 같은 페이지를 공유하므로 sourceUrl 로 그룹핑해 1회만 추출하고,
  // 나머지 id 에는 대표 id 문자열 별칭을 저장한다.
  const targets = (LH_LISTINGS as { id: string; title: string; status: string; deadline?: string | null; beginDate?: string | null; sourceUrl?: string | null }[])
    .filter((l) => effectiveStatus(l.status as never, l.deadline ?? "", l.beginDate ?? undefined) !== "closed")
    .filter((l) => l.sourceUrl?.includes("selectWrtancInfo.do"))
    .filter((l) => FORCE || !(l.id in specs));
  const groups = new Map<string, { id: string; title: string; sourceUrl: string }[]>();
  for (const l of targets) {
    if (!groups.has(l.sourceUrl!)) groups.set(l.sourceUrl!, []);
    groups.get(l.sourceUrl!)!.push(l as { id: string; title: string; sourceUrl: string });
  }
  let pages = [...groups.values()];
  if (LIMIT > 0) pages = pages.slice(0, LIMIT);
  console.log(`대상: 공고 ${targets.length}건 / 고유 페이지 ${pages.length}곳`);

  // 1단계 — 페이지를 순차(polite 딜레이) 크롤링해 평면도 이미지를 모은다.
  const jobs: { ids: string[]; title: string; buf: Buffer; mediaType: "image/png" | "image/jpeg" | "image/webp"; label: string }[] = [];
  let noFp = 0;
  for (const [i, group] of pages.entries()) {
    const l = group[0];
    const prefix = `[${i + 1}/${pages.length}] ${l.id}`;
    try {
      const res = await fetch(l.sourceUrl, { headers: { "User-Agent": UA } });
      if (!res.ok) { console.warn(`${prefix} 페이지 HTTP ${res.status}`); continue; }
      const html = await res.text();
      // 주력: wrtancFloorplan 변수. 폴백: 이미지 리스트의 "평면" 라벨.
      const fpEntries = extractFloorplanEntries(html);
      const fallback = extractImageEntries(html).find((e) => /평면/.test(labelOf(e) ?? ""));
      const pick = fpEntries[0] ?? (fallback ? { cmnAhflSn: fallback.cmnAhflSn!, htyNna: labelOf(fallback) ?? undefined } : null);
      if (!pick) { noFp += group.length; console.log(`${prefix} 평면도 없음 — 스킵`); continue; }
      const url = await resolveFilePath(pick.cmnAhflSn, l.sourceUrl);
      let buf = url ? await downloadImage(url, l.sourceUrl) : null;
      // 일부 LH 평면도는 BMP — Claude 비전·sharp 둘 다 미지원이라 macOS sips 로 PNG 변환
      if (buf && buf[0] === 0x42 && buf[1] === 0x4d) buf = bmpToPng(buf);
      const mediaType = buf ? mediaTypeOf(buf, url ?? "") : null;
      if (!buf || !mediaType) { console.warn(`${prefix} 이미지 다운로드 실패`); continue; }
      jobs.push({ ids: group.map((g) => g.id), title: l.title, buf, mediaType, label: pick.htyNna ?? "" });
      console.log(`${prefix} 평면도 확보 (${Math.round(buf.length / 1024)}KB, 주택형 "${pick.htyNna ?? "?"}", 후보 ${fpEntries.length}개)`);
    } catch (e) {
      console.warn(`${prefix} 크롤 오류: ${(e as Error).message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`\n이미지 확보 ${jobs.length}곳 / 평면도 없음 ${noFp}건 — Claude 추출 시작 (동시 ${CONCURRENCY})\n`);

  // 2단계 — Claude 추출 (제한 동시성), 성공할 때마다 파일에 즉시 반영.
  let ok = 0, failed = 0, cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const [primary, ...rest] = job.ids;
      const prefix = `[추출 ${primary}]`;
      const t0 = Date.now();
      try {
        const r = await extractSpec(job.buf, job.mediaType);
        if ("error" in r) { failed += job.ids.length; console.warn(`${prefix} 실패: ${r.error}`); continue; }
        specs[primary] = r.spec;
        for (const id of rest) specs[id] = primary; // 같은 페이지 공유 핀은 별칭
        save(specs);
        ok += job.ids.length;
        console.log(`${prefix} 저장 (${Math.round((Date.now() - t0) / 1000)}초, 별칭 ${rest.length}) — ${(r.spec as { meta: { label: string } }).meta.label}`);
      } catch (e) {
        failed += job.ids.length;
        console.warn(`${prefix} 오류: ${(e as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  console.log(`\n완료 — 저장 ${ok} / 실패 ${failed} / 평면도없음 ${noFp} / 전체 대상 ${targets.length}`);
}

main();
