"use client";

import { useEffect, useState } from "react";
import type { InsightResult } from "@/lib/insight";
import type { Listing } from "@/lib/types";
import { Button } from "./button";
import { DdsIcon } from "./dds-icon";
import "./location-insight.css";

const TILES = [
  { key: "transit", label: "교통", icon: "map" },
  { key: "life", label: "생활", icon: "shopping" },
  { key: "edu", label: "교육", icon: "contents" },
  { key: "medical", label: "의료", icon: "add" },
] as const;

type State = { status: "loading" } | { status: "ready"; result: InsightResult } | { status: "error"; message: string };

export function LocationInsight({ item }: { item: Listing }) {
  const [attempt, setAttempt] = useState(0);
  const hasCoordinates = Number.isFinite(item.lat) && Number.isFinite(item.lng) && item.lat !== 0 && item.lng !== 0;
  if (!hasCoordinates || item.coordApprox) return <section className="detail-section insight-section">
    <h3>주변 입지</h3>
    <p className="insight-status-message">{item.coordApprox
      ? "공고의 대표 위치만 확인되어 단지 주변 입지를 분석할 수 없어요. 정확한 단지 위치가 확인되면 제공할게요."
      : "단지 위치가 아직 확인되지 않았어요. 정확한 위치가 확인되면 주변 입지를 제공할게요."}</p>
  </section>;

  // Remount on a new listing/request, so old results never appear under another address.
  const requestKey = JSON.stringify([item.id, item.lat, item.lng, item.type, item.title, item.address, attempt]);
  return <InsightRequest key={requestKey} item={item} retry={() => setAttempt(n => n + 1)} />;
}

function InsightRequest({ item, retry }: { item: Listing; retry: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const { lat, lng, title, address, type } = item;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 25000);
    async function load() {
      try {
        const response = await fetch("/api/insight", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, name: title, address, type }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("request-failed");
        const result = await response.json();
        if (!result || typeof result.summary !== "string" || !result.groups) throw new Error("invalid-response");
        if (active) setState({ status: "ready", result });
      } catch {
        if (active) setState({ status: "error", message: controller.signal.aborted
          ? "주변 정보 조회가 지연되고 있어요. 잠시 후 다시 시도해 주세요."
          : "주변 정보를 불러오지 못했어요. 다시 시도해 주세요." });
      } finally {
        clearTimeout(timer);
      }
    }
    void load();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [lat, lng, title, address, type]);

  const result = state.status === "ready" ? state.result : null;
  const sqm = parseFloat(item.area);
  const rawRatio = result?.marketPerM2 && item.type !== "sale" && sqm > 0 && (item.deposit > 0 || item.rent > 0)
    ? Math.round(((item.deposit + (item.rent > 0 ? item.rent * 12 / 0.055 : 0)) / sqm / result.marketPerM2) * 100)
    : null;
  const priceRatio = rawRatio && rawRatio > 0 && rawRatio <= 130 ? rawRatio : null;

  return <section className="detail-section insight-section" aria-label="주변 입지 분석" aria-busy={state.status === "loading"}>
    <h3>주변 입지 <span className="detail-section-note">생활시설 반경 500m</span></h3>
    {state.status === "loading" && <div className="insight-loading" role="status">
      <span className="insight-spinner" aria-hidden="true" /><span>주변 시설과 입지를 확인하고 있어요…</span>
    </div>}
    {state.status === "error" && <div className="insight-error" role="alert">
      <DdsIcon name="info" size={20} /><p>{state.message}</p>
      <Button size="sm" variant="outline" color="ghost" onClick={retry}>다시 시도</Button>
    </div>}
    {result && <>
      <div className="insight-result-meta">
        <dds-badge variant="outline" color="ghost" size="sm">{result.summarySource === "data" ? "주변 데이터 요약" : "AI 입지 요약"}</dds-badge>
        {result.generatedAt && <span>조회 {new Date(result.generatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span>}
      </div>
      {(priceRatio || result.valueText) && <div className="insight-hero">
        <div className="insight-hero-top">
          <span className="insight-hero-badge">임대료 참고</span>
          <span className="insight-hero-val">{priceRatio ? `주변 아파트 전세 시세의 약 ${priceRatio}% 수준` : `제도 기준 · ${result.valueText}`}</span>
        </div>
        {result.marketText && <div className="insight-hero-mkt"><DdsIcon name="bar-chart" size={16} /> {result.marketText}</div>}
      </div>}
      <p className="insight-summary">{result.summary}</p>
      <div className="insight-grid">{TILES.map(({ key, label, icon }) => {
        const group = result.groups[key];
        return <div key={key} className="insight-tile">
          <div className="insight-tile-top"><span className="insight-tile-ico"><DdsIcon name={icon} size={24} /></span>
            <span className={`insight-lvl ${group?.tone ?? "mid"}`}>{group?.level ?? "미확인"}</span>
          </div>
          <div className="insight-tile-k">{label}</div>
          <div className="insight-tile-v">{group?.value ?? "시설 정보를 조회하지 못했어요"}</div>
        </div>;
      })}</div>
      {result.tags?.length > 0 && <div className="insight-tags">{result.tags.map((tag, index) => <span className="insight-tag" key={`${index}-${tag}`}>{tag}</span>)}</div>}
      {!!result.warnings?.length && <div className="insight-partial" role="status">
        <ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      </div>}
      <p className="insight-disc">카카오 장소·공공 역/학교 위치 데이터 기준. 도보 시간은 직선거리로 계산한 추정치이며, 실제 보행 경로나 학교 배정을 뜻하지 않아요.
        {result.marketText ? " 시세는 국토부 아파트 실거래가 기준이에요." : ""}
        {priceRatio ? " 시세 비교는 연 5.5% 전세환산·인근 아파트 기준 추정치예요." : ""}
      </p>
    </>}
  </section>;
}
