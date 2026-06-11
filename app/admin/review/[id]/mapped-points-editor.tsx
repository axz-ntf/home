"use client";

import { useState } from "react";

// 다지점 분리 핀 편집 (P1) — AI 추출+지오코딩 산출물(sh-mapped/mapped-regional)의
// 사람 교정 UI. 라벨·주소·좌표·가격·세대 수정, 행 삭제, 전체 저장(교체).
// 각 행의 "지도" 링크로 지오코딩이 맞는 위치인지 눈으로 검증한다.

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

const cell: React.CSSProperties = { padding: "2px 4px" };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box" };

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
  const [message, setMessage] = useState<string | null>(null);

  const update = (i: number, patch: Partial<PointDraft>) =>
    setDrafts((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const remove = (i: number) => setDrafts((d) => d.filter((_, j) => j !== i));

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
                <td style={{ ...cell, minWidth: 180 }}><input style={inp} value={d.address} onChange={(e) => update(i, { address: e.target.value })} /></td>
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
        <button type="button" className="a-btn primary" onClick={save} disabled={saving}>
          {saving ? "저장 중…" : `핀 ${drafts.length}개 저장`}
        </button>
        {message && <span style={{ fontSize: 12.5, color: "var(--a-ink-2)" }}>{message}</span>}
      </div>
    </section>
  );
}
