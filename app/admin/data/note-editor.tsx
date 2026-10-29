"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NOTE_STATES, type CatalogNote, type DatasetId } from "@/lib/housing-catalog-types";

export default function NoteEditor({ source, id, initial, writable }: { source: DatasetId; id: string; initial?: CatalogNote; writable: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<CatalogNote["state"]>(initial?.state ?? "none");
  const [note, setNote] = useState(initial?.note ?? "");
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`/api/admin/housing-data/${source}/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, note, revision }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "저장에 실패했습니다.");
      setRevision(result.saved.revision); setMessage("관리 메모를 저장했습니다."); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "저장에 실패했습니다."); }
    finally { setBusy(false); }
  }
  return <form className="hd-note" onSubmit={save}>
    <h2>관리 메모</h2><p>수집 원본과 분리해 저장합니다. 관리 표시는 서비스 노출이나 자동 수집을 변경하지 않습니다.</p>
    {!writable && <p className="hd-alert">이 배포 환경은 메모 저장소가 연결되지 않아 조회만 가능합니다.</p>}
    <label>관리 표시<select aria-label="관리 표시" value={state} onChange={e => setState(e.target.value as CatalogNote["state"])} disabled={!writable || busy}>{Object.entries(NOTE_STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>메모<textarea aria-label="메모" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={5} disabled={!writable || busy} placeholder="데이터 확인 사항이나 운영 메모를 남겨주세요." /></label>
    <div className="hd-note-actions"><span>{note.length} / 2,000</span><button type="submit" className="a-btn primary" disabled={!writable || busy}>{busy ? "저장 중…" : "메모 저장"}</button></div>
    {message && <p role={failed ? "alert" : "status"} className={failed ? "hd-alert" : "hd-success"}>{message}</p>}
  </form>;
}
