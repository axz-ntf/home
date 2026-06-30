"use client";

// AI 챗 본체 — useChat + welcome + messages + input.
// desktop `FloatingChat` 와 모바일 `/ai` 풀스크린 라우트 양쪽에서 재사용.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import type { Listing } from "@/lib/types";
import { loadProfile, summarizeEligibility } from "@/lib/profile";
import { ChatListingCarousel } from "./chat-listing-carousel";
import { ChatSuggestionChips, type SuggestionAction } from "./chat-suggestion-chips";

function useTypewriter(target: string, enabled: boolean) {
  const [displayed, setDisplayed] = useState("");
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setDisplayed((prev) => {
        const t = targetRef.current;
        if (prev === t) return prev;
        if (!t.startsWith(prev)) return t;
        return t.slice(0, prev.length + 1);
      });
    }, 20);
    return () => clearInterval(id);
  }, [enabled]);

  return enabled ? displayed : target;
}

function MessageBubble({ message, animate }: { message: UIMessage; animate: boolean }) {
  const isUser = message.role === "user";
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
  const shown = useTypewriter(text, !isUser && animate);
  // text 가 비어 있으면 (tool 호출만 있고 텍스트 없음) 버블 숨김
  if (!text) return null;
  return (
    <div className={`chat-msg ${isUser ? "user" : "ai"}`}>
      <div className="chat-bubble">
        {isUser ? (
          shown
        ) : (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="chat-md-p">{children}</p>,
              strong: ({ children }) => <strong className="chat-md-strong">{children}</strong>,
              ul: ({ children }) => <ul className="chat-md-ul">{children}</ul>,
              ol: ({ children }) => <ol className="chat-md-ol">{children}</ol>,
              li: ({ children }) => <li className="chat-md-li">{children}</li>,
              h1: ({ children }) => <strong className="chat-md-strong">{children}</strong>,
              h2: ({ children }) => <strong className="chat-md-strong">{children}</strong>,
              h3: ({ children }) => <strong className="chat-md-strong">{children}</strong>,
              hr: () => <hr className="chat-md-hr" />,
              code: ({ children }) => <code className="chat-md-code">{children}</code>,
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noreferrer" className="chat-md-a">
                  {children}
                </a>
              ),
            }}
          >
            {shown}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

// AI SDK v6: 타입드 tool 의 결과 파트는 `tool-${toolName}` 타입으로 들어옴.
// state === "output-available" 일 때 output 에 execute 반환값이 담김.
// type prefix 의존하지 않고 output shape 으로 어떤 tool 결과인지 판별 (false-positive 없음).
type RecItem = { id: string; reasons?: string[] };
type ToolPart = {
  type: string;
  state?: string;
  output?: { items?: RecItem[]; actions?: SuggestionAction[] };
};

function extractRecommendedItems(m: UIMessage): RecItem[] {
  if (m.role !== "assistant") return [];
  const out: RecItem[] = [];
  for (const p of m.parts as unknown as ToolPart[]) {
    if (p.state === "output-available" && Array.isArray(p.output?.items)) {
      for (const it of p.output.items) {
        if (it && typeof it.id === "string") out.push(it);
      }
    }
  }
  return out;
}

function extractSuggestedActions(m: UIMessage): SuggestionAction[] {
  if (m.role !== "assistant") return [];
  const out: SuggestionAction[] = [];
  for (const p of m.parts as unknown as ToolPart[]) {
    if (p.state === "output-available" && Array.isArray(p.output?.actions)) {
      // label/query 모두 string 인 항목만
      for (const a of p.output.actions) {
        if (a && typeof a.label === "string" && typeof a.query === "string") {
          out.push({ label: a.label, query: a.query });
        }
      }
    }
  }
  return out;
}

// 페이지 이동 → 복귀 시 대화 이어가기 위한 sessionStorage 키.
// localStorage 가 아니라 sessionStorage — 탭 닫으면 자동 초기화 (개인정보 노출 우려 ↓).
const CHAT_STORAGE_KEY = "doongji:ai-chat:messages";

export function ChatPanelBody({ allListings = [], focusListing }: { allListings?: Listing[]; focusListing?: Listing } = {}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(false);

  // 현재 보고 있는 매물 id 를 매 요청 body 에 실어 서버가 공고문 RAG 를 그 매물로
  // scope 하게 한다. ref 로 최신값 추적 — transport 는 1회만 생성(재생성 시 useChat 혼란).
  const focusIdRef = useRef(focusListing?.id);
  focusIdRef.current = focusListing?.id;

  // 로그인 사용자의 저장된 자격 → 요청마다 body 로 실어 AI 가 다시 묻지 않고 맞춤 상담.
  const eligibilityRef = useRef<string | null>(null);
  useEffect(() => {
    loadProfile().then((form) => {
      eligibilityRef.current = form ? summarizeEligibility(form) : null;
    });
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, id, body }) => ({
          body: { ...body, id, messages, focusListingId: focusIdRef.current, eligibility: eligibilityRef.current },
        }),
      }),
    [],
  );

  const { messages, setMessages, sendMessage, status } = useChat({ transport });

  // 마운트 1회: sessionStorage 에서 메시지 복원
  useEffect(() => {
    if (typeof window === "undefined") {
      setHydrated(true);
      return;
    }
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // 손상된 데이터면 무시하고 빈 상태로 시작
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // messages 변경 시 저장 (hydrate 끝난 뒤에만)
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      if (messages.length === 0) sessionStorage.removeItem(CHAT_STORAGE_KEY);
      else sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // quota 초과 등 — 무시
    }
  }, [messages, hydrated]);


  // ID → Listing 빠른 lookup
  const listingMap = useMemo(() => {
    const m = new Map<string, Listing>();
    for (const l of allListings) m.set(l.id, l);
    return m;
  }, [allListings]);

  const lastMsg = messages[messages.length - 1];
  const lastIsAssistant = lastMsg?.role === "assistant";
  const hasAssistantText =
    lastIsAssistant &&
    lastMsg.parts.some((p) => p.type === "text" && p.text.length > 0);
  const showTyping =
    status === "submitted" || (status === "streaming" && !hasAssistantText);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || status !== "ready") return;
    sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <>
      <div className="chat-body" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-logo" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ai-icon.svg" alt="" />
            </div>
            {focusListing ? (
              <>
                <div className="chat-welcome-lines">
                  <div><strong>{focusListing.complexName || focusListing.title}</strong></div>
                  <div>이 공고에 대해 무엇이든 물어보세요.</div>
                  <div>공고문을 읽고 답해드릴게요 ☺️</div>
                </div>
                <div className="chat-questions">
                  <div className="chat-questions-title">이런 게 궁금하지 않으세요?</div>
                  {[
                    "이 공고 입주 자격이 어떻게 되나요?",
                    "소득·자산 기준 알려주세요",
                    "보증금·임대료가 얼마예요?",
                    "접수 일정이 언제예요?",
                  ].map((q) => (
                    <button
                      key={q}
                      className="chat-question"
                      onClick={() => sendMessage({ text: `${focusListing.complexName || focusListing.title} — ${q}` })}
                    >
                      <span className="chat-question-icon" aria-hidden>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/ai-icon.svg" alt="" />
                      </span>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="chat-welcome-lines">
                  <div>안녕하세요!</div>
                  <div>
                    <strong>둥지 AI 상담사</strong>예요 ☺️
                  </div>
                  <div>공공임대·분양 자격이 고민이라면</div>
                  <div>조건에 맞춰 추천해드릴게요.</div>
                </div>
                <div className="chat-questions">
                  <div className="chat-questions-title">많은 분들이 자주 물어보시는 질문이에요.</div>
                  {[
                    "28살 청년 1인가구, 월소득 250만원인데 어디 지원 가능해?",
                    "신혼부부 무자녀, 맞벌이 월 600만원이에요. 행복주택 되나요?",
                    "행복주택과 국민임대 차이가 뭐예요?",
                  ].map((q) => (
                    <button
                      key={q}
                      className="chat-question"
                      onClick={() => sendMessage({ text: q })}
                    >
                      <span className="chat-question-icon" aria-hidden>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/ai-icon.svg" alt="" />
                      </span>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const recItems = extractRecommendedItems(m);
          const carouselItems = recItems
            .map((it) => {
              const listing = listingMap.get(it.id);
              return listing ? { listing, reasons: it.reasons ?? [] } : null;
            })
            .filter((x): x is { listing: Listing; reasons: string[] } => Boolean(x));
          const suggestions = extractSuggestedActions(m);
          const isLastAssistant = i === messages.length - 1 && m.role === "assistant";
          return (
            <Fragment key={m.id}>
              <MessageBubble message={m} animate={isLastAssistant} />
              {carouselItems.length > 0 && <ChatListingCarousel items={carouselItems} />}
              {suggestions.length > 0 && (
                <ChatSuggestionChips
                  actions={suggestions}
                  // 가장 최근 AI 메시지의 칩만 활성화 — 이전 칩은 시각적으로 남되 비활성
                  disabled={!isLastAssistant || status !== "ready"}
                  onSelect={(query) => sendMessage({ text: query })}
                />
              )}
            </Fragment>
          );
        })}
        {showTyping && (
          <div className="chat-msg ai">
            <div className="chat-bubble chat-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
      <form className="chat-input-row" onSubmit={handleSubmit}>
        <div className="chat-input-wrap">
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="원하는 조건을 입력해 보세요."
            rows={1}
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={status !== "ready" && status !== "error"}
          />
          <button
            type="submit"
            className="chat-send"
            disabled={!input.trim() || status === "submitted" || status === "streaming"}
            aria-label="전송"
          >
            ↑
          </button>
        </div>
        <p className="chat-disclaimer">
          AI 학습 데이터 기반의 답변으로, 실제와 차이가 있을 수 있습니다.
        </p>
      </form>
    </>
  );
}
