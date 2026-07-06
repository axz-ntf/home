"use client";

// 미리보기 실시간 연동 (P1) — 폼(왼쪽)이 입력 중 대표값을 발행하고 미리보기(오른쪽)가
// 구독한다. 저장 전에 "앱에 어떻게 보일지"를 즉시 확인. 서버 컴포넌트인 page 가
// 양쪽을 이 프로바이더의 children 으로 감싸면 컨텍스트가 클라이언트 트리로 흐른다.
import { createContext, useContext, useState, type ReactNode } from "react";

export interface LiveRow {
  houseType: string;
  area: string;
  depositManwon: number | null;
}

export interface LivePreview {
  deposit: number | null;
  rent: number | null;
  salePriceManwon: number | null;
  supplyUnits: number | null;
  area: string | null;    // null = 면적 입력이 없는 모드 — 저장값 유지
  rows: LiveRow[] | null; // null = 평형별 모드 아님 — 저장값 유지
  dirty: boolean;         // 저장 안 된 수정이 있는지
}

const Ctx = createContext<{ live: LivePreview | null; setLive: (v: LivePreview) => void }>({
  live: null,
  setLive: () => {},
});

export function ReviewLiveProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState<LivePreview | null>(null);
  return <Ctx.Provider value={{ live, setLive }}>{children}</Ctx.Provider>;
}

export function useReviewLive() {
  return useContext(Ctx);
}
