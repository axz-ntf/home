"use client";
import { useState } from "react";
import { Button } from "@/components/button";
import { DdsIcon } from "@/components/dds-icon";
import { DEFAULT_CONDITIONS, type HomeConditions } from "@/lib/home-discovery";
import { useSavedHomeFilter } from "@/lib/use-home-discovery";
import type { District, Filters, Listing } from "@/lib/types";
import "./home-discovery.css";

export function HomeConditionsPanel({ value, status, onChange, countResults, districts, changedCount, onlyChanged, onChanged, unknownCount }: {
  value: HomeConditions; status: Filters["status"]; onChange: (v: HomeConditions, status: Filters["status"]) => void;
  countResults: (v: HomeConditions, status: Filters["status"]) => number; districts: District[];
  changedCount: number; onlyChanged: boolean; onChanged: () => void; unknownCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, save] = useSavedHomeFilter();
  const [notice, setNotice] = useState("");
  const active = Boolean(value.region || value.deposit || value.rent || value.area || status.length || !value.includeUnknown);
  const sameSaved = saved && JSON.stringify(saved.conditions) === JSON.stringify(value) && JSON.stringify(saved.status) === JSON.stringify(status);
  const apply = (next: HomeConditions, nextStatus = status) => { onChange(next, nextStatus); setNotice(""); };
  const fields = [["deposit", "보증금 상한 (만원)"], ["rent", "월세 상한 (만원)"], ["area", "최소 전용면적 (㎡)"]] as const;
  const resultCount = editing ? countResults(draft, status) : 0;
  return <section className="home-discovery" aria-label="공고 필터">
    <div className="home-filter-bar">
      <select aria-label="지역" value={value.region} onChange={e => { apply({ ...value, region: e.target.value }); setEditing(false); }}><option value="">전국</option>{districts.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select>
      <select aria-label="모집 상태" value={status.length === 2 && status.includes("open") && status.includes("closing") ? "recruiting" : status.length === 1 ? status[0] : status.length ? "custom" : ""} onChange={e => { const v = e.target.value; apply(value, v === "recruiting" ? ["open", "closing"] : v ? [v as Filters["status"][number]] : []); setEditing(false); }}>
        <option value="">마감 제외</option><option value="recruiting">모집 중</option><option value="upcoming">모집 예정</option><option value="closing">마감 임박</option><option value="closed">모집 마감</option>{status.length === 1 && status[0] === "open" && <option value="open">모집 중 (일반)</option>}{status.length > 1 && !(status.length === 2 && status.includes("open") && status.includes("closing")) && <option value="custom" disabled>상태 {status.length}개</option>}
      </select>
      <Button size="sm" color="secondary" variant="outline" aria-expanded={editing} onClick={() => { if (!editing) setDraft(value); setEditing(!editing); }}>필터{[value.deposit, value.rent, value.area].filter(Boolean).length ? ` ${[value.deposit, value.rent, value.area].filter(Boolean).length}` : ""}</Button>
    </div>
    {!editing && active && <div className="home-applied" aria-label="적용된 조건">
      {value.region && <Button size="sm" color="subtlest" onClick={() => apply({ ...value, region: "" })}>{districts.find(d => d.id === value.region)?.name || value.region} <DdsIcon name="close" size={16} /></Button>}
      {fields.map(([key]) => value[key] !== "" && <Button key={key} size="sm" color="subtlest" onClick={() => apply({ ...value, [key]: "" })}>{key === "area" ? `${value[key]}㎡ 이상` : `${key === "deposit" ? "보증금" : "월세"} ${Number(value[key]).toLocaleString()}만 이하`} <DdsIcon name="close" size={16} /></Button>)}
      {!value.includeUnknown && <Button size="sm" color="subtlest" onClick={() => apply({ ...value, includeUnknown: true })}>확인 필요 제외 <DdsIcon name="close" size={16} /></Button>}
      <Button size="sm" color="ghost" onClick={() => apply(DEFAULT_CONDITIONS, [])}>초기화</Button>
      <Button size="sm" color="ghost" disabled={Boolean(sameSaved)} onClick={() => { const ok = save({ conditions: value, status }); setNotice(ok ? "이 브라우저에 조건을 저장했어요." : "브라우저 저장이 제한되어 조건을 저장하지 못했어요."); }}>{sameSaved ? "저장됨" : "이 조건 저장"}</Button>
    </div>}
    {editing && <div className="home-filter-editor">
      <strong>예산·면적으로 좁혀보기</strong>
      <div className="home-condition-fields">
        {fields.map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" placeholder="제한 없음" value={draft[key]} onChange={e => { const v = e.target.value; if (v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0)) setDraft({ ...draft, [key]: v }); }} /></label>)}
        <label className="home-unknown"><input type="checkbox" checked={draft.includeUnknown} onChange={e => setDraft({ ...draft, includeUnknown: e.target.checked })} />금액·면적 확인이 필요한 공고도 포함</label>
      </div>
      <p className="home-condition-note">확인되지 않은 금액은 예산에 맞는 공고로 판단하지 않아요.</p>
      <div className="home-filter-actions"><Button size="sm" color="ghost" onClick={() => setDraft({ ...DEFAULT_CONDITIONS, region: value.region })}>조건 비우기</Button><Button size="sm" color="ghost" onClick={() => setEditing(false)}>취소</Button><Button size="md" color="primary" onClick={() => { apply(draft); setEditing(false); }}>결과 {resultCount}개 보기</Button></div>
    </div>}
    {!editing && saved && !sameSaved && <div className="home-saved-filter"><Button size="sm" color="ghost" onClick={() => apply(saved.conditions, saved.status)}>저장한 조건 불러오기</Button><Button size="sm" color="ghost" onClick={() => { save(null); setNotice("저장한 조건을 삭제했어요."); }}>저장 조건 삭제</Button></div>}
    {!editing && (changedCount > 0 || onlyChanged) && <Button size="sm" color="ghost" onClick={onChanged}>{onlyChanged ? "전체 공고 보기" : `지난 방문 이후 변경 ${changedCount}건`}</Button>}
    {!editing && unknownCount > 0 && <small>금액·면적 확인이 필요한 공고 {unknownCount}건 포함</small>}
    {notice && <small role="status">{notice}</small>}
  </section>;
}

export function CompareTray({ items, remove, clear, open }: { items: Listing[]; remove: (id: string) => void; clear: () => void; open: () => void }) {
  if (!items.length) return null;
  return <div className="home-compare-tray" aria-label="비교할 공고">
    <div className="home-tray-items">{items.map(l => <Button size="sm" color="ghost" key={l.id} onClick={() => remove(l.id)} aria-label={`${l.complexName || l.title} 비교 선택 해제`}><span className="home-tray-name">{l.complexName || l.title}</span><DdsIcon name="close" size={16} /><span className="home-sr-only"> 비교 선택 해제</span></Button>)}</div>
    <div className="home-tray-actions"><span>{items.length}/3 선택</span><Button size="sm" color="ghost" onClick={clear}>비우기</Button><Button size="md" color="primary" className="home-compare-open" onClick={open} disabled={items.length < 2}>{items.length < 2 ? "공고를 하나 더 선택하세요" : `선택한 ${items.length}개 비교하기`}</Button></div>
  </div>;
}
