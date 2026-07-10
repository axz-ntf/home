"use client";

import { useEffect, useState } from "react";
import type { Listing } from "@/lib/types";
import { HOUSING_TYPES } from "@/lib/mock-data";
import { comma, formatManwon } from "@/lib/format";
import { summarizePrice } from "@/lib/price-summary";
import { loadProfile } from "@/lib/profile";
import {
  LOAN_PRODUCTS,
  type LoanProduct,
  type ProfileBrief,
  rateFor,
  limitFor,
  qualifies,
  autoSelect,
  toBrief,
} from "@/lib/loan-products";

// 버팀목 전월세대출이 실제 의미있는 유형만 — 세입자가 목돈 보증금을 직접 마련하는 경우.
// 영구임대(실버)는 보증금이 극소(중앙값 254만), 전세임대는 제도가 대출을 대체, 매입/분양은 대상 외.
const LOAN_TYPES = ["happy", "nation", "integ"];

// 슬라이더 초기값 — 한도를 1,000만 단위로 내림 (한도가 그보다 작으면 한도 그대로)
function defaultAmount(limit: number): number {
  return Math.floor(limit / 1000) * 1000 || limit;
}

// 만원 금액 표시 — 이자처럼 소수가 나올 수 있는 값은 소수 1자리까지.
function fmtWon(v: number): string {
  if (v >= 10000) return formatManwon(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return `${Number.isInteger(r) ? comma(r) : r.toFixed(1)}만원`;
}

export function LoanCalculator({ item }: { item: Listing }) {
  const s = summarizePrice(item);
  const deposit = s.deposit?.max ?? 0;
  const rent = s.rent?.max ?? 0;

  const [productId, setProductId] = useState<LoanProduct["id"]>("youth");
  const [amount, setAmount] = useState(() => defaultAmount(limitFor(LOAN_PRODUCTS[0], deposit, rent)));
  const [years, setYears] = useState(2);
  const [profile, setProfile] = useState<ProfileBrief | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  // 프로필 로드 → 신혼·청년·일반 순 자동 선택 (마운트 시 1회)
  useEffect(() => {
    let alive = true;
    loadProfile().then((form) => {
      if (!alive || !form) return;
      const brief = toBrief(form);
      if (!brief) return;
      setProfile(brief);
      const auto = autoSelect(brief);
      setProductId(auto);
      setAmount(defaultAmount(limitFor(LOAN_PRODUCTS.find((p) => p.id === auto)!, deposit, rent)));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!LOAN_TYPES.includes(item.type) || deposit <= 0) return null;

  // 월세 없는 매물은 월세대출 제외 → 프로필이 있으면 요건 충족 상품만.
  // 충족 상품이 하나도 없으면 전체를 보여주고 경고로 안내.
  const byListing = rent > 0 ? LOAN_PRODUCTS : LOAN_PRODUCTS.filter((p) => p.id !== "wolse");
  const eligible = profile ? byListing.filter((p) => qualifies(p, profile)) : byListing;
  const products = eligible.length ? eligible : byListing;
  const filtered = profile != null && eligible.length > 0 && eligible.length < byListing.length;

  const product = products.find((p) => p.id === productId) ?? products[0];
  const limit = limitFor(product, deposit, rent);
  const annual = profile?.annual || null;
  const rate = rateFor(product, annual, deposit);
  const monthlyInterest = (amount * rate) / 100 / 12; // 만기일시상환 — 매달 이자만
  const monthlyTotal = rent + monthlyInterest;
  const singleParentRate = Math.max(1.0, Math.round((rate - 1.0) * 10) / 10); // 한부모 우대 -1.0%p
  const typeName = HOUSING_TYPES.find((t) => t.id === item.type)?.name;
  const mismatch = profile != null && !qualifies(product, profile);

  const snapAmount = () => {
    setAmount((a) => (a >= limit - 50 ? limit : Math.round(a / 100) * 100));
  };

  const selectProduct = (id: LoanProduct["id"]) => {
    setProductId(id);
    const p = products.find((x) => x.id === id)!;
    setAmount(defaultAmount(limitFor(p, deposit, rent)));
    setYears(2);
  };

  return (
    <section className="detail-section">
      <h3>
        대출 계산기
        <span className="detail-section-note">만기일시상환 · 이자만 계산</span>
      </h3>

      <div className="loan-seg" role="tablist">
        {products.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === product.id}
            className={`loan-seg-btn${p.id === product.id ? " on" : ""}`}
            onClick={() => selectProduct(p.id)}
          >
            {p.tab}
          </button>
        ))}
      </div>

      <div className="loan-auto">
        <span>{filtered ? "내 프로필로 신청 가능한 대출만 표시" : "내 프로필 기준 자동 선택"}</span>
        {profile ? (
          <strong>
            · 만 {profile.age}세{profile.newlywed ? " · 신혼" : ""}
            {profile.annual > 0 ? ` · 연소득 ${comma(profile.annual)}만` : ""} ✓
          </strong>
        ) : (
          <em>프로필 미입력 — 최고 소득구간 금리로 계산</em>
        )}
      </div>
      {mismatch && (
        <p className="loan-warn">{product.name} 대상({product.require})이 아닐 수 있어요.</p>
      )}

      <div className="loan-row">
        <span className="loan-row-label">대출 금액</span>
        <strong className="loan-row-value">{formatManwon(amount) || "0원"}</strong>
      </div>
      <input
        type="range"
        className="loan-slider"
        min={0}
        max={limit}
        step={1}
        value={Math.min(amount, limit)}
        // 드래그 중엔 원시값 그대로 (반올림하면 엄지가 포인터와 어긋나 튕김) —
        // 놓는 순간에만 100만 단위 스냅, 한도 근처는 정확히 한도로.
        onChange={(e) => setAmount(Number(e.target.value))}
        onPointerUp={snapAmount}
        onBlur={snapAmount}
        aria-label="대출 금액"
        style={{ "--pct": `${limit > 0 ? (Math.min(amount, limit) / limit) * 100 : 0}%` } as React.CSSProperties}
      />
      <div className="loan-meta">
        <span>{product.id === "wolse" ? `월세 ${comma(rent)}만 기준` : `보증금 ${comma(deposit)}만`}</span>
        {typeName && <span className="loan-chip">{typeName}</span>}
        {product.id !== "wolse" && <span className="loan-chip">한도 {Math.round(product.ltv * 100)}%</span>}
        <strong className="loan-meta-max">최대 {fmtWon(limit)}</strong>
      </div>

      <div className="loan-row" style={{ marginTop: 20 }}>
        <span className="loan-row-label">대출 기간</span>
        <strong className="loan-row-value">
          {years}년 <em>· 최장 {product.maxYears}년</em>
        </strong>
      </div>
      <input
        type="range"
        className="loan-slider"
        min={2}
        max={product.maxYears}
        step={2}
        value={Math.min(years, product.maxYears)}
        onChange={(e) => setYears(Number(e.target.value))}
        disabled={product.maxYears <= 2}
        aria-label="대출 기간"
        style={{ "--pct": `${product.maxYears > 2 ? ((Math.min(years, product.maxYears) - 2) / (product.maxYears - 2)) * 100 : 0}%` } as React.CSSProperties}
      />

      <div className="loan-divider" />
      <h4 className="loan-result-title">위 조건으로 오늘 대출하면?</h4>

      <div className="loan-result">
        <div className="loan-result-head">
          {/* 주택도시기금 심볼 (nhuf.molit.go.kr 원본 트레이싱) */}
          <span className="loan-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nhuf-mark.svg" alt="주택도시기금" />
          </span>
          <strong>{product.name}</strong>
          <span className="loan-rate-chip">연 {rate.toFixed(1)}%</span>
          <span className="loan-result-interest">
            월 이자 <strong>{fmtWon(monthlyInterest)}</strong>
          </span>
        </div>
        <div className="loan-result-foot">
          <span>{rent > 0 ? `월세 ${comma(rent)}만원 포함, 매달` : "이자만 부담, 매달"}</span>
          <strong>월 {fmtWon(monthlyTotal)}</strong>
        </div>
      </div>

      <div className="loan-note">
        {product.id !== "wolse" ? (
          <span>한부모가구라면 연 {singleParentRate.toFixed(1)}% → 월 이자 {fmtWon((amount * singleParentRate) / 100 / 12)}</span>
        ) : (
          <span />
        )}
        {products.length > 1 && (
          <button
            type="button"
            className="loan-note-toggle"
            aria-expanded={compareOpen}
            onClick={() => setCompareOpen((v) => !v)}
          >
            다른 대출 비교 {compareOpen ? "∧" : "∨"}
          </button>
        )}
      </div>

      {compareOpen && products.length > 1 && (
        <div className="loan-compare">
          {products.map((p) => {
            // 상품별 한도 초과 시 그 상품 한도 기준으로 계산 (오해 방지)
            const pLimit = limitFor(p, deposit, rent);
            const pAmount = Math.min(amount, pLimit);
            const pRate = rateFor(p, annual, deposit);
            const pInterest = (pAmount * pRate) / 100 / 12;
            const on = p.id === product.id;
            return (
              <button
                type="button"
                key={p.id}
                className={`loan-compare-row${on ? " on" : ""}`}
                onClick={() => { if (!on) selectProduct(p.id); }}
              >
                <span className="loan-compare-name">{p.name}</span>
                <span className="loan-compare-rate">연 {pRate.toFixed(1)}%</span>
                {pAmount < amount && <span className="loan-compare-cap">한도 {fmtWon(pLimit)}</span>}
                <strong className="loan-compare-interest">월 이자 {fmtWon(pInterest)}</strong>
              </button>
            );
          })}
        </div>
      )}

      <a className="loan-cta" href="https://enhuf.molit.go.kr/" target="_blank" rel="noreferrer">
        기금e든든에서 내 한도 확인하기
      </a>
      <p className="loan-disclaimer">2026.1 기준금리 · 실제 금리·한도는 소득·자산 심사에 따라 달라질 수 있어요</p>
    </section>
  );
}
