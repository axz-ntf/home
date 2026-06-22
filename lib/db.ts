// Supabase Postgres (pgvector) 연결 — 공고문 RAG 인덱스 저장소.
// serverless 에서 인스턴스 재사용(전역 캐시), Supabase 트랜잭션 풀러(Supavisor)는
// prepared statement 미지원이라 prepare:false.
import postgres from "postgres";

const CONN = process.env.DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

// DATABASE_URL 없으면 client 를 만들지 않는다(import 만으로 throw 방지) — 호출 측은 hasDb 로 가드.
export const hasDb = !!CONN;
export const sql = CONN
  ? (globalThis.__sql ?? postgres(CONN, { prepare: false, idle_timeout: 20, max: 4 }))
  : (undefined as unknown as ReturnType<typeof postgres>);
if (CONN && process.env.NODE_ENV !== "production") globalThis.__sql = sql;
