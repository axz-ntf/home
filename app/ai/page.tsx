"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatPanelBody } from "@/components/chat-panel-body";
import { LH_LISTINGS } from "@/lib/lh-adapter";

// 모바일 풀스크린 AI 챗 라우트. ?focus=<listingId> 면 그 공고에 스코프된 상담.
// 데스크탑에서 직접 URL 로 들어와도 동일한 풀스크린 UI.
function AiPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const focusId = params.get("focus");
  const focusListing = focusId
    ? LH_LISTINGS.find((l) => l.id === focusId || l.id.replace(/-m\d+$/, "") === focusId)
    : undefined;

  // 헤더의 ← 뒤로가기는 명시적 "닫기" — 다음 열기 때 새 대화로.
  const handleClose = () => {
    if (typeof window !== "undefined") {
      try { sessionStorage.removeItem("doongji:ai-chat:messages"); } catch {}
    }
    router.back();
  };
  return (
    <div className="ai-fullscreen">
      <header className="ai-fullscreen-header">
        <button
          type="button"
          className="ai-fullscreen-back"
          onClick={handleClose}
          aria-label="뒤로"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M 12 4 L 6 10 L 12 16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="ai-fullscreen-title">
          <span>AI 자격상담사</span>
          <span className="ai-fullscreen-beta">beta</span>
        </div>
        <div className="ai-fullscreen-spacer" />
      </header>
      <ChatPanelBody allListings={LH_LISTINGS} focusListing={focusListing} />
    </div>
  );
}

export default function AiPage() {
  return (
    <Suspense fallback={<div className="ai-fullscreen" />}>
      <AiPageInner />
    </Suspense>
  );
}
