#!/usr/bin/env node
// 매물 공고문 PDF → Upstage Document Parse → markdown 캐시.
// 임베딩 인덱싱의 전 단계 — markdown 파일을 lib/notice-texts/{id}.md 로 저장.
//
// 사용:
//   node --env-file=.env.local --env-file=.env.solar-test scripts/enrich-notice-text.mjs [--ids id1,id2,...] [--limit N] [--active-only]
//
// 옵션:
//   --ids       특정 매물 ID 만 (콤마 구분)
//   --limit N   최대 N 개 매물 처리 (기본 5, sample 용)
//   --active-only  status open/upcoming 인 매물만
//   --force     이미 캐시된 매물도 재파싱

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "lib/lh-notices-all.json");
const OUT_DIR = path.join(ROOT, "lib/notice-texts");
const META_PATH = path.join(OUT_DIR, "_meta.json");

const UA = "daum-public-housing-app/1.0 (notice text enricher; polite)";
const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
if (!SOLAR_API_KEY) { console.error("ERROR: SOLAR_API_KEY env 누락"); process.exit(1); }

const DOC_PARSE_URL = "https://api.upstage.ai/v1/document-ai/document-parse";
const PDF_BASE = "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=";
const DELAY_MS = 700;
// 동시 처리 수 — Solar Document Parse rate limit 보수적 추정. 너무 높이면 429.
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDetailHtml(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`detail HTTP ${r.status}`);
  return r.text();
}

// 공고문 PDF 우선 — 신청서류/평면도/배치도는 제외
function pickNoticePdf(html) {
  const all = [];
  const re = /fileDownLoad\(\s*'([0-9]+)'\s*\)\s*[^>]*>([^<]+\.pdf)/gi;
  let m;
  while ((m = re.exec(html))) all.push({ fileid: m[1], name: m[2].trim() });
  if (!all.length) return null;
  // 우선: 파일명에 "공고문" 포함
  const notice = all.find((p) => /공고문/.test(p.name));
  if (notice) return notice;
  // 차선: 첨부/양식 류 제외
  const skip = /제출서류|첨부|양식|동의서|체크|평면도|배치도|단지조감도|위치도/;
  const candidate = all.find((p) => !skip.test(p.name));
  return candidate ?? all[0];
}

async function downloadPdf(fileid) {
  const r = await fetch(PDF_BASE + fileid, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`PDF HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function parseDocument(pdfBuf, filename) {
  const form = new FormData();
  form.append("document", new Blob([pdfBuf], { type: "application/pdf" }), filename);
  form.append("output_formats", '["markdown"]');
  form.append("base64_encoding", '["table"]');

  const r = await fetch(DOC_PARSE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SOLAR_API_KEY}` },
    body: form,
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Doc Parse HTTP ${r.status}: ${errText.slice(0, 200)}`);
  }
  return r.json();
}

function assembleMarkdown(parsed) {
  // content.markdown 이 비어 오는 경우가 있어 elements 에서 직접 합침.
  // category 별로 가독성 있는 markdown 생성.
  const els = parsed.elements ?? [];
  const out = [];
  for (const e of els) {
    const md = e.content?.markdown ?? "";
    const html = e.content?.html ?? "";
    if (md) {
      out.push(md);
    } else if (html) {
      // <br> → 줄바꿈, 태그 제거
      const txt = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
      if (e.category?.startsWith("heading")) out.push(`## ${txt}`);
      else out.push(txt);
    }
  }
  return out.filter(Boolean).join("\n\n").trim();
}

async function loadMeta() {
  try { return JSON.parse(await fs.readFile(META_PATH, "utf8")); }
  catch { return { entries: {}, totalPages: 0, totalRequests: 0 }; }
}

async function saveMeta(meta) {
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2) + "\n", "utf8");
}

function parseArgs() {
  const a = process.argv.slice(2);
  const idsIdx = a.indexOf("--ids");
  const limIdx = a.indexOf("--limit");
  return {
    ids: idsIdx >= 0 ? a[idsIdx + 1].split(",").map((s) => s.trim()) : null,
    limit: limIdx >= 0 ? Number(a[limIdx + 1]) : 5,
    activeOnly: a.includes("--active-only"),
    force: a.includes("--force"),
    // listings-api.json 도 source 로 추가 (lh-notices-all 에 없는 매물 보완용).
    // 출력 파일명은 매물 id 그대로 — listings-api id (lh-rental-{panId}) 형식 저장.
    fromApi: a.includes("--from-api"),
  };
}

async function main() {
  const args = parseArgs();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const meta = await loadMeta();

  let pool;
  if (args.fromApi) {
    // listings-api 매물 중 sourceUrl 있는 active 매물만
    const apiPath = path.join(ROOT, "lib/listings-api.json");
    const api = JSON.parse(await fs.readFile(apiPath, "utf8"));
    pool = api.filter((l) => typeof l.sourceUrl === "string" && l.sourceUrl.includes("selectWrtancInfo.do"));
    if (args.activeOnly) pool = pool.filter((l) => l.status !== "closed");
    // 같은 panId 매물이 -c0, -c1 같이 중복일 수 있음 — base panId 로 dedupe
    const seen = new Set();
    pool = pool.filter((l) => {
      const m = l.id.match(/lh-(?:rental|sale)-(\d+)/);
      const key = m ? `${l.id.startsWith("lh-rental") ? "rental" : "sale"}-${m[1]}` : l.id;
      if (seen.has(key)) return false;
      seen.add(key);
      // dedupe 키 기반 새 id (suffix 제거)
      l.id = `lh-${l.id.startsWith("lh-rental") ? "rental" : "sale"}-${m?.[1] ?? ""}`;
      return true;
    });
  } else {
    const notices = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
    pool = notices.filter((n) => typeof n.sourceUrl === "string" && n.sourceUrl.includes("selectWrtancInfo.do"));
    if (args.activeOnly) {
      pool = pool.filter((n) => {
        const s = n.details?.noticeStatus;
        return s && s !== "접수마감" && s !== "모집중지";
      });
    }
  }
  if (args.ids?.length) pool = pool.filter((n) => args.ids.includes(n.id));
  // 다양성: 매물 유형 섞기 (type 기준 라운드 로빈) — sample 용이라
  pool.sort(() => Math.random() - 0.5);
  const target = pool.slice(0, args.limit);

  console.log(`처리 대상: ${target.length}건 / 전체 후보: ${pool.length}건\n`);

  let ok = 0, skip = 0, err = 0;
  const startTs = Date.now();
  let nextIdx = 0;
  const total = target.length;

  // 워커 N개가 nextIdx 를 공유하며 pool 에서 다음 매물 가져감 → CONCURRENCY 동시 처리.
  async function worker(wid) {
    while (true) {
      const i = nextIdx++;
      if (i >= total) return;
      const n = target[i];
      const outPath = path.join(OUT_DIR, `${n.id}.md`);

      if (!args.force) {
        try { await fs.access(outPath); skip++; console.log(`[${i + 1}/${total}] SKIP ${n.id}`); continue; }
        catch {}
      }

      try {
        console.log(`[${i + 1}/${total}] w${wid} ${n.id} "${n.title?.slice(0, 30)}"`);
        const html = await fetchDetailHtml(n.sourceUrl);
        const pdf = pickNoticePdf(html);
        if (!pdf) { console.log(`  [${i + 1}] PDF 없음`); err++; continue; }

        const t0 = Date.now();
        const buf = await downloadPdf(pdf.fileid);
        const parsed = await parseDocument(buf, pdf.name);
        const t2 = Date.now();
        const pages = parsed.usage?.pages ?? 0;
        const md = assembleMarkdown(parsed);
        console.log(`  [${i + 1}] ${Math.round(buf.length / 1024)}KB / ${pages}p / ${md.length}자 (${t2 - t0}ms)`);

        await fs.writeFile(outPath, md, "utf8");
        // meta 동시 접근 — 단순 increment 만 (worker 들이 같은 객체 mutate, race condition 미미)
        meta.entries[n.id] = {
          pdfFileid: pdf.fileid, pdfName: pdf.name, pdfSize: buf.length,
          pages, mdLength: md.length, elementCount: parsed.elements?.length ?? 0,
          parseMs: t2 - t0, parsedAt: new Date().toISOString(),
        };
        meta.totalPages += pages;
        meta.totalRequests += 1;
        if ((ok + 1) % 10 === 0) await saveMeta(meta); // 10건마다만 저장 (race 줄임)
        ok++;
        await sleep(DELAY_MS);
      } catch (e) {
        console.log(`  [${i + 1}] ERROR: ${e.message}`);
        err++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, w) => worker(w + 1)));
  await saveMeta(meta);

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`\n완료: ok=${ok} skip=${skip} err=${err}  (${elapsed}s, concurrency=${CONCURRENCY})`);
  console.log(`누적 메타: 매물 ${Object.keys(meta.entries).length}건 / 페이지 ${meta.totalPages}장 / 호출 ${meta.totalRequests}회`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
