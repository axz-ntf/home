// AI provider 스위치 (.mjs 스크립트용) — lib/ai-provider.ts 와 동일 로직.
// 타임리라우터(OpenAI 호환) 우선, TIMELY_ROUTER_API_KEY 없으면 Anthropic 직접 호출 폴백.
// env 는 호출 시점에 읽는다 — 스크립트가 .env.local 을 import 이후에 로드하는 경우 대응.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const timelyBaseUrl = () =>
  process.env.TIMELY_ROUTER_BASE_URL ?? "https://router.stg.timelyai.io/v1";
export const timelyApiKey = () => (process.env.TIMELY_ROUTER_API_KEY ?? "").trim();
export const hasAiKey = () =>
  !!(timelyApiKey() || (process.env.ANTHROPIC_API_KEY ?? "").trim());

export function aiModel(modelId) {
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
