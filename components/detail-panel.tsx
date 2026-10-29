"use client";

import { useState, useEffect } from "react";
import type { Listing } from "@/lib/types";
import { HOUSING_TYPES, STATUS_LABELS } from "@/lib/mock-data";
import { thumbnailSVG } from "@/lib/svg";
import { calcDday, isRegularRecruitment, effectiveStatus } from "@/lib/dday";
import { applyUrlFor, infoUrlFor } from "@/lib/notice-match";
import { NaverPanorama } from "./naver-panorama";
import { CloseIcon, HeartIcon } from "./icons";
import { DdsIcon } from "./dds-icon";
import "./dds-components.css";
import { EligibilityDetail } from "./eligibility-detail";
import { formatManwon } from "@/lib/format";
import { nearbyStations } from "@/lib/subway";
import { nearbySchools, type NearSchool } from "@/lib/schools";
import { AgencyBadge } from "./agency-badge";
import { useSavedListings } from "@/lib/use-saved";
import { accentVars } from "./detail-type";
import { summarizePrice, type Range } from "@/lib/price-summary";
import { FloorplanSection } from "./floorplan-section";
import { SiteSun3D, type Bldg } from "./site-sun-3d";
import { LoanCalculator } from "./loan-calculator";
import { Button } from "./button";
import { NoticeAttachments } from "./notice-attachments";
import { LocationInsight } from "./location-insight";
import { sendGAEvent } from "@next/third-parties/google";

// 주택형 드롭다운 — SH 매입임대는 주택형(32A/36A…) 단위로 신청(호실은 무작위 배정).
// 선택한 주택형의 면적·보증금·월세를 보여준다. 주택형별 가격이 없으면 단지 공통값으로 폴백.
function UnitTypePicker({ item, types }: { item: Listing; types: NonNullable<Listing["unitTypes"]> }) {
  const [idx, setIdx] = useState(0);
  const fmtM2 = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
  const t = types[Math.min(idx, types.length - 1)];
  // 주택형·전용면적 중심. 보증금은 단지 공통값이 있으면만, 월세는 주택형별로 신뢰 어려워 표시 안 함.
  const deposit = t.depositManwon ?? (item.deposit > 0 ? item.deposit : undefined);
  const totalUnits = types.reduce((sum, x) => sum + (x.units ?? 0), 0);

  const cells: { label: string; value: string; full?: boolean }[] = [];
  if (t.areaM2) cells.push({ label: "전용면적", value: `${fmtM2(t.areaM2)}㎡` });
  if (deposit != null) cells.push({ label: "보증금", value: formatManwon(deposit) });
  if (cells.length === 1) cells[0].full = true; // 단독이면 꽉 채움
  if (item.rentTerms?.residence) cells.push({ label: "거주기간", value: item.rentTerms.residence, full: true });

  return (
    <>
      <div className="detail-unit-field">
        <label htmlFor="sh-unit-type">주택형{totalUnits > 0 ? ` · 총 ${totalUnits}호 모집` : ""}</label>
        <select
          id="sh-unit-type"
          className="detail-unit-select"
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
        >
          {types.map((x, i) => (
            <option key={i} value={i}>
              {x.name}
              {x.areaM2 ? ` · ${fmtM2(x.areaM2)}㎡` : ""}
              {x.units ? ` · ${x.units}호` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="detail-price" style={{ marginBottom: 0 }}>
        {cells.map((c) => (
          <div key={c.label} className={`detail-price-cell${c.full ? " detail-price-cell--full" : ""}`}>
            <div className="detail-price-label">{c.label}</div>
            <div className="detail-price-value">{c.value}</div>
          </div>
        ))}
      </div>
      <p style={{ display: "flex", alignItems: "center", gap: "var(--dds-spacing-8)", fontSize: "var(--dds-typography-label-normal-size)", color: "var(--dds-text-quaternary)", margin: "var(--dds-spacing-12) 0 0" }}>
        <DdsIcon name="info" style={{ flexShrink: 0, fontSize: "var(--dds-typography-caption-normal-size)" }} />
        보증금·월세는 주택형·호실별로 달라요.
      </p>
    </>
  );
}

// 임대 조건 요약 — 모든 매물 공통 골격 (스펙: 범위로 표시, 정보 없으면 행 자체 미표시).
// 가격 모델이 무엇이든 summarizePrice 가 범위로 정규화.
function RentSummarySection({ item }: { item: Listing }) {
  // SH 매입임대 등 주택형 옵션이 2개 이상이면 드롭다운으로 (단지 공통 범위 표 대신).
  const unitTypes = item.unitTypes;
  if (item.type !== "sale" && unitTypes && unitTypes.length >= 2) {
    return (
      <section className="detail-section">
        <h3>임대 조건</h3>
        <UnitTypePicker item={item} types={unitTypes} />
      </section>
    );
  }
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
  if (item.rentTerms?.residence) cells.push({ label: "거주기간", value: item.rentTerms.residence, full: true });

  // 보증금이 호실별 감정가로 책정되는 유형(매입임대·기숙사형 등) — 고정 가격표가 없어
  // 공고문 확인이 필요한 "이유"로 안내. (감정가 비율 같은 메커니즘은 노출하지 않음.)
  const perUnitPriced = Boolean(item.rentTerms?.depositBasis);

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
              <span style={{ fontSize: "var(--dds-typography-caption-normal-size)", marginRight: "var(--dds-spacing-8)" }}>단지별 상이</span>
              {item.sourceUrl && (
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="detail-confirm-link">원문 보기 <DdsIcon name="arrow-up-right" size={16}/></a>
              )}
            </div>
          </div>
        </div>
      )}
      {isRanged && (
        <p style={{ fontSize: "var(--dds-typography-label-normal-size)", color: "var(--dds-text-quaternary)", margin: "var(--dds-spacing-8) 0 0" }}>
          계층·평형에 따라 달라요. 정확한 조건은 상세에서 확인하세요.
        </p>
      )}
      {/* 광역 공고(든든전세·매입임대) — 첨부 주택목록에서 뽑은 단지별 실보증금 */}
      {(item.housingGroups?.length ?? 0) > 0 && (
        <div className="detail-hg">
          <div className="detail-hg-title">공급 주택 ({item.housingGroups!.reduce((s, g) => s + g.units, 0)}호)</div>
          {item.housingGroups!.map((g) => (
            <div key={g.label} className="detail-hg-row">
              <span className="detail-hg-name">{g.label}</span>
              <span className="detail-hg-units">{g.units}호</span>
              <span className="detail-hg-price">
                {g.depMin
                  ? g.depMin === g.depMax
                    ? `보증금 ${formatManwon(g.depMin)}`
                    : `보증금 ${formatManwon(g.depMin)}~${formatManwon(g.depMax!)}`
                  : "공고문 확인"}
                {g.rentMin ? ` · 월 ${g.rentMin === g.rentMax ? g.rentMin : `${g.rentMin}~${g.rentMax}`}만` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* 면적 등은 있지만 가격이 없는 경우 — 안내만(링크 제거, 공고문은 하단 PDF 버튼으로). */}
      {cells.length > 0 && !s.deposit && !s.rent && !s.supportLimit && item.type !== "sale" && (
        <p style={{ display: "flex", alignItems: "center", gap: "var(--dds-spacing-8)", fontSize: "var(--dds-typography-label-normal-size)", color: "var(--dds-text-quaternary)", margin: "var(--dds-spacing-12) 0 0" }}>
          <DdsIcon name="info" style={{ flexShrink: 0, fontSize: "var(--dds-typography-caption-normal-size)" }} />
          <span>{perUnitPriced ? "보증금·월세가 호실마다 달라요." : "보증금·월세는 공고문에서 확인하세요."}</span>
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
  // 현재 국면 = 마지막으로 지난 마일스톤. 접수중이면 "접수 시작"(진행 중인 국면)이 강조되고,
  // 마감이 지나면 "접수 마감"이 강조된다. (다음 단계가 아니라 "지금 어디" 를 표시 —
  // 접수중인데 마감 단계가 강조되던 문제 수정.)
  let activeIdx = -1;
  steps.forEach((s, i) => { if (isPast(s.date)) activeIdx = i; });
  if (activeIdx < 0) activeIdx = 0; // 아직 아무 단계도 안 지남(모집예정) → 첫 단계

  const status = effectiveStatus(item.status, item.deadline, item.beginDate);
  const statusLabel = STATUS_LABELS[status];
  const dday = status !== "closed" ? calcDday(item.deadline) : "";
  // 상태(접수중/모집예정)는 섹션 헤더 배지로만 표시 — 단계 옆 인라인 태그는 "공고 등록 접수중"
  // 처럼 단계명과 붙어 헷갈려서 제거. D-day 만 접수 마감 단계에 붙인다.

  return (
    <section className="detail-section">
      <h3 style={{ display: "flex", alignItems: "center", gap: "var(--dds-spacing-8)" }}>
        모집 일정
        <span style={{
          fontSize: "var(--dds-typography-label-normal-size)", fontWeight: 700, lineHeight: 1,
          padding: "var(--dds-spacing-4) var(--dds-spacing-8)", borderRadius: "var(--dds-radius-100)",
          color: "white", background: statusLabel.color,
        }}>{statusLabel.text}</span>
      </h3>
      <ol className="dds-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const past = isPast(s.date);
          const state = i === activeIdx ? "now" : past ? "done" : "next";
          return (
            <li key={s.label} className={`dds-step dds-step--${state}`}>
              <i aria-hidden />
              <b>{s.label}</b>
              <span suppressHydrationWarning>
                {s.date.replace(/^\d{4}\./, "")}
                {s.label === "접수 마감" && dday ? ` · ${dday}` : ""}
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

  // 조감도가 없으면 섹션 자체를 생략 (빈 안내 미표시).
  if (!cover) return null;
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
            <DdsIcon name="close" size={24}/>
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

// 모집 상태 → DDS 배지 (접수중은 파랑 강조, 마감임박은 빨강, 나머지는 회색)
const STATUS_BADGE = {
  open: { variant: "weak", color: "primary" },
  closing: { variant: "solid", color: "accent" },
  upcoming: { variant: "outline", color: "secondary" },
  closed: { variant: "solid", color: "secondary" },
} as const;

// 이 집에 드는 햇빛 — 조감도·공고문에서 뽑은 동 배치(lib/site-layouts)가 있는 단지만.
// 배치 0~1 좌표를 대지 300×240m 로 환산 (조감도 기준 추정, 방위는 정남향 가정).
const SITE_W = 300, SITE_D = 240;
function SunSection({ item }: { item: Listing }) {
  const [site, setSite] = useState<Bldg[] | null>(null);
  useEffect(() => {
    setSite(null);
    if (!item.lat || !item.lng) return;
    let alive = true;
    fetch(`/api/site-layout/${encodeURIComponent(item.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.ok) return;
        const bs = (j.data.buildings as { id: string; type: string; floors: number; x: number; y: number; widthRel: number }[]).map((b) => ({
          id: b.id.replace(/동$/, ""),
          floors: Math.max(3, Math.round(b.floors)),
          cx: b.x * SITE_W,
          cy: b.y * SITE_D,
          w: Math.max(20, b.widthRel * SITE_W),
          d: b.type === "탑상형" ? 22 : 16,
          tower: b.type === "탑상형",
        }));
        if (bs.length) setSite(bs);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [item.id, item.lat, item.lng]);
  if (!site) return null;
  return (
    <section className="detail-section">
      <h3>이 집에 드는 햇빛 <span className="detail-section-note">동·층·계절별 직사광</span></h3>
      <SiteSun3D lat={item.lat} lng={item.lng} site={site} />
    </section>
  );
}

export function DetailPanel({
  item,
  open,
  onClose,
  onAskAI,
}: {
  item: Listing | null | undefined;
  open: boolean;
  onClose: () => void;
  // 제공되면(PC 앱셸) 상세 옆 컬럼으로 AI 상담 — 없으면(단독 페이지) /ai 라우트로.
  onAskAI?: (id: string) => void;
}) {
  // N1: 하트 = 실제 저장(localStorage). 저장 목록은 /saved 에서 모아보기.
  const { isSaved, toggle } = useSavedListings();

  // 주변 초등학교 — schools.json 동적 import(코드 스플릿), 매물 변경 시 비동기 로드.
  const [nearSchools, setNearSchools] = useState<NearSchool[]>([]);
  useEffect(() => {
    let alive = true;
    nearbySchools(item?.lat, item?.lng).then((r) => { if (alive) setNearSchools(r); });
    return () => { alive = false; };
  }, [item?.lat, item?.lng]);

  if (!item) return <div className={`detail-panel ${open ? "open" : ""}`} />;
  const liked = isSaved(item.id);

  const svg = thumbnailSVG(item.thumbSeed, item.type);
  const effStatus = effectiveStatus(item.status, item.deadline, item.beginDate);
  const status = STATUS_LABELS[effStatus];
  const housingType = HOUSING_TYPES.find((t) => t.id === item.type);
  const applyUrl = applyUrlFor(item.type);
  const infoUrl = infoUrlFor(item.type);
  const nearby = nearbyStations(item.lat, item.lng);
  // 청약 신청 버튼 — raw status 대신 effStatus 기반 (sync stale 보정 반영)
  const isRecurring = isRegularRecruitment(item.deadline, item.status);
  const applyButton: { label: string; active: boolean } = isRecurring
    ? { label: "공고 확인", active: true }
    : effStatus === "open" || effStatus === "closing"
      ? { label: "신청하러 가기", active: true }
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
        <div className="detail-badges">
          {housingType && (
            <span className={`badge ${housingType.badge}`} style={{ fontSize: "var(--dds-typography-label-normal-size)", padding: "var(--dds-spacing-4) var(--dds-spacing-8)" }}>
              {/* SH 는 자체 청약유형(청년안심주택 등) 그대로 (M4) */}
              {item.agency === "SH" && item.suplyTyNm ? item.suplyTyNm : housingType.name}
            </span>
          )}
          <AgencyBadge agency={item.agency} className="detail-agency-badge" />
          <dds-badge {...STATUS_BADGE[effStatus]} size="sm">
            {status.text}
          </dds-badge>
        </div>
        {/* M3: 단지명을 제목으로, 공고명 전체는 부제로 (단지명 없으면 공고명이 제목) */}
        <h1 className="detail-title">{item.complexName || item.title}</h1>
        {item.complexName && (
          <div style={{ fontSize: "var(--dds-typography-caption-normal-size)", color: "var(--dds-text-quaternary)", marginTop: "calc(-1 * var(--dds-spacing-8))", marginBottom: "var(--dds-spacing-8)" }}>
            {item.title}
          </div>
        )}
        {item.address && (
          <div className="detail-address">
            {item.address}
            {item.coordApprox && <span className="detail-approx-chip">대표 위치</span>}
          </div>
        )}
        {item.coordApprox && (
          <p className="detail-approx-note">
            이 공고는 대기자 모집이에요. 실제 주택은 빈집이 나오면 순번대로 안내되며, 지도의 핀은
            지역 대표 위치입니다.
          </p>
        )}



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
            <div className="detail-deadline-dday" suppressHydrationWarning>{calcDday(item.deadline)}</div>
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
        {/* 대출 계산기 — 기금 전월세 대출 시뮬레이션 (분양·보증금 없는 매물은 내부에서 미표시) */}
        <LoanCalculator item={item} />

        <section className="detail-section">
          <EligibilityDetail listingId={item.id} sourceUrl={item.sourceUrl} housingType={item.type} />
        </section>

        <SunSection item={item} />

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
          </dl>
        </section>

        {open && <LocationInsight key={`insight:${item.id}`} item={item} />}

        {nearby.length > 0 && (
          <section className="detail-section">
            <h3>주변 역세권</h3>
            <ul className="subway-list">
              {nearby.map((s, i) => (
                <li key={i} className="subway-item">
                  <span className="subway-ico" aria-hidden>
                    <DdsIcon name="map" />
                  </span>
                  <span className="subway-name">{s.name}역</span>
                  <span className="subway-walk">도보 {s.walkMin}분 · {s.distM.toLocaleString()}m</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {nearSchools.length > 0 && (
          <section className="detail-section">
            <h3>주변 초등학교 <span className="detail-section-note">거리순</span></h3>
            <ul className="subway-list">
              {nearSchools.map((s, i) => (
                <li key={i} className="subway-item">
                  <span className="subway-ico" aria-hidden>
                    <DdsIcon name="contents" />
                  </span>
                  <span className="subway-name">{s.name}</span>
                  <span className="subway-walk">도보 {s.walkMin}분 · {s.distM.toLocaleString()}m</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 공고문 원문(PDF) — 지하철·학교 행과 같은 리스트 행 언어로 (1차 행동은 AI 자격확인) */}
        <section className="detail-section">
          <h3>공고문 원문</h3>
          <a
            className="subway-item detail-notice-row"
            href={item.noticePdfUrl ?? item.sourceUrl ?? infoUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="subway-ico" aria-hidden>
              <DdsIcon name="summary" />
            </span>
            <span className="subway-name">{item.noticePdfUrl ? "공고문 PDF" : "공고 페이지"}</span>
            <span className="subway-walk">
              새 창에서 열기 <DdsIcon name="arrow-up-right" />
            </span>
          </a>
        </section>

        {!!item.attachments?.length && (
          <NoticeAttachments key={`attachments:${item.id}`} files={item.attachments} />
        )}

        <div className="detail-actions">
          <button
            className={`icon-btn ${liked ? "active" : ""}`}
            onClick={() => {
              toggle(item.id);
              sendGAEvent("event", "toggle_like", { listing_id: item.id, liked: String(!liked) });
            }}
            aria-label="관심 목록"
          >
            <HeartIcon size={20} filled={liked} />
          </button>
          {/* 좌: 자격 확인하기(보조 = Outline/Neutral) · 우: 신청하러가기(핵심 = Solid/Primary) */}
          {onAskAI ? (
            <Button variant="outline" color="ghost" size="lg" fullWidth onClick={() => {
              sendGAEvent("event", "click_eligibility", { listing_id: item.id });
              onAskAI(item.id);
            }}>
              자격 확인하기
            </Button>
          ) : (
            <Button variant="outline" color="ghost" size="lg" fullWidth href={`/ai?focus=${encodeURIComponent(item.id)}`}
              onClick={() => sendGAEvent("event", "click_eligibility", { listing_id: item.id })}>
              자격 확인하기
            </Button>
          )}
          <Button
            variant="solid"
            color="primary"
            size="lg"
            fullWidth
            href={applyButton.active ? (item.sourceUrl ?? applyUrl) : undefined}
            trailingIcon={applyButton.active ? <DdsIcon name="arrow-up-right" size={20}/> : undefined}
            target="_blank"
            disabled={!applyButton.active}
            onClick={applyButton.active ? () => sendGAEvent("event", "click_apply", { listing_id: item.id, listing_title: item.title.slice(0, 90) }) : undefined}
          >
            {applyButton.label}
          </Button>
        </div>
      </div>
    </aside>
  );
}
