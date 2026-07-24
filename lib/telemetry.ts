// Langfuse 트레이싱 — AI SDK 의 OTel span 을 Langfuse 로 내보낸다.
// instrumentation.ts 가 NodeSDK 에 등록하고, 서버리스에서는 각 라우트가
// after(() => forceFlush()) 로 응답 후 강제 플러시한다 (미플러시 시 trace 유실).
import { LangfuseSpanProcessor } from "@langfuse/otel";

// globalThis 싱글턴 — instrumentation 번들과 라우트 번들이 이 모듈을 각자 복제해도
// 프로세서 인스턴스는 하나만 쓰게 한다. (인스턴스가 갈리면 라우트의 forceFlush 가
// 스팬이 쌓인 쪽이 아닌 빈 프로세서를 플러시해 trace 가 유실된다.)
const g = globalThis as { __langfuseSpanProcessor?: LangfuseSpanProcessor };

export const langfuseSpanProcessor = (g.__langfuseSpanProcessor ??= new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
}));
