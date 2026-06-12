"use client";

import { useState, useEffect } from "react";
import type { Listing } from "@/lib/types";
import { HOUSING_TYPES, STATUS_LABELS } from "@/lib/mock-data";
import { thumbnailSVG } from "@/lib/svg";
import { calcDday, isRegularRecruitment, effectiveStatus } from "@/lib/dday";
import { applyUrlFor, infoUrlFor } from "@/lib/notice-match";
import { NaverPanorama } from "./naver-panorama";
import { CloseIcon, HeartIcon } from "./icons";
import { EligibilityDetail } from "./eligibility-detail";
import { formatManwon } from "@/lib/format";
import { nearestStation } from "@/lib/subway";
import { useSavedListings } from "@/lib/use-saved";
import { TypeIntro, accentVars } from "./detail-type";
import { summarizePrice, type Range } from "@/lib/price-summary";
import { FloorplanSection } from "./floorplan-section";

// 임대 조건 요약 — 모든 매물 공통 골격 (스펙: 범위로 표시, 정보 없으면 행 자체 미표시).
// 가격 모델이 무엇이든 summarizePrice 가 범위로 정규화.
function RentSummarySection({ item }: { item: Listing }) {
  const s = summarizePrice(item);
  const fmtRange = (r: Range) =>
    r.min === r.max ? formatManwon(r.min) : `${formatManwon(r.min)} ~ ${formatManwon(r.max)}`;
  const fmtM2 = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
  const fmtAreaRange = (r: Range) =>
    r.min === r.max ? `${fmtM2(r.min)}㎡` : `${fmtM2(r.min)} ~ ${fmtM2(r.max)}㎡`;

  const cells: { label: string; value: string; full?: boolean }[] = [];
  if (item.type === "sale") {
    const sale = s.deposit ?? (item.salePriceManwon ? { min: item.salePriceManwon, max: item.salePriceManwon } : undefined);
    if (sale) cells.push({ label: "분양가", value: fmtRange(sale), full: true });
  } else if (s.supportLimit) {
    cells.push({ label: "전세 지원한도", value: fmtRange(s.supportLimit), full: true });
  } else {
    const isJeonse = item.type === "jeonse" || (!s.rent && /전세/.test(item.title ?? ""));
    if (s.deposit) cells.push({ label: isJeonse ? "전세보증금" : "보증금", value: fmtRange(s.deposit), full: !s.rent });
    if (s.rent) cells.push({ label: "월세", value: fmtRange(s.rent), full: !s.deposit });
  }
  if (s.areaM2) cells.push({ label: "전용면적", value: fmtAreaRange(s.areaM2), full: true });

  const isRanged = [s.deposit, s.rent, s.supportLimit].some((r) => r && r.min < r.max);

  return (
    <section className="detail-section">
      <h3>{item.type === "sale" ? "분양 조건" : "임대 조건"}</h3>
      {cells.length > 0 ? (
        <div className="detail-price" style={{ marginBottom: 0 }}>
          {cells.map((c) => (
            <div key={c.label} className={`detail-price-cell${c.full ? " detail-price-cell--full" : ""}`}>
              <div className="detail-price-label">{c.label}</div>
              <div className="detail-price-value">{c.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="detail-price" style={{ marginBottom: 0 }}>
          <div className="detail-price-cell detail-price-cell--full">
            <div className="detail-price-label">{item.type === "sale" ? "분양 조건" : "임대조건"}</div>
            <div className="detail-price-value">
              <span style={{ fontSize: 14, marginRight: 8 }}>단지별 상이</span>
              {item.sourceUrl && (
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="detail-confirm-link">원문 보기 →</a>
              )}
            </div>
          </div>
        </div>
      )}
      {isRanged && (
        <p style={{ fontSize: 11.5, color: "var(--seed-semantic-color-ink-text-low)", margin: "8px 0 0" }}>
          계층·평형에 따라 달라요. 정확한 조건은 상세에서 확인하세요.
        </p>
      )}
      {/* 면적 등은 있지만 가격이 없는 경우 — 어디서 확인할지 안내 */}
      {cells.length > 0 && !s.deposit && !s.rent && !s.supportLimit && item.type !== "sale" && item.sourceUrl && (
        <p style={{ fontSize: 12, margin: "8px 0 0" }}>
          보증금·월세는{" "}
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="detail-confirm-link">공고문에서 확인 →</a>
        </p>
      )}
    </section>
  );
}

// 모집 일정 타임라인 (개선안1차) — 공고등록→접수시작→접수마감→당첨자발표.
// 있는 단계만 표시(2개 미만이면 섹션 생략). 지난 단계는 회색, 다음 단계 강조.
function ScheduleTimeline({ item }: { item: Listing }) {
  const steps = [
    { label: "공고 등록", date: item.announceDate },
    { label: "접수 시작", date: item.beginDate },
    { label: "접수 마감", date: item.deadline },
    { label: "당첨자 발표", date: item.winnerAt },
  ].filter((s): s is { label: string; date: string } => Boolean(s.date));
  if (steps.length < 2) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPast = (d: string) => {
    const m = d.match(/^(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
    if (!m) return false;
    return new Date(+m[1], +m[2] - 1, +m[3]).getTime() < today.getTime();
  };
  // 다음 단계 = 아직 안 지난 첫 단계
  const nextIdx = steps.findIndex((s) => !isPast(s.date));

  // "접수 마감" 단계가 강조되면 모집중인데도 마감처럼 읽힌다 —
  // 제목 옆 현재 상태 칩 + 마감 단계에 D-day 를 붙여 진행 상태를 명시.
  const status = effectiveStatus(item.status, item.deadline, item.beginDate);
  const statusLabel = STATUS_LABELS[status];
  const dday = status !== "closed" ? calcDday(item.deadline) : "";

  return (
    <section className="detail-section">
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        모집 일정
        <span style={{
          fontSize: 11, fontWeight: 700, lineHeight: 1,
          padding: "4px 8px", borderRadius: 999,
          color: "white", background: statusLabel.color,
        }}>{statusLabel.text}</span>
      </h3>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
        {steps.map((s, i) => {
          const past = isPast(s.date);
          const isNext = i === nextIdx;
          return (
            <li key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderBottom: i < steps.length - 1 ? "1px solid var(--seed-scale-color-gray-100)" : "none" }}>
              <span style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800,
                background: isNext ? "var(--seed-semantic-color-primary)" : past ? "var(--seed-scale-color-gray-200)" : "var(--seed-scale-color-gray-100)",
                color: isNext ? "white" : "var(--seed-semantic-color-ink-text-low)",
              }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: isNext ? 700 : 500, color: past ? "var(--seed-semantic-color-ink-text-low)" : "var(--seed-semantic-color-ink-text)" }}>
                {s.label}
                {isNext && s.label === "접수 마감" && dday && (
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: "var(--seed-semantic-color-primary)" }}>{dday}</span>
                )}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: isNext ? 700 : 500, color: past ? "var(--seed-semantic-color-ink-text-low)" : "var(--seed-semantic-color-ink-text)" }}>
                {s.date}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ListingPhotos({ item }: { item: Listing }) {
  const cover = item.coverPhotoUrl;
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // 라이트박스 열려있을 때 ESC 로 닫기 + body scroll 잠금
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxOpen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxOpen]);

  // 골격 통일 — 조감도가 없어도 섹션 자리는 유지하고 정제된 안내로 채운다.
  if (!cover) {
    return (
      <section className="detail-section detail-photos">
        <h3>단지 조감도</h3>
        <div className="detail-empty-notice" style={{ marginBottom: 0 }}>
          <div className="detail-empty-notice-sub">이 공고는 조감도 이미지가 제공되지 않았어요.</div>
        </div>
      </section>
    );
  }
  return (
    <section className="detail-section detail-photos">
      <h3>단지 조감도</h3>
      <button
        type="button"
        className="detail-photo-card"
        onClick={() => setLightboxOpen(true)}
        aria-label="조감도 크게 보기"
      >
        <div className="detail-photo-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="detail-photo-img"
            src={cover}
            alt={`${item.title} 단지 조감도`}
            referrerPolicy="no-referrer"
          />
        </div>
      </button>
      {lightboxOpen && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="조감도 확대 보기"
        >
          <button
            type="button"
            className="lightbox-close"
            onClick={() => setLightboxOpen(false)}
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M 5 5 L 15 15 M 15 5 L 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="lightbox-img"
            src={cover}
            alt={`${item.title} 단지 조감도 확대`}
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}

export function DetailPanel({
  item,
  open,
  onClose,
}: {
  item: Listing | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  // N1: 하트 = 실제 저장(localStorage). 저장 목록은 /saved 에서 모아보기.
  const { isSaved, toggle } = useSavedListings();
  if (!item) return <div className={`detail-panel ${open ? "open" : ""}`} />;
  const liked = isSaved(item.id);

  const svg = thumbnailSVG(item.thumbSeed, item.type);
  const effStatus = effectiveStatus(item.status, item.deadline, item.beginDate);
  const status = STATUS_LABELS[effStatus];
  const housingType = HOUSING_TYPES.find((t) => t.id === item.type);
  const applyUrl = applyUrlFor(item.type);
  const infoUrl = infoUrlFor(item.type);
  const nearStation = nearestStation(item.lat, item.lng);
  // 청약 신청 버튼 — raw status 대신 effStatus 기반 (sync stale 보정 반영)
  const isRecurring = isRegularRecruitment(item.deadline, item.status);
  const applyButton: { label: string; active: boolean } = isRecurring
    ? { label: "공고 확인 →", active: true }
    : effStatus === "open" || effStatus === "closing"
      ? { label: "청약 신청하기 →", active: true }
      : effStatus === "upcoming"
        ? { label: "접수 예정", active: false }
        : { label: "접수 마감", active: false };

  return (
    <aside className={`detail-panel ${open ? "open" : ""}`} style={accentVars(item.type)}>
      <button className="detail-close" onClick={onClose}>
        <CloseIcon size={16} />
      </button>

      <div className="detail-hero">
        <NaverPanorama
          lat={item.lat}
          lng={item.lng}
          fallback={
            <div
              style={{ width: "100%", height: "100%" }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          }
        />
      </div>

      <div className="detail-body">
        <div className="detail-eyebrow">
          <span className="detail-agency-tag">
            {item.agency} · {item.district}
          </span>
        </div>
        {/* M3: 단지명을 제목으로, 공고명 전체는 부제로 (단지명 없으면 공고명이 제목) */}
        <h1 className="detail-title">{item.complexName || item.title}</h1>
        {item.complexName && (
          <div style={{ fontSize: 12.5, color: "var(--seed-semantic-color-ink-text-low)", marginTop: -6, marginBottom: 8 }}>
            {item.title}
          </div>
        )}
        {item.address && <div className="detail-address">{item.address}</div>}

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {housingType && (
            <span className={`badge ${housingType.badge}`} style={{ fontSize: 12, padding: "4px 9px" }}>
              {/* SH 는 자체 청약유형(청년안심주택 등) 그대로 (M4) */}
              {item.agency === "SH" && item.suplyTyNm ? item.suplyTyNm : housingType.name}
            </span>
          )}
          <span className="badge agency" style={{ fontSize: 12, padding: "4px 9px" }}>
            {item.agency} 공급
          </span>
          <span
            className="badge"
            style={{
              fontSize: 12,
              padding: "4px 9px",
              background: status.color + "22",
              color: status.color,
            }}
          >
            · {status.text}
          </span>
        </div>

        <TypeIntro item={item} />

        {isRegularRecruitment(item.deadline, item.status) ? (
          <div className="detail-empty-notice">
            <div className="detail-empty-notice-title">정례모집 단지</div>
            <div className="detail-empty-notice-sub">
              이 단지는 정해진 회차마다 모집해요. 현재 회차 접수가 끝났더라도 다음 회차에 다시 신청할 수 있습니다. 일정은 &lsquo;LH 청약플러스&rsquo;에서 확인하세요.
            </div>
          </div>
        ) : item.deadline ? (
          <div className="detail-deadline">
            <div>
              <div className="detail-deadline-label">모집 마감</div>
              <div className="detail-deadline-date">{item.deadline.replace(/\./g, ". ")} 18:00까지</div>
            </div>
            <div className="detail-deadline-dday">{calcDday(item.deadline)}</div>
          </div>
        ) : (
          <div className="detail-empty-notice">
            <div className="detail-empty-notice-title">현재 단지별 모집 공고 없음</div>
            <div className="detail-empty-notice-sub">
              공실 발생 시 LH/마이홈에서 별도 공고됩니다. 아래 버튼으로 직접 확인하세요.
            </div>
          </div>
        )}

        <ScheduleTimeline item={item} />

        <ListingPhotos item={item} />
        <FloorplanSection listingId={item.id} />
        {/* 임대 조건 — 모든 매물 공통 골격: 범위 요약 1차 노출, 모델별 상세 표는 접기 */}
        <RentSummarySection item={item} />

        <section className="detail-section">
          <EligibilityDetail listingId={item.id} sourceUrl={item.sourceUrl} housingType={item.type} />
        </section>

        <section className="detail-section">
          <h3>기본 정보</h3>
          <dl className="detail-specs">
            {/* 골격 통일 — 핵심 행(공급유형·세대수·접수기간)은 항상 표시, 없으면 "—".
                부가 행(공고명·총세대·난방·교통)은 값이 있을 때만. */}
            {item.pblancNm ? (
              <>
                <dt>공고명</dt>
                <dd>{item.pblancNm}</dd>
              </>
            ) : null}
            {/* 주택 종류 — 단지 매칭·제도 기본값 어느 쪽도 없으면(전세임대·분양 일부) 행 숨김 */}
            {item.buildingType ? (
              <>
                <dt>주택 종류</dt>
                <dd>{item.buildingType}</dd>
              </>
            ) : null}
            <dt>공급 세대 수</dt>
            <dd>{item.supplyUnits ? `${item.supplyUnits}세대` : "—"}</dd>
            {item.totalUnits ? (
              <>
                <dt>총 세대 수</dt>
                <dd>{item.totalUnits}세대</dd>
              </>
            ) : null}
            <dt>접수 기간</dt>
            <dd>
              {item.beginDate || item.deadline
                ? `${item.beginDate || "공고문 참조"} ~ ${item.deadline || "공고문 참조"}`
                : "—"}
            </dd>
            {item.heatMethod ? (
              <>
                <dt>난방</dt>
                <dd>{item.heatMethod}</dd>
              </>
            ) : null}
            {nearStation ? (
              <>
                <dt>교통</dt>
                <dd>{nearStation.name}역 도보 {nearStation.walkMin}분</dd>
              </>
            ) : null}
          </dl>
        </section>

        {/* 공고문 원문(PDF) 은 보조 링크로 — 1차 행동은 AI 자격확인 */}
        <a
          className="detail-notice-link"
          href={item.noticePdfUrl ?? item.sourceUrl ?? infoUrl}
          target="_blank"
          rel="noreferrer"
        >
          📄 {item.noticePdfUrl ? "공고문 PDF 원문" : "공고문 원문"} 보기 →
        </a>

        <div className="detail-actions">
          <button
            className={`icon-btn ${liked ? "active" : ""}`}
            onClick={() => toggle(item.id)}
            aria-label="관심 목록"
          >
            <HeartIcon size={20} filled={liked} />
          </button>
          {/* 공고문을 임베딩한 AI 가 이 공고 자격을 바로 상담 */}
          <a
            className="secondary"
            href={`/ai?focus=${encodeURIComponent(item.id)}`}
            style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            ✨ AI로 자격 확인하기
          </a>
          {applyButton.active ? (
            <a
              className="primary"
              href={applyUrl}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {applyButton.label}
            </a>
          ) : (
            <button
              className="primary disabled"
              disabled
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {applyButton.label}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
