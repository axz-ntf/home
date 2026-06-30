// Solar Pro 3 vs Claude Sonnet 4.6 — recommendListings tool calling 비교 테스트.
// 같은 system prompt + 같은 tool 정의로 10개 질문을 양 모델에 던져
// (1) tool 호출 여부 (2) 인자 (3) 텍스트 응답 을 나란히 출력.
//
// 실행:  node --env-file=.env.local scripts/compare-models.mjs
//
// 주의: 아래 SOLAR_API_KEY 는 사용자가 테스트용으로 제공한 키 — 영속화 금지.
// 본 스크립트는 .gitignore 처리하거나 테스트 후 제거 권장.

import { generateText, tool } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
if (!SOLAR_API_KEY) {
  console.error("ERROR: SOLAR_API_KEY env var not set. 사용자 env 파일에 SOLAR_API_KEY=... 추가 후 재실행.");
  process.exit(1);
}
const SOLAR_MODEL_ID = process.env.SOLAR_MODEL ?? "solar-pro3";

const bizrouter = createOpenAICompatible({
  name: "bizrouter",
  baseURL: process.env.BIZROUTER_BASE_URL ?? "https://api.bizrouter.ai/v1",
  apiKey: process.env.BIZROUTER_API_KEY,
});
const CLAUDE_MODEL_ID = process.env.BIZROUTER_MODEL ?? "anthropic/claude-sonnet-4.6";

const upstage = createOpenAICompatible({
  name: "upstage",
  baseURL: "https://api.upstage.ai/v1",
  apiKey: SOLAR_API_KEY,
});

const SYSTEM_PROMPT = `당신은 한국 LH/마이홈 공공임대주택·공공분양 자격 상담 도우미 "다음부동산 AI"입니다.

역할:
- 사용자가 자신의 상황을 알려주면 어떤 공공주택 유형에 지원 가능한지 친절하게 안내합니다.
- 답변은 한국어 존댓말, 간결하게 (3~6문장).

도구 사용 — recommendListings:
- 사용자가 **실제 모집중인 매물 추천을 원할 때만** \`recommendListings\` tool 을 호출하세요. (예: "추천해줘", "내 조건에 맞는 거 찾아줘", "어디 신청 가능해?", "마감 임박한 거 보여줘")
- 단순 정보/비교 질문(예: "행복주택과 국민임대 차이?", "소득 기준은?")에는 tool 호출 없이 텍스트로만 답하세요.
- tool 호출 후엔 결과를 짧게 요약하세요 ("마감 임박순으로 N개 보여드릴게요" 정도). 카드는 UI 가 자동 표시 — 텍스트로 매물 나열 금지.
`;

const recommendListings = tool({
  description:
    "사용자 조건에 맞는 실제 모집중 공공임대/공공분양 매물을 추천. " +
    "사용자가 매물 추천/검색을 요청할 때만 사용. 단순 정보 질문에는 호출하지 말 것.",
  inputSchema: z.object({
    types: z
      .array(z.enum(["happy", "nation", "perm", "integ", "fifty", "sale", "buy", "jeonse"]))
      .optional()
      .describe("주택 유형 필터"),
    maxRent: z.number().optional().describe("최대 월세(만원)"),
    maxDeposit: z.number().optional().describe("최대 보증금(만원)"),
    regionKeyword: z.string().optional().describe("지역 키워드 (예: '서울', '강서')"),
    urgentOnly: z.boolean().optional().describe("마감 임박(D-7 이내)만"),
    limit: z.number().min(1).max(5).default(3).describe("반환 매물 수"),
  }),
  // 실제 매물 검색 대신 mock — 호출 자체와 인자 추출만 평가
  execute: async (args) => ({ count: 3, ids: ["mock-1", "mock-2", "mock-3"], echoedArgs: args }),
});

const QUESTIONS = [
  { id: 1, q: "행복주택과 국민임대 차이가 뭐예요?", expectTool: false, note: "정보 비교 질문" },
  { id: 2, q: "내 조건에 맞는 매물 추천해줘", expectTool: true, note: "순수 추천 요청 (인자 없음)" },
  { id: 3, q: "보증금 2천만원 이하 강서구 행복주택 보여줘", expectTool: true, note: "복합 필터 — maxDeposit/regionKeyword/types" },
  { id: 4, q: "28살 청년 1인가구, 월소득 250만원인데 어디 지원 가능해?", expectTool: null, note: "자격 상담 — follow-up 질문 or tool 호출 둘 다 OK" },
  { id: 5, q: "마감 임박한 거 보여줘", expectTool: true, note: "urgentOnly: true" },
  { id: 6, q: "공공임대 신청 방법 알려줘", expectTool: false, note: "절차 정보 질문" },
  { id: 7, q: "신혼부부인데 지원 가능한 거 추천 좀", expectTool: true, note: "추천 + 신혼 컨텍스트" },
  { id: 8, q: "소득 기준이 어떻게 되나요?", expectTool: false, note: "정책 정보 질문" },
  { id: 9, q: "분양가 4억 이하 공공분양 추천해줘", expectTool: true, note: "추천 + types: ['sale'] (maxDeposit 잘못 쓰면 안 됨)" },
  { id: 10, q: "안녕하세요", expectTool: false, note: "인사" },
];

async function testModel(model, modelLabel, question) {
  const t0 = Date.now();
  try {
    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: question }],
      tools: { recommendListings },
      // 한 번의 응답에서 tool 호출 + (혹은) 텍스트 까지만. tool result 받은 후 재호출 X.
      stopWhen: ({ steps }) => steps.length >= 1,
    });
    const calls = result.toolCalls ?? [];
    return {
      ok: true,
      ms: Date.now() - t0,
      calledTool: calls.length > 0,
      args: calls[0]?.input,
      text: (result.text ?? "").trim(),
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e.message ?? String(e) };
  }
}

function fmtCheck(actual, expected) {
  if (expected == null) return "—";
  return actual === expected ? "✓" : "✗";
}

function pad(s, n) {
  s = String(s ?? "");
  if (s.length >= n) return s.slice(0, n - 1) + "…";
  return s + " ".repeat(n - s.length);
}

(async () => {
  console.log(`\n비교 테스트:  ${CLAUDE_MODEL_ID}  vs  ${SOLAR_MODEL_ID}\n`);
  console.log("=".repeat(100));

  const summary = { claude: { hit: 0, miss: 0, err: 0 }, solar: { hit: 0, miss: 0, err: 0 } };

  for (const { id, q, expectTool, note } of QUESTIONS) {
    console.log(`\n[${id}] ${q}`);
    console.log(`    expect tool=${expectTool == null ? "?" : expectTool ? "YES" : "NO"}  (${note})`);

    const [claude, solar] = await Promise.all([
      testModel(bizrouter(CLAUDE_MODEL_ID), "Claude", q),
      testModel(upstage(SOLAR_MODEL_ID), "Solar", q),
    ]);

    function row(label, r) {
      const key = label === "Claude" ? "claude" : "solar";
      if (!r.ok) {
        summary[key].err++;
        console.log(`  ${pad(label, 7)} ERROR (${r.ms}ms): ${r.error?.slice(0, 80)}`);
        return;
      }
      if (expectTool != null) {
        if (r.calledTool === expectTool) summary[key].hit++;
        else summary[key].miss++;
      }
      const check = fmtCheck(r.calledTool, expectTool);
      const argsStr = r.args ? JSON.stringify(r.args) : "—";
      console.log(`  ${pad(label, 7)} tool=${r.calledTool ? "YES" : "NO "} ${check}  ${r.ms}ms`);
      console.log(`          args: ${argsStr}`);
      if (r.text) console.log(`          text: ${r.text.replace(/\n+/g, " ").slice(0, 110)}${r.text.length > 110 ? "…" : ""}`);
    }

    row("Claude", claude);
    row("Solar", solar);
  }

  console.log("\n" + "=".repeat(100));
  console.log(`\n요약 (expectTool 명시된 9개 케이스 기준):`);
  console.log(`  Claude:  ${summary.claude.hit}/${summary.claude.hit + summary.claude.miss} 일치   에러 ${summary.claude.err}`);
  console.log(`  Solar:   ${summary.solar.hit}/${summary.solar.hit + summary.solar.miss} 일치   에러 ${summary.solar.err}`);
})();
