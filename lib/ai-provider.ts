// AI provider 스위치 — 타임리라우터(사내 통합 라우터, OpenAI Chat Completions 호환) 우선,
// TIMELY_ROUTER_API_KEY 없으면 기존 Anthropic 직접 호출로 폴백.
// 회사 방침: bizrouter → 타임리라우터 전환 ('26.06 ai-coding-tips 공지). 키는 타임리 stage 콘솔에서 발급.
// 모델 id 는 양쪽 동일 표기 (claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-8 등).
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const timelyBaseUrl = () =>
  process.env.TIMELY_ROUTER_BASE_URL ?? "https://router.stg.timelyai.io/v1";
export const timelyApiKey = () => (process.env.TIMELY_ROUTER_API_KEY ?? "").trim();
export const hasAiKey = () =>
  !!(timelyApiKey() || (process.env.ANTHROPIC_API_KEY ?? "").trim());

export function aiModel(modelId: string) {
  const key = timelyApiKey();
  if (key) {
    // supportsStructuredOutputs: 라우터는 response_format 을 json_schema 타입으로만 받음 (generateObject 경로).
    return createOpenAICompatible({
      name: "timely",
      baseURL: timelyBaseUrl(),
      apiKey: key,
      supportsStructuredOutputs: true,
    })(modelId);
  }
  return createAnthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim() })(modelId);
}
