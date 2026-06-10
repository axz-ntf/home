"use client";

// 유형별 가격 모델 입력 에디터 (3-3). review-form 에서 priceModel 에 따라 렌더.
// 값은 문자열 draft 로 보관(입력 친화), 저장 시 review-form 이 숫자/범위로 변환.

export interface TierDraft {
  houseType: string;
  area: string;
  supplyUnits: string;
  incomes: { label: string; deposit: string; rent: string }[];
}
export interface HouseholdDraft {
  label: string;
  areaRange: string;
  supplyUnits: string;
  deposit: string; // "850" 또는 "850~1200"
  rent: string;
}
export interface SupportDraft {
  label: string;
  limit: string; // 만원
}

const cellInput: React.CSSProperties = {
  width: "100%", padding: "5px 7px", border: "1px solid var(--a-line-2)", borderRadius: 6,
  fontSize: 12, fontFamily: "inherit", color: "var(--a-ink)", background: "white",
};
const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "var(--a-ink-3)" };
const card: React.CSSProperties = {
  padding: 12, border: "1px solid var(--a-line)", borderRadius: 10, background: "var(--a-bg-2)", position: "relative",
};
const addBtn: React.CSSProperties = {
  padding: "9px 13px", background: "white", border: "1.5px dashed var(--a-line-2)", borderRadius: 10,
  fontSize: 12.5, fontWeight: 700, color: "var(--a-carrot)", cursor: "pointer", fontFamily: "inherit",
};
const delBtn: React.CSSProperties = {
  marginTop: 8, padding: "4px 9px", background: "transparent", border: "1px solid var(--a-line-2)",
  borderRadius: 6, fontSize: 11, fontWeight: 600, color: "var(--a-ink-3)", cursor: "pointer", fontFamily: "inherit",
};
function Tag({ i }: { i: number }) {
  return <div style={{ position: "absolute", top: 8, right: 10, fontSize: 10, fontWeight: 800, color: "var(--a-ink-3)" }}>#{i + 1}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><label style={lbl}>{label}</label>{children}</div>;
}

// ── 소득계층별 (가군/나군 등) — tiered-by-income ──
export function TieredEditor({ tiers, onChange }: { tiers: TierDraft[]; onChange: (t: TierDraft[]) => void }) {
  const up = (i: number, patch: Partial<TierDraft>) => onChange(tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const upInc = (ti: number, ii: number, patch: Partial<TierDraft["incomes"][number]>) =>
    onChange(tiers.map((t, k) => (k === ti ? { ...t, incomes: t.incomes.map((inc, j) => (j === ii ? { ...inc, ...patch } : inc)) } : t)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {tiers.map((t, i) => (
        <div key={i} style={card}>
          <Tag i={i} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr", gap: 8, marginBottom: 8 }}>
            <Field label="주택형"><input style={cellInput} value={t.houseType} onChange={(e) => up(i, { houseType: e.target.value })} placeholder="26A" /></Field>
            <Field label="면적"><input style={cellInput} value={t.area} onChange={(e) => up(i, { area: e.target.value })} placeholder="26.84㎡" /></Field>
            <Field label="세대수"><input style={cellInput} type="number" value={t.supplyUnits} onChange={(e) => up(i, { supplyUnits: e.target.value })} placeholder="200" /></Field>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {t.incomes.map((inc, j) => (
              <div key={j} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 6, alignItems: "end" }}>
                <Field label="소득계층"><input style={cellInput} value={inc.label} onChange={(e) => upInc(i, j, { label: e.target.value })} placeholder="가군" /></Field>
                <Field label="보증금(만)"><input style={cellInput} type="number" value={inc.deposit} onChange={(e) => upInc(i, j, { deposit: e.target.value })} /></Field>
                <Field label="월세(만)"><input style={cellInput} type="number" value={inc.rent} onChange={(e) => upInc(i, j, { rent: e.target.value })} /></Field>
                {t.incomes.length > 1 && (
                  <button type="button" style={{ ...delBtn, marginTop: 0 }} onClick={() => up(i, { incomes: t.incomes.filter((_, x) => x !== j) })}>×</button>
                )}
              </div>
            ))}
            <button type="button" style={{ ...delBtn, alignSelf: "flex-start", color: "var(--a-carrot)" }}
              onClick={() => up(i, { incomes: [...t.incomes, { label: "", deposit: "", rent: "" }] })}>+ 계층 추가</button>
          </div>
          {tiers.length > 1 && <button type="button" style={delBtn} onClick={() => onChange(tiers.filter((_, k) => k !== i))}>× 이 평형 삭제</button>}
        </div>
      ))}
      <button type="button" style={addBtn} onClick={() => onChange([...tiers, { houseType: "", area: "", supplyUnits: "", incomes: [{ label: "", deposit: "", rent: "" }] }])}>+ 평형 추가</button>
    </div>
  );
}

// ── 가구원수 유형 (1/2/3형) — by-household-size ──
export function HouseholdEditor({ rows, onChange }: { rows: HouseholdDraft[]; onChange: (r: HouseholdDraft[]) => void }) {
  const up = (i: number, patch: Partial<HouseholdDraft>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i} style={card}>
          <Tag i={i} />
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.6fr", gap: 8, marginBottom: 8 }}>
            <Field label="가구원수 유형"><input style={cellInput} value={r.label} onChange={(e) => up(i, { label: e.target.value })} placeholder="2인 가구(1형)" /></Field>
            <Field label="면적 구간"><input style={cellInput} value={r.areaRange} onChange={(e) => up(i, { areaRange: e.target.value })} placeholder="50㎡ 이하" /></Field>
            <Field label="세대수"><input style={cellInput} type="number" value={r.supplyUnits} onChange={(e) => up(i, { supplyUnits: e.target.value })} /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="보증금(만) — 범위면 850~1200"><input style={cellInput} value={r.deposit} onChange={(e) => up(i, { deposit: e.target.value })} placeholder="850" /></Field>
            <Field label="월세(만) — 범위 가능"><input style={cellInput} value={r.rent} onChange={(e) => up(i, { rent: e.target.value })} placeholder="31~53" /></Field>
          </div>
          {rows.length > 1 && <button type="button" style={delBtn} onClick={() => onChange(rows.filter((_, k) => k !== i))}>× 삭제</button>}
        </div>
      ))}
      <button type="button" style={addBtn} onClick={() => onChange([...rows, { label: "", areaRange: "", supplyUnits: "", deposit: "", rent: "" }])}>+ 유형 추가</button>
    </div>
  );
}

// ── 전세 지원한도 — support-limit ──
export function SupportEditor({ rows, onChange }: { rows: SupportDraft[]; onChange: (r: SupportDraft[]) => void }) {
  const up = (i: number, patch: Partial<SupportDraft>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: 8, alignItems: "end" }}>
          <Field label="구분(가구원수/지역)"><input style={cellInput} value={r.label} onChange={(e) => up(i, { label: e.target.value })} placeholder="수도권 / 2인" /></Field>
          <Field label="지원한도(만)"><input style={cellInput} type="number" value={r.limit} onChange={(e) => up(i, { limit: e.target.value })} placeholder="13000" /></Field>
          {rows.length > 1 && <button type="button" style={{ ...delBtn, marginTop: 0 }} onClick={() => onChange(rows.filter((_, k) => k !== i))}>×</button>}
        </div>
      ))}
      <button type="button" style={{ ...addBtn, padding: "8px 12px" }} onClick={() => onChange([...rows, { label: "", limit: "" }])}>+ 한도 추가</button>
    </div>
  );
}
