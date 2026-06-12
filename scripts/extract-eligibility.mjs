#!/usr/bin/env node
// 공고문 markdown → 구조화 자격 정보 JSON 추출.
// Claude Sonnet 4.6 (bizrouter) — Solar 가 표준 카테고리 임의 채워 넣는 환각 이슈로 교체.
// 결과: lib/notice-eligibility/{id}.json
//
// 사용:
//   node --env-file=.env.local scripts/extract-eligibility.mjs [--limit N] [--ids ...] [--force]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEXTS_DIR = path.join(ROOT, "lib/notice-texts");
const OUT_DIR = path.join(ROOT, "lib/notice-eligibility");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) { console.error("ERROR: ANTHROPIC_API_KEY 누락"); process.exit(1); }

const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY.trim() });
// Haiku 4.5: $1/M in, $5/M out (Sonnet 대비 5배↓). 자격 추출은 비교적 단순 → 품질 충분.
const MODEL = process.env.EXTRACT_MODEL ?? "claude-haiku-4-5";

// 자격 정보 schema — LLM 이 생성할 구조.
// 모든 숫자는 만원 단위 (소득/자산), percent 는 도시근로자 % (예: 70, 100, 150).
const eligibilitySchema = z.object({
  supplyTotal: z.number().nullish().describe("이번 회차 총 공급 세대수"),
  tiers: z
    .array(
      z.object({
        // id 는 다양한 한국 공고문 표현을 다 잡으려면 자유 string. UI 에서 name 으로 충분.
        id: z.string().describe("계층 영문 id (예: youth/newlywed/general/senior/etc). 자유 string"),
        name: z.string().describe("계층 한국어 이름 (예: 청년, 신혼부부, 일반세대)"),
        units: z.number().nullish().describe("이 계층 공급 세대수"),
        age: z.string().nullish().describe("연령 조건 (예: '만 19~39세')"),
        marriage: z.string().nullish().describe("혼인 조건"),
        income: z
          .object({
            percent: z.number().nullish().describe("도시근로자 월평균 소득 기준 % (예: 100, 150)"),
            // value 가 null 인 항목도 허용 (Solar 가 가끔 키만 넣고 값 모르면 null 처리)
            byHousehold: z.record(z.string(), z.number().nullable()).nullish(),
            note: z.string().nullish(),
          })
          .nullish(),
        asset: z
          .object({
            total: z.number().nullish().describe("총자산 한도 만원"),
            car: z.number().nullish().describe("자동차 가액 한도 만원"),
          })
          .nullish(),
        other: z.array(z.string()).default([]),
      }),
    )
    .describe("공급 계층 목록"),
  priority: z.array(z.string()).default([]).describe("우선공급 대상 카테고리 (예: '다자녀', '한부모', '노부모 부양', '장애인')"),
});

const SYSTEM_PROMPT = `당신은 한국 LH/마이홈 공공임대주택·공공분양 공고문에서 정형화된 자격 정보를 추출하는 전문가입니다.

**핵심 원칙 — 반드시 지킬 것**:
1. **공고문 본문에 명시된 계층만 추출**. 표준 카테고리(청년/신혼/자녀/노인/대학생 등)를 임의로 채워 넣지 마세요. 본문에 "청년" 언급 없으면 청년 tier 만들지 말 것.
2. **각 tier 는 의미 있는 정보 1개 이상 필요** — units 또는 age/marriage/income/asset 중 하나라도 명시된 경우에만. 모두 null 이면 tier 자체를 만들지 마세요.
3. **국민임대/영구임대처럼 단일 계층 매물**은 tier 1개. 행복주택처럼 다계층 매물만 여러 tier.
4. **영구임대 매물**의 자격은 "수급/차상위/장애" 같은 특별자격이 핵심 — 일반 tier 만 만들고 끝내지 말 것.
5. **name 중복 금지**. "일반"이 두 번 나오면 안 됨. 다른 이름으로 구분되든 통합하든 결정.

데이터 변환:
- 소득/자산 숫자는 만원 단위 정수 ("382만원" → 382, "3억 6,100만원" → 36100).
- byHousehold: 가구원수 string 키 ("1","2","3","4") → 월소득 만원 값.
- 본문에 없으면 null 또는 빈 배열.

우선공급:
- 가점 대상은 priority 배열에 (계층과 분리). 예: 다자녀/한부모/노부모부양/장애인.

출력:
- schema 가 강제하는 JSON 만. 자유 텍스트/주석/마크다운 헤더 금지. 오직 \`{ ... }\` 한 덩어리.`;

async function loadMarkdown(id) {
  return fs.readFile(path.join(TEXTS_DIR, `${id}.md`), "utf8");
}

// Solar Pro 3 가 responseFormat/tool 강제호출 모두 불안정 → 단순 prompt JSON 출력 + 직접 파싱.
// 응답에서 ```json ... ``` 또는 raw JSON 추출하고 zod 로 검증.
function extractJsonFromText(text) {
  // 1) 코드 펜스 안의 JSON
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fence) return fence[1].trim();
  // 2) 첫 { 부터 마지막 } 까지
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

const SCHEMA_HINT = `\n출력 형식 (JSON, 다른 텍스트 금지):
{
  "supplyTotal": <number|null>,
  "tiers": [
    {
      "id": "youth"|"newlywed"|"child"|"single"|"general"|"senior"|"student"|"etc",
      "name": "<한국어 계층 이름>",
      "units": <number|null>,
      "age": <"문자열"|null>,
      "marriage": <"문자열"|null>,
      "income": {
        "percent": <number|null>,
        "byHousehold": { "1": <만원>, "2": <만원>, ... } 또는 null,
        "note": <"문자열"|null>
      } 또는 null,
      "asset": { "total": <만원|null>, "car": <만원|null> } 또는 null,
      "other": ["짧은 문장", ...]
    }
  ],
  "priority": ["다자녀", "한부모", ...]
}`;

// LH 공고문 markdown 에서 자격 정보 섹션만 추출 — input token 90%↓ 비용 절감.
// "신청자격"/"입주자격"/"자격요건" 첫 등장부터 다음 큰 섹션 (신청서류/계약절차 등) 직전까지.
function extractEligibilityRegion(md) {
  // 시작 marker — 자격 관련 첫 등장
  const startRes = [/신\s*청\s*자\s*격/, /입\s*주\s*자\s*격/, /자\s*격\s*요\s*건/, /4\.\s*신청\s*자격/];
  let start = -1;
  for (const re of startRes) {
    const m = md.search(re);
    if (m >= 0 && (start < 0 || m < start)) start = m;
  }
  if (start < 0) return md.slice(0, 15000); // fallback — 자격 marker 못 찾으면 앞 15K

  // 종료 marker — 자격 정보 끝났을 가능성 큰 큰 섹션 헤더
  const endRes = [
    /\d+\.\s*신청\s*서류/, /\d+\.\s*첨부\s*서류/, /\d+\.\s*제출\s*서류/,
    /\d+\.\s*계약\s*및\s*입주/, /\d+\.\s*계약\s*절차/,
    /\d+\.\s*유의\s*사항/, /\d+\.\s*기타\s*안내/, /\d+\.\s*문의\s*처/,
  ];
  let end = md.length;
  const sliceForEnd = md.slice(start + 200); // 시작 직후엔 같은 키워드 잔류물 있을 수 있어 skip
  for (const re of endRes) {
    const m = sliceForEnd.search(re);
    if (m >= 0) end = Math.min(end, start + 200 + m);
  }

  const region = md.slice(start, end);
  // 안전 상한 — 너무 길면 자르기 (Haiku context 충분하지만 비용 효율)
  return region.length > 20000 ? region.slice(0, 20000) : region;
}

// 단위 가드 — 만원 지시에도 LH 원 단위 표를 천원 단위로 출력하는 사례가 있어 보정.
// 소득표: 만원 단위 최솟값 상한(1인 150% ≈ 690만) < 천원 단위 최솟값 하한(1인 50% ≈ 1,750)
// 이라 표 최솟값 1500 이상이면 천원 단위로 판정. 자산은 LH 한도 범위 기준.
function normalizeUnits(obj) {
  let fixed = false;
  for (const tier of obj.tiers ?? []) {
    const table = tier.income?.byHousehold;
    if (table) {
      const vals = Object.values(table).filter((v) => v != null);
      if (vals.length && Math.min(...vals) >= 1500) {
        for (const k of Object.keys(table)) if (table[k] != null) table[k] = Math.round(table[k] / 10);
        fixed = true;
      }
    }
    if (tier.asset?.total != null && tier.asset.total > 100000) { tier.asset.total = Math.round(tier.asset.total / 10); fixed = true; }
    if (tier.asset?.car != null && tier.asset.car > 10000) { tier.asset.car = Math.round(tier.asset.car / 10); fixed = true; }
  }
  return fixed;
}

async function extractOne(id) {
  const md = await loadMarkdown(id);
  const eligibilityRegion = extractEligibilityRegion(md);

  const result = await generateText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT + SCHEMA_HINT,
    prompt:
      `다음은 LH 공고문의 자격 관련 섹션입니다. 자격 정보를 추출해 위 schema 의 JSON 만 출력하세요. 설명/주석/마크다운 헤더 금지, 오직 JSON 한 덩어리.\n\n` +
      eligibilityRegion,
  });

  const raw = extractJsonFromText(result.text ?? "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`JSON parse 실패: ${e.message} / raw=${raw.slice(0, 200)}`);
  }
  const validated = eligibilitySchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`schema 검증 실패: ${validated.error.issues.map((i) => `${i.path.join(".")}=${i.message}`).slice(0, 3).join("; ")}`);
  }
  const unitFixed = normalizeUnits(validated.data);
  return { object: validated.data, usage: result.usage, unitFixed };
}

function parseArgs() {
  const a = process.argv.slice(2);
  const limIdx = a.indexOf("--limit");
  const idsIdx = a.indexOf("--ids");
  return {
    limit: limIdx >= 0 ? Number(a[limIdx + 1]) : 5,
    ids: idsIdx >= 0 ? a[idsIdx + 1].split(",").map((s) => s.trim()) : null,
    force: a.includes("--force"),
  };
}

async function main() {
  const args = parseArgs();
  await fs.mkdir(OUT_DIR, { recursive: true });

  let files = (await fs.readdir(TEXTS_DIR)).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  if (args.ids?.length) files = files.filter((id) => args.ids.includes(id));
  // skip already extracted
  if (!args.force) {
    const existing = new Set((await fs.readdir(OUT_DIR)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")));
    files = files.filter((id) => !existing.has(id));
  }
  files = files.slice(0, args.limit);

  console.log(`처리 대상: ${files.length}건\n`);

  let ok = 0, err = 0;
  let totalIn = 0, totalOut = 0;
  const t0 = Date.now();
  // 병렬 처리 — Claude (BizRouter) rate limit 고려해 보수적으로. 환경변수로 조정 가능.
  const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);

  let nextIdx = 0;
  const total = files.length;
  async function worker(wid) {
    while (true) {
      const i = nextIdx++;
      if (i >= total) return;
      const id = files[i];
      const tStart = Date.now();
      try {
        const { object, usage, unitFixed } = await extractOne(id);
        const tiers = object.tiers?.length ?? 0;
        console.log(`[${i + 1}/${total}] w${wid} ${id}  tiers=${tiers}  priority=${object.priority?.length ?? 0}${unitFixed ? "  (단위보정됨)" : ""}  (${Date.now() - tStart}ms)`);
        await fs.writeFile(path.join(OUT_DIR, `${id}.json`), JSON.stringify(object, null, 2) + "\n", "utf8");
        totalIn += usage?.inputTokens ?? 0;
        totalOut += usage?.outputTokens ?? 0;
        ok++;
      } catch (e) {
        console.log(`[${i + 1}/${total}] w${wid} ${id}  ERROR: ${e.message?.slice(0, 200)}`);
        err++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, w) => worker(w + 1)));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n완료: ok=${ok} err=${err} (${elapsed}s, concurrency=${CONCURRENCY})`);
  console.log(`토큰: in=${totalIn.toLocaleString()} out=${totalOut.toLocaleString()}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
