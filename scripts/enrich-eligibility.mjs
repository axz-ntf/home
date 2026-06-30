// LH 공고 PDF 에서 매물별 자격 계층을 추출하여 listings-api.json 의 eligible 필드에 저장.
//
// 행복주택 등은 매물마다 공급 계층이 다르다 (예: 청년 빠지고 신혼/고령/주거급여만).
// type 기본값을 그대로 두면 잘못된 정보가 카드에 노출됨.
//
// 추출 패턴: PDF 텍스트의 "① X 계층", "② Y 계층" 또는 "X : 19세 이상" 같은 표기.
//
// 캐시된 PDF (.cache/lh-pdfs/) 우선, 없으면 다운로드.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "lib/listings-api.json");
const PDF_DIR = path.join(ROOT, ".cache/lh-pdfs");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 daum-public-housing-app/1.0";
const LH_BASE = "https://apply.lh.or.kr";
const DELAY_MS = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// 페이지에서 "입주자모집공고문.pdf" 의 fileSn 추출 (enrich-prices-pdf 와 동일 로직)
function extractNoticePdfSn(html) {
  const re = /fileDownLoad\('(\d+)'\)\s*;\s*"[^>]*>\s*([^<]+\.pdf)\s*</gi;
  const items = [];
  let m;
  while ((m = re.exec(html))) items.push({ sn: m[1], name: m[2].trim() });
  if (!items.length) return null;
  const priorities = [/입주자모집공고/, /모집공고/, /입주자모집/, /공고문/];
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
  if (buf.slice(0, 5).toString("utf8") !== "%PDF-") throw new Error("not a PDF");
  fs.writeFileSync(dest, buf);
}

async function parsePdfText(buf) {
  const m = await import("pdf-parse");
  const out = await new m.PDFParse({ data: buf }).getText();
  return out.text || "";
}

// PDF 텍스트에서 자격 키 추출.
// 우리 ELIGIBILITY_LABELS 의 키와 매핑 가능한 신호를 검출.
function extractEligibilityKeys(text) {
  const norm = text.replace(/(.)\1{3,}/g, "$1").replace(/\s+/g, " ");
  const keys = new Set();

  // 계층 키워드 — 명시적으로 "X 계층" 또는 "X :" 패턴
  const signals = {
    대학생: [/[①②③④⑤⑥⑦⑧⑨]\s*대학생\s*계층/, /대학생\s*:/, /대학생\s*등\(/],
    청년:   [/[①②③④⑤⑥⑦⑧⑨]\s*청년\s*계층/, /청년\s*:\s*19/, /청년\s*\(\s*만/],
    신혼:   [/[①②③④⑤⑥⑦⑧⑨]\s*신혼/, /신혼부부\s*[:·]/, /혼인\s*기간\s*이?\s*7년/],
    한부모: [/한부모\s*가족/, /한부모\s*가구/],
    자녀:   [/자녀\s*있는/, /6세\s*이하\s*자녀/, /다자녀/],
    고령:   [/[①②③④⑤⑥⑦⑧⑨]\s*고령자/, /고령자\s*:\s*65/, /만\s*65세\s*이상/],
    수급:   [/기초생활수급/, /생계급여/, /의료급여/, /주거급여수급/],
    차상위: [/차상위/],
    장애:   [/장애인\s*[:·]/, /장애의\s*정도가/, /등록\s*장애인/],
    국가유공: [/국가유공자/, /보훈\s*보상대상/],
    북한이탈: [/북한이탈주민/, /새터민/],
    // 기본 조건 — 거의 모든 임대/분양에 공통
    무주택: [/무주택\s*세대구성원/, /무주택\s*세대주/, /무주택자/],
    청약저축: [/주택청약저축/, /주택청약종합저축/],
    소득70: [/도시근로자\s*가구당\s*월평균소득\s*70|소득\s*70\s*%\s*이하/, /도시근로자\s*월평균소득\s*70/],
    소득100: [/소득\s*100\s*%\s*이하|월평균소득\s*100\s*%/],
    소득150: [/소득\s*150\s*%|월평균소득\s*150/],
    자산:   [/총자산\s*[:·]\s*[0-9]/, /자산\s*기준.*?3[\.,]?6/],
    자동차: [/자동차.*?3[\.,]?80[03]/, /자동차가액.*?만원/],
  };

  for (const [key, patterns] of Object.entries(signals)) {
    for (const re of patterns) {
      if (re.test(norm)) {
        keys.add(key);
        break;
      }
    }
  }
  return [...keys];
}

async function getOrFetchPdf(listing) {
  const cached = path.join(PDF_DIR, `${listing.id}.pdf`);
  if (fs.existsSync(cached)) return cached;
  // 페이지에서 PDF fileSn 추출
  const res = await fetch(listing.sourceUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const pick = extractNoticePdfSn(html);
  if (!pick) return null;
  try {
    await downloadPdf(pick.sn, listing.sourceUrl, cached);
    return cached;
  } catch {
    return null;
  }
}

async function main() {
  const listings = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const targets = listings.filter(
    (l) =>
      l.scope !== "regional" &&
      l.sourceUrl &&
      l.sourceUrl.includes("selectWrtancInfo.do")
  );
  console.log(`targets: ${targets.length} / total ${listings.length}`);

  let ok = 0, noPdf = 0, noKeys = 0, fail = 0;
  for (const [i, l] of targets.entries()) {
    const tag = `[${i + 1}/${targets.length}] ${l.id}`;
    try {
      const pdfPath = await getOrFetchPdf(l);
      if (!pdfPath) { noPdf++; continue; }
      const buf = fs.readFileSync(pdfPath);
      const text = await parsePdfText(buf);
      if (!text || text.length < 500) { noPdf++; continue; }
      const keys = extractEligibilityKeys(text);
      if (!keys.length) { noKeys++; continue; }
      l.eligibilityKeys = keys; // raw 데이터 보존, adapter 가 우선순위 결정
      ok++;
      if (ok % 20 === 0) console.log(`${tag} ✓ keys=${keys.join(",")}`);
    } catch (e) {
      fail++;
      if (fail < 5) console.warn(`${tag} error: ${e.message}`);
    }
    // 캐시 hit 이면 sleep 짧게
    if (!fs.existsSync(path.join(PDF_DIR, `${l.id}.pdf`))) {
      // shouldn't happen since we just made/checked it; fallthrough
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(listings, null, 2));
  console.log("---");
  console.log({ ok, noPdf, noKeys, fail, total: targets.length });
}

main().catch((e) => { console.error(e); process.exit(1); });
