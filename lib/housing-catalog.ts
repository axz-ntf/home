import { createHash } from "node:crypto";

export const DATASETS = [
  { id: "lh-listings", label: "LH 서비스 데이터", provider: "LH", kind: "가공 데이터", file: "listings-api.json", meta: "lh", url: "https://apply.lh.or.kr/", description: "API·공식 상세에서 수집해 서비스용으로 가공한 공고" },
  { id: "lh-complexes", label: "공공임대 단지", provider: "마이홈 · LH", kind: "단지 API", file: "lh-complexes.json", meta: "complexes", url: "https://www.myhome.go.kr/", description: "단지 식별자로 묶은 공공임대 단지와 주택형별 임대조건" },
  { id: "lh-notices", label: "LH 수집 공고", provider: "LH · 마이홈", kind: "수집 공고", file: "lh-notices-all.json", meta: "lh", url: "https://www.myhome.go.kr/", description: "공공데이터 API와 공식 공고 상세를 합친 수집 기록" },
  { id: "sh-notices", label: "SH 수집 공고", provider: "SH", kind: "공식 사이트", file: "sh-notices.json", meta: "sh", url: "https://www.i-sh.co.kr/", description: "SH 공식 사이트에서 수집한 모집공고와 첨부 정보" },
  { id: "youth-notices", label: "청년안심주택 공고", provider: "서울시", kind: "공식 사이트", file: "youth-notices.json", meta: "youth", url: "https://soco.seoul.go.kr/", description: "서울시 청년안심주택 공고 · 민간임대 포함" },
  { id: "youth-complexes", label: "청년안심주택 단지", provider: "서울시", kind: "단지 정보", file: "youth-complexes.json", meta: "youth", url: "https://soco.seoul.go.kr/", description: "청년안심주택 단지 기본 정보 · 민간임대 포함" },
] as const;
export type DatasetId = typeof DATASETS[number]["id"];
export type RawHousing = Record<string, unknown>;
export type CatalogRecord = {
  id: string; title: string; address: string; region: string; type: string; types: string[];
  status: string; date: string; sourceUrl: string | null; issues: string[];
  rows: RawHousing[]; search: string;
};
export const datasetById = (id: string) => DATASETS.find(d => d.id === id);
export function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}
export function safeSourceUrl(value: unknown): string | null {
  try { const url = new URL(textValue(value)); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export const searchText = (s: string) => s.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
const first = (...values: unknown[]) => values.map(textValue).find(Boolean) ?? "";

export function normalizeCatalog(source: DatasetId, rows: RawHousing[]): CatalogRecord[] {
  const groups = new Map<string, CatalogRecord>();
  for (const row of rows) {
    const identity = source === "lh-complexes" ? row.hsmpSn : source === "youth-complexes" ? row.homeCode : source === "sh-notices" ? row.seq : source === "youth-notices" ? row.boardId : row.id;
    const id = textValue(identity) || `unidentified-${createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 24)}`;
    const title = first(row.title, row.hsmpNm, row.homeName);
    const address = first(row.address, row.rnAdres);
    const region = first(row.brtcNm, row.sido, row.district, row.gu) || "미수집";
    const type = first(row.housingType, row.suplyTyNm, row.supplyType, row.type, row.category) || (source.startsWith("youth") ? "청년안심주택" : "미수집");
    const sourceUrl = safeSourceUrl(row.sourceUrl) ?? safeSourceUrl(row.detailUrl) ?? safeSourceUrl(row.homepage);
    const issues: string[] = [];
    if (!textValue(identity)) issues.push("식별자 미수집");
    if (!title) issues.push("이름 미수집");
    if (!address) issues.push("주소 미수집");
    if (source !== "lh-complexes" && !(typeof row.lat === "number" && row.lat >= 33 && row.lat <= 39 && typeof row.lng === "number" && row.lng >= 124 && row.lng <= 132)) issues.push("좌표 미수집");
    if (row.coordApprox === true || row.geocoded === "regional") issues.push("대표 위치");
    if (!source.endsWith("complexes") && !sourceUrl) issues.push("원문 링크 미수집");
    const prior = groups.get(id);
    const search = searchText([id, title, address, region, type, row.pblancId, row.pnu, row.houseTyNm, row.styleNm].map(textValue).join(" "));
    if (prior) {
      prior.rows.push(row);
      prior.types = [...new Set([...prior.types, type])];
      prior.type = prior.types.join(" · ");
      prior.issues = [...new Set([...prior.issues, ...issues])];
      prior.search += ` ${search}`;
    } else groups.set(id, { id, title: title || "이름 미수집", address, region, type, types: [type], sourceUrl, issues, rows: [row], search,
      status: first(row.progressStatus, row.status, row.activeStatus) || "미수집",
      date: first(row.announceDate, row.postedAt),
    });
  }
  return [...groups.values()];
}

export type CatalogQuery = { q?: string; region?: string; type?: string; quality?: string; page?: string; sort?: string; managed?: string };
export type CatalogNote = { state: "none" | "watch" | "check" | "done"; note: string; revision: number; updatedAt: string };
export { NOTE_STATES } from "./housing-catalog-types";
export const noteKey = (source: DatasetId, id: string) => `${source}:${id}`;

export function queryCatalog(records: CatalogRecord[], query: CatalogQuery, notes: Record<string, CatalogNote>, source: DatasetId) {
  const q = searchText((query.q ?? "").slice(0, 200));
  const filtered = records.filter(r => (!q || r.search.includes(q)) && (!query.region || r.region === query.region) && (!query.type || r.types.includes(query.type))
    && (query.quality !== "missing" || r.issues.length > 0) && (query.quality !== "complete" || r.issues.length === 0)
    && (!query.managed || (notes[noteKey(source, r.id)]?.state ?? "none") === query.managed));
  filtered.sort((a, b) => query.sort === "name" ? a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id) : b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "ko") || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const requested = Number(query.page);
  const page = Math.max(1, Math.min(pages, Number.isSafeInteger(requested) ? requested : 1));
  return { records: filtered.slice((page - 1) * 24, page * 24), total: filtered.length, pages, page };
}
