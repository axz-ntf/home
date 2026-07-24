// Langfuse 트레이싱 — AI SDK 의 OTel span 을 Langfuse 로 내보낸다.
// instrumentation.ts 가 NodeSDK 에 등록하고, 서버리스에서는 각 라우트가
// after(() => forceFlush()) 로 응답 후 강제 플러시한다 (미플러시 시 trace 유실).
import { LangfuseSpanProcessor } from "@langfuse/otel";

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});
