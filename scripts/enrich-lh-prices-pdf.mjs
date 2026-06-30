#!/usr/bin/env node
// 가격이 "공고문 확인" 으로만 남은 분양/매각 공고의 PDF 공고문을 받아
// 분양가 총액을 추출해 details.priceFromPdf, salePriceManwon 보정에 사용.
//
// 동작: lib/lh-notices-all.json 의 분양 entry 중 가격 미추출인 항목 대상
//   1) sourceUrl 페이지 fetch
//   2) <a href="javascript:fileDownLoad('NNN');">XXX.pdf</a> 패턴에서 PDF fileid 추출 (공고문 우선)
//   3) https://apply.lh.or.kr/lhapply/lhFile.do?fileid=NNN 다운로드
//   4) pdf-parse 로 텍스트 추출, 큰 숫자 패턴 최댓값을 분양가로 채택
//
// 사용: node scripts/enrich-lh-prices-pdf.mjs [--limit N]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "lib/lh-notices-all.json");

const HEADERS = {
  "User-Agent": "daum-public-housing-app/1.0 (LH price extractor; polite crawler; 1req/s)",
  Accept: "text/html,*/*",
};
const DELAY_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alreadyHasPrice(notice) {
  for (const row of notice.details?.housingTypes ?? []) {
    for (const [k, v] of Object.entries(row)) {
      if (!(k.includes("분양가") || k.includes("매각가"))) continue;
      const s = String(v);
      if (s === "공고문 확인" || s === "-") continue;
      if (/[\d,]+/.test(s) && !/^0+$/.test(s.replace(/[^0-9]/g, ""))) return true;
    }
  }
  return false;
}

// fileDownLoad('NNN') 와 인접한 파일명을 짝지어 추출
function extractPdfAttachments(html) {
  const out = [];
  const linkRe = /<a\b[^>]*href="javascript:fileDownLoad\('(\d+)'\);"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(linkRe)) {
    const fileid = m[1];
    const name = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!/\.pdf$/i.test(name)) continue;
    out.push({ fileid, name });
  }
  return out;
}

function pickPrimaryPdf(pdfs) {
  if (pdfs.length === 0) return null;
  // 공고문/모집공고/매각 키워드 포함된 PDF 우선
  const priority = pdfs.find((p) => /공고문|입주자모집|모집공고|매각공고/.test(p.name));
  return priority ?? pdfs[0];
}

async function fetchHtml(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status} on page`);
  return r.text();
}

async function fetchPdf(fileid) {
  const url = `https://apply.lh.or.kr/lhapply/lhFile.do?fileid=${fileid}`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status} on pdf`);
  return Buffer.from(await r.arrayBuffer());
}

async function extractText(pdfBuffer) {
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  return result.text ?? "";
}

const PRICE_RE = /(\d{2,3}(?:,\d{3}){2,4})/g;

function extractMaxPrice(text) {
  let max = 0;
  for (const m of text.matchAll(PRICE_RE)) {
    const v = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(v) && v > max && v < 10_000_000_000) max = v;
  }
  return max > 0 ? max : null;
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const onlyId = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;

  const notices = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const targets = notices.filter((n) => {
    if (onlyId) return n.id === onlyId;
    if (n.category !== "분양") return false;
    if (n.details?.priceFromPdf?.fetchedAt) return false;
    if (alreadyHasPrice(n)) return false;
    return Boolean(n.sourceUrl);
  });
  console.log(`PDF 가격 보강 대상: ${targets.length}건`);

  let pageOk = 0;
  let pageFail = 0;
  let noPdf = 0;
  let priceOk = 0;
  let priceFail = 0;
  let processed = 0;

  for (const n of targets) {
    if (processed >= limit) break;
    processed++;
    const pageUrl = n.details?.canonicalUrl || n.sourceUrl;
    try {
      const html = await fetchHtml(pageUrl);
      pageOk++;
      const pdfs = extractPdfAttachments(html);
      const primary = pickPrimaryPdf(pdfs);
      if (!primary) {
        noPdf++;
        n.details = n.details ?? {};
        n.details.priceFromPdf = { fetchedAt: new Date().toISOString(), state: "no-pdf" };
        if (processed % 20 === 0 || processed <= 5) {
          console.log(`[${processed}/${targets.length}] ${n.id} no-pdf`);
        }
      } else {
        try {
          const pdfBuf = await fetchPdf(primary.fileid);
          const text = await extractText(pdfBuf);
          const price = extractMaxPrice(text);
          n.details = n.details ?? {};
          if (price && price >= 10_000_000) {
            n.salePriceManwon = Math.round(price / 10000);
            n.details.priceFromPdf = {
              fetchedAt: new Date().toISOString(),
              state: "ok",
              fileid: primary.fileid,
              name: primary.name,
              maxPriceWon: price,
            };
            priceOk++;
          } else {
            n.details.priceFromPdf = {
              fetchedAt: new Date().toISOString(),
              state: "no-price",
              fileid: primary.fileid,
              name: primary.name,
            };
            priceFail++;
          }
          if (processed % 20 === 0 || processed <= 5) {
            console.log(
              `[${processed}/${targets.length}] ${n.id} price=${price ? `${Math.round(price / 10000)}만원` : "—"}`,
            );
          }
        } catch (error) {
          priceFail++;
          n.details = n.details ?? {};
          n.details.priceFromPdf = {
            fetchedAt: new Date().toISOString(),
            state: `error: ${error.message}`,
            fileid: primary.fileid,
          };
          console.log(`[${processed}] ${n.id} pdf fail: ${error.message}`);
        }
      }
    } catch (error) {
      pageFail++;
      console.log(`[${processed}] ${n.id} page fail: ${error.message}`);
    }
    if (processed % 25 === 0) {
      await fs.writeFile(DATA_PATH, JSON.stringify(notices, null, 2) + "\n", "utf8");
    }
    await sleep(DELAY_MS);
  }

  await fs.writeFile(DATA_PATH, JSON.stringify(notices, null, 2) + "\n", "utf8");
  console.log(
    `\n완료: pageOk=${pageOk} pageFail=${pageFail} noPdf=${noPdf} priceOk=${priceOk} priceFail=${priceFail}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
