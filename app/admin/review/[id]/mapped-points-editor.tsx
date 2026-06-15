"use client";

import { useState } from "react";

// 다지점 분리 핀 편집 (P1) — AI 추출+지오코딩 산출물(sh-mapped/mapped-regional)의
// 사람 교정 UI. 라벨·주소·좌표·가격·세대 수정, 행 삭제, 전체 저장(교체).
// 각 행의 "지도" 링크로 지오코딩이 맞는 위치인지 눈으로 검증한다.
// "핀 추가" 로 빈 행을 만들고 "주소검색"(다음 우편번호 팝업)으로 주소를 고르면
// VWORLD 지오코딩(/api/admin/geocode)으로 위/경도를 자동 채운다 — 손으로 좌표 안 침.

interface PointDraft {
  lat: string;
  lng: string;
  label: string;
  address: string;
  units: string;
  depositManwon: string;
  rentManwon: string;
}

export interface MappedPoint {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
  units?: number;
  depositManwon?: number;
  rentManwon?: number;
}

const toDraft = (p: MappedPoint): PointDraft => ({
  lat: String(p.lat),
  lng: String(p.lng),
  label: p.label ?? "",
  address: p.address ?? "",
  units: p.units != null ? String(p.units) : "",
  depositManwon: p.depositManwon != null ? String(p.depositManwon) : "",
  rentManwon: p.rentManwon != null ? String(p.rentManwon) : "",
});

const num = (s: string): number | null => {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

const EMPTY_DRAFT: PointDraft = { lat: "", lng: "", label: "", address: "", units: "", depositManwon: "", rentManwon: "" };

const cell: React.CSSProperties = { padding: "2px 4px" };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box" };

// 다음 우편번호 팝업 — 검색창에 동/도로명 치면 주소 리스트 → 선택. 무료 임베드 스크립트.
const DAUM_SRC = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
interface DaumPostcodeData { roadAddress: string; jibunAddress: string; buildingName: string }
declare global {
  interface Window {
    daum?: { Postcode: new (opts: { oncomplete: (d: DaumPostcodeData) => void }) => { open: () => void } };
  }
}
function loadDaumPostcode(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.daum?.Postcode) return resolve();
    const done = () => (window.daum?.Postcode ? resolve() : reject(new Error("우편번호 스크립트 로드 실패")));
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DAUM_SRC}"]`);
    if (existing) { existing.addEventListener("load", done); existing.addEventListener("error", () => reject(new Error("우편번호 스크립트 로드 실패"))); return; }
    const s = document.createElement("script");
    s.src = DAUM_SRC;
    s.onload = done;
    s.onerror = () => reject(new Error("우편번호 스크립트 로드 실패"));
    document.head.appendChild(s);
  });
}

export default function MappedPointsEditor({
  file, mappedKey, initialPoints, currentPinIndex,
}: {
  file: "sh" | "lh";
  mappedKey: string;
  initialPoints: MappedPoint[];
  currentPinIndex: number | null;
}) {
  const [drafts, setDrafts] = useState<PointDraft[]>(initialPoints.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [geoBusy, setGeoBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const update = (i: number, patch: Partial<PointDraft>) =>
    setDrafts((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const remove = (i: number) => setDrafts((d) => d.filter((_, j) => j !== i));
  const addRow = () => setDrafts((d) => [...d, { ...EMPTY_DRAFT }]);

  // 주소검색 → 지오코딩. 팝업이 고른 주소를 채우고 VWORLD 로 위/경도 자동 입력.
  async function searchAddress(i: number) {
    try {
      await loadDaumPostcode();
    } catch (e) {
      setMessage((e as Error).message);
      return;
    }
    new window.daum!.Postcode({
      oncomplete: (data) => {
        const road = data.roadAddress || "";
        const jibun = data.jibunAddress || "";
        update(i, { address: road || jibun });
        if (data.buildingName) setDrafts((d) => d.map((p, j) => (j === i && !p.label.trim() ? { ...p, label: data.buildingName } : p)));
        geocode(i, road, jibun);
      },
    }).open();
  }

  async function geocode(i: number, road: string, jibun: string) {
    setGeoBusy(i);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin/geocode?${new URLSearchParams({ road, jibun })}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      update(i, { lat: String(j.lat), lng: String(j.lng) });
    } catch (e) {
      setMessage(`#${i + 1} 좌표 변환 실패: ${(e as Error).message} — 위/경도 직접 입력하세요.`);
    } finally {
      setGeoBusy(null);
    }
  }

  async function save() {
    const bad = drafts.findIndex((d) => num(d.lat) == null || num(d.lng) == null);
    if (bad >= 0) {
      setMessage(`#${bad + 1} 좌표가 숫자가 아닙니다.`);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const points = drafts.map((d) => ({
        lat: num(d.lat) as number,
        lng: num(d.lng) as number,
        ...(d.label.trim() && { label: d.label.trim() }),
        ...(d.address.trim() && { address: d.address.trim() }),
        ...(num(d.units) != null && { units: num(d.units) }),
        ...(num(d.depositManwon) != null && { depositManwon: num(d.depositManwon), rentManwon: num(d.rentManwon) ?? 0 }),
      }));
      const r = await fetch("/api/admin/mapped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, key: mappedKey, points }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMessage(
        points.length === 0
          ? "분리 해제 저장됨 — 이 공고의 핀이 지도에서 내려갑니다."
          : `핀 ${j.count}개 저장됨 (${j.persisted === "github" ? "GitHub 커밋 — 약 1분 후 반영" : "로컬 저장 — 커밋 필요"})`,
      );
    } catch (e) {
      setMessage(`저장 실패: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="a-form-section" style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
        분리 핀 {drafts.length}개 <span style={{ fontWeight: 500, color: "var(--a-ink-3)", fontSize: 12.5 }}>— AI 추출·지오코딩 결과 교정. 행 삭제 후 저장하면 그 핀만 내려감.</span>
      </h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: "var(--a-ink-3)", textAlign: "left" }}>
              {["#", "라벨(단지명)", "주소", "위도", "경도", "세대", "보증금(만)", "월세(만)", "", ""].map((h, i) => (
                <th key={i} style={{ ...cell, fontWeight: 700, borderBottom: "1px solid var(--a-line)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((d, i) => (
              <tr key={i} style={i === currentPinIndex ? { background: "var(--a-bg-2)" } : undefined}>
                <td style={{ ...cell, color: "var(--a-ink-3)", fontWeight: 700 }}>{i + 1}</td>
                <td style={{ ...cell, minWidth: 150 }}><input style={inp} value={d.label} onChange={(e) => update(i, { label: e.target.value })} /></td>
                <td style={{ ...cell, minWidth: 220 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input style={inp} value={d.address} onChange={(e) => update(i, { address: e.target.value })} />
                    <button type="button" onClick={() => searchAddress(i)} style={{ whiteSpace: "nowrap", fontSize: 11.5, padding: "0 6px", cursor: "pointer" }}>주소검색</button>
                  </div>
                  {geoBusy === i && <span style={{ fontSize: 11, color: "var(--a-ink-3)" }}>좌표 변환 중…</span>}
                </td>
                <td style={{ ...cell, width: 90 }}><input style={inp} value={d.lat} onChange={(e) => update(i, { lat: e.target.value })} /></td>
                <td style={{ ...cell, width: 90 }}><input style={inp} value={d.lng} onChange={(e) => update(i, { lng: e.target.value })} /></td>
                <td style={{ ...cell, width: 56 }}><input style={inp} value={d.units} onChange={(e) => update(i, { units: e.target.value })} type="number" /></td>
                <td style={{ ...cell, width: 76 }}><input style={inp} value={d.depositManwon} onChange={(e) => update(i, { depositManwon: e.target.value })} type="number" /></td>
                <td style={{ ...cell, width: 56 }}><input style={inp} value={d.rentManwon} onChange={(e) => update(i, { rentManwon: e.target.value })} type="number" /></td>
                <td style={cell}>
                  <a
                    href={`https://map.kakao.com/link/map/${encodeURIComponent(d.label || d.address || "핀")},${d.lat},${d.lng}`}
                    target="_blank" rel="noreferrer" style={{ fontSize: 11.5 }}
                  >
                    지도
                  </a>
                </td>
                <td style={cell}>
                  <button type="button" onClick={() => remove(i)} aria-label={`핀 ${i + 1} 삭제`}
                    style={{ border: "none", background: "none", color: "var(--a-danger, #d33)", cursor: "pointer", fontWeight: 800 }}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="a-actions" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" className="a-btn" onClick={addRow}>+ 핀 추가</button>
        <button type="button" className="a-btn primary" onClick={save} disabled={saving}>
          {saving ? "저장 중…" : `핀 ${drafts.length}개 저장`}
        </button>
        {message && <span style={{ fontSize: 12.5, color: "var(--a-ink-2)" }}>{message}</span>}
      </div>
    </section>
  );
}
