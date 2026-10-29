#!/usr/bin/env node
// 단지조감도 이미지 + 공고문 본문 → 동 배치 JSON (3D 모형용).
// 조감도로 모양·상대 위치·외관을, 공고문으로 동 개수·동 번호·최고 층수·세대수를 잡는다.
// AI 는 로컬 Claude Code 헤드리스(`claude -p`, 구독 계정) — 이미지를 Read 도구로 연다.
// 결과: lib/site-layouts/{id}.json
//
// 사용:
//   node --env-file=.env.local scripts/extract-site-layout.mjs --ids id1,id2 [--force]
//   node --env-file=.env.local scripts/extract-site-layout.mjs --limit 5 [--active]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { cliGenerateText } from "./lib/ai-provider.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LISTINGS = path.join(ROOT, "lib/listings-api.json");
const TEXTS_DIR = path.join(ROOT, "lib/notice-texts");
const OUT_DIR = path.join(ROOT, "lib/site-layouts");
const IMG_DIR = path.join(ROOT, ".cache/site-covers");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 2);

const layoutSchema = z.object({
  fromNotice: z.object({
    dongCount: z.number().nullable(),
    dongNames: z.array(z.string()).default([]),
    maxFloors: z.number().nullable(),
    units: z.number().nullable(),
  }),
  buildings: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["판상형", "탑상형", "저층"]),
      floors: z.number(),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      widthRel: z.number().min(0).max(1),
      note: z.string().nullish(),
    }),
  ),
  look: z.object({ wall: z.string(), accent: z.string().nullish(), roof: z.string().nullish() }),
  surroundings: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]),
  issues: z.array(z.string()).default([]),
});

const SYSTEM = `당신은 한국 LH 공공주택 단지조감도와 입주자모집공고문을 보고 단지의 동 배치를 정리하는 건축 분석가입니다.
출력은 JSON 한 덩어리만. 설명·마크다운 금지.

원칙:
- 동 개수·동 번호·최고 층수·세대수는 공고문 발췌를 우선한다. 조감도는 모양·상대 위치·외관 판단에만 쓴다.
- 조감도에서 보이는 동 수가 공고문과 다르면 issues 에 적고, buildings 는 공고문 동 개수에 맞춘다(안 보이는 동은 가장 그럴듯한 위치로, note 에 "추정").
- x, y 는 조감도를 위에서 내려다본 배치도로 환산한 대략 위치(0~1). x=왼→오른, y=이미지 뒤쪽(위)=0 → 앞쪽(아래)=1. 동 바닥 중심 기준.
- widthRel 은 단지 전체 폭 대비 그 동 가로 길이 비율.
- floors 는 공고문 최고 층수를 넘지 않게. 조감도상 낮아 보이는 동은 낮게.
- 조감도가 단지 사진이 아니거나(지도·로고·평면도 등) 판단이 어려우면 confidence "low" 와 이유를 issues 에.
- 북쪽 방향은 조감도로 알 수 없으므로 추측하지 않는다.`;

const SCHEMA_HINT = `{
  "fromNotice": { "dongCount": <number|null>, "dongNames": ["2601", ...], "maxFloors": <number|null>, "units": <number|null> },
  "buildings": [ { "id": "2601", "type": "판상형"|"탑상형"|"저층", "floors": <number>, "x": <0~1>, "y": <0~1>, "widthRel": <0~1>, "note": <string|null> } ],
  "look": { "wall": "외벽 주색 (예: 흰색)", "accent": "포인트색|null", "roof": "지붕 특징|null" },
  "surroundings": ["하천 남서쪽", "철도 북쪽", ...],
  "confidence": "high"|"medium"|"low",
  "issues": ["..."]
}`;

// 공고문에서 동·층·세대 관련 줄만 발췌 (입력 토큰 절약).
function noticeExcerpt(md) {
  const lines = md.split("\n");
  const re = /개\s*동|\d{3,4}\s*동|최고\s*층|층수|지상\s*\d+\s*층|건립\s*세대|총\s*세대|공급\s*세대|단지\s*개요|배치도|대지\s*면적/;
  const hit = new Set();
  lines.forEach((l, i) => { if (re.test(l)) for (let k = Math.max(0, i - 1); k <= Math.min(lines.length - 1, i + 1); k++) hit.add(k); });
  const out = [...hit].sort((a, b) => a - b).map((i) => lines[i].slice(0, 400)).join("\n");
  return out.slice(0, 9000);
}

async function downloadCover(id, url) {
  await fs.mkdir(IMG_DIR, { recursive: true });
  const ext = (url.match(/\.(jpe?g|png|webp)(\?|$)/i)?.[1] ?? "jpg").toLowerCase();
  const out = path.join(IMG_DIR, `${id}.${ext}`);
  try { await fs.access(out); return out; } catch {}
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`조감도 HTTP ${r.status}`);
  await fs.writeFile(out, Buffer.from(await r.arrayBuffer()));
  return out;
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence) return fence[1];
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  return a >= 0 && b > a ? text.slice(a, b + 1) : text;
}

async function extractOne(item) {
  const md = await fs.readFile(path.join(TEXTS_DIR, `${item.id}.md`), "utf8");
  const img = await downloadCover(item.id, item.coverPhotoUrl);
  const prompt =
    `단지: ${item.complexName ?? item.title}\n주소: ${item.address ?? "-"}\n\n` +
    `1) Read 도구로 조감도 이미지를 여세요: ${img}\n` +
    `2) 아래 공고문 발췌와 함께 판단해, 이 형식의 JSON 만 출력하세요:\n${SCHEMA_HINT}\n\n` +
    `--- 공고문 발췌 ---\n${noticeExcerpt(md)}`;
  const r = await cliGenerateText({ system: SYSTEM, prompt, readDir: IMG_DIR });
  const parsed = layoutSchema.safeParse(JSON.parse(extractJson(r.text ?? "")));
  if (!parsed.success) throw new Error(`schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return { id: item.id, complexName: item.complexName ?? null, coverPhotoUrl: item.coverPhotoUrl, ...parsed.data, extractedAt: new Date().toISOString() };
}

function parseArgs() {
  const a = process.argv.slice(2);
  const v = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  return { ids: v("--ids")?.split(",").map((s) => s.trim()) ?? null, limit: Number(v("--limit") ?? 5), force: a.includes("--force"), active: a.includes("--active") };
}

async function main() {
  const args = parseArgs();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const all = JSON.parse(await fs.readFile(LISTINGS, "utf8"));
  const texts = new Set((await fs.readdir(TEXTS_DIR)).map((f) => f.replace(/\.md$/, "")));
  const done = new Set((await fs.readdir(OUT_DIR)).map((f) => f.replace(/\.json$/, "")));
  let pool = all.filter((x) => x.coverPhotoUrl && texts.has(x.id));
  if (args.ids) pool = pool.filter((x) => args.ids.includes(x.id));
  if (args.active) pool = pool.filter((x) => x.status !== "closed");
  if (!args.force) pool = pool.filter((x) => !done.has(x.id));
  pool = pool.slice(0, args.ids ? pool.length : args.limit);
  console.log(`처리 대상: ${pool.length}건`);

  let next = 0, ok = 0, err = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < pool.length) {
      const item = pool[next++], t = Date.now();
      try {
        const out = await extractOne(item);
        await fs.writeFile(path.join(OUT_DIR, `${item.id}.json`), JSON.stringify(out, null, 2) + "\n");
        ok++;
        console.log(`✓ ${item.id} ${out.complexName ?? ""}  동 ${out.buildings.length} (공고 ${out.fromNotice.dongCount ?? "?"}) · 최고 ${out.fromNotice.maxFloors ?? "?"}층 · ${out.confidence}  (${Date.now() - t}ms)`);
      } catch (e) {
        err++;
        console.log(`✗ ${item.id}  ${String(e.message).slice(0, 200)}`);
      }
    }
  }));
  console.log(`\n완료: ok=${ok} err=${err}`);
  if (err > 0 && err >= (ok + err) / 2) process.exitCode = 1;
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
