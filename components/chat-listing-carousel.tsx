"use client";

// AI 챗 메시지 하단에 끼워 넣는 추천 매물 가로 캐러셀.
// 카드 디자인: 1순위 칩 / 하트 / D-day pill / 다음부동산이 선택한 이유 / 상세보기 CTA.
// 페이지 인디케이터 도트 — 캐러셀 하단에 현재 카드 위치 표시.

import { useEffect, useRef, useState } from "react";
import { comma } from "@/lib/format";
import { useRouter } from "next/navigation";
import type { Listing } from "@/lib/types";
import { HOUSING_TYPES } from "@/lib/mock-data";
import { dDayText, effectiveStatus } from "@/lib/dday";
import { depositText, rentText } from "@/lib/price-label";
import { thumbnailSVG } from "@/lib/svg";

function rankLabel(idx: number): string {
  return `${idx + 1}순위`;
}

export type CarouselItem = { listing: Listing; reasons: string[] };

function CarouselCard({ item: { listing: item, reasons }, rank }: { item: CarouselItem; rank: number }) {
  const router = useRouter();
  const housing = HOUSING_TYPES.find((t) => t.id === item.type);
  const effStatus = effectiveStatus(item.status, item.deadline, item.beginDate);
  const dday = dDayText(item.deadline, effStatus);
  const svg = thumbnailSVG(item.thumbSeed, item.type);

  const priceText =
    item.type === "sale" && item.salePriceManwon && item.salePriceManwon > 0
      ? (() => {
          const eok = Math.floor(item.salePriceManwon / 10000);
          const man = item.salePriceManwon % 10000;
          return `분양가 ${eok > 0 ? `${eok}억 ` : ""}${man > 0 ? `${comma(man)}만` : ""}`.trim();
        })()
      : item.deposit > 0 || item.rent > 0
        ? [depositText(item) && `보 ${depositText(item)}`, rentText(item) && `월 ${rentText(item)}`].filter(Boolean).join(" · ")
        : "임대조건 공고문 확인";

  return (
    <article
      className="chat-rec-card"
      onClick={() => router.push(`/listings/${item.id}`)}
      role="button"
      tabIndex={0}
    >
      <div className="chat-rec-thumb">
        {item.coverPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.coverPhotoUrl}
            alt={item.title}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="chat-rec-thumb-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        )}
        <span className="chat-rec-rank">{rankLabel(rank)}</span>
        <button
          type="button"
          className="chat-rec-heart"
          aria-label="관심 매물에 저장"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path
              d="M 10 17 C 10 17 3 12 3 7.5 C 3 5 5 3 7.5 3 C 8.8 3 10 4 10 4 C 10 4 11.2 3 12.5 3 C 15 3 17 5 17 7.5 C 17 12 10 17 10 17 Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
        {dday && <span className={`chat-rec-dday ${effStatus}`} suppressHydrationWarning>{dday}</span>}
      </div>
      <div className="chat-rec-body">
        <div className="chat-rec-tags">
          {housing && <span className={`badge ${housing.badge}`}>{housing.name}</span>}
          <span className="badge agency">{item.agency}</span>
          {item.competition != null && (
            <span className="chat-rec-competition">경쟁률 {item.competition}:1</span>
          )}
        </div>
        <div className="chat-rec-title">{item.title}</div>
        <div className="chat-rec-price">{priceText}</div>
        <div className="chat-rec-meta">
          {item.area && <>{item.area}<span className="dot">·</span></>}
          {item.district}
        </div>
        {reasons.length > 0 && (
          <div className="chat-rec-reasons" aria-label="추천 이유">
            <div className="chat-rec-reasons-title">
              <span className="chat-rec-reasons-check" aria-hidden>
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M 2 5 L 4.2 7 L 8 3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              다음부동산이 선택한 이유
            </div>
            <div className="chat-rec-reasons-chips">
              {reasons.map((r, i) => (
                <span key={i} className="chat-rec-reason-chip">{r}</span>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className="chat-rec-cta"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/listings/${item.id}`);
          }}
        >
          상세 보기
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M 4 2 L 8 6 L 4 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </article>
  );
}

export function ChatListingCarousel({ items }: { items: CarouselItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // 가로 스크롤 시 현재 보이는 카드 인덱스 추적 — 도트 인디케이터 동기화.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const cards = el.querySelectorAll<HTMLElement>(".chat-rec-card");
      if (!cards.length) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let nearest = 0;
      let minDist = Infinity;
      cards.forEach((card, i) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(cardCenter - center);
        if (dist < minDist) { minDist = dist; nearest = i; }
      });
      setActiveIdx(nearest);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);

  if (!items.length) return null;
  return (
    <div className="chat-rec-wrap">
      <div className="chat-rec-carousel" role="region" aria-label="AI 추천 매물" ref={scrollRef}>
        {items.map((it, idx) => (
          <CarouselCard key={it.listing.id} item={it} rank={idx} />
        ))}
      </div>
      {items.length > 1 && (
        <div className="chat-rec-dots" aria-hidden>
          {items.map((_, i) => (
            <span key={i} className={`chat-rec-dot ${i === activeIdx ? "on" : ""}`} />
          ))}
        </div>
      )}
    </div>
  );
}
