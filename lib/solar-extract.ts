// 공고문 마크다운 → Solar(추론 모델)로 임대/분양 조건을 구조화 추출.
// 3-2: 유형별 PriceModel 인지 — tiered(소득계층)/household(가구원수)/support(지원한도)/rows/sale.
// + 전환보증금(conversion)·당첨발표일 추출, LH/SH 공통 키워드.
// 기존 임베딩 호출과 동일하게 Upstage OpenAI-호환 endpoint 로 직접 fetch.

import type { HousingTypeId } from "./types";
import { priceModelFor, type PriceModel } from "./manual-overrides";

const BASE = (process.env.SOLAR_BASE_URL ?? "https://api.upstage.ai/v1").replace(/\/$/, "");
const KEY = (process.env.SOLAR_API_KEY ?? "").trim();
// 날짜 스냅샷(-260528)은 '26.07 폐기됨 — 최신 추적 별칭 사용 (404 시 여기부터 확인).
const MODEL = (process.env.SOLAR_EXTRACT_MODEL ?? "solar-open2").trim();

export interface ExtractedRow {
  houseType: string;
  area: string | null;
  supplyUnits: number | null;
  deposit: number | null; // 만원
  rent: number | null; // 만원
  salePriceManwon: number | null; // 만원
}
export interface ExtractedTier {
  houseType: string;
  area: string | null;
  supplyUnits: number | null;
  incomes: { label: string; deposit: number | null; rent: number | null }[];
}
export interface ExtractedHousehold {
  label: string;
  areaRange: string | null;
  supplyUnits: number | null;
  deposit: number | [number, number] | null;
  rent: number | [number, number] | null;
}
export interface ExtractedFields {
  priceModel: PriceModel;
  rows: ExtractedRow[];
  tiers?: ExtractedTier[];
  householdTypes?: ExtractedHousehold[];
  supportLimit?: { byHousehold: { label: string; limitManwon: number }[] };
  conversion?: { rateUp: number | null; rateDown: number | null; perHouseType?: { houseType: string; limitManwon: number | null; maxDeposit: number | null; minRent: number | null }[] };
  schedule?: { winnerAt: string | null };
  deadline: string | null;
  noticeStatus: string | null;
  progressStatus: string | null;
}

export interface ExtractOpts {
  type?: HousingTypeId;
  isSale?: boolean;
  model?: string;
}

function resolveModel(opts: ExtractOpts): PriceModel {
  if (opts.type) return priceModelFor(opts.type);
  return opts.isSale ? "per-unit-sale" : "rows-by-area";
}

// "29,760,000원" / "2976" / 2976 → 만원 정수. 변환 불가면 null.
function toManwon(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const digits = String(v).replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function manwonOrRange(v: unknown): number | [number, number] | null {
  if (Array.isArray(v) && v.length === 2) {
    const a = toManwon(v[0]), b = toManwon(v[1]);
    if (a != null && b != null) return a === b ? a : [Math.min(a, b), Math.max(a, b)];
    return a ?? b;
  }
  return toManwon(v);
}
function str(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s && s.toLowerCase() !== "null" ? s : null;
}

// 공고문이 길면 가격/계층/일정 관련 섹션 주변만 추려 보낸다. LH+SH 공통 키워드.
function selectRelevant(md: string): string {
  if (md.length <= 9000) return md;
  const keys =
    /임대조건|임대보증금|보증금|월\s*임대료|월세|공급금액|공급조건|분양가|매각금액|주택형|공급대상|공급규모|공급형별|소득|계층|[가나]군|소득구간|가구원|지원한도|전환보증금|보증금\s*전환|모집공고|접수|신청기간|당첨자\s*발표|예비입주자\s*발표/g;
  const windows: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = keys.exec(md)) && windows.length < 20) {
    windows.push([Math.max(0, m.index - 300), Math.min(md.length, m.index + 1800)]);
  }
  if (windows.length === 0) return md.slice(0, 9000);
  windows.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([w[0], w[1]]);
  }
  const out = merged.map(([s, e]) => md.slice(s, e)).join("\n\n…(중략)…\n\n");
  return out.length > 20000 ? out.slice(0, 20000) : out;
}

// 모델별 가격 블록 스키마 + 지시.
function priceBlock(model: PriceModel): string {
  switch (model) {
    case "tiered-by-income":
      return `"priceModel":"tiered-by-income",
"tiers":[{"houseType":"주택형(예 26A)","area":"전용면적(㎡포함)|null","supplyUnits":세대수|null,"incomes":[{"label":"소득계층(가군/나군 또는 소득구간 표기)","deposit":보증금만원,"rent":월임대료만원}]}]
※ 같은 주택형이라도 소득계층(가군·나군, 또는 소득구간)별로 보증금·월임대료가 다르면 incomes 에 각 계층을 모두 넣어라. supplyUnits 는 주택형당 1회만(계층마다 반복 금지).`;
    case "by-household-size":
      return `"priceModel":"by-household-size",
"householdTypes":[{"label":"가구원수 유형(예 2인 가구(1형))","areaRange":"전용면적 구간(예 50㎡ 이하)|null","supplyUnits":세대수|null,"deposit":보증금만원 또는 [최소,최대],"rent":월임대료만원 또는 [최소,최대]}]
※ 매입/집주인 임대는 개별 호실이 흩어져 있다. 가구원수 유형(1형/2형/3형)별로 묶고, 호실마다 가격이 다르면 deposit/rent 를 [최소,최대] 범위로 표기.`;
    case "support-limit":
      return `"priceModel":"support-limit",
"supportLimit":{"byHousehold":[{"label":"구분(가구원수/유형)","limitManwon":전세지원한도액 만원}]}
※ 전세임대는 평형이 없다. 가구원수/유형별 전세 지원한도액만 추출.`;
    case "per-unit-sale":
      return `"priceModel":"per-unit-sale",
"rows":[{"houseType":"동·호 또는 타입","area":"전용면적|null","supplyUnits":세대수|null,"deposit":null,"rent":null,"salePriceManwon":분양가만원}]`;
    case "deposit-only":
      return `"priceModel":"deposit-only",
"rows":[{"houseType":"주택형","area":"전용면적|null","supplyUnits":세대수|null,"deposit":전세보증금만원,"rent":null,"salePriceManwon":null}]`;
    default: // rows-by-area
      return `"priceModel":"rows-by-area",
"rows":[{"houseType":"주택형","area":"전용면적|null","supplyUnits":세대수|null,"deposit":보증금만원,"rent":월임대료만원,"salePriceManwon":null}]`;
  }
}

function buildPrompt(doc: string, model: PriceModel): string {
  return `다음은 한국 공공주택(LH/SH) 모집공고문 일부다. 아래 JSON 스키마로만 답하라. 설명·마크다운 없이 JSON 객체 하나만.

{
  ${priceBlock(model)},
  "conversion":{"rateUp":보증금→월세 전환이율(%)|null,"rateDown":월세→보증금 전환이율(%)|null,"perHouseType":[{"houseType":"주택형","limitManwon":전환가능 보증금 한도 만원|null,"maxDeposit":최대전환시 보증금 만원|null,"minRent":최대전환시 월세 만원|null}]}|null,
  "schedule":{"winnerAt":"당첨자(예비입주자) 발표일 YYYY.MM.DD"|null},
  "deadline":"접수 마감일 YYYY.MM.DD"|null,
  "noticeStatus":"일반공고/정정공고/취소공고/재공고 중 하나"|null,
  "progressStatus":"모집예정/모집중/모집완료 중 하나"|null
}

규칙:
- 금액은 반드시 만원 단위 정수로 변환하되, 표 헤더의 단위를 먼저 확인하라:
  · "(원)" → ÷10000 (예: 29,760,000원 → 2976)
  · "(천원)" → ÷10 (예: 37,400천원 → 3740)   ← SH 공고는 보증금이 천원 단위인 경우가 많음
  · "(만원)" → 그대로
- 한 공고에 자치구·단지가 여러 개 묶인 표(특히 SH 행복주택/장기전세)면, 각 (단지·주택형)을 별도 항목으로 모두 추출하고 houseType 에 "자치구 단지명 주택형"(예: "광진구 DM7세종 25형")처럼 묶어 표기하라. 표가 길어도 빠짐없이.
- 전환보증금(보증금 증액으로 월세 인하) 정보가 있으면 conversion 에 채워라. 없으면 null.
- 공고문에 없거나 불확실하면 추측하지 말고 null(배열은 []).

공고문:
"""
${doc}
"""`;
}

export async function extractFromMarkdown(md: string, opts: ExtractOpts = {}): Promise<ExtractedFields> {
  if (!KEY) throw new Error("SOLAR_API_KEY 미설정");
  const model = resolveModel(opts);
  const isSale = model === "per-unit-sale";
  const doc = selectRelevant(md);

  const r = await fetch(BASE + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildPrompt(doc, model) }],
    }),
  });
  if (!r.ok) throw new Error(`Solar 추출 호출 실패 (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const content: string = j.choices?.[0]?.message?.content ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    const s = content.indexOf("{"), e = content.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error("Solar 응답을 JSON 으로 파싱하지 못했습니다.");
    parsed = JSON.parse(content.slice(s, e + 1));
  }

  // rows (rows-by-area / per-unit-sale / deposit-only)
  const rawRows = Array.isArray(parsed.rows) ? (parsed.rows as Record<string, unknown>[]) : [];
  const rows: ExtractedRow[] = rawRows
    .filter((row) => row && (str(row.houseType) || row.supplyUnits != null || row.deposit != null || row.salePriceManwon != null))
    .map((row) => ({
      houseType: str(row.houseType) ?? "—",
      area: str(row.area),
      supplyUnits: toManwon(row.supplyUnits),
      deposit: isSale ? null : toManwon(row.deposit),
      rent: isSale ? null : toManwon(row.rent),
      salePriceManwon: isSale ? toManwon(row.salePriceManwon) : null,
    }));

  // tiers
  let tiers: ExtractedTier[] | undefined;
  if (Array.isArray(parsed.tiers)) {
    tiers = (parsed.tiers as Record<string, unknown>[])
      .filter((t) => t && Array.isArray(t.incomes))
      .map((t) => ({
        houseType: str(t.houseType) ?? "—",
        area: str(t.area),
        supplyUnits: toManwon(t.supplyUnits),
        incomes: (t.incomes as Record<string, unknown>[])
          .map((i) => ({ label: str(i.label) ?? "—", deposit: toManwon(i.deposit), rent: toManwon(i.rent) }))
          .filter((i) => i.deposit != null || i.rent != null),
      }))
      .filter((t) => t.incomes.length > 0);
    if (!tiers.length) tiers = undefined;
  }

  // householdTypes
  let householdTypes: ExtractedHousehold[] | undefined;
  if (Array.isArray(parsed.householdTypes)) {
    householdTypes = (parsed.householdTypes as Record<string, unknown>[])
      .filter((h) => h && str(h.label))
      .map((h) => ({
        label: str(h.label) ?? "—",
        areaRange: str(h.areaRange),
        supplyUnits: toManwon(h.supplyUnits),
        deposit: manwonOrRange(h.deposit),
        rent: manwonOrRange(h.rent),
      }));
    if (!householdTypes.length) householdTypes = undefined;
  }

  // supportLimit
  let supportLimit: ExtractedFields["supportLimit"];
  const slRaw = (parsed.supportLimit as { byHousehold?: unknown })?.byHousehold;
  if (Array.isArray(slRaw)) {
    const byHousehold = (slRaw as Record<string, unknown>[])
      .map((b) => ({ label: str(b.label) ?? "—", limitManwon: toManwon(b.limitManwon) }))
      .filter((b): b is { label: string; limitManwon: number } => b.limitManwon != null);
    if (byHousehold.length) supportLimit = { byHousehold };
  }

  // conversion
  let conversion: ExtractedFields["conversion"];
  const cv = parsed.conversion as Record<string, unknown> | null;
  if (cv && typeof cv === "object") {
    const per = Array.isArray(cv.perHouseType)
      ? (cv.perHouseType as Record<string, unknown>[])
          .map((p) => ({ houseType: str(p.houseType) ?? "—", limitManwon: toManwon(p.limitManwon), maxDeposit: toManwon(p.maxDeposit), minRent: toManwon(p.minRent) }))
          .filter((p) => p.limitManwon != null || p.maxDeposit != null)
      : undefined;
    const rateUp = toManwon(cv.rateUp), rateDown = toManwon(cv.rateDown);
    if (rateUp != null || rateDown != null || (per && per.length)) conversion = { rateUp, rateDown, ...(per && per.length ? { perHouseType: per } : {}) };
  }

  const sched = parsed.schedule as { winnerAt?: unknown } | null;
  const winnerAt = sched ? str(sched.winnerAt) : null;

  return {
    priceModel: model,
    rows,
    tiers,
    householdTypes,
    supportLimit,
    conversion,
    schedule: winnerAt ? { winnerAt } : undefined,
    deadline: str(parsed.deadline),
    noticeStatus: str(parsed.noticeStatus),
    progressStatus: str(parsed.progressStatus),
  };
}
