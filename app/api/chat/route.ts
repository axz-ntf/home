import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { after } from "next/server";
import { langfuseSpanProcessor } from "@/lib/telemetry";
import { aiModel } from "@/lib/ai-provider";
import { z } from "zod";
import { LH_LISTINGS } from "@/lib/lh-adapter";
import { SH_ADMIN_LISTINGS } from "@/lib/sh-adapter";
import { YOUTH_ADMIN_LISTINGS } from "@/lib/youth-adapter";
import { effectiveStatus } from "@/lib/dday";
import { searchByQueryVector } from "@/lib/notice-search";

export const maxDuration = 60;

// RAG hit 의 listingId → 공고 제목. AI 가 "검색 결과가 사용자가 물은 공고와 같은지"
// 스스로 확인해 엉뚱한 공고를 답으로 제시하지 않게 한다(오답 방지).
const TITLE_BY_ID = new Map<string, string>();
for (const l of [...LH_LISTINGS, ...SH_ADMIN_LISTINGS, ...YOUTH_ADMIN_LISTINGS]) {
  TITLE_BY_ID.set(l.id, l.pblancNm || l.title);
}

// 타임리라우터 우선, 키 없으면 Anthropic 직접 호출 (lib/ai-provider 스위치).
const MODEL_ID = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT = `당신은 한국 LH/마이홈 공공임대주택·공공분양 자격 상담 도우미 "다음부동산 AI"입니다.

역할:
- 사용자가 자신의 상황(나이, 가구 구성, 소득, 무주택 여부, 청약통장 등)을 알려주면, 어떤 공공주택 유형(행복주택·국민임대·영구임대·매입임대·전세임대·50년임대·공공분양)에 지원 가능한지 친절하게 안내합니다.
- 자격 충족 여부가 불분명하면 추가 질문을 통해 확인합니다.
- 한국 공공임대 정책에 대한 기본 지식을 활용합니다 — 도시근로자 월평균 소득, 무주택 세대구성원, 자산 기준 등.
- 답변은 한국어 존댓말로, 간결하고 친근하게 (3~6문장).
- 정확하지 않은 정보는 추측하지 말고 "공고문 / LH 청약플러스를 확인해 주세요"로 안내합니다.
- 신청은 마이홈포털(myhome.go.kr) 또는 LH 청약플러스(apply.lh.or.kr)에서 가능하다고 알려주세요.

도구 사용 — recommendListings:
- 사용자가 **실제 모집중인 매물 추천을 원할 때만** \`recommendListings\` tool 을 호출하세요. (예: "추천해줘", "내 조건에 맞는 거 찾아줘", "어디 신청 가능해?", "마감 임박한 거 보여줘")
- 단순 정보/비교 질문(예: "행복주택과 국민임대 차이?", "소득 기준은?")에는 tool 호출 없이 텍스트로만 답하세요.
- **사용자가 명시하지 않은 인자는 절대 채워 넣지 마세요.** 지역, 보증금, 월세, 유형 등은 사용자 발화에서 명확히 추출된 경우에만 인자에 포함. 모르면 빼고 호출.
- 임대 매물에는 \`maxRent\`/\`maxDeposit\`, 분양 매물에는 \`maxSalePrice\` 를 사용하세요 — 분양가를 maxDeposit 에 넣지 마세요.
- 사용자의 우선공급 계층(청년/신혼/자녀/한부모/고령/다자녀/대학생)이 대화에서 명확히 드러나면 \`userTier\` 인자에 넘기세요. 자격 매칭 reason 표시에 사용됩니다. 모르면 빼고 호출.
- tool 호출 후엔 결과를 자연어로 짧게 요약하세요 ("마감 임박순으로 N개 보여드릴게요" 정도). 카드는 UI 가 자동으로 표시합니다 — 텍스트에서 매물 상세를 줄줄이 나열하지 마세요.
- **결과가 0건이면** 그대로 알리고, 조건을 어떻게 완화하면 좋을지 1~2개 구체적으로 제안하세요.

도구 사용 — searchNoticeContent (공고문 RAG):
- 사용자가 매물의 **세부 자격/조건/일정/금액/특수 규정** 같이 공고문에만 적힌 디테일을 물으면 호출하세요.
- 예: "이 매물 청년 자격이 정확히 어떻게 돼?", "맞벌이 소득 합산 방식?", "이번 회차 접수일이 언제야?"
- 직전 recommendListings 호출 결과의 items[].id 가 컨텍스트에 있으면 그 중 가장 관련된 매물의 id 를 listingId 로 넘기세요. 사용자가 "이 매물", "두 번째 매물" 같이 모호하게 지칭하면 첫 번째(1순위) 매물 id 우선.
- 사용자가 명확히 다른 매물을 지칭한 경우만 그 id 사용.
- listingId 없이 전체 인덱스 검색하면 정확도 떨어지므로 가급적 피하세요.
- **오답 방지 (중요)**: 반환된 hits 의 \`title\` 이 사용자가 물은 공고명과 명백히 다르면(예: 사용자는 "왕십리 모노퍼스"를 물었는데 hit title 이 "논산 국민임대"), 그 내용을 그 공고의 답으로 제시하지 마세요. 이럴 땐 "찾으시는 공고가 아직 AI 데이터에 없어요 — LH 청약플러스(apply.lh.or.kr)/마이홈(myhome.go.kr)에서 직접 확인해 주세요" 라고 안내하고, 자격을 추측해서 지어내지 마세요. (\`scoped:false\` 이고 제목 불일치면 특히 주의)
- 반환된 hits 의 text 를 그대로 인용하거나 짧게 요약해서 답변하세요. 인용 시 "공고문에 따르면..." 같이 출처 명시.
- 일반 정책 질문(예: "행복주택 자격이 뭐예요?")에는 호출 금지 — 일반 지식으로 답하세요.

도구 사용 — suggestActions (매우 중요):
- 사용자가 다음 액션을 고를 만한 상황이면 \`suggestActions\` tool 을 호출해 **클릭 가능한 칩 2~3개**를 제공하세요.
- "~~할까요?" "원하시면..." 같이 텍스트로 묻지 말고, **suggestActions 로 선택지를 칩으로** 보여주세요. 사용자가 다시 타이핑할 필요 없게 만드는 게 핵심.
- 사용 시점 예:
  - 매물 0건 → 조건 완화 옵션 칩 ("충북 전체로 확장", "전세임대도 포함")
  - 정보 답변 후 → 후속 액션 칩 ("내 조건으로 검색", "신청 방법 알려줘")
  - 매물 추천 후 → 추가 옵션 칩 ("더 많은 매물 보기", "다른 지역도")
- 칩 라벨은 짧게 (2~10자), query 는 사용자가 입력했을 법한 자연스러운 문장.
- 매물 추천이나 정보 답변을 끝낸 거의 모든 메시지에 suggestActions 를 함께 호출하는 게 좋아요. 단순 인사·간단 정보 외에는.

응답 톤:
- 메시지는 짧게 2~3 문장 이내. 길게 설명할 필요 있으면 suggestActions 로 "자세히 알려줘" 칩을 따로 두세요.
- 이모지는 메시지당 0~1개만. 절제.

원칙:
- 사용자가 "지원 가능한가요?" 같이 짧게 물으면 먼저 몇 가지 핵심 질문(만 나이, 혼인 여부, 자녀 수, 월소득)을 받으세요.
- 마크다운 헤더(#, ##) 사용 금지. 강조는 **굵게**, 목록은 짧은 \`- 항목\` 으로.
- 응답은 컴팩트하게. 빈 줄(연속 \\n\\n)을 남용하지 말고 가능하면 한 단락 안에 자연스럽게 묶으세요. 불필요한 시각 여백 만들지 않기.
`;

// 사용자 조건에 매칭되는 매물을 골라 ID 배열로 반환.
// AI 가 자격 상담 후 적절한 시점에 호출하도록 system prompt 에서 안내.
const recommendListings = tool({
  description:
    "사용자 조건에 맞는 실제 모집중 공공임대/공공분양 매물을 추천. " +
    "사용자가 매물 추천/검색을 요청할 때만 사용. 단순 정보 질문에는 호출하지 말 것.",
  inputSchema: z.object({
    types: z
      .array(z.enum(["happy", "nation", "perm", "integ", "fifty", "sale", "buy", "jeonse", "youth"]))
      .optional()
      .describe(
        "주택 유형 필터 (다중 선택 가능). happy=행복주택, nation=국민임대, perm=영구임대, integ=통합공공임대, fifty=50년임대, sale=공공분양, buy=매입임대, jeonse=전세임대, youth=청년주택",
      ),
    maxRent: z.number().int().positive().optional().describe("최대 월세(만원). 임대 매물에만 적용."),
    maxDeposit: z.number().int().positive().optional().describe("최대 보증금(만원). 임대 매물에만 적용. 분양가에는 사용 금지."),
    maxSalePrice: z.number().int().positive().optional().describe("최대 분양가(만원). 공공분양/매입 매물에만 적용. 예: 4억 → 40000."),
    regionKeyword: z
      .string()
      .min(1)
      .optional()
      .describe(
        "지역 키워드. 매물 제목/시도/구/동/단지명에서 부분 매칭. " +
          "예: '서울', '강서', '가좌', '광교' 모두 가능. " +
          "사용자가 명확히 표현한 지명만 사용 (예: '서울 가좌' → '가좌' 또는 '서울'). " +
          "잘 모르면 시·도 단위(서울/경기 등)로 넓게 호출 후 안 잡히면 더 좁혀가는 식.",
      ),
    urgentOnly: z.boolean().optional().describe("마감 임박(D-7 이내)만 보여줄지"),
    limit: z.number().min(1).max(5).default(3).describe("반환 매물 수 (1~5)"),
    userTier: z
      .enum(["청년", "신혼", "자녀", "한부모", "고령", "다자녀", "대학생"])
      .optional()
      .describe(
        "사용자가 속한 우선공급 계층 (대화에서 추출된 경우에만). " +
          "자격 매칭 reason hook 생성에 사용. 사용자가 명시 안 했으면 빼고 호출.",
      ),
  }),
  execute: async ({ types, maxRent, maxDeposit, maxSalePrice, regionKeyword, urgentOnly, limit, userTier }) => {
    let list = LH_LISTINGS.filter((l) => l.status !== "closed");
    if (types?.length) list = list.filter((l) => types.includes(l.type));
    if (maxRent != null) list = list.filter((l) => l.rent <= maxRent);
    if (maxDeposit != null) list = list.filter((l) => l.deposit <= maxDeposit);
    if (maxSalePrice != null) {
      list = list.filter((l) => l.salePriceManwon != null && l.salePriceManwon <= maxSalePrice);
    }
    if (regionKeyword) {
      const kw = regionKeyword.toLowerCase();
      // title 도 검색 — 매물 제목에 단지명/지명이 들어가는 경우가 많음
      // (예: "서울가좌 행복주택" 의 "가좌" 는 district/address 엔 없지만 title 엔 있음).
      list = list.filter(
        (l) =>
          l.district.toLowerCase().includes(kw) ||
          l.address.toLowerCase().includes(kw) ||
          l.title.toLowerCase().includes(kw),
      );
    }
    if (urgentOnly) {
      list = list.filter((l) => effectiveStatus(l.status, l.deadline, l.beginDate) === "closing");
    }

    // 마감 임박순 정렬
    list.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));

    const top = list.slice(0, Math.min(Math.max(limit ?? 3, 1), 5));
    if (top.length === 0) {
      return {
        count: 0,
        items: [] as { id: string; reasons: string[] }[],
        emptyReason:
          "조건에 매칭되는 모집중 매물이 없습니다. 사용자에게 결과 없음을 알리고 조건 완화(지역 확장, 유형 변경 등)를 1~2개 제안하세요.",
      };
    }
    return {
      count: top.length,
      // AI 가 후속 호출(searchNoticeContent 등) 시 정확한 listingId 를 알 수 있게 title 함께 반환.
      items: top.map((l) => ({
        id: l.id,
        title: l.title,
        reasons: computeReasons(l, { userTier, maxDeposit, maxRent, maxSalePrice, regionKeyword }),
      })),
    };
  },
});

// 매물 + 사용자 컨텍스트로부터 "선택한 이유" hook 2~3개 생성.
// 자유 LLM 생성이 아니라 listing data 기반 결정론적 매칭 → 환각 없음.
function computeReasons(
  l: typeof LH_LISTINGS[number],
  ctx: { userTier?: string; maxDeposit?: number; maxRent?: number; maxSalePrice?: number; regionKeyword?: string },
): string[] {
  const r: string[] = [];

  // 1. 자격 매칭 — 가장 강력한 시그널
  if (ctx.userTier && l.eligible.includes(ctx.userTier)) {
    const tierLabels: Record<string, string> = {
      청년: "청년 자격",
      신혼: "신혼 자격",
      자녀: "자녀 가구",
      한부모: "한부모 가족",
      고령: "고령자",
      다자녀: "다자녀",
      대학생: "대학생",
    };
    r.push(tierLabels[ctx.userTier] ?? `${ctx.userTier} 자격`);
  }

  // 2. 가격 부합 — 사용자가 명시한 예산 안에 들어옴
  if (ctx.maxDeposit != null && l.deposit > 0 && l.deposit <= ctx.maxDeposit) {
    r.push(`보 ${l.deposit.toLocaleString()}만`);
  }
  if (ctx.maxRent != null && l.rent > 0 && l.rent <= ctx.maxRent) {
    r.push(`월 ${l.rent}만`);
  }
  if (ctx.maxSalePrice != null && l.salePriceManwon != null && l.salePriceManwon <= ctx.maxSalePrice) {
    const eok = Math.floor(l.salePriceManwon / 10000);
    const man = l.salePriceManwon % 10000;
    r.push(`분양가 ${eok > 0 ? `${eok}억 ` : ""}${man > 0 ? `${man.toLocaleString()}만` : ""}`.trim());
  }

  // 3. 마감 임박 — D-7 이내
  if (l.deadline) {
    const parts = l.deadline.split(".").map((s) => Number(s.trim()));
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      const [y, m, d] = parts;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
      if (diff >= 0 && diff <= 7) {
        r.push(diff === 0 ? "D-DAY 마감" : `D-${diff} 마감`);
      }
    }
  }

  // 4. 지역 일치
  if (ctx.regionKeyword && (l.district.includes(ctx.regionKeyword) || l.address.includes(ctx.regionKeyword))) {
    r.push(`${ctx.regionKeyword} 위치`);
  }

  // 상위 3개만
  return r.slice(0, 3);
}

// 공고문 본문 의미 검색 — 임베딩 인덱스에서 사용자 질의와 유사한 문단을 가져옴.
// AI 가 추측이 아닌 실제 공고문 텍스트 기반 답변(RAG) 을 할 수 있게 함.
// focusListingId: 사용자가 상세페이지에서 보고 있는 매물 id (요청 body 로 전달).
// LLM 이 listingId 를 명시하지 않아도 이 매물로 scope → 상세페이지 자격 질문이
// 전체검색(scoped:false)으로 새어 엉뚱한 공고를 답하는 문제 방지.
const buildSearchNoticeContent = (focusListingId?: string) => tool({
  description:
    "특정 매물의 공고문 본문에서 사용자 질의와 의미적으로 유사한 문단을 찾아 반환합니다. " +
    "사용 시점: 사용자가 매물의 세부 자격/조건/일정/금액 등 공고문에만 적힌 디테일을 묻거나, " +
    "AI 가 일반론으로 답하기 곤란해 공고문 원문 인용이 필요한 경우. 사용자가 listing 을 본 직후 " +
    "또는 listingId 가 컨텍스트에 있을 때 우선 호출.",
  inputSchema: z.object({
    query: z.string().min(2).describe("검색 질의 (자연어)"),
    listingId: z
      .string()
      .optional()
      .describe("특정 매물의 공고문 안에서만 검색할 때. 없으면 전체 인덱스에서 검색."),
    topK: z.number().min(1).max(8).default(4).describe("반환 청크 수"),
  }),
  execute: async ({ query, listingId, topK }) => {
    // LLM 이 안 넘기면 현재 보고 있는 매물로 fallback.
    const scopeId = listingId ?? focusListingId;
    // 쿼리 임베딩 — solar-embedding-1-large-query
    const r = await fetch(process.env.SOLAR_BASE_URL + "/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SOLAR_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "solar-embedding-1-large-query", input: query }),
    });
    if (!r.ok) {
      return { ok: false, message: `임베딩 호출 실패 (${r.status}).` };
    }
    const j = await r.json();
    const queryVec = j.data?.[0]?.embedding as number[] | undefined;
    if (!queryVec) return { ok: false, message: "임베딩 응답 비어 있음." };

    const hits = await searchByQueryVector(queryVec, {
      topK: topK ?? 4,
      listingIds: scopeId ? [scopeId] : undefined,
    });
    if (!hits.length) {
      return {
        ok: false,
        message:
          "공고문 인덱스에서 일치하는 내용을 찾지 못했어요. 일반 지식 기반으로 답하거나 LH 공고문 확인을 안내하세요.",
      };
    }
    return {
      ok: true,
      scoped: !!scopeId, // 특정 공고에 한정해 검색했는지 — 전체검색이면 매칭 신뢰도 낮음
      hits: hits.map((h) => ({
        listingId: h.listingId,
        title: TITLE_BY_ID.get(h.listingId) ?? "", // 이 청크가 어느 공고에서 왔는지 — 사용자 질문과 대조용
        score: +h.score.toFixed(3),
        text: h.text.slice(0, 600),
      })),
    };
  },
});

// 사용자가 클릭 한 번으로 다음 단계로 진행할 수 있는 빠른 응답 칩.
// AI 가 답변 마무리에 호출하면 클라이언트가 메시지 아래 칩으로 렌더.
const suggestActions = tool({
  description:
    "사용자가 다음 행동을 고를 수 있도록 2~3개의 클릭 가능한 칩을 제시합니다. " +
    "'~~할까요?' 라고 텍스트로 묻는 대신 이 tool 을 호출하세요.",
  inputSchema: z.object({
    actions: z
      .array(
        z.object({
          label: z.string().min(1).max(20).describe("칩에 표시할 짧은 라벨 (2~10자 권장)"),
          query: z.string().min(1).describe("칩 클릭 시 사용자 메시지로 전송될 자연스러운 한국어 문장"),
        }),
      )
      .min(1)
      .max(4),
  }),
  execute: async ({ actions }) => ({ actions }),
});

// 주민등록번호 패턴 마스킹 — 외부 LLM 으로 나가기 전 서버에서 차단 (개인정보 최소화).
// 생년월일 6자리 + 구분자(옵션) + 성별코드(1~8)로 시작하는 7자리.
const maskRRN = (s: string) => s.replace(/\d{6}[-\s]?[1-8]\d{6}/g, "[주민등록번호 삭제됨]");

export async function POST(req: Request) {
  const { messages: rawMessages, focusListingId, eligibility: rawEligibility }: {
    messages: UIMessage[];
    focusListingId?: string;
    eligibility?: string;
  } = await req.json();

  const messages = rawMessages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === "text" ? { ...p, text: maskRRN(p.text) } : p)),
  })) as UIMessage[];
  const eligibility = rawEligibility ? maskRRN(rawEligibility) : rawEligibility;

  // 상세페이지에서 온 요청이면 그 매물을 시스템 컨텍스트로 알려주고, 공고문 RAG 도 이 매물로 scope.
  const focusTitle = focusListingId ? TITLE_BY_ID.get(focusListingId) : undefined;
  let system = SYSTEM_PROMPT;
  if (eligibility) {
    system += `\n\n[사용자가 저장한 자격 프로필]\n${eligibility}\n위 정보는 이미 확보된 사용자 본인 정보입니다. 나이·소득·세대·무주택 여부 등을 다시 묻지 말고 바로 맞춤 상담에 활용하세요. 부족한 항목만 추가로 물으세요.`;
  }
  if (focusTitle) {
    system += `\n현재 사용자가 보고 있는 매물: "${focusTitle}" (id: ${focusListingId}). 이 매물의 공고문 디테일(자격/조건/일정/금액)을 물으면 searchNoticeContent 의 listingId 에 이 id 를 넘기세요.`;
  }

  const result = streamText({
    model: aiModel(MODEL_ID),
    system,
    messages: await convertToModelMessages(messages),
    tools: { recommendListings, suggestActions, searchNoticeContent: buildSearchNoticeContent(focusListingId) },
    // 멀티스텝 — tool 호출 후 AI 가 결과를 보고 follow-up 코멘트를 쓰게 함.
    // 없으면 "찾아볼게요!" 만 출력하고 끝나버려 사용자는 0건/N건 알 길 없음.
    stopWhen: stepCountIs(4),
    experimental_telemetry: { isEnabled: true, functionId: "chat" },
    onError: ({ error }) => {
      console.error("[chat] streamText error", error);
    },
  });

  // 서버리스에서 응답 후 trace 를 Langfuse 로 강제 플러시 (안 하면 유실).
  after(async () => {
    await langfuseSpanProcessor.forceFlush();
  });

  return result.toUIMessageStreamResponse();
}
