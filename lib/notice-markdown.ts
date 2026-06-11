// 공고문 마크다운 확보 — 추출(solar-extract)의 입력.
//   1) 로컬 dev: lib/notice-texts/{id}.md 캐시 사용 (enrich-notice-text.mjs 가 만든 것)
//   2) 배포(Vercel): 캐시가 함수 번들에서 제외돼 없음 → 원본 PDF 를 Document Parse 로 즉시 파싱
//   3) 업로드 PDF: 그대로 Document Parse
// PDF 파싱 로직은 scripts/enrich-notice-text.mjs 와 동일(공고문 PDF 선택 → 다운로드 → 파싱 → 마크다운 조립).

import fs from "node:fs/promises";
import path from "node:path";
import shNotices from "./sh-notices.json";

const UA = "doongji-app/1.0 (admin extract; polite)";
const DOC_PARSE_URL = "https://api.upstage.ai/v1/document-ai/document-parse";
const PDF_BASE = "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=";
const CACHE_DIR = path.join(process.cwd(), "lib", "notice-texts");
const KEY = (process.env.SOLAR_API_KEY ?? "").trim();

export type MarkdownSource = "cache" | "parsed" | "upload";

// 캐시 파일명 후보 — listing id 가 분리(-c0) / suffix(-1) 되기 전 형태도 시도.
function cacheCandidates(id: string): string[] {
  const out = [id];
  const noSuffix = id.replace(/-c\d+$/, "");
  if (noSuffix !== id) out.push(noSuffix);
  const m = id.match(/^lh-(rental|sale)-(\d+)/);
  if (m) out.push(`lh-${m[1]}-${m[2]}`);
  return [...new Set(out)];
}

export async function readCachedMarkdown(id: string): Promise<string | null> {
  for (const name of cacheCandidates(id)) {
    try {
      return await fs.readFile(path.join(CACHE_DIR, `${name}.md`), "utf8");
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

// 공고문 PDF 우선 — 신청서류/평면도/배치도는 제외 (script 와 동일 규칙).
function pickNoticePdf(html: string): { fileid: string; name: string } | null {
  const all: { fileid: string; name: string }[] = [];
  const re = /fileDownLoad\(\s*'([0-9]+)'\s*\)\s*[^>]*>([^<]+\.pdf)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) all.push({ fileid: m[1], name: m[2].trim() });
  if (!all.length) return null;
  const notice = all.find((p) => /공고문/.test(p.name));
  if (notice) return notice;
  const skip = /제출서류|첨부|양식|동의서|체크|평면도|배치도|단지조감도|위치도/;
  return all.find((p) => !skip.test(p.name)) ?? all[0];
}

function assembleMarkdown(parsed: { elements?: { content?: { markdown?: string; html?: string }; category?: string }[] }): string {
  const els = parsed.elements ?? [];
  const out: string[] = [];
  for (const e of els) {
    const md = e.content?.markdown ?? "";
    const html = e.content?.html ?? "";
    if (md) {
      out.push(md);
    } else if (html) {
      const txt = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
      out.push(e.category?.startsWith("heading") ? `## ${txt}` : txt);
    }
  }
  return stripWatermark(out.filter(Boolean).join("\n\n").trim());
}

// 워터마크 제거 — 일부 PDF(특히 매각 공고)는 단지명·"선착순"·"잔여세대" 등 짧은 문구가
// 사선 워터마크로 깔려 마크다운에 수십 번 반복된다(전체의 절반까지). 짧고 과도하게 반복되는
// 라인을 제거해 RAG 검색·추출 정확도를 높인다. 표 행(|)·긴 문장은 보존.
function stripWatermark(md: string): string {
  const lines = md.split("\n");
  const freq = new Map<string, number>();
  for (const l of lines) {
    const t = l.trim();
    if (t && t.length < 25 && !t.includes("|")) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const noise = new Set([...freq.entries()].filter(([, c]) => c >= 8).map(([t]) => t));
  if (noise.size === 0) return md;
  return lines.filter((l) => !noise.has(l.trim())).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function docParse(pdfBuf: Buffer, filename: string): Promise<string> {
  if (!KEY) throw new Error("SOLAR_API_KEY 미설정");
  const form = new FormData();
  form.append("document", new Blob([new Uint8Array(pdfBuf)], { type: "application/pdf" }), filename);
  form.append("output_formats", '["markdown"]');
  form.append("base64_encoding", '["table"]');
  const r = await fetch(DOC_PARSE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
    body: form,
  });
  if (!r.ok) throw new Error(`Document Parse 실패 (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return assembleMarkdown(await r.json());
}

// sourceUrl(LH 공고 상세 페이지) → 공고문 PDF → Document Parse → 마크다운.
export async function parseNoticeFromSource(sourceUrl: string): Promise<string> {
  const detail = await fetch(sourceUrl, { headers: { "User-Agent": UA } });
  if (!detail.ok) throw new Error(`공고 상세 페이지 로드 실패 (${detail.status})`);
  const html = await detail.text();
  const pdf = pickNoticePdf(html);
  if (!pdf) throw new Error("공고 페이지에서 공고문 PDF 를 찾지 못했습니다.");
  const dl = await fetch(PDF_BASE + pdf.fileid, { headers: { "User-Agent": UA } });
  if (!dl.ok) throw new Error(`PDF 다운로드 실패 (${dl.status})`);
  return docParse(Buffer.from(await dl.arrayBuffer()), pdf.name);
}

export async function parseUploadedPdf(buf: Buffer, filename: string): Promise<string> {
  return docParse(buf, filename);
}

// SH(sh-{seq}) → sh-notices.json 의 pdfUrl(Innorix innoFD) 직접 다운로드 → Document Parse.
async function resolveShMarkdown(id: string): Promise<string> {
  const seq = id.replace(/^sh-/, "");
  const n = (shNotices as { seq: string; pdfUrl?: string | null; pdfName?: string | null; detailUrl?: string }[]).find((x) => x.seq === seq);
  if (!n?.pdfUrl) throw new Error("SH 공고문 PDF 를 찾을 수 없습니다.");
  const r = await fetch(n.pdfUrl, { headers: { "User-Agent": UA, Referer: n.detailUrl ?? "https://www.i-sh.co.kr/" } });
  if (!r.ok) throw new Error(`SH PDF 다운로드 실패 (${r.status})`);
  return docParse(Buffer.from(await r.arrayBuffer()), n.pdfName ?? "sh.pdf");
}

// id(+sourceUrl) 로 마크다운 확보. 캐시 우선, 없으면 원본 PDF 파싱.
export async function resolveMarkdown(
  id: string,
  sourceUrl: string | null,
): Promise<{ markdown: string; source: MarkdownSource }> {
  if (id.startsWith("sh-")) {
    return { markdown: await resolveShMarkdown(id), source: "parsed" };
  }
  const cached = await readCachedMarkdown(id);
  if (cached) return { markdown: cached, source: "cache" };
  if (!sourceUrl) throw new Error("캐시가 없고 sourceUrl 도 없어 공고문을 가져올 수 없습니다.");
  return { markdown: await parseNoticeFromSource(sourceUrl), source: "parsed" };
}
