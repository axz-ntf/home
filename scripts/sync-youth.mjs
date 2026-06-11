#!/usr/bin/env node
// 청년안심주택(서울시, soco.seoul.go.kr) 모집공고 크롤러.
// 목록은 bbsListJson.json(POST, 키 불필요) — 공공임대+민간임대 둘 다 포함.
// 상세 페이지에서 자치구(카테고리)·첨부 PDF(fileDown.do?atchFileId&fileSn)를 해석한다.
// 출력: lib/youth-notices.json (메타 + pdfUrl). 가격/평형 추출은 기존 extract 파이프라인 재사용.
//
// 사용: node scripts/sync-youth.mjs [--pages N] [--probe-pdf]   (페이지당 10건, 기본 10페이지)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "lib/youth-notices.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const BASE = "https://soco.seoul.go.kr";
const LIST_URL = `${BASE}/youth/pgm/home/yohome/bbsListJson.json`;
const DETAIL_URL = (boardId) => `${BASE}/youth/bbs/BMSR00015/view.do?boardId=${boardId}&menuNo=400008`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchListPage(pageIndex) {
  const r = await fetch(LIST_URL, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: `bbsId=BMSR00015&pageIndex=${pageIndex}&pageUnit=10`,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} list page ${pageIndex}`);
  return r.json();
}

// 상세 페이지 → 자치구(카테고리에서 선택된 구) + 첨부파일 목록.
async function resolveDetail(boardId) {
  const r = await fetch(DETAIL_URL(boardId), { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} detail ${boardId}`);
  const html = await r.text();

  // 카테고리 영역에 선택된 자치구 하나만 텍스트로 남는다
  const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, "|");
  const catIdx = text.indexOf("카테고리");
  const gu = catIdx >= 0 ? (text.slice(catIdx, catIdx + 800).match(/([가-힣]{1,4}구)/)?.[1] ?? "") : "";

  // 첨부: /coHouse/cmmn/file/fileDown.do?atchFileId=..&fileSn=N — 같은 URL이 미리보기/듣기로도
  // 반복되므로 fileSn 기준 dedupe
  const files = [];
  const seen = new Set();
  for (const m of html.matchAll(/href="(\/coHouse\/cmmn\/file\/fileDown\.do\?atchFileId=[a-f0-9]+&(?:amp;)?fileSn=(\d+))"\s*>([^<]+)</g)) {
    if (seen.has(m[2])) continue;
    seen.add(m[2]);
    files.push({ url: BASE + m[1].replace(/&amp;/g, "&"), fileSn: Number(m[2]), name: m[3].trim() });
  }
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
  const notice = pdfs.find((f) => /공고문|모집공고|입주자\s*모집/.test(f.name)) ?? pdfs[0];
  return { gu, pdfUrl: notice?.url ?? null, pdfName: notice?.name ?? null, fileCount: files.length };
}

function parseArgs() {
  const a = process.argv.slice(2);
  const pi = a.indexOf("--pages");
  return { pages: pi >= 0 ? Number(a[pi + 1]) : 10, probePdf: a.includes("--probe-pdf") };
}

async function main() {
  const args = parseArgs();
  const notices = [];
  let totPage = args.pages;
  for (let p = 1; p <= Math.min(args.pages, totPage); p++) {
    const d = await fetchListPage(p);
    totPage = d.pagingInfo.totPage;
    const rows = d.resultList ?? [];
    if (rows.length === 0) break;
    for (const r of rows) {
      notices.push({
        boardId: r.boardId,
        title: (r.nttSj ?? "").trim(),
        isPrivate: /민간임대/.test(r.nttSj ?? ""),
        gubunCd: r.gubunCd,
        supplier: r.optn3 ?? "",
        postedAt: r.optn1 ?? "", // 공고게시일 (YYYY-MM-DD)
        applyDate: r.optn4 ?? "", // 청약신청일 (YYYY-MM-DD)
        atchFileId: r.atchFileId ?? null,
        detailUrl: DETAIL_URL(r.boardId),
      });
    }
    console.log(`page ${p}/${totPage}: ${rows.length}건`);
    await sleep(300);
  }

  console.log(`\n상세(자치구·PDF) 해석 ${notices.length}건...`);
  let done = 0;
  for (const n of notices) {
    try {
      Object.assign(n, await resolveDetail(n.boardId));
    } catch (e) {
      n.error = e.message;
    }
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${notices.length}`);
    await sleep(300);
  }

  const withPdf = notices.filter((n) => n.pdfUrl).length;
  const withGu = notices.filter((n) => n.gu).length;
  const priv = notices.filter((n) => n.isPrivate).length;
  console.log(`\n수집 ${notices.length}건 | PDF ${withPdf} | 자치구 ${withGu} | 민간임대 ${priv} / 공공 ${notices.length - priv}`);

  await fs.writeFile(OUT_PATH, JSON.stringify(notices, null, 2) + "\n", "utf8");
  console.log(`저장: ${OUT_PATH}`);

  if (args.probePdf) {
    const t = notices.find((n) => n.pdfUrl);
    if (t) {
      const r = await fetch(t.pdfUrl, { headers: { "User-Agent": UA, Referer: t.detailUrl } });
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(`\nPDF probe: ${t.title.slice(0, 30)} → ${r.status}, ${Math.round(buf.length / 1024)}KB, PDF=${buf.slice(0, 4).toString() === "%PDF"}`);
    }
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
