-- 공고문 RAG 청크 — Supabase Postgres + pgvector.
-- Solar 임베딩이 4096차원이라 ANN 인덱스(hnsw/halfvec 최대 4000) 불가 → 정확검색(seq scan).
-- 5.8만 행 규모는 전수 코사인도 수백 ms 내. halfvec(float16) 로 저장 절반.
create extension if not exists vector;

create table if not exists notice_chunks (
  listing_id  text        not null,   -- lh-notices-all id (lh-rental-20175-1, youth-6560 ...)
  chunk_idx   int         not null,
  text        text        not null,
  embedding   halfvec(4096) not null,
  primary key (listing_id, chunk_idx)
);

-- scoped 검색(특정 공고 한정) 시 listing_id 필터용.
create index if not exists notice_chunks_listing_idx on notice_chunks (listing_id);
