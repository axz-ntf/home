// AI provider (.mjs 스크립트용) — lib/ai-provider.ts 와 동일 로직.
//   claude-* → Anthropic 직접 호출, 그 외 → Upstage Solar (OpenAI 호환).
// env 는 호출 시점에 읽는다 — 스크립트가 .env.local 을 import 이후에 로드하는 경우 대응.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const solarBaseUrl = () =>
  process.env.SOLAR_BASE_URL ?? "https://api.upstage.ai/v1";
export const solarApiKey = () => (process.env.SOLAR_API_KEY ?? "").trim();
export const anthropicApiKey = () => (process.env.ANTHROPIC_API_KEY ?? "").trim();

export const isClaude = (modelId) => modelId.startsWith("claude-");

export const hasAiKey = (modelId) =>
  isClaude(modelId) ? !!anthropicApiKey() : !!solarApiKey();

export function aiModel(modelId) {
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
