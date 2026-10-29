"use client";

import { DdsIcon } from "./dds-icon";

import { useState } from "react";
import type { PriceDetail } from "@/lib/types";
import { formatManwon, comma } from "@/lib/format";

// 유형별 가격 모델 디테일 렌더 (3-4). priceDetail.model 로 분기.
// tiered=소득계층 토글 / household=가구원수 / support=지원한도표. + 전환보증금 안내.

const fmt = (m: number | null | undefined) => (m != null ? formatManwon(m) || `${comma(m)}만원` : "—");
const fmtRange = (v: number | [number, number] | null | undefined) =>
  Array.isArray(v) ? `${fmt(v[0])} ~ ${fmt(v[1])}` : fmt(v);

export function StructuredPrice({ detail }: { detail: PriceDetail }) {
  if (detail.model === "tiered-by-income" && detail.tiers?.length) return <Tiered detail={detail} />;
  if (detail.model === "by-household-size" && detail.householdTypes?.length) return <Household detail={detail} />;
  if (detail.model === "support-limit" && detail.supportLimit?.byHousehold?.length) return <Support detail={detail} />;
  return null;
}

function Tiered({ detail }: { detail: PriceDetail }) {
  const tiers = detail.tiers!;
  const labels = [...new Set(tiers.flatMap((t) => t.incomes.map((i) => i.label)))];
  const [sel, setSel] = useState(labels[0]);
  return (
    <div>
      <div style={{ display: "flex", gap: "var(--dds-spacing-8)", marginBottom: "var(--dds-spacing-12)", flexWrap: "wrap" }}>
        {labels.map((l) => (
          <button key={l} type="button" onClick={() => setSel(l)} className={`area-unit-toggle-btn ${sel === l ? "on" : ""}`}
            style={{ padding: "var(--dds-spacing-4) var(--dds-spacing-12)", borderRadius: "var(--dds-radius-8)", fontSize: "var(--dds-typography-caption-normal-size)", fontWeight: 600 }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: "var(--dds-typography-caption-normal-size)", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--dds-border-card)", color: "var(--dds-text-quaternary)", textAlign: "left" }}>
              <th style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)" }}>주택형</th>
              <th style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)", textAlign: "right" }}>보증금</th>
              <th style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)", textAlign: "right" }}>월세</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => {
              const inc = t.incomes.find((x) => x.label === sel);
              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--dds-border-divider-item)" }}>
                  <td style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)" }}>{t.houseType}{t.area ? ` · ${t.area}` : ""}</td>
                  <td style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)", textAlign: "right", fontWeight: 600 }}>{fmt(inc?.deposit)}</td>
                  <td style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)", textAlign: "right" }}>{inc?.rent != null ? `${inc.rent}만원` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "var(--dds-typography-label-normal-size)", color: "var(--dds-text-quaternary)", marginTop: "var(--dds-spacing-8)" }}>
        소득 계층에 따라 임대조건이 다릅니다. 본인 해당 계층을 선택해 확인하세요.
      </p>
      <ConversionNote detail={detail} />
    </div>
  );
}

function Household({ detail }: { detail: PriceDetail }) {
  const rows = detail.householdTypes!;
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--dds-spacing-8)" }}>
        {rows.map((h, i) => (
          <div key={i} style={{ padding: "var(--dds-spacing-12) var(--dds-spacing-12)", border: "1px solid var(--dds-border-card)", borderRadius: "var(--dds-radius-12)" }}>
            <div style={{ fontSize: "var(--dds-typography-body-sm-strong-size)", fontWeight: 700, marginBottom: "var(--dds-spacing-4)" }}>{h.label}</div>
            {h.areaRange && <div style={{ fontSize: "var(--dds-typography-label-normal-size)", color: "var(--dds-text-quaternary)", marginBottom: "var(--dds-spacing-8)" }}>{h.areaRange}</div>}
            <div style={{ display: "flex", gap: "var(--dds-spacing-16)", fontSize: "var(--dds-typography-caption-normal-size)" }}>
              <span>보증금 <strong>{fmtRange(h.deposit)}</strong></span>
              <span>월세 <strong>{h.rent != null ? (Array.isArray(h.rent) ? `${h.rent[0]}~${h.rent[1]}만원` : `${h.rent}만원`) : "—"}</strong></span>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: "var(--dds-typography-label-normal-size)", color: "var(--dds-text-quaternary)", marginTop: "var(--dds-spacing-8)" }}>
        가구원수에 따라 신청 유형이 나뉩니다. 매물에 따라 보증금·월세가 범위로 표시될 수 있어요.
      </p>
      <ConversionNote detail={detail} />
    </div>
  );
}

function Support({ detail }: { detail: PriceDetail }) {
  const rows = detail.supportLimit!.byHousehold;
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: "var(--dds-typography-caption-normal-size)", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--dds-border-card)", color: "var(--dds-text-quaternary)", textAlign: "left" }}>
              <th style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)" }}>구분</th>
              <th style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)", textAlign: "right" }}>전세 지원한도</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--dds-border-divider-item)" }}>
                <td style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)" }}>{b.label}</td>
                <td style={{ padding: "var(--dds-spacing-8) var(--dds-spacing-8)", textAlign: "right", fontWeight: 600 }}>{fmt(b.limitManwon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "var(--dds-typography-label-normal-size)", color: "var(--dds-text-quaternary)", marginTop: "var(--dds-spacing-8)" }}>
        전세임대는 한도액 내에서 직접 주택을 고르면 공사가 집주인과 계약 후 재임대합니다.
      </p>
    </div>
  );
}

// 전환보증금 안내 — 보증금을 더 내면 월세가 내려가는 제도. rateDown(보증금→월세 인하율)로 예시 계산.
function ConversionNote({ detail }: { detail: PriceDetail }) {
  const rate = detail.conversion?.rateDown;
  if (rate == null || !(rate > 0)) return null;
  const sampleManwon = 1000;
  const monthlyDown = (sampleManwon * (rate / 100)) / 12; // 만원/월
  return (
    <div style={{ marginTop: "var(--dds-spacing-12)", padding: "var(--dds-spacing-12) var(--dds-spacing-12)", background: "var(--dds-background-state-info-subtle)", border: "1px solid var(--dds-border-card)", borderRadius: "var(--dds-radius-12)" }}>
      <div style={{ fontSize: "var(--dds-typography-body-sm-strong-size)", fontWeight: 700, color: "var(--dds-blue-700)", marginBottom: "var(--dds-spacing-4)" }}><DdsIcon name="bulb" size={16}/> 전환보증금 — 월세 더 낮추기</div>
      <div style={{ fontSize: "var(--dds-typography-caption-normal-size)", color: "var(--dds-text-secondary)" }}>
        보증금을 <strong>1,000만원</strong> 더 내면 월세가 약 <strong>{monthlyDown.toFixed(1)}만원</strong> 내려갑니다. (전환이율 {rate}%)
      </div>
    </div>
  );
}
