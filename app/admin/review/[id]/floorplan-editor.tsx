"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { FloorPlanSpec } from "@/lib/floorplan-spec";

// 평면도 3D 검수 (Phase 2) — 이미지 업로드 → Claude 비전 추출 → 3D 미리보기 →
// JSON 교정 → 저장. three.js 가 무거워 뷰어는 동적 로드(스펙이 생겼을 때만).
const FloorPlan3D = dynamic(() => import("@/components/floor-plan-3d"), {
  ssr: false,
  loading: () => <div style={{ padding: 30, textAlign: "center", color: "var(--a-ink-3)" }}>3D 뷰어 로딩…</div>,
});

export default function FloorplanEditor({ listingId, initialSpec }: { listingId: string; initialSpec: FloorPlanSpec | null }) {
  const [spec, setSpec] = useState<FloorPlanSpec | null>(initialSpec);
  const [draft, setDraft] = useState<string>(initialSpec ? JSON.stringify(initialSpec, null, 2) : "");
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState<"extract" | "save" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function extract(file: File) {
    setBusy("extract");
    setMsg("Claude 가 평면도를 읽는 중… (1~3분 걸릴 수 있어요)");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/floorplan", { method: "POST", body: fd });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSpec(j.spec);
      setDraft(JSON.stringify(j.spec, null, 2));
      setMsg(`추출 완료 (${Math.round(j.ms / 1000)}초) — 3D 미리보기를 확인하고, 어긋난 부분은 JSON 교정 후 저장하세요.`);
    } catch (e) {
      setMsg(`추출 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  function applyDraft() {
    try {
      const parsed = JSON.parse(draft) as FloorPlanSpec;
      setSpec({ ...parsed });
      setMsg("미리보기에 반영했습니다 — 확인 후 저장하세요.");
    } catch (e) {
      setMsg(`JSON 파싱 실패: ${(e as Error).message}`);
    }
  }

  async function save(specToSave: FloorPlanSpec | null) {
    setBusy("save");
    setMsg(null);
    try {
      const r = await fetch("/api/admin/floorplan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: listingId, spec: specToSave }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      if (specToSave == null) {
        setSpec(null);
        setDraft("");
        setMsg("평면도 삭제됨 — 디테일에서 내려갑니다.");
      } else {
        setMsg(`저장됨 (${j.persisted === "github" ? "GitHub 커밋 — 약 1분 후 디테일 반영" : "로컬 저장 — 커밋 필요"})`);
      }
    } catch (e) {
      setMsg(`저장 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="a-form-section" style={{ marginTop: 14, maxWidth: 760 }}>
      <header>
        <h2>평면도 3D</h2>
        <p className="section-sub">평면도 이미지를 올리면 AI 가 3D 스펙을 만들고, 검수자가 교정해 저장합니다.</p>
      </header>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label className="a-btn primary" style={{ cursor: busy ? "default" : "pointer", margin: 0 }}>
          {busy === "extract" ? "추출 중…" : "평면도 이미지 업로드"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy != null}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) extract(f);
              e.target.value = "";
            }}
          />
        </label>
        {spec && (
          <>
            <button type="button" className="a-btn primary" disabled={busy != null} onClick={() => save(spec)}>
              {busy === "save" ? "저장 중…" : "저장 (디테일에 공개)"}
            </button>
            <button type="button" className="a-btn ghost" onClick={() => setShowJson((v) => !v)}>
              {showJson ? "JSON 닫기" : "JSON 교정"}
            </button>
            <button
              type="button"
              className="a-btn ghost"
              disabled={busy != null}
              style={{ color: "var(--a-red)" }}
              onClick={() => save(null)}
            >
              삭제
            </button>
          </>
        )}
      </div>
      {msg && <div className="a-msg">{msg}</div>}
      {spec && showJson && (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            style={{ width: "100%", minHeight: 220, fontFamily: "ui-monospace, monospace", fontSize: 11.5, boxSizing: "border-box" }}
          />
          <button type="button" className="a-btn ghost" onClick={applyDraft} style={{ marginTop: 6 }}>
            미리보기 적용
          </button>
        </div>
      )}
      {spec && <FloorPlan3D spec={spec} height={420} />}
    </section>
  );
}
