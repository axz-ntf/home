// 공고문 마크다운 → Solar(추론 모델)로 임대/분양 조건을 구조화 추출.
// open2 계열은 reasoning 모델이라 호출당 수십 초 — 관련 섹션만 추려 토큰/지연을 줄인다.
// 기존 임베딩 호출(app/api/chat/route.ts)과 동일하게 Upstage OpenAI-호환 endpoint 로 직접 fetch.

const BASE = (process.env.SOLAR_BASE_URL ?? "https://api.upstage.ai/v1").replace(/\/$/, "");
const KEY = (process.env.SOLAR_API_KEY ?? "").trim();
const MODEL = (process.env.SOLAR_EXTRACT_MODEL ?? "solar-open2-260528").trim();

export interface ExtractedRow {
  houseType: string;
  area: string | null;
  supplyUnits: number | null;
  deposit: number | null; // 만원
  rent: number | null; // 만원
  salePriceManwon: number | null; // 만원
}

export interface ExtractedFields {
  rows: ExtractedRow[];
  deadline: string | null;
  noticeStatus: string | null;
  progressStatus: string | null;
}

// "29,760,000원" / "2976" / 2976 등을 만원 단위 정수로. 변환 못 하면 null.
function toManwon(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const digits = String(v).replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// 공고문이 길면(보통 100KB+) 임대조건/공급 관련 섹션 주변만 추려서 보낸다.
function selectRelevant(md: string, isSale: boolean): string {
  if (md.length <= 9000) return md;
  const keys = isSale
    ? /공급금액|공급가격|분양가|추정분양가|주택형|공급대상|공급규모|모집공고|접수|신청기간/g
    : /임대조건|임대보증금|보증금|월\s*임대료|월세|주택형|공급대상|공급규모|모집공고|접수|신청기간/g;
  const windows: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = keys.exec(md)) && windows.length < 16) {
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
  return out.length > 16000 ? out.slice(0, 16000) : out;
}

function buildPrompt(doc: string, isSale: boolean): string {
  const priceLine = isSale
    ? "- 분양 매물이므로 각 주택형의 분양가를 salePriceManwon 에 넣어라. deposit/rent 는 null."
    : "- 임대 매물이므로 각 주택형의 보증금을 deposit, 월임대료를 rent 에 넣어라. salePriceManwon 은 null.";
  return `다음은 한국 LH 공공주택 모집공고문의 일부다. 임대/분양 조건을 추출해 JSON 으로만 답하라. 설명·마크다운 없이 JSON 객체 하나만 출력한다.

스키마:
{
  "rows": [
    { "houseType": "주택형 표기(예: 16형, 59A, 84)", "area": "전용면적(㎡ 포함, 예: 59.96㎡)" 또는 null, "supplyUnits": 공급세대수 정수 또는 null, "deposit": 보증금(만원) 정수 또는 null, "rent": 월임대료(만원) 정수 또는 null, "salePriceManwon": 분양가(만원) 정수 또는 null }
  ],
  "deadline": "접수 마감일 YYYY.MM.DD" 또는 null,
  "noticeStatus": "일반공고 / 정정공고 / 취소공고 / 재공고 중 하나" 또는 null,
  "progressStatus": "모집예정 / 모집중 / 모집완료 중 하나" 또는 null
}

규칙:
- 금액은 반드시 만원 단위 정수로 변환한다. 예: 29,760,000원 → 2976, 5억 2,640만원 → 52640.
- 한 공고에 여러 주택형/평형이 있으면 각각을 rows 의 별도 항목으로 만든다.
${priceLine}
- 공고문에 없거나 불확실한 값은 추측하지 말고 null 로 둔다.
- rows 가 하나도 확인되지 않으면 "rows": [] 로 둔다.

공고문:
"""
${doc}
"""`;
}

export async function extractFromMarkdown(md: string, isSale: boolean): Promise<ExtractedFields> {
  if (!KEY) throw new Error("SOLAR_API_KEY 미설정");

  const doc = selectRelevant(md, isSale);
  const r = await fetch(BASE + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildPrompt(doc, isSale) }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Solar 추출 호출 실패 (${r.status}): ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const content: string = j.choices?.[0]?.message?.content ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    // 드물게 코드펜스/앞뒤 텍스트가 섞이면 첫 { ~ 마지막 } 만 떼서 재시도.
    const s = content.indexOf("{");
    const e = content.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error("Solar 응답을 JSON 으로 파싱하지 못했습니다.");
    parsed = JSON.parse(content.slice(s, e + 1));
  }

  const rawRows = Array.isArray(parsed.rows) ? (parsed.rows as Record<string, unknown>[]) : [];
  const rows: ExtractedRow[] = rawRows
    .filter((row) => row && (String(row.houseType ?? "").trim() || row.supplyUnits != null || row.deposit != null || row.salePriceManwon != null))
    .map((row) => ({
      houseType: String(row.houseType ?? "").trim() || "—",
      area: row.area != null ? String(row.area).trim() || null : null,
      supplyUnits: toManwon(row.supplyUnits),
      deposit: isSale ? null : toManwon(row.deposit),
      rent: isSale ? null : toManwon(row.rent),
      salePriceManwon: isSale ? toManwon(row.salePriceManwon) : null,
    }));

  const str = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim();
    return s && s.toLowerCase() !== "null" ? s : null;
  };

  return {
    rows,
    deadline: str(parsed.deadline),
    noticeStatus: str(parsed.noticeStatus),
    progressStatus: str(parsed.progressStatus),
  };
}
