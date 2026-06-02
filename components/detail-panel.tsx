"use client";

import { useState, useEffect } from "react";
import type { Listing } from "@/lib/types";
import { HOUSING_TYPES, STATUS_LABELS } from "@/lib/mock-data";
import { thumbnailSVG } from "@/lib/svg";
import { calcDday, isRegularRecruitment, effectiveStatus } from "@/lib/dday";
import { applyUrlFor, infoUrlFor } from "@/lib/notice-match";
import { NaverPanorama } from "./naver-panorama";
import { CloseIcon, HeartIcon, TrainIcon } from "./icons";
import { EligibilityDetail } from "./eligibility-detail";
import { formatManwon } from "@/lib/format";
import { TypeIntro, TypePrice, accentVars } from "./detail-type";

// 1평 ≈ 3.3058㎡ — 부동산 공인 환산
const PYEONG_PER_M2 = 1 / 3.3058;
type AreaUnit = "m2" | "pyeong";

function formatAreaCell(m2: number, unit: AreaUnit): string {
  if (!Number.isFinite(m2) || m2 <= 0) return "-";
  if (unit === "pyeong") {
    const py = m2 * PYEONG_PER_M2;
    return py >= 100 ? `${Math.round(py)}평` : `${py.toFixed(1)}평`;
  }
  // ㎡ 표시: 정수면 그대로, 소수면 .00 절단 (74.96 → 74.96, 75.00 → 75)
  return Number.isInteger(m2) ? `${m2}㎡` : `${m2}㎡`;
}

function ListingComplexes({ item }: { item: Listing }) {
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("m2");
  if (!item.complexes || !item.complexes.length) return null;
  function fmtPrice(v: number | null): string {
    if (v == null) return "공고문 확인";
    const m = Math.round(v / 10000);
    return formatManwon(m) || `${m.toLocaleString()}만원`;
  }
  // 모든 row 의 deposit/rent 가 null 인지 — 매입임대/위탁임대 등 LH 가 등록 안 한 케이스
  const allRowsEmpty = item.complexes.every((c) =>
    (c.rows ?? []).every((r) => (r.deposit ?? 0) === 0 && (r.rent ?? 0) === 0),
  );
  return (
    <section className="detail-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>단지별 공급 정보</h3>
        <div className="area-unit-toggle" role="group" aria-label="면적 단위">
          <button
            type="button"
            className={`area-unit-toggle-btn ${areaUnit === "m2" ? "on" : ""}`}
            onClick={() => setAreaUnit("m2")}
            aria-pressed={areaUnit === "m2"}
          >
            ㎡
          </button>
          <button
            type="button"
            className={`area-unit-toggle-btn ${areaUnit === "pyeong" ? "on" : ""}`}
            onClick={() => setAreaUnit("pyeong")}
            aria-pressed={areaUnit === "pyeong"}
          >
            평
          </button>
        </div>
      </div>
      {allRowsEmpty && (
        <div className="detail-confirm-box">
          <span>임대조건 정보가 등록되지 않은 매물입니다.</span>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            LH 공고문에서 단지별 보증금·월세 확인 →
          </a>
        </div>
      )}
      {item.complexes.map((c, ci) => (
        <div key={ci} style={{ marginTop: ci === 0 ? 0 : 16 }}>
          {c.name && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{c.name}</div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--seed-scale-color-gray-200)", color: "var(--seed-semantic-color-ink-text-low)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>
                    전용면적 ({areaUnit === "pyeong" ? "평" : "㎡"})
                  </th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>세대수</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>보증금</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>월세</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r, ri) => {
                  const m2 = Number(r.houseType);
                  const units = r.supplyTotal ?? r.area ?? null;
                  return (
                    <tr key={ri} style={{ borderBottom: "1px solid var(--seed-scale-color-gray-100)" }}>
                      <td style={{ padding: "6px 8px" }}>{formatAreaCell(m2, areaUnit)}</td>
                      <td style={{ textAlign: "right", padding: "6px 8px" }}>{units ?? "-"}</td>
                      <td style={{ textAlign: "right", padding: "6px 8px" }}>{fmtPrice(r.deposit)}</td>
                      <td style={{ textAlign: "right", padding: "6px 8px" }}>{fmtPrice(r.rent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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
  const [liked, setLiked] = useState(false);
  if (!item) return <div className={`detail-panel ${open ? "open" : ""}`} />;

  const svg = thumbnailSVG(item.thumbSeed, item.type);
  const effStatus = effectiveStatus(item.status, item.deadline, item.beginDate);
  const status = STATUS_LABELS[effStatus];
  const housingType = HOUSING_TYPES.find((t) => t.id === item.type);
  const applyUrl = applyUrlFor(item.type);
  const infoUrl = infoUrlFor(item.type);
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
        <h1 className="detail-title">{item.title}</h1>
        <div className="detail-address">{item.address}</div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {housingType && (
            <span className={`badge ${housingType.badge}`} style={{ fontSize: 12, padding: "4px 9px" }}>
              {housingType.name}
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

        <ListingPhotos item={item} />
        <ListingComplexes item={item} />

        <TypePrice item={item} />

        <section className="detail-section">
          <EligibilityDetail listingId={item.id} sourceUrl={item.sourceUrl} housingType={item.type} />
        </section>

        <section className="detail-section">
          <h3>기본 정보</h3>
          <dl className="detail-specs">
            {item.pblancNm ? (
              <>
                <dt>공고명</dt>
                <dd>{item.pblancNm}</dd>
              </>
            ) : null}
            {item.suplyTyNm ? (
              <>
                <dt>공급 유형</dt>
                <dd>{item.suplyTyNm}</dd>
              </>
            ) : null}
            {item.totalUnits ? (
              <>
                <dt>총 세대 수</dt>
                <dd>{item.totalUnits}세대</dd>
              </>
            ) : null}
            {item.supplyUnits ? (
              <>
                <dt>공급 세대 수</dt>
                <dd>{item.supplyUnits}세대</dd>
              </>
            ) : null}
            {item.heatMethod ? (
              <>
                <dt>난방</dt>
                <dd>{item.heatMethod}</dd>
              </>
            ) : null}
            {item.beginDate ? (
              <>
                <dt>접수 시작</dt>
                <dd>{item.beginDate}</dd>
              </>
            ) : null}
            {item.deadline ? (
              <>
                <dt>접수 마감</dt>
                <dd>{item.deadline}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section className="detail-section">
          <h3>입지·편의</h3>
          <div className="detail-feat-row">
            <div className="feat-chip">
              <TrainIcon size={12} />
              {item.transit}
            </div>
            {item.features.map((f) => (
              <div key={f} className="feat-chip">
                #{f}
              </div>
            ))}
            {item.competition != null && (
              <div
                className="feat-chip"
                style={{
                  borderColor: "var(--seed-scale-color-carrot-200)",
                  background: "var(--seed-semantic-color-primary-low)",
                  color: "var(--seed-scale-color-carrot-700)",
                  fontWeight: 600,
                }}
              >
                지난 회차 경쟁률 {item.competition}:1
              </div>
            )}
          </div>
        </section>

        <section className="detail-section">
          <h3>신청 방법</h3>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.75,
              color: "var(--seed-semantic-color-ink-text)",
            }}
          >
            <li>{item.agency} 청약 플랫폼에서 회원가입 및 공인인증</li>
            <li>모집공고 기간 내 온라인 청약 신청서 제출</li>
            <li>서류 제출 (주민등록, 소득 증빙 등)</li>
            <li>소득·자산 조사 및 당첨자 발표</li>
            <li>계약 체결 및 입주</li>
          </ol>
        </section>

        <div className="detail-actions">
          <button
            className={`icon-btn ${liked ? "active" : ""}`}
            onClick={() => setLiked(!liked)}
            aria-label="관심 목록"
          >
            <HeartIcon size={20} filled={liked} />
          </button>
          <a
            className="secondary"
            href={item.sourceUrl ?? infoUrl}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            공고문 원문 보기
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
