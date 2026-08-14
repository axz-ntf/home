#!/usr/bin/env node
// LH 청약센터 공지사항의 "접수결과/신청현황" 첨부 PDF → 공고별 경쟁률 추출.
//
// 배경: LH 는 경쟁률을 API 로 제공하지 않고 접수 마감 후 공지사항 첨부문서로만 게시.
// (청약홈 경쟁률 API 는 LH 자체접수 공고를 커버하지 못함 — 2024+ LH 공고 81건 중 3건뿐.)
//
// 단계:
//   1. lhNoticeInfo1 — 제목검색(접수결과/신청현황/경쟁률)으로 공지 수집
//   2. lhNoticeDtlInfo1 — 공지별 첨부 PDF URL
//   3. Solar Document Parse — PDF → markdown (enrich-notice-text 와 동일 패턴)
//   4. Claude Sonnet 5 — 표에서 단지×형별 모집/신청 추출 + 후보 매물 pblancId 매칭
//   5. lib/competition.json — pblancId → { competition, applicants, unitsRecruit, ... }
//
// 캐시: lib/competition-notices.json (BBS_SN 별 처리 결과 — 재실행 시 skip)
// 사용: node --env-file=.env.local scripts/sync-competition.mjs [--days N] [--limit N] [--force]

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText } from "ai";
import { aiModel, hasAiKey } from "./lib/ai-provider.mjs";
import { z } from "zod";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LISTINGS_PATH = path.join(ROOT, "lib/listings-api.json");
const CACHE_PATH = path.join(ROOT, "lib/competition-notices.json");
const OUT_PATH = path.join(ROOT, "lib/competition.json");
const HISTORY_PATH = path.join(ROOT, "lib/competition-history.json");

// .env.local 로드 (sync-lh-api 와 동일)
try {
  const txt = fssync.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY;
const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
const MODEL = process.env.EXTRACT_MODEL ?? "claude-sonnet-5";
if (!DATA_GO_KR_KEY || !SOLAR_API_KEY || !hasAiKey(MODEL)) {
  console.error(`DATA_GO_KR_KEY / SOLAR_API_KEY / ${MODEL} 용 API 키 필요`);
  process.exit(1);
}
const UA = "daum-public-housing-app/1.0 (LH competition sync)";
const DOC_PARSE_URL = "https://api.upstage.ai/v1/document-ai/document-parse";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 접수결과 공지 제목 패턴 — 서버측 BBS_TL 부분일치 검색
const SEARCH_TERMS = ["접수결과", "신청현황", "접수현황", "경쟁률"];

// ─────────────────────────────────────────────────────────────
// 1. 공지 목록
// ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

async function searchNotices(term, stDt, edDt) {
  const rows = [];
  let page = 1;
  while (true) {
    const url = new URL("https://apis.data.go.kr/B552555/lhNoticeInfo1/getNoticeInfo1");
    url.searchParams.set("ServiceKey", DATA_GO_KR_KEY);
    url.searchParams.set("PG_SZ", "100");
    url.searchParams.set("PAGE", String(page));
    url.searchParams.set("SCH_ST_DT", stDt);
    url.searchParams.set("SCH_ED_DT", edDt);
    url.searchParams.set("BBS_TL", term);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`공지목록 HTTP ${res.status}`);
    const json = JSON.parse(await res.text());
    const items = Array.isArray(json) ? json[1]?.dsList || [] : [];
    rows.push(...items);
    if (items.length < 100) break;
    page++;
    await sleep(250);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────
// 2. 공지 상세 (본문 + 첨부)
// ─────────────────────────────────────────────────────────────
async function fetchNoticeDetail(ccrCd, bbsSn) {
  const url = new URL("https://apis.data.go.kr/B552555/lhNoticeDtlInfo1/getNoticeDtlInfo1");
  url.searchParams.set("serviceKey", DATA_GO_KR_KEY);
  url.searchParams.set("CCR_CNNT_SYS_DS_CD", ccrCd);
  url.searchParams.set("BBS_SN", bbsSn);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`공지상세 HTTP ${res.status}`);
  const json = JSON.parse(await res.text());
  if (!Array.isArray(json)) return null;
  const body = json[1]?.dsBbsInfo?.[0] || null;
  const files = json[1]?.dsBbsAhflInfo || [];
  return { body, files };
}

// ─────────────────────────────────────────────────────────────
// 3. PDF → markdown (Solar)
// ─────────────────────────────────────────────────────────────
async function parsePdfToMarkdown(pdfUrl, filename) {
  const r = await fetch(pdfUrl, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`PDF HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());

  const form = new FormData();
  form.append("document", new Blob([buf], { type: "application/pdf" }), filename);
  form.append("output_formats", '["markdown"]');
  form.append("base64_encoding", '["table"]');
  const res = await fetch(DOC_PARSE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SOLAR_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Doc Parse HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const parsed = await res.json();

  // enrich-notice-text assembleMarkdown 과 동일 — content.markdown 비면 elements 합침
  const els = parsed.elements ?? [];
  const out = [];
  for (const e of els) {
    const md = e.content?.markdown ?? "";
    const html = e.content?.html ?? "";
    if (md) out.push(md);
    else if (html) {
      const txt = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
      if (e.category?.startsWith("heading")) out.push(`## ${txt}`);
      else out.push(txt);
    }
  }
  return out.filter(Boolean).join("\n\n").trim();
}

// ─────────────────────────────────────────────────────────────
// 4. Claude — 추출 + 매칭
// ─────────────────────────────────────────────────────────────
const resultSchema = z.object({
  complexes: z
    .array(
      z.object({
        name: z.string().describe("단지명 (예: 김해율하2LH3)"),
        unitsRecruit: z.number().describe("모집호수 합 (소계 행 제외하고 형별 합산)"),
        applicants: z.number().describe("신청자수 합"),
      }),
    )
    .default([])
    .describe("표의 모든 단지 — 매물 매칭 여부와 무관하게 전부"),
  matches: z
    .array(
      z.object({
        pblancId: z.string().describe("후보 목록에서 고른 매물 pblancId"),
        complexNames: z.array(z.string()).min(1).describe("이 매물에 속한 단지명 (complexes 의 name 과 동일 표기)"),
      }),
    )
    .default([]),
});

const SYSTEM = `당신은 LH 공공주택 청약 접수결과 문서에서 경쟁률 데이터를 추출하는 전문가입니다.

입력: (1) 접수결과 공지 제목/본문, (2) 첨부 표 markdown, (3) 후보 매물 목록(pblancId/제목/공고일/단지명).

작업:
1. 표의 모든 단지에 대해 모집호수(모집세대수)와 신청자수 합계를 complexes 에 넣으세요. 소계/합계 행은 중복이므로 제외하고 형별 행만 합산. 형별 행이 없으면 소계 행 사용. 매물 매칭 여부와 관계없이 모든 단지를 추출합니다 (과거 회차 참조용 이력).
2. 각 단지를 후보 매물과 매칭해 matches 에 넣으세요. 근거: 공고일 일치 + 지역명/단지명 일치. 한 공지가 여러 매물(지역별 공고)을 커버할 수 있고, 한 매물에 여러 단지가 속할 수 있습니다.
3. 매칭은 확신 있을 때만. 틀린 매칭이 누락보다 나쁩니다. 후보가 없거나 애매하면 matches 는 빈 배열.

숫자 규칙: 모집호수는 "모집호수/모집세대수" 열 (건설호수 아님). 신청자수는 "신청자계/신청자수/계" 열.
출력: schema JSON 만. 다른 텍스트 금지.`;

const SCHEMA_HINT = `\n출력 형식 (JSON only):
{
  "complexes": [ { "name": "단지명", "unitsRecruit": <수>, "applicants": <수> } ],
  "matches": [ { "pblancId": "<후보의 pblancId>", "complexNames": ["단지명", ...] } ]
}`;

function extractJsonFromText(text) {
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence) return fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

// 공지 제목에서 공고일 추출 — "('26.06.15 공고)" / "(2026.06.15.공고)" 등
function announceDateFromTitle(title) {
  const m = title.match(/[('\s](\d{2}|\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (!m) return null;
  const yy = m[1].length === 2 ? "20" + m[1] : m[1];
  return `${yy}.${m[2].padStart(2, "0")}.${m[3].padStart(2, "0")}`;
}

// 후보 매물 — 공고일 일치 우선, 없으면 공지일 기준 이전 90일 내 공고
function candidateListings(listings, notice) {
  const annDate = announceDateFromTitle(notice.BBS_TL);
  if (annDate) {
    const exact = listings.filter((l) => (l.announceDate || "") === annDate);
    if (exact.length) return exact;
  }
  const noticeDay = (notice.BBS_WOU_DTTM || "").replaceAll(".", "-"); // 2026.07.08
  const noticeTs = Date.parse(noticeDay) || Date.now();
  return listings
    .filter((l) => {
      const ts = Date.parse((l.announceDate || "").replaceAll(".", "-"));
      return Number.isFinite(ts) && noticeTs - ts > 0 && noticeTs - ts < 90 * 86400e3;
    })
    .slice(0, 60);
}

async function extractAndMatch(notice, bodyText, tableMd, candidates) {
  const candLines = candidates
    .map((l) => `- pblancId=${l.pblancId} | ${l.title} | 공고일=${l.announceDate || "?"} | 단지=${l.complexName || "-"}`)
    .join("\n");
  const result = await generateText({
    model: aiModel(MODEL),
    // adaptive thinking 이 켜진 모델은 출력 예산을 thinking 과 나눠 쓴다 —
    // 상한을 안 잡으면 표가 긴 공지에서 JSON 이 중간에 잘린다.
    maxOutputTokens: 8000,
    system: SYSTEM + SCHEMA_HINT,
    prompt:
      `[공지 제목] ${notice.BBS_TL}\n[공지 게시일] ${notice.BBS_WOU_DTTM}\n[공지 본문]\n${(bodyText || "").slice(0, 2000)}\n\n` +
      `[첨부 표 markdown]\n${tableMd.slice(0, 20000)}\n\n[후보 매물 목록]\n${candLines}\n\n` +
      `표의 단지별 모집/신청 수를 추출하고 후보 매물에 매칭해 JSON 만 출력하세요.`,
  });
  const parsed = JSON.parse(extractJsonFromText(result.text ?? ""));
  const validated = resultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`schema 검증 실패: ${validated.error.issues.map((i) => i.message).slice(0, 3).join("; ")}`);
  }
  return validated.data;
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────
function parseArgs() {
  const a = process.argv.slice(2);
  const val = (flag, def) => {
    const i = a.indexOf(flag);
    return i >= 0 ? Number(a[i + 1]) : def;
  };
  return { days: val("--days", 90), limit: val("--limit", 30), force: a.includes("--force") };
}

async function loadJson(p, def) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return def; }
}

async function main() {
  const { days, limit, force } = parseArgs();
  const listings = await loadJson(LISTINGS_PATH, []);
  const cache = force ? {} : await loadJson(CACHE_PATH, {});

  const edDt = fmtDate(new Date());
  const stDt = fmtDate(new Date(Date.now() - days * 86400e3));
  console.log(`=== 공지 검색 (${stDt} ~ ${edDt}) ===`);

  const byBbsSn = new Map();
  for (const term of SEARCH_TERMS) {
    const rows = await searchNotices(term, stDt, edDt);
    for (const r of rows) if (r.BBS_SN && !byBbsSn.has(r.BBS_SN)) byBbsSn.set(r.BBS_SN, r);
    console.log(`  "${term}": ${rows.length}건`);
    await sleep(250);
  }
  console.log(`공지 합계 (dedup): ${byBbsSn.size}건`);

  let processed = 0, skipped = 0, failed = 0;
  for (const [bbsSn, notice] of byBbsSn) {
    if (cache[bbsSn]) { skipped++; continue; }
    if (processed >= limit) break;

    try {
      const detail = await fetchNoticeDetail(notice.CCR_CNNT_SYS_DS_CD, bbsSn);
      const pdf = (detail?.files || []).find((f) => /\.pdf$/i.test(f.CMN_AHFL_NM || ""));
      if (!pdf) {
        cache[bbsSn] = { title: notice.BBS_TL, date: notice.BBS_WOU_DTTM, status: "no-pdf" };
        processed++;
        continue;
      }

      const md = await parsePdfToMarkdown(pdf.AHFL_URL, pdf.CMN_AHFL_NM);
      const candidates = candidateListings(listings, notice);
      const extracted = await extractAndMatch(notice, detail.body?.BBS_DTL_CTS, md, candidates);

      cache[bbsSn] = {
        title: notice.BBS_TL,
        date: notice.BBS_WOU_DTTM,
        linkUrl: notice.LINK_URL || "",
        attachment: pdf.CMN_AHFL_NM,
        aisType: notice.AIS_TP_CD_NM || "",
        status: extracted.complexes.length ? (extracted.matches.length ? "matched" : "no-match") : "no-data",
        complexes: extracted.complexes,
        matches: extracted.matches,
      };
      processed++;
      console.log(`  [${processed}] ${notice.BBS_TL.slice(0, 50)} → 단지 ${extracted.complexes.length} / 매칭 ${extracted.matches.length}`);
      // 장시간 백필 중 크래시 대비 — 10건마다 캐시 중간 저장
      if (processed % 10 === 0) await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
      await sleep(300);
    } catch (e) {
      failed++;
      console.warn(`  실패 ${bbsSn}: ${e.message}`);
      // 실패는 캐시하지 않음 — 다음 실행에서 재시도
    }
  }

  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
  console.log(`\n처리 ${processed} / 캐시 skip ${skipped} / 실패 ${failed}`);

  // ── competition.json 재생성 (캐시 전체 기준) ──
  // 같은 pblancId 에 공지 여러 개면 게시일 최신 것 우선 (1순위 현황 → 최종 현황 갱신).
  const byPblanc = {};
  for (const [bbsSn, c] of Object.entries(cache)) {
    if (c.status !== "matched") continue;
    const rowByName = new Map((c.complexes || []).map((x) => [x.name, x]));
    for (const m of c.matches || []) {
      const rows = (m.complexNames || []).map((n) => rowByName.get(n)).filter(Boolean);
      const units = rows.reduce((s, x) => s + (x.unitsRecruit || 0), 0);
      const apps = rows.reduce((s, x) => s + (x.applicants || 0), 0);
      if (!units) continue;
      const prev = byPblanc[m.pblancId];
      if (prev && prev.noticeDate >= c.date) continue;
      byPblanc[m.pblancId] = {
        competition: Math.round((apps / units) * 10) / 10,
        applicants: apps,
        unitsRecruit: units,
        complexes: rows,
        noticeDate: c.date,
        noticeTitle: c.title,
        sourceUrl: c.linkUrl || "",
        noticeSn: bbsSn,
      };
    }
  }
  await fs.writeFile(OUT_PATH, JSON.stringify(byPblanc, null, 2) + "\n");
  console.log(`저장: ${OUT_PATH} (${Object.keys(byPblanc).length}개 공고)`);

  // ── competition-history.json — 단지별 과거 회차 이력 (매물 매칭과 무관하게 전체) ──
  // 어댑터가 "지난 회차 경쟁률" 참조용으로 사용. 같은 단지×공지는 최신만.
  const history = [];
  for (const [bbsSn, c] of Object.entries(cache)) {
    for (const x of c.complexes || []) {
      if (!x.unitsRecruit) continue;
      history.push({
        name: x.name,
        type: c.aisType || "",
        competition: Math.round((x.applicants / x.unitsRecruit) * 10) / 10,
        applicants: x.applicants,
        unitsRecruit: x.unitsRecruit,
        noticeDate: c.date,
        noticeTitle: c.title,
        noticeSn: bbsSn,
      });
    }
  }
  history.sort((a, b) => (a.noticeDate < b.noticeDate ? 1 : -1));
  await fs.writeFile(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
  console.log(`저장: ${HISTORY_PATH} (${history.length}개 단지 이력)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
