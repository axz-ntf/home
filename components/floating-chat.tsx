"use client";

import { useRouter } from "next/navigation";
import { CloseIcon } from "./icons";
import { ChatPanelBody } from "./chat-panel-body";
import type { Listing } from "@/lib/types";

export function FloatingChat({
  open,
  onOpenChange,
  shifted = false,
  allListings = [],
  hidden = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shifted?: boolean;
  allListings?: Listing[];
  // 상세 옆 도킹 AI 패널이 열렸을 땐 FAB·플로팅챗을 숨겨 겹침 방지.
  hidden?: boolean;
}) {
  const router = useRouter();

  if (hidden) return null;

  const handleFabClick = () => {
    // 모바일 viewport: 풀스크린 라우트로 — overlay 대신 별도 페이지.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      router.push("/ai");
      return;
    }
    onOpenChange(true);
  };

  // X 닫기 = 명시적 종료 → 다음 열기 때 새 대화로.
  // 페이지 이동 후 복귀는 sessionStorage 가 유지하므로 영향 없음.
  const handleExplicitClose = () => {
    if (typeof window !== "undefined") {
      try { sessionStorage.removeItem("doongji:ai-chat:messages"); } catch {}
    }
    onOpenChange(false);
  };

  return (
    <>
      {!open && (
        <button
          className={`chat-fab ${shifted ? "shifted" : ""}`}
          onClick={handleFabClick}
          aria-label="AI 챗봇 열기"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ai-icon.svg" alt="" className="chat-fab-icon" />
        </button>
      )}
      {open && (
        <div className={`chat-panel ${shifted ? "shifted" : ""}`} key="chat-panel">
          <header className="chat-header">
            <div className="chat-header-title">
              <span className="chat-header-name">AI 자격상담사</span>
              <span className="chat-header-beta">beta</span>
            </div>
            <button className="chat-close" onClick={handleExplicitClose} aria-label="닫기">
              <CloseIcon size={16} />
            </button>
          </header>
          <ChatPanelBody allListings={allListings} />
        </div>
      )}
    </>
  );
}
