"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { priceModelFor, type ManualOverride, type OverrideRow } from "@/lib/manual-overrides";
import type { HousingTypeId, StatusId } from "@/lib/types";
import { TieredEditor, HouseholdEditor, SupportEditor, type TierDraft, type HouseholdDraft, type SupportDraft } from "./model-editors";

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

const sn = (n: number | null | undefined) => (n != null ? String(n) : "");
const rangeStr = (v: number | [number, number] | null | undefined) =>
  Array.isArray(v) ? `${v[0]}~${v[1]}` : sn(v);

function initTiers(o: ManualOverride | null): TierDraft[] {
  if (o?.tiers?.length) {
    return o.tiers.map((t) => ({
      houseType: t.houseType ?? "", area: t.area ?? "", supplyUnits: sn(t.supplyUnits),
      incomes: (t.incomes ?? []).map((i) => ({ label: i.label ?? "", deposit: sn(i.deposit), rent: sn(i.rent) })),
    }));
  }
  // legacy rows 로 저장된 기존 검수값을 에디터에 보여줌 (감사 H1 — 안 보이면 저장 시 유실로 오인).
  if (o?.rows?.length) {
    return o.rows.map((r) => ({
      houseType: r.houseType ?? "", area: r.area ?? "", supplyUnits: sn(r.supplyUnits),
      incomes: [{ label: "기본", deposit: sn(r.deposit), rent: sn(r.rent) }],
    }));
  }
  return [{ houseType: "", area: "", supplyUnits: "", incomes: [{ label: "", deposit: "", rent: "" }] }];
}
function initHouseholds(o: ManualOverride | null): HouseholdDraft[] {
  if (o?.householdTypes?.length) {
    return o.householdTypes.map((h) => ({
      label: h.label ?? "", areaRange: h.areaRange ?? "", supplyUnits: sn(h.supplyUnits),
      deposit: rangeStr(h.deposit), rent: rangeStr(h.rent),
    }));
  }
  // legacy rows fallback (감사 H1)
  if (o?.rows?.length) {
    return o.rows.map((r) => ({
      label: r.houseType ?? "", areaRange: r.area ?? "", supplyUnits: sn(r.supplyUnits),
      deposit: sn(r.deposit), rent: sn(r.rent),
    }));
  }
  return [{ label: "", areaRange: "", supplyUnits: "", deposit: "", rent: "" }];
}
function initSupport(o: ManualOverride | null): SupportDraft[] {
  const rows = o?.supportLimit?.byHousehold ?? [];
  if (rows.length) return rows.map((b) => ({ label: b.label ?? "", limit: sn(b.limitManwon) }));
  // legacy 단일 보증금을 한도로 보여줌 (감사 H1)
  if (o?.deposit != null && o.deposit > 0) return [{ label: "전체", limit: sn(o.deposit) }];
  return [{ label: "", limit: "" }];
}

// "850~1200" → [850,1200], "850" → 850, "" → null.
function parseRange(s: string): number | [number, number] | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*[~\-]\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    return a === b ? a : [Math.min(a, b), Math.max(a, b)];
  }
  const n = Number(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
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
  sourceUrl,
  canAutoExtract = true,
}: {
  id: string;
  type: HousingTypeId;
  current: Current;
  context: Context;
  override: ManualOverride | null;
  nextHref?: string | null;
  queueIndex?: { current: number; total: number } | null;
  initialRows?: OverrideRow[] | null;
  sourceUrl?: string | null;
  canAutoExtract?: boolean; // SH 인데 공고문 PDF 가 없으면 false — 자동 채움 비활성 (감사 M3)
}) {
  const router = useRouter();
  const isSale = type === "sale";
  const priceModel = priceModelFor(type);

  // 평형별 모드 — override 에 rows 가 있으면 즉시 활성화. 자동 임포트된 complexes 가 있어도 활성화.
  const hasMultipleRows =
    (override?.rows && override.rows.length > 0) ||
    (initialRows && initialRows.length > 1);
  const [byRows, setByRows] = useState<boolean>(Boolean(hasMultipleRows));

  // 평형별 모드 state
  const [rowsList, setRowsList] = useState<RowDraft[]>(() => buildInitialRows(override, initialRows ?? null));

  // 단일값 모드 state
  const [supplyUnits, setSupplyUnits] = useState(String(current.supplyUnits ?? ""));
  // 0 은 "미상" 의미(특히 SH 어댑트값) — "0" 프리필이 저장되면 보증금 0원으로 박제됨 (감사 M2).
  const [deposit, setDeposit] = useState(current.deposit ? String(current.deposit) : "");
  const [rent, setRent] = useState(current.rent ? String(current.rent) : "");
  const [salePrice, setSalePrice] = useState(current.salePriceManwon ? String(current.salePriceManwon) : "");
  const [area, setArea] = useState(current.area ?? "");

  // 유형별 모델 state (3-3) — tiered/household/support + 전환보증금 + 당첨발표일
  const [tiers, setTiers] = useState<TierDraft[]>(() => initTiers(override));
  const [households, setHouseholds] = useState<HouseholdDraft[]>(() => initHouseholds(override));
  const [supportRows, setSupportRows] = useState<SupportDraft[]>(() => initSupport(override));
  const [convUp, setConvUp] = useState(override?.conversion?.rateUp != null ? String(override.conversion.rateUp) : "");
  const [convDown, setConvDown] = useState(override?.conversion?.rateDown != null ? String(override.conversion.rateDown) : "");
  const [winnerAt, setWinnerAt] = useState(override?.schedule?.winnerAt ?? "");

  const [status, setStatus] = useState<StatusId>(current.status);
  const [noticeStatus, setNoticeStatus] = useState(current.noticeStatus);
  const [progressStatus, setProgressStatus] = useState(current.progressStatus);
  const [deadline, setDeadline] = useState(current.deadline);
  const [note, setNote] = useState(override?._note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  // AI 자동 추출 — Solar(open2)가 공고문을 읽어 폼을 채운다. reasoning 모델이라 수십 초 걸림.
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);

  // 추출 결과를 폼 state 에 반영. 저장은 사람이 확인 후 직접 — 자동 저장하지 않는다.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  function applyExtracted(fields: any) {
    const s = (n: number | null) => (n != null ? String(n) : "");
    // 모델별 구조화 결과 우선 반영
    if (Array.isArray(fields.tiers) && fields.tiers.length) {
      setTiers(fields.tiers.map((t: any) => ({
        houseType: t.houseType ?? "", area: t.area ?? "", supplyUnits: s(t.supplyUnits),
        incomes: (t.incomes ?? []).map((i: any) => ({ label: i.label ?? "", deposit: s(i.deposit), rent: s(i.rent) })),
      })));
    }
    if (Array.isArray(fields.householdTypes) && fields.householdTypes.length) {
      setHouseholds(fields.householdTypes.map((h: any) => ({
        label: h.label ?? "", areaRange: h.areaRange ?? "", supplyUnits: s(h.supplyUnits),
        deposit: rangeStr(h.deposit), rent: rangeStr(h.rent),
      })));
    }
    if (fields.supportLimit?.byHousehold?.length) {
      setSupportRows(fields.supportLimit.byHousehold.map((b: any) => ({ label: b.label ?? "", limit: s(b.limitManwon) })));
    }
    if (fields.conversion) {
      if (fields.conversion.rateUp != null) setConvUp(s(fields.conversion.rateUp));
      if (fields.conversion.rateDown != null) setConvDown(s(fields.conversion.rateDown));
    }
    if (fields.schedule?.winnerAt) setWinnerAt(fields.schedule.winnerAt);
    if ((fields.rows?.length ?? 0) >= 2) {
      setByRows(true);
      setRowsList(fields.rows.map((r: any) => ({
        houseType: r.houseType ?? "",
        area: r.area ?? "",
        supplyUnits: s(r.supplyUnits),
        deposit: s(r.deposit),
        rent: s(r.rent),
        salePriceManwon: s(r.salePriceManwon),
      })));
    } else if (fields.rows?.length === 1) {
      const r = fields.rows[0];
      setByRows(false);
      if (r.supplyUnits != null) setSupplyUnits(s(r.supplyUnits));
      if (isSale) {
        if (r.salePriceManwon != null) setSalePrice(s(r.salePriceManwon));
      } else {
        if (r.deposit != null) setDeposit(s(r.deposit));
        if (r.rent != null) setRent(s(r.rent));
      }
      if (r.area) setArea(r.area);
    }
    if (fields.deadline) setDeadline(fields.deadline);
    if (fields.noticeStatus) setNoticeStatus(fields.noticeStatus);
    if (fields.progressStatus) setProgressStatus(fields.progressStatus);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async function runExtract(file?: File) {
    setExtracting(true);
    setExtractMsg({ kind: "info", text: "Solar 가 공고문을 읽는 중… (추론 모델이라 30~90초 걸릴 수 있어요)" });
    try {
      const res = file
        ? await fetch("/api/admin/extract", { method: "POST", body: (() => {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("isSale", String(isSale));
            fd.append("type", type);
            return fd;
          })() })
        : await fetch("/api/admin/extract", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id, sourceUrl: sourceUrl ?? null, isSale, type }),
          });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setExtractMsg({ kind: "error", text: `추출 실패: ${j.error ?? res.statusText}` });
        return;
      }
      applyExtracted(j.fields);
      const f = j.fields;
      const n = f.tiers?.length || f.householdTypes?.length || f.supportLimit?.byHousehold?.length || f.rows?.length || 0;
      const srcLabel = j.source === "cache" ? "캐시" : j.source === "upload" ? "업로드 PDF" : "원본 PDF 파싱";
      setExtractMsg({
        kind: "success",
        text: `자동 채움 완료 — ${srcLabel}에서 ${n}건 추출 (${Math.round(j.ms / 1000)}초). 값 확인 후 저장하세요.`,
      });
    } catch (e) {
      setExtractMsg({ kind: "error", text: `추출 오류: ${(e as Error).message}` });
    } finally {
      setExtracting(false);
    }
  }

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

    if (priceModel === "tiered-by-income") {
      payload.priceModel = "tiered-by-income";
      payload.supplyUnits = num(supplyUnits); // 총 세대수 — 모델 유형도 정정 가능 (감사 H2)
      payload.tiers = tiers
        .filter((t) => t.houseType.trim() || t.incomes.some((i) => i.deposit.trim()))
        .map((t) => ({
          houseType: t.houseType.trim() || "—",
          area: t.area.trim() || undefined,
          supplyUnits: num(t.supplyUnits),
          incomes: t.incomes
            .filter((i) => i.label.trim() || i.deposit.trim() || i.rent.trim())
            .map((i) => ({ label: i.label.trim() || "—", deposit: num(i.deposit), rent: num(i.rent) })),
        }));
    } else if (priceModel === "by-household-size") {
      payload.priceModel = "by-household-size";
      payload.supplyUnits = num(supplyUnits);
      payload.householdTypes = households
        .filter((h) => h.label.trim() || h.deposit.trim() || h.supplyUnits.trim())
        .map((h) => ({
          label: h.label.trim() || "—",
          areaRange: h.areaRange.trim() || undefined,
          supplyUnits: num(h.supplyUnits),
          deposit: parseRange(h.deposit),
          rent: parseRange(h.rent),
        }));
    } else if (priceModel === "support-limit") {
      payload.priceModel = "support-limit";
      payload.supplyUnits = num(supplyUnits);
      payload.supportLimit = {
        byHousehold: supportRows
          .filter((r) => r.label.trim() || r.limit.trim())
          .map((r) => ({ label: r.label.trim() || "—", limitManwon: num(r.limit) })),
      };
    } else if (byRows) {
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

    // 전환보증금 + 당첨발표일 (공통, 값 있을 때만)
    if (convUp.trim() || convDown.trim()) {
      payload.conversion = { rateUp: num(convUp), rateDown: num(convDown) };
    }
    if (winnerAt.trim()) payload.schedule = { winnerAt: winnerAt.trim() };

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

      <FormSection title="AI 자동 채움" subtitle="Solar 가 공고문을 읽어 금액·세대수·평형을 채웁니다. 값은 반드시 확인 후 저장하세요.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => runExtract()}
            disabled={extracting || busy || !canAutoExtract}
            className="a-btn primary"
            style={{ background: "var(--a-carrot)", opacity: canAutoExtract ? 1 : 0.5 }}
            title={canAutoExtract ? undefined : "이 공고는 첨부 PDF 가 없어요 — 아래 PDF 업로드를 이용하세요"}
          >
            {extracting ? "추출 중…" : canAutoExtract ? "공고문에서 자동 채움" : "PDF 없음 — 업로드 필요"}
          </button>
          <label className="a-btn ghost" style={{ cursor: extracting ? "default" : "pointer", margin: 0 }}>
            PDF 업로드
            <input
              type="file"
              accept="application/pdf"
              disabled={extracting || busy}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) runExtract(f);
                e.target.value = "";
              }}
            />
          </label>
          <span style={{ fontSize: 11, color: "var(--a-ink-3)" }}>
            기존 공고는 캐시 사용, 신규는 PDF 업로드
          </span>
        </div>
        {extractMsg && (
          <div className={`a-msg ${extractMsg.kind === "info" ? "" : extractMsg.kind}`} style={{ marginTop: 10 }}>
            {extractMsg.text}
          </div>
        )}
      </FormSection>

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

        <Field label="당첨자 발표일" hint="예비입주자/당첨자 발표 — 사용자 최다 질문">
          <input value={winnerAt} onChange={(e) => setWinnerAt(e.target.value)} type="text" placeholder="YYYY.MM.DD" />
        </Field>

        {current.announceDate && (
          <div style={{ fontSize: 11, color: "var(--a-ink-3)", fontWeight: 500 }}>
            공고일: <strong style={{ color: "var(--a-ink-2)", fontWeight: 700 }}>{current.announceDate}</strong> (자동 추출, 수정 불가)
          </div>
        )}
      </FormSection>

      {priceModel === "tiered-by-income" ? (
        <FormSection title="임대 조건 — 소득계층별" subtitle="영구·통합공공임대: 같은 평형도 소득계층(가/나군)별 임대료가 다름.">
          <Field label="총 공급 세대수" hint="모델과 별개로 정정 가능 — 비우면 평형별 합계 사용">
            <input value={supplyUnits} onChange={(e) => setSupplyUnits(e.target.value)} type="number" min="0" />
          </Field>
          <TieredEditor tiers={tiers} onChange={setTiers} />
        </FormSection>
      ) : priceModel === "by-household-size" ? (
        <FormSection title="임대 조건 — 가구원수 유형별" subtitle="매입·집주인 임대: 가구원수 유형(1/2/3형) + 면적구간. 가격은 범위(850~1200) 가능.">
          <Field label="총 공급 세대수" hint="모델과 별개로 정정 가능 — 비우면 유형별 합계 사용">
            <input value={supplyUnits} onChange={(e) => setSupplyUnits(e.target.value)} type="number" min="0" />
          </Field>
          <HouseholdEditor rows={households} onChange={setHouseholds} />
        </FormSection>
      ) : priceModel === "support-limit" ? (
        <FormSection title="전세 지원한도" subtitle="전세임대: 평형 없이 가구원수/지역별 전세 지원한도액.">
          <Field label="총 공급 세대수" hint="전세임대는 한도표에 세대수가 없어 여기서 정정 (감사 H2)">
            <input value={supplyUnits} onChange={(e) => setSupplyUnits(e.target.value)} type="number" min="0" />
          </Field>
          <SupportEditor rows={supportRows} onChange={setSupportRows} />
        </FormSection>
      ) : (
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
      )}

      {!isSale && (
        <FormSection title="전환보증금 (선택)" subtitle="보증금을 더 내면 월세가 내려가는 제도 — '저가' 핵심 정보. 전환이율만 입력하면 됨.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="보증금→월세 전환이율 (%)" hint="보통 3.5">
              <input value={convDown} onChange={(e) => setConvDown(e.target.value)} type="number" step="0.1" placeholder="3.5" />
            </Field>
            <Field label="월세→보증금 전환이율 (%)" hint="보통 6">
              <input value={convUp} onChange={(e) => setConvUp(e.target.value)} type="number" step="0.1" placeholder="6" />
            </Field>
          </div>
        </FormSection>
      )}

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
