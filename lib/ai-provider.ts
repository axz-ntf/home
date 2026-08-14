// AI provider — 모델 id 로 프로바이더를 고른다.
//   claude-*  → Anthropic 직접 호출 (배치 추출·인사이트·평면도)
//   그 외      → Upstage Solar, OpenAI 호환 (챗)
// 타임리라우터에서 전환 ('26.08). 라우터 stg 가 내려가면 AI 기능 전체가 멈추는 구조였다.
// Solar 는 임베딩·문서파싱에 이미 쓰던 경로라 키가 모든 환경에 있고,
// Solar 계열은 이미지 입력을 못 받아 평면도는 Anthropic 으로 남는다.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const solarBaseUrl = () =>
  process.env.SOLAR_BASE_URL ?? "https://api.upstage.ai/v1";
export const solarApiKey = () => (process.env.SOLAR_API_KEY ?? "").trim();
export const anthropicApiKey = () => (process.env.ANTHROPIC_API_KEY ?? "").trim();

export const isClaude = (modelId: string) => modelId.startsWith("claude-");

// 해당 모델을 부를 키가 있는지 — 스크립트 진입 가드용.
export const hasAiKey = (modelId: string) =>
  isClaude(modelId) ? !!anthropicApiKey() : !!solarApiKey();

export function aiModel(modelId: string) {
  if (isClaude(modelId)) {
    return createAnthropic({ apiKey: anthropicApiKey() })(modelId);
  }
  // supportsStructuredOutputs: response_format 을 json_schema 타입으로 보낸다 (generateObject 경로).
  return createOpenAICompatible({
    name: "solar",
    baseURL: solarBaseUrl(),
    apiKey: solarApiKey(),
    supportsStructuredOutputs: true,
  })(modelId);
}
