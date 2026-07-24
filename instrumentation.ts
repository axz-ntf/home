// Next.js instrumentation — 서버 기동 시 1회 실행. Langfuse OTel 트레이싱 등록.
// edge 런타임에서는 @opentelemetry/sdk-node 를 로드할 수 없어 nodejs 일 때만.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { langfuseSpanProcessor } = await import("./lib/telemetry");
    const sdk = new NodeSDK({ spanProcessors: [langfuseSpanProcessor] });
    sdk.start();
  }
}
