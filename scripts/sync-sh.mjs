#!/usr/bin/env node
// SH(서울주택도시공사) 임대 모집공고 크롤러 — 서울주거포털 목록 → i-sh.co.kr 상세 → PDF(innoFD.do).
// LH 와 달리 API 가 없어 스크래핑. PDF 는 Innorix(innoFD.do) 단순 GET 으로 받힌다(토큰 불필요).
// 출력: lib/sh-notices.json (메타 + pdfUrl). 가격/평형 추출은 기존 enrich/extract 파이프라인 재사용.
//
// 사용: node scripts/sync-sh.mjs [--pages N] [--probe-pdf]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "lib/sh-notices.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const LIST_URL = "https://housing.seoul.go.kr/site/main/sh/publicLease/list";
const ISH_BASE = "https://www.i-sh.co.kr";
const ISH_DETAIL = (seq) => `${ISH_BASE}/main/lay2/program/S1T294C295/www/brd/m_241/view.do?seq=${seq}`;
const INNO_FD = (seq, fileSeq, fileTp = "A", brdId = "GS0401") =>
  `${ISH_BASE}/main/com/file/innoFD.do?brdId=${brdId}&seq=${seq}&fileSeq=${fileSeq}&fileTp=${fileTp}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

// 목록 1페이지 파싱 — 각 행: 번호/청약유형/공고명/게시일/발표일/상태/담당부서 + i-sh seq.
function parseListPage(html) {
  const out = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]));
    const ish = row.match(/i-sh\.co\.kr[^"' ]*?seq=(\d+)/);
    if (cells.length < 6 || !ish) continue;
    // 공고명 셀에 "--> 제목" 형태 노이즈 정리
    const title = (cells[2] ?? "").replace(/^-+>?\s*/, "").trim();
    out.push({
      seq: ish[1],
      no: cells[0],
      supplyType: cells[1],
      title,
      postedAt: cells[3],
      announceAt: cells[4] && cells[4] !== "-" ? cells[4] : null,
      status: cells[5],
      dept: cells[6] ?? "",
    });
  }
  return out;
}

// 상세 페이지 → 공고문 PDF (downList 에서 fileTp=A 중 "공고문" 우선) + 본문 일부 필드.
async function resolveDetail(seq) {
  const html = await fetchText(ISH_DETAIL(seq));
  const dlMatch = html.match(/downList\s*[:=]\s*(\[[\s\S]*?\])\s*[,;]/);
  let pdf = null;
  if (dlMatch) {
    try {
      const list = JSON.parse(dlMatch[1]);
      const pdfs = list.filter((f) => /\.pdf$/i.test(f.oriFileNm ?? ""));
      const notice = pdfs.find((f) => /공고문|모집공고|입주자\s*모집/.test(f.oriFileNm)) ?? pdfs[0];
      if (notice) pdf = { fileSeq: notice.fileSeq, fileTp: notice.fileTp ?? "A", name: notice.oriFileNm, size: Number(notice.fileSize) || null };
    } catch {
      /* downList 파싱 실패 시 pdf=null */
    }
  }
  return { pdfUrl: pdf ? INNO_FD(seq, pdf.fileSeq, pdf.fileTp) : null, pdfName: pdf?.name ?? null, pdfSize: pdf?.size ?? null };
}

function parseArgs() {
  const a = process.argv.slice(2);
  const pi = a.indexOf("--pages");
  return { pages: pi >= 0 ? Number(a[pi + 1]) : 10, probePdf: a.includes("--probe-pdf") };
}

async function main() {
  const args = parseArgs();
  const notices = [];
  for (let cp = 1; cp <= args.pages; cp++) {
    const html = await fetchText(`${LIST_URL}?cp=${cp}&supplyType=publicLease`);
    const rows = parseListPage(html);
    if (rows.length === 0) {
      console.log(`page ${cp}: 0건 — 종료`);
      break;
    }
    notices.push(...rows);
    console.log(`page ${cp}: ${rows.length}건`);
    await sleep(400);
  }

  // 상세 → PDF 해석 (전 건)
  console.log(`\n상세/PDF 해석 ${notices.length}건...`);
  for (const n of notices) {
    try {
      const d = await resolveDetail(n.seq);
      Object.assign(n, d, { detailUrl: ISH_DETAIL(n.seq) });
    } catch (e) {
      n.error = e.message;
    }
    await sleep(300);
  }

  const withPdf = notices.filter((n) => n.pdfUrl).length;
  console.log(`\n수집 ${notices.length}건 | PDF 있음 ${withPdf}건`);
  const byType = {};
  notices.forEach((n) => (byType[n.supplyType] = (byType[n.supplyType] || 0) + 1));
  console.log("청약유형 분포:", byType);

  await fs.writeFile(OUT_PATH, JSON.stringify(notices, null, 2) + "\n", "utf8");
  console.log(`저장: ${OUT_PATH}`);

  if (args.probePdf) {
    const target = notices.find((n) => n.pdfUrl);
    if (target) {
      const r = await fetch(target.pdfUrl, { headers: { "User-Agent": UA, Referer: ISH_DETAIL(target.seq) } });
      const buf = Buffer.from(await r.arrayBuffer());
      console.log(`\nPDF probe: ${target.title.slice(0, 30)} → ${r.status}, ${Math.round(buf.length / 1024)}KB, PDF=${buf.slice(0, 4).toString() === "%PDF"}`);
    }
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
