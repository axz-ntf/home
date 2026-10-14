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

// "claude-cli" → 로컬 Claude Code 헤드리스(`claude -p`), 구독 계정 사용. API 키 불필요.
export const isClaudeCli = (modelId) => modelId === "claude-cli";

export const hasAiKey = (modelId) =>
  isClaudeCli(modelId) ? true : isClaude(modelId) ? !!anthropicApiKey() : !!solarApiKey();

// generateText 와 같은 모양({ text, usage })으로 반환. CLAUDE_CLI_MODEL 로 모델 지정(기본 sonnet).
// readDir 를 주면 그 폴더만 Read 도구로 열 수 있게 한다 (이미지 입력용).
export async function cliGenerateText({ system, prompt, readDir }) {
  const { spawn } = await import("node:child_process");
  const args = ["-p", "--model", process.env.CLAUDE_CLI_MODEL ?? "sonnet", "--output-format", "json",
    "--tools", readDir ? "Read" : "", "--no-session-persistence", "--system-prompt", system,
    ...(readDir ? ["--add-dir", readDir, "--allowedTools", "Read"] : [])];
  const out = await new Promise((resolve, reject) => {
    // ANTHROPIC_API_KEY 가 있으면 CLI 가 구독 로그인 대신 그 키를 쓴다 → 자식 env 에서 제거.
    const { ANTHROPIC_API_KEY: _drop, ...env } = process.env;
    const p = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], env });
    let so = "", se = "";
    p.stdout.on("data", (d) => (so += d));
    p.stderr.on("data", (d) => (se += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(so) : reject(new Error(`claude exit ${code}: ${(se || so).slice(0, 300)}`))));
    p.stdin.end(prompt);
  });
  const r = JSON.parse(out);
  if (r.is_error) throw new Error(`claude-cli: ${String(r.result).slice(0, 300)}`);
  return { text: r.result, usage: { inputTokens: r.usage?.input_tokens, outputTokens: r.usage?.output_tokens } };
}

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
