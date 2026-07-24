// Next.js instrumentation — 서버 기동 시 1회 실행. Langfuse OTel 트레이싱 등록.
// edge 런타임에서는 @opentelemetry/sdk-node 를 로드할 수 없어 nodejs 일 때만.
// (sdk-node 는 next.config 의 serverExternalPackages 로 번들링 제외 — Vercel 런타임 이슈 방지.)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { langfuseSpanProcessor } = await import("./lib/telemetry");
    const sdk = new NodeSDK({ spanProcessors: [langfuseSpanProcessor] });
    sdk.start();
    console.log("[otel] Langfuse 트레이싱 등록 완료 — key:", !!process.env.LANGFUSE_SECRET_KEY);
  }
}
