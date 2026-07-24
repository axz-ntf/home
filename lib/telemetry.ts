// Langfuse 트레이싱 — AI SDK 호출에 tracer 를 직접 주입한다 (experimental_telemetry.tracer).
// 전역 OTel 레지스트리를 쓰지 않는 이유: Next 번들과 외부화 모듈이 @opentelemetry/api 를
// 복사본으로 나눠 갖면 전역 등록이 서로 안 보여 프로덕션에서 스팬이 통째로 유실된다.
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const g = globalThis as {
  __langfuseSpanProcessor?: LangfuseSpanProcessor;
  __aiTracerProvider?: NodeTracerProvider;
};

export const langfuseSpanProcessor = (g.__langfuseSpanProcessor ??= new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
  // 서버리스는 응답 후 프로세스가 얼어 배치 flush 가 안 나감 — 스팬 즉시 내보내기(공식 권장).
  exportMode: process.env.VERCEL ? "immediate" : "batched",
}));

const tracerProvider = (g.__aiTracerProvider ??= new NodeTracerProvider({
  spanProcessors: [langfuseSpanProcessor],
}));

// streamText/generateText 의 experimental_telemetry.tracer 로 전달.
export const aiTracer = tracerProvider.getTracer("ai");
