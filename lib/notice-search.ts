// 공고문 임베딩 인덱스 로딩 + 코사인 유사도 검색.
// 서버 라우트와 AI tool 양쪽에서 재사용.
//
// ID 매핑 주의:
//   인덱스는 lh-notices-all.json 의 ID (lh-rental-20274-1) 로 저장됨.
//   런타임 카드/AI 는 listings-api.json 의 ID (lh-rental-2015122300019890) 사용.
//   둘 다 같은 매물이지만 식별자 다름 — sourceUrl 의 panId 로 매핑.

import fs from "node:fs";
import path from "node:path";
import allNotices from "./lh-notices-all.json";
import blobVectors from "./blob-vectors.json";

const ROOT = path.resolve(process.cwd());
const INDEX_PATH = path.join(ROOT, "lib/notice-embeddings/index.json");
const VECTORS_PATH = path.join(ROOT, "lib/notice-embeddings/vectors.bin");
// production 에선 둘 다 git/deploy 에 없음 → Blob 에서 fetch.
const VECTORS_BLOB_URL = (blobVectors as { vectors?: { url?: string }; url?: string }).vectors?.url
  ?? (blobVectors as { url?: string }).url;
const INDEX_BLOB_URL = (blobVectors as { index?: { url?: string } }).index?.url;

// panId ↔ notice-all id 양방향 매핑.
const PAN_TO_NOTICE_ID = new Map<string, string>();
const NOTICE_TO_PAN = new Map<string, string>();
for (const n of allNotices as Array<{ id?: string; sourceUrl?: string }>) {
  if (!n.id || !n.sourceUrl) continue;
  const m = n.sourceUrl.match(/panId=(\d+)/);
  if (!m) continue;
  PAN_TO_NOTICE_ID.set(m[1], n.id);
  NOTICE_TO_PAN.set(n.id, m[1]);
}

// listings-api 식 ID → notice-all 식 ID (인덱스에서 사용).
// listings-api 형식: lh-{rental|sale}-{panId}[-c{idx}]
function apiIdToNoticeId(apiId: string): string | null {
  const lh = apiId.match(/lh-(?:rental|sale)-(\d+)/);
  if (lh) return PAN_TO_NOTICE_ID.get(lh[1]) ?? null;
  // SH·youth 는 공고문 .md 파일명이 곧 매물 id (sh-{seq}, youth-{boardId}).
  // 분리 핀(-mN)·단지(-cN) suffix 를 떼고 인덱스 키와 동일한 base id 로 패스스루.
  const etc = apiId.match(/^(?:sh|youth)-[^-]+/);
  return etc ? etc[0] : null;
}

// 인덱스의 notice-all id → listings-api 식 ID (검색 결과 반환용).
// 다중 단지 매물(c0, c1)이 있어도 panId 단위로 매칭되므로 base ID 반환.
function noticeIdToApiId(noticeId: string, kind: "rental" | "sale" = "rental"): string | null {
  const panId = NOTICE_TO_PAN.get(noticeId);
  return panId ? `lh-${kind}-${panId}` : null;
}

type ChunkEntry = { idx: number; text: string; offset: number };
type NoticeIndex = {
  dim: number;
  model: string;
  listings: Record<string, ChunkEntry[]>;
};

let cached: { index: NoticeIndex; vectors: Float32Array } | null = null;
let loadingPromise: Promise<{ index: NoticeIndex; vectors: Float32Array } | null> | null = null;

async function loadIndexJson(): Promise<NoticeIndex | null> {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as NoticeIndex;
  } catch {
    if (!INDEX_BLOB_URL) return null;
    const r = await fetch(INDEX_BLOB_URL);
    if (!r.ok) return null;
    return (await r.json()) as NoticeIndex;
  }
}

async function loadVectorsBuffer(): Promise<Buffer | null> {
  try {
    return fs.readFileSync(VECTORS_PATH);
  } catch {
    if (!VECTORS_BLOB_URL) return null;
    const r = await fetch(VECTORS_BLOB_URL);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  }
}

// 인덱스 + binary 벡터 로딩 (lazy, process 수명 동안 메모리 보존).
// production: index.json + vectors.bin 둘 다 Blob 에서 병렬 fetch.
async function load(): Promise<{ index: NoticeIndex; vectors: Float32Array } | null> {
  if (cached) return cached;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const [index, buf] = await Promise.all([loadIndexJson(), loadVectorsBuffer()]);
      if (!index || !buf) return null;
      const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      cached = { index, vectors };
      return cached;
    } catch {
      return null;
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

function cosineSim(a: Float32Array, aOff: number, b: Float32Array, bOff: number, dim: number): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < dim; i++) {
    const x = a[aOff + i];
    const y = b[bOff + i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export type SearchResult = {
  listingId: string;
  chunkIdx: number;
  text: string;
  score: number;
};

/** 쿼리 벡터(query embedding) 가 있을 때 top-K 청크 검색.
 *  listingIds 지정 시 그 매물 안에서만 검색.
 *  listingIds 는 listings-api 식 ID (lh-rental-2015...) — 내부에서 notice-all id 로 변환. */
export async function searchByQueryVector(
  queryVec: number[],
  opts: { topK?: number; listingIds?: string[] } = {},
): Promise<SearchResult[]> {
  const data = await load();
  if (!data) return [];
  const { index, vectors } = data;
  const dim = index.dim;
  if (queryVec.length !== dim) {
    throw new Error(`query dim ${queryVec.length} != index dim ${dim}`);
  }
  const q = new Float32Array(queryVec);
  const topK = opts.topK ?? 5;

  // listings-api id → notice-all id 로 변환
  let filterSet: Set<string> | null = null;
  if (opts.listingIds?.length) {
    const noticeIds = opts.listingIds.map((id) => apiIdToNoticeId(id)).filter((x): x is string => !!x);
    filterSet = noticeIds.length ? new Set(noticeIds) : null;
  }

  const results: SearchResult[] = [];
  for (const [noticeId, chunks] of Object.entries(index.listings)) {
    if (filterSet && !filterSet.has(noticeId)) continue;
    for (const c of chunks) {
      const bOff = c.offset / 4; // bytes → float32 elements
      const score = cosineSim(q, 0, vectors, bOff, dim);
      // 카드/AI 인식 ID 형식으로 변환해서 반환
      const apiId = noticeIdToApiId(noticeId, noticeId.startsWith("lh-sale-") ? "sale" : "rental");
      results.push({ listingId: apiId ?? noticeId, chunkIdx: c.idx, text: c.text, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/** 인덱스 로딩 가능한지 / 통계 — cache hit 만 빠르게 (검색 호출 후엔 즉시 응답). */
export function getIndexStats(): { ok: boolean; listings?: number; chunks?: number; dim?: number; vectorMB?: number } {
  if (!cached) return { ok: false };
  const chunks = Object.values(cached.index.listings).reduce((a, arr) => a + arr.length, 0);
  return {
    ok: true,
    listings: Object.keys(cached.index.listings).length,
    chunks,
    dim: cached.index.dim,
    vectorMB: +((cached.vectors.byteLength) / 1024 / 1024).toFixed(1),
  };
}
