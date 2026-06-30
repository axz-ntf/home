// HTML 표가 "공고문 확인" 으로 마스킹된 매물은 PDF 파싱으로 가격 추출.
//
// 흐름:
//   1) 매물 sourceUrl 페이지 fetch → fileDownLoad('NNN') 호출에서 "입주자모집공고문.pdf" fileSn 추출
//   2) /lhapply/lhFile.do?fileid=NNN 로 PDF 다운로드 (Referer 필수)
//   3) pdf-parse 의 PDFParse 로 텍스트 추출
//   4) 휴리스틱 패턴으로 임대보증금/월임대료/분양가 추출
//   5) listings-api.json 업데이트
//
// 정확도 50~70% 각오. PDF 안 표가 텍스트 변환 시 깨지는 경우 패턴 매칭 실패 가능.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "lib/listings-api.json");
const PDF_DIR = path.join(ROOT, ".cache/lh-pdfs");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 daum-public-housing-app/1.0";
const LH_BASE = "https://apply.lh.or.kr";
const DELAY_MS = 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// 매물 페이지에서 "입주자모집공고문.pdf" 또는 비슷한 PDF 의 fileSn 추출.
// 우선순위: 입주자모집공고문 > 모집공고 > 분양팸플릿
function extractNoticePdfSn(html) {
  // <a href="javascript:fileDownLoad('66743091');">파일명.pdf</a>
  const re = /fileDownLoad\('(\d+)'\)\s*;\s*"[^>]*>\s*([^<]+\.pdf)\s*</gi;
  const items = [];
  let m;
  while ((m = re.exec(html))) {
    items.push({ sn: m[1], name: m[2].trim() });
  }
  if (!items.length) return null;
  const priorities = [
    /입주자모집공고/,
    /모집공고/,
    /입주자모집/,
    /공고문/,
    /분양팸플릿/,
  ];
  for (const re2 of priorities) {
    const hit = items.find((x) => re2.test(x.name));
    if (hit) return hit;
  }
  return items[0];
}

async function downloadPdf(fileSn, sourceUrl, dest) {
  const url = `${LH_BASE}/lhapply/lhFile.do?fileid=${fileSn}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Referer: sourceUrl } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error(`too small (${buf.length}B)`);
  const head = buf.slice(0, 5).toString("utf8");
  if (head !== "%PDF-") throw new Error("not a PDF");
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// 텍스트에서 가격 패턴 추출.
// LH PDF 의 표는 텍스트 변환 시 한 행이 한 줄로 들어가거나 흩어짐.
// 휴리스틱:
//   - "임대보증금" 키워드 주변 100자에서 가장 큰 합리적 숫자 (1만 ~ 5억) → 보증금
//   - "월임대료" / "월세" 주변 → 월세 (1만 ~ 200만)
//   - "분양가" / "주택분양가격" 주변 → 분양가 (1억 ~ 20억)
function extractPrices(text) {
  // 텍스트 정규화 — PDF 추출 시 글자 반복("인천인천인천")/탭/공백 정리
  const norm = text
    .replace(/\t+/g, " ")
    .replace(/(.)\1{3,}/g, "$1") // 같은 글자 4회+ 반복은 1회로
    .replace(/\s+/g, " ");

  function findNearbyNumbers(keywords, range, range2 = null) {
    const out = [];
    for (const kw of keywords) {
      let idx = 0;
      while ((idx = norm.indexOf(kw, idx)) >= 0) {
        const slice = norm.slice(idx, idx + 300);
        const nums = [...slice.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,12})/g)]
          .map((m) => Number(m[1].replace(/,/g, "")))
          .filter((n) => Number.isFinite(n) && n >= range[0] && n <= range[1]);
        out.push(...nums);
        idx += kw.length;
      }
    }
    if (!out.length) return null;
    // 너무 작은 값 (예: 페이지 번호) 거르고 최빈/중앙값
    out.sort((a, b) => a - b);
    return out[Math.floor(out.length / 2)]; // 중앙값
  }

  // 임대보증금: 100만원 ~ 5억
  const deposit = findNearbyNumbers(["임대보증금", "보증금(원)", "보증금합계"], [1_000_000, 500_000_000]);
  // 월임대료: 1만 ~ 200만
  const rent = findNearbyNumbers(["월임대료", "월세(원)", "월임대료(원)"], [10_000, 2_000_000]);
  // 분양가: 5천만 ~ 20억
  const sale = findNearbyNumbers(["분양가", "주택가격", "공급금액"], [50_000_000, 2_000_000_000]);

  return { deposit, rent, sale };
}

async function parsePdfText(buf) {
  const m = await import("pdf-parse");
  const parser = new m.PDFParse({ data: buf });
  const out = await parser.getText();
  return out.text || "";
}

async function main() {
  const listings = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const targets = listings.filter(
    (l) =>
      l.scope !== "regional" &&
      l.sourceUrl &&
      l.sourceUrl.includes("selectWrtancInfo.do") &&
      !l.depositManwon && !l.monthlyRentManwon && !l.salePriceManwon
  );
  console.log(`targets: ${targets.length} / total ${listings.length}`);

  let updated = 0, noPdf = 0, noPrice = 0, fail = 0;
  for (const [i, l] of targets.entries()) {
    const tag = `[${i + 1}/${targets.length}] ${l.id}`;
    try {
      const pageRes = await fetch(l.sourceUrl, { headers: { "User-Agent": UA } });
      if (!pageRes.ok) { fail++; continue; }
      const html = await pageRes.text();
      const pick = extractNoticePdfSn(html);
      if (!pick) { noPdf++; continue; }

      const pdfPath = path.join(PDF_DIR, `${l.id}.pdf`);
      try {
        await downloadPdf(pick.sn, l.sourceUrl, pdfPath);
      } catch (e) {
        fail++;
        if (fail < 5) console.warn(`${tag} pdf dl: ${e.message}`);
        await sleep(DELAY_MS);
        continue;
      }
      await sleep(200);

      const buf = fs.readFileSync(pdfPath);
      const text = await parsePdfText(buf);
      if (!text || text.length < 500) { noPrice++; continue; }

      const { deposit, rent, sale } = extractPrices(text);
      let changed = false;
      if (deposit && !l.depositManwon) { l.depositManwon = Math.round(deposit / 10000); changed = true; }
      if (rent && !l.monthlyRentManwon) { l.monthlyRentManwon = Math.round(rent / 10000); changed = true; }
      if (sale && !l.salePriceManwon) { l.salePriceManwon = Math.round(sale / 10000); changed = true; }

      if (changed) {
        updated++;
        if (updated % 5 === 0) {
          console.log(`${tag} ✓ d=${l.depositManwon || '-'} r=${l.monthlyRentManwon || '-'} sale=${l.salePriceManwon || '-'}`);
        }
      } else {
        noPrice++;
      }
    } catch (e) {
      fail++;
      if (fail < 5) console.warn(`${tag} error: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(listings, null, 2));
  console.log("---");
  console.log({ updated, noPdf, noPrice, fail, total: targets.length });
  console.log(`saved → ${DATA_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
