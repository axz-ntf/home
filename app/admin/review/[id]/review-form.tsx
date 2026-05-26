"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManualOverride, OverrideRow } from "@/lib/manual-overrides";
import type { HousingTypeId, StatusId } from "@/lib/types";

interface Current {
  supplyUnits: number | string | null;
  deposit: number | null;
  rent: number | null;
  salePriceManwon: number | null;
  area: string;
  status: StatusId;
  noticeStatus: string;
  progressStatus: string;
  deadline: string;
  announceDate: string;
}

interface Context {
  complexName: string | null;
  address: string;
  pnu: string | null;
  houseType: string | null;
  heatMethod: string | null;
  parkngCo: number | null;
  coverPhotoUrl: string | null;
  eligible: string[];
}

interface RowDraft {
  houseType: string;
  area: string;
  supplyUnits: string;
  deposit: string;
  rent: string;
  salePriceManwon: string;
}

const STATUS_OPTIONS: { value: StatusId; label: string; dot: string }[] = [
  { value: "open",     label: "모집중",   dot: "var(--a-green)" },
  { value: "upcoming", label: "모집예정", dot: "var(--a-yellow)" },
  { value: "closing",  label: "마감임박", dot: "var(--a-red)" },
  { value: "closed",   label: "마감",     dot: "var(--a-ink-4)" },
];

const NOTICE_STATUS_OPTIONS = ["일반공고", "정정공고", "취소공고", "재공고", "발표결과"];
const PROGRESS_STATUS_OPTIONS = ["모집예정", "모집중", "모집완료"];

function emptyRow(): RowDraft {
  return { houseType: "", area: "", supplyUnits: "", deposit: "", rent: "", salePriceManwon: "" };
}

// override.rows 또는 listing.complexes[0].rows 에서 초기 RowDraft[] derive.
// 둘 다 없으면 단일값 모드로 시작.
function buildInitialRows(override: ManualOverride | null, initialRows: OverrideRow[] | null): RowDraft[] {
  if (override?.rows && override.rows.length > 0) {
    return override.rows.map((r) => ({
      houseType: r.houseType ?? "",
      area: r.area ?? "",
      supplyUnits: r.supplyUnits != null ? String(r.supplyUnits) : "",
      deposit: r.deposit != null ? String(r.deposit) : "",
      rent: r.rent != null ? String(r.rent) : "",
      salePriceManwon: r.salePriceManwon != null ? String(r.salePriceManwon) : "",
    }));
  }
  if (initialRows && initialRows.length > 0) {
    return initialRows.map((r) => ({
      houseType: r.houseType ?? "",
      area: r.area ?? "",
      supplyUnits: r.supplyUnits != null ? String(r.supplyUnits) : "",
      deposit: r.deposit != null ? String(r.deposit) : "",
      rent: r.rent != null ? String(r.rent) : "",
      salePriceManwon: r.salePriceManwon != null ? String(r.salePriceManwon) : "",
    }));
  }
  return [emptyRow()];
}

export default function ReviewForm({
  id,
  type,
  current,
  context,
  override,
  nextHref,
  queueIndex,
  initialRows,
}: {
  id: string;
  type: HousingTypeId;
  current: Current;
  context: Context;
  override: ManualOverride | null;
  nextHref?: string | null;
  queueIndex?: { current: number; total: number } | null;
  initialRows?: OverrideRow[] | null;
}) {
  const router = useRouter();
  const isSale = type === "sale";

  // 평형별 모드 — override 에 rows 가 있으면 즉시 활성화. 자동 임포트된 complexes 가 있어도 활성화.
  const hasMultipleRows =
    (override?.rows && override.rows.length > 0) ||
    (initialRows && initialRows.length > 1);
  const [byRows, setByRows] = useState<boolean>(Boolean(hasMultipleRows));

  // 평형별 모드 state
  const [rowsList, setRowsList] = useState<RowDraft[]>(() => buildInitialRows(override, initialRows ?? null));

  // 단일값 모드 state
  const [supplyUnits, setSupplyUnits] = useState(String(current.supplyUnits ?? ""));
  const [deposit, setDeposit] = useState(String(current.deposit ?? ""));
  const [rent, setRent] = useState(String(current.rent ?? ""));
  const [salePrice, setSalePrice] = useState(String(current.salePriceManwon ?? ""));
  const [area, setArea] = useState(current.area ?? "");

  const [status, setStatus] = useState<StatusId>(current.status);
  const [noticeStatus, setNoticeStatus] = useState(current.noticeStatus);
  const [progressStatus, setProgressStatus] = useState(current.progressStatus);
  const [deadline, setDeadline] = useState(current.deadline);
  const [note, setNote] = useState(override?._note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  function num(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function addRow() {
    setRowsList((arr) => [...arr, emptyRow()]);
  }
  function removeRow(idx: number) {
    setRowsList((arr) => arr.filter((_, i) => i !== idx));
  }
  function updateRow(idx: number, patch: Partial<RowDraft>) {
    setRowsList((arr) => arr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  // 평형별 행에서 총합 derive
  const totalSupply = byRows
    ? rowsList.reduce((s, r) => s + (num(r.supplyUnits) ?? 0), 0)
    : null;

  async function save(goNext: boolean) {
    setBusy(true);
    setMsg(null);

    // 평형별 모드면 rows 빌드, 단일이면 단일 값들
    const payload: Record<string, unknown> = {
      id,
      status: status !== current.status ? status : undefined,
      noticeStatus: noticeStatus !== current.noticeStatus ? noticeStatus : undefined,
      progressStatus: progressStatus !== current.progressStatus ? progressStatus : undefined,
      deadline: deadline !== current.deadline ? deadline : undefined,
      _note: note.trim() || undefined,
    };

    if (byRows) {
      const cleanRows = rowsList
        .filter((r) => r.houseType.trim() || r.supplyUnits.trim() || r.salePriceManwon.trim() || r.deposit.trim() || r.rent.trim())
        .map((r) => ({
          houseType: r.houseType.trim() || "—",
          area: r.area.trim() || undefined,
          supplyUnits: num(r.supplyUnits),
          deposit: isSale ? undefined : num(r.deposit),
          rent: isSale ? undefined : num(r.rent),
          salePriceManwon: isSale ? num(r.salePriceManwon) : undefined,
        }));
      payload.rows = cleanRows;
      // 합계 supplyUnits 도 같이 저장 (대시보드/검색 일관성)
      payload.supplyUnits = totalSupply;
    } else {
      payload.supplyUnits = num(supplyUnits);
      payload.deposit = num(deposit);
      payload.rent = num(rent);
      payload.salePriceManwon = num(salePrice);
      payload.area = area.trim() || undefined;
    }

    const r = await fetch("/api/admin/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      setBusy(false);
      const j = await r.json().catch(() => ({}));
      setMsg({ kind: "error", text: `저장 실패: ${j.error ?? r.statusText}` });
      return;
    }
    setMsg({ kind: "success", text: "저장됨" });
    if (goNext && nextHref) {
      router.push(nextHref);
    } else {
      router.refresh();
      setBusy(false);
    }
  }

  async function clearOverride() {
    if (!confirm("이 매물의 override를 삭제할까요? 자동 추출값으로 돌아갑니다.")) return;
    setBusy(true);
    const r = await fetch("/api/admin/overrides", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    if (r.ok) {
      setMsg({ kind: "success", text: "삭제됨" });
      router.refresh();
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="a-form">
      {queueIndex && (
        <div style={{
          padding: "10px 14px", background: "var(--a-bg-2)", borderRadius: 8,
          fontSize: 12, color: "var(--a-ink-2)", fontWeight: 600,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>검수 큐 <strong style={{ color: "var(--a-ink)" }}>{queueIndex.current}</strong> / {queueIndex.total}</span>
          <span style={{ color: "var(--a-ink-3)", fontWeight: 500 }}>저장하고 다음 진행 가능</span>
        </div>
      )}
      {override && (
        <div className="a-review-banner">
          <span>✓ 검수됨 — {override._reviewedAt}</span>
          {override._note && <span className="note">메모: {override._note}</span>}
        </div>
      )}

      <FormSection title="공고 상태" subtitle="자동 추출이 틀린 경우 수동 교정. 화면 분류 / 필터에 즉시 반영.">
        <Field label="활성 상태" hint="대시보드 분류 기준 — 모집중 / 모집예정 / 마감임박 / 마감">
          <SegmentedControl value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </Field>

        <Field label="공고 종류" hint="LH 원본의 공고 분류">
          <ChipGroup value={noticeStatus} options={NOTICE_STATUS_OPTIONS} onChange={setNoticeStatus} allowEmpty />
        </Field>

        <Field label="모집 진행" hint="LH 원본의 진행 상태">
          <ChipGroup value={progressStatus} options={PROGRESS_STATUS_OPTIONS} onChange={setProgressStatus} allowEmpty />
        </Field>

        <Field label="마감일">
          <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="text" placeholder="YYYY.MM.DD" />
        </Field>

        {current.announceDate && (
          <div style={{ fontSize: 11, color: "var(--a-ink-3)", fontWeight: 500 }}>
            공고일: <strong style={{ color: "var(--a-ink-2)", fontWeight: 700 }}>{current.announceDate}</strong> (자동 추출, 수정 불가)
          </div>
        )}
      </FormSection>

      <FormSection
        title={isSale ? "분양 정보" : "임대 조건"}
        subtitle={byRows
          ? "평형별 행 — 한 공고에 59㎡/74㎡/84㎡ 등 여러 평형이 있을 때 행을 나눠서 입력."
          : (isSale
              ? "분양가 · 공급 세대수. PDF 표 합계 확인."
              : "보증금 · 월세 · 공급 세대수. LH API 부정확값 정정.")}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
          borderBottom: "1px dashed var(--a-line)",
        }}>
          <ModeToggle byRows={byRows} onChange={setByRows} />
          {byRows && (
            <span style={{ fontSize: 11.5, color: "var(--a-ink-3)", marginLeft: "auto" }}>
              총 공급 세대수: <strong style={{ color: "var(--a-ink)", fontVariantNumeric: "tabular-nums" }}>
                {totalSupply != null ? totalSupply.toLocaleString() : "—"}
              </strong>
            </span>
          )}
        </div>

        {byRows ? (
          <RowsEditor
            isSale={isSale}
            rows={rowsList}
            onUpdate={updateRow}
            onRemove={removeRow}
            onAdd={addRow}
          />
        ) : (
          <>
            <Field label="공급 세대수" hint="LH API 가 1로 잘못 주는 경우가 많음. PDF 표 합계 확인.">
              <input value={supplyUnits} onChange={(e) => setSupplyUnits(e.target.value)} type="number" min="0" />
            </Field>
            {isSale ? (
              <Field label="분양가 (만원)" hint="공급 가격 (분양 매물)">
                <input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} type="number" min="0" />
              </Field>
            ) : (
              <>
                <Field label="보증금 (만원)">
                  <input value={deposit} onChange={(e) => setDeposit(e.target.value)} type="number" min="0" />
                </Field>
                <Field label="월세 (만원)">
                  <input value={rent} onChange={(e) => setRent(e.target.value)} type="number" min="0" />
                </Field>
              </>
            )}
            <Field label="면적" hint="예: 29~46㎡">
              <input value={area} onChange={(e) => setArea(e.target.value)} type="text" />
            </Field>
          </>
        )}
      </FormSection>

      <ContextSection context={context} coverUrl={context.coverPhotoUrl} />

      <FormSection title="검수 메모">
        <Field label="메모">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="검수하면서 발견한 특이사항" />
        </Field>
      </FormSection>

      <div className="a-actions">
        <button type="submit" disabled={busy} className="a-btn primary">
          {busy ? "저장 중..." : "저장"}
        </button>
        {nextHref && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy}
            className="a-btn primary"
            style={{ background: "var(--a-ink)", color: "white" }}
          >
            {busy ? "저장 중..." : "저장하고 다음 →"}
          </button>
        )}
        {override && (
          <button type="button" onClick={clearOverride} disabled={busy} className="a-btn ghost" style={{ marginLeft: "auto" }}>
            override 전체 삭제
          </button>
        )}
      </div>
      {msg && <div className={`a-msg ${msg.kind}`}>{msg.text}</div>}
    </form>
  );
}

function ModeToggle({ byRows, onChange }: { byRows: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="a-segmented" style={{ background: "var(--a-bg-3)" }}>
      <button type="button" data-active={!byRows} onClick={() => onChange(false)}>
        단일 평형
      </button>
      <button type="button" data-active={byRows} onClick={() => onChange(true)}>
        평형별 입력
      </button>
    </div>
  );
}

function RowsEditor({
  isSale, rows, onUpdate, onRemove, onAdd,
}: {
  isSale: boolean;
  rows: RowDraft[];
  onUpdate: (idx: number, patch: Partial<RowDraft>) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          padding: 12,
          border: "1px solid var(--a-line)",
          borderRadius: 10,
          background: "var(--a-bg-2)",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", top: 8, right: 8,
            fontSize: 10.5, fontWeight: 800,
            color: "var(--a-ink-3)",
            letterSpacing: "0.04em",
          }}>
            #{i + 1}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <RowField label="주택형" hint='예: "59A" / "84"'>
              <input
                value={r.houseType}
                onChange={(e) => onUpdate(i, { houseType: e.target.value })}
                placeholder="59A"
              />
            </RowField>
            <RowField label="면적" hint="예: 59.96㎡">
              <input
                value={r.area}
                onChange={(e) => onUpdate(i, { area: e.target.value })}
                placeholder="59.96㎡"
              />
            </RowField>
            <RowField label="세대수">
              <input
                value={r.supplyUnits}
                onChange={(e) => onUpdate(i, { supplyUnits: e.target.value })}
                type="number"
                min="0"
                placeholder="390"
              />
            </RowField>
            {isSale ? (
              <RowField label="분양가 (만원)" hint="예: 52640">
                <input
                  value={r.salePriceManwon}
                  onChange={(e) => onUpdate(i, { salePriceManwon: e.target.value })}
                  type="number"
                  min="0"
                />
              </RowField>
            ) : (
              <>
                <RowField label="보증금 (만원)">
                  <input
                    value={r.deposit}
                    onChange={(e) => onUpdate(i, { deposit: e.target.value })}
                    type="number"
                    min="0"
                  />
                </RowField>
                <RowField label="월세 (만원)">
                  <input
                    value={r.rent}
                    onChange={(e) => onUpdate(i, { rent: e.target.value })}
                    type="number"
                    min="0"
                  />
                </RowField>
              </>
            )}
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              style={{
                marginTop: 8, padding: "5px 10px",
                background: "transparent",
                border: "1px solid var(--a-line-2)",
                borderRadius: 6,
                fontSize: 11.5, fontWeight: 600,
                color: "var(--a-ink-3)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              × 이 평형 삭제
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          padding: "10px 14px",
          background: "white",
          border: "1.5px dashed var(--a-line-2)",
          borderRadius: 10,
          fontSize: 12.5, fontWeight: 700,
          color: "var(--a-carrot)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        + 평형 추가
      </button>
    </div>
  );
}

function RowField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--a-ink-2)" }}>{label}</label>
      {hint && <span style={{ fontSize: 10, color: "var(--a-ink-3)" }}>{hint}</span>}
      <div className="a-field">
        {children}
      </div>
    </div>
  );
}

function FormSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="a-form-section">
      <header>
        <h2>{title}</h2>
        {subtitle && <p className="section-sub">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function ContextSection({ context, coverUrl }: { context: Context; coverUrl: string | null }) {
  const hasAny =
    context.complexName || context.address || context.pnu ||
    context.houseType || context.heatMethod || context.parkngCo != null ||
    coverUrl || context.eligible.length > 0;
  if (!hasAny) return null;
  return (
    <section className="a-form-section">
      <header>
        <h2>참고 정보</h2>
        <p className="section-sub">자동 추출된 raw 메타 — 검수 컨텍스트용 (편집 불가)</p>
      </header>

      {coverUrl && (
        <div style={{ marginBottom: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt="공고 표지"
            style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 8, background: "var(--a-bg-3)" }}
          />
        </div>
      )}

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 16px", fontSize: 12.5 }}>
        {context.complexName && <Row label="단지명">{context.complexName}</Row>}
        {context.houseType && <Row label="주거형태">{context.houseType}</Row>}
        {context.heatMethod && <Row label="난방방식">{context.heatMethod}</Row>}
        {context.parkngCo != null && <Row label="총 주차대수">{context.parkngCo.toLocaleString()}대</Row>}
        {context.address && <Row label="주소">{context.address}</Row>}
        {context.pnu && <Row label="PNU 지번">
          <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--a-ink-3)" }}>{context.pnu}</code>
        </Row>}
        {context.eligible.length > 0 && (
          <Row label="자격 조건">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {context.eligible.map((e) => (
                <span key={e} className="a-badge notice-normal" style={{ fontSize: 10.5 }}>{e}</span>
              ))}
            </div>
          </Row>
        )}
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--a-ink-3)", fontWeight: 600 }}>{label}</dt>
      <dd style={{ margin: 0, color: "var(--a-ink)", fontWeight: 500 }}>{children}</dd>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="a-field">
      <label>{label}</label>
      {hint && <span className="hint">{hint}</span>}
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string; dot: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="a-segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          data-active={o.value === value}
          style={{ ["--dot" as string]: o.dot }}
        >
          <span className="dot" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChipGroup({
  value, options, onChange, allowEmpty,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div className="a-chip-group">
      {allowEmpty && (
        <button type="button" onClick={() => onChange("")} data-active={!value} data-muted="true">
          — 없음
        </button>
      )}
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} data-active={value === o}>
          {o}
        </button>
      ))}
    </div>
  );
}
