// 공고문 임베딩 검색 — Supabase Postgres(pgvector) 에 저장된 청크에 대해 코사인 유사도 검색.
// (이전: vectors.bin blob 을 함수 메모리에 통째 로드. Blob 1GB 한도 + 콜드스타트 때문에 DB 로 이전.)
// 서버 라우트와 AI tool 양쪽에서 재사용.
//
// ID 매핑 주의:
//   DB 의 listing_id 는 lh-notices-all.json 의 ID (lh-rental-20274-1).
//   런타임 카드/AI 는 listings-api.json 의 ID (lh-rental-2015122300019890) 사용.
//   둘 다 같은 매물이지만 식별자 다름 — sourceUrl 의 panId 로 매핑.

import allNotices from "./lh-notices-all.json";
import { sql, hasDb } from "./db";

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

// listings-api 식 ID → notice-all 식 ID (DB 키).
// listings-api 형식: lh-{rental|sale}-{panId}[-c{idx}]
function apiIdToNoticeId(apiId: string): string | null {
  const lh = apiId.match(/lh-(?:rental|sale)-(\d+)/);
  if (lh) return PAN_TO_NOTICE_ID.get(lh[1]) ?? null;
  // SH·youth 는 공고문 .md 파일명이 곧 매물 id (sh-{seq}, youth-{boardId}).
  // 분리 핀(-mN)·단지(-cN) suffix 를 떼고 DB 키와 동일한 base id 로 패스스루.
  const etc = apiId.match(/^(?:sh|youth)-[^-]+/);
  return etc ? etc[0] : null;
}

// DB 의 notice-all id → listings-api 식 ID (검색 결과 반환용).
function noticeIdToApiId(noticeId: string, kind: "rental" | "sale" = "rental"): string | null {
  const panId = NOTICE_TO_PAN.get(noticeId);
  return panId ? `lh-${kind}-${panId}` : null;
}

export type SearchResult = {
  listingId: string;
  chunkIdx: number;
  text: string;
  score: number;
};

/** 쿼리 벡터(query embedding) 로 top-K 청크 검색 (pgvector 코사인).
 *  listingIds 지정 시 그 매물 안에서만 검색 (listings-api 식 ID → 내부 notice-all id 변환).
 *  Solar 임베딩 4096차원은 ANN 인덱스 한도를 넘어 정확검색(seq scan) — 규모상 충분. */
export async function searchByQueryVector(
  queryVec: number[],
  opts: { topK?: number; listingIds?: string[] } = {},
): Promise<SearchResult[]> {
  if (!hasDb) return [];
  const topK = opts.topK ?? 5;
  const q = `[${queryVec.join(",")}]`;

  // listings-api id → notice-all id. 변환된 게 있으면 그 매물들로 한정, 없으면 전체검색.
  let noticeIds: string[] = [];
  if (opts.listingIds?.length) {
    noticeIds = opts.listingIds.map((id) => apiIdToNoticeId(id)).filter((x): x is string => !!x);
  }

  try {
    const rows = noticeIds.length
      ? await sql`
          select listing_id, chunk_idx, text, 1 - (embedding <=> ${q}::halfvec) as score
          from notice_chunks
          where listing_id = any(${noticeIds})
          order by embedding <=> ${q}::halfvec
          limit ${topK}`
      : await sql`
          select listing_id, chunk_idx, text, 1 - (embedding <=> ${q}::halfvec) as score
          from notice_chunks
          order by embedding <=> ${q}::halfvec
          limit ${topK}`;

    return rows.map((r) => ({
      listingId:
        noticeIdToApiId(r.listing_id, (r.listing_id as string).startsWith("lh-sale-") ? "sale" : "rental") ??
        (r.listing_id as string),
      chunkIdx: r.chunk_idx as number,
      text: r.text as string,
      score: Number(r.score),
    }));
  } catch (e) {
    console.error("[notice-search] query failed", e);
    return [];
  }
}
