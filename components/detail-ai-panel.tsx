"use client";

import { CloseIcon } from "./icons";
import { ChatPanelBody } from "./chat-panel-body";
import type { Listing } from "@/lib/types";

// PC 상세 옆에 도킹되는 공고 스코프 AI 상담 컬럼 (모바일은 /ai 풀스크린 라우트 사용).
export function DetailAiPanel({
  listing,
  allListings,
  onClose,
}: {
  listing: Listing;
  allListings: Listing[];
  onClose: () => void;
}) {
  return (
    <aside className="detail-ai-panel">
      <header className="detail-ai-header">
        <div className="detail-ai-title">
          <span className="detail-ai-name">AI 자격상담사</span>
          <span className="detail-ai-beta">beta</span>
        </div>
        <button className="detail-ai-close" onClick={onClose} aria-label="닫기">
          <CloseIcon size={16} />
        </button>
      </header>
      {/* key=공고id — 다른 공고로 바뀌면 대화 새로 시작 */}
      <ChatPanelBody key={listing.id} allListings={allListings} focusListing={listing} />
    </aside>
  );
}
