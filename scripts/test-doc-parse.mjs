#!/usr/bin/env node
// Upstage Document Parse 시범 — 매물 1개의 PDF 공고문을 가져와 파싱.
// 목적: API 권한 확인 + 출력 품질/형식/표 인식 검증.
//
// 실행: node --env-file=.env.local --env-file=.env.solar-test scripts/test-doc-parse.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "lib/lh-notices-all.json");

const UA = "daum-public-housing-app/1.0 (Document Parse test; polite)";
const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
if (!SOLAR_API_KEY) {
  console.error("ERROR: SOLAR_API_KEY 가 env 에 없음.");
  process.exit(1);
}

// Upstage Document Parse — 가장 흔한 endpoint 후보.
// 권한/엔드포인트 둘 다 검증.
const DOC_PARSE_URL = "https://api.upstage.ai/v1/document-ai/document-parse";

async function fetchPdfFileIdsFromDetail(sourceUrl) {
  const r = await fetch(sourceUrl, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`detail HTTP ${r.status}`);
  const html = await r.text();
  const out = [];
  // 패턴 1: <a href="javascript:fileDownLoad('NNN');">NAME.pdf</a>
  const re = /fileDownLoad\(\s*'([0-9]+)'\s*\)\s*[^>]*>([^<]+\.pdf)/gi;
  let m;
  while ((m = re.exec(html))) out.push({ fileid: m[1], name: m[2].trim() });
  return out;
}

async function downloadPdf(fileid, destPath) {
  const url = `https://apply.lh.or.kr/lhapply/lhFile.do?fileid=${fileid}`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`PDF HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(destPath, buf);
  return buf.length;
}

async function callDocumentParse(pdfPath) {
  const buf = await fs.readFile(pdfPath);
  const form = new FormData();
  form.append("document", new Blob([buf], { type: "application/pdf" }), path.basename(pdfPath));
  // markdown 출력 명시
  form.append("output_formats", '["markdown", "text", "html"]');
  // 표를 더 잘 인식하도록 (default vs 고품질)
  form.append("base64_encoding", '["table"]');

  const r = await fetch(DOC_PARSE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SOLAR_API_KEY}` },
    body: form,
  });
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { status: r.status, ok: r.ok, parsed, raw: text.slice(0, 500) };
}

async function main() {
  // sample 매물 선택 — 공공분양 or 임대 1건
  const all = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const sample = all.find((n) => typeof n.sourceUrl === "string" && n.sourceUrl.includes("selectWrtancInfo.do"));
  if (!sample) { console.error("sample 없음"); process.exit(1); }

  console.log(`\n샘플: ${sample.id}`);
  console.log(`제목: ${sample.title?.slice(0, 60) ?? "-"}`);
  console.log(`URL:  ${sample.sourceUrl.slice(0, 100)}...\n`);

  console.log("1) detail HTML 에서 PDF 파일 ID 추출 중…");
  const pdfs = await fetchPdfFileIdsFromDetail(sample.sourceUrl);
  if (!pdfs.length) {
    console.error("PDF 링크 못 찾음 (자바스크립트 패턴 변경 가능성)");
    process.exit(1);
  }
  console.log(`   → ${pdfs.length}개 발견: ${pdfs.map((p) => p.name).slice(0, 3).join(", ")}\n`);

  // "공고문" 이름이 들어간 PDF 우선, 없으면 첫 번째
  const target = pdfs.find((p) => /공고문/.test(p.name)) ?? pdfs[0];
  const pdfPath = `/tmp/doc-parse-test-${target.fileid}.pdf`;
  console.log(`2) PDF 다운로드 → ${target.name} (fileid=${target.fileid})`);
  const size = await downloadPdf(target.fileid, pdfPath);
  console.log(`   → ${Math.round(size / 1024)} KB 저장\n`);

  console.log(`3) Upstage Document Parse 호출 → ${DOC_PARSE_URL}`);
  const t0 = Date.now();
  const res = await callDocumentParse(pdfPath);
  const ms = Date.now() - t0;
  console.log(`   → HTTP ${res.status}  (${ms}ms)\n`);

  if (!res.ok) {
    console.log("실패 응답 원문:");
    console.log(res.raw);
    process.exit(1);
  }

  // 응답 구조 상세 진단
  console.log("응답 키:", res.parsed ? Object.keys(res.parsed) : "(JSON 아님)");
  console.log("\napi:", JSON.stringify(res.parsed?.api));
  console.log("model:", JSON.stringify(res.parsed?.model));
  console.log("ocr:", JSON.stringify(res.parsed?.ocr));
  console.log("usage:", JSON.stringify(res.parsed?.usage));
  if (res.parsed?.content) {
    const c = res.parsed.content;
    console.log("\ncontent 키:", Object.keys(c));
    console.log("  html 길이:", (c.html ?? "").length);
    console.log("  markdown 길이:", (c.markdown ?? "").length);
    console.log("  text 길이:", (c.text ?? "").length);
    const md = c.markdown || c.html || c.text || "";
    if (md) {
      console.log("\n=== content 본문 (앞 1500자) ===");
      console.log(md.slice(0, 1500));
    }
  }
  if (Array.isArray(res.parsed?.elements)) {
    const els = res.parsed.elements;
    const byCat = {};
    for (const e of els) byCat[e.category] = (byCat[e.category] || 0) + 1;
    console.log("\nelements 개수:", els.length);
    console.log("카테고리 분포:", byCat);

    const firstTable = els.find((e) => e.category === "table");
    if (firstTable) {
      console.log("\n=== 첫 번째 table element ===");
      console.log("페이지:", firstTable.page);
      console.log("html 길이:", (firstTable.content?.html ?? "").length);
      console.log("markdown 길이:", (firstTable.content?.markdown ?? "").length);
      console.log("\n표 markdown (앞 800자):");
      console.log((firstTable.content?.markdown ?? "").slice(0, 800));
    } else {
      console.log("\n표(table) element 없음");
    }

    // 캐시된 PDF 텍스트 한 번 저장 — 후속 임베딩에 사용 가능하도록
    const cachePath = `/tmp/doc-parse-test-output.json`;
    await fs.writeFile(cachePath, JSON.stringify(res.parsed, null, 2));
    console.log(`\n전체 응답 → ${cachePath}`);
  }
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
