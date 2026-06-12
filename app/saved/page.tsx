import { LH_LISTINGS } from "@/lib/lh-adapter";
import { SavedClient } from "./saved-client";

export const metadata = { title: "저장한 공고 — 다음부동산" };

// 저장 목록 (N1) — id 는 localStorage(클라이언트), 매물 데이터는 서버에서 전달해 조인.
// LH_LISTINGS 는 마감 포함(M1)이라 저장한 공고가 마감돼도 계속 보인다.
export default function SavedPage() {
  return <SavedClient listings={LH_LISTINGS} />;
}
