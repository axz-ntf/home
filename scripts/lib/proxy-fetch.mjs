// 정부 서버 해외 IP 차단 우회 — globalThis.fetch 를 패치해 차단된 호스트로의
// 요청만 Vercel icn1(서울) 프록시(/api/govproxy)로 재라우팅한다.
// 사용: NODE_OPTIONS="--import ./scripts/lib/proxy-fetch.mjs" (스크립트 수정 불필요)
// 필요 env: GOV_PROXY_URL (예: https://public-housing-map.vercel.app/api/govproxy),
//           GOV_PROXY_SECRET, GOV_PROXY_HOSTS (쉼표 구분, 미설정 시 기본 차단 목록)

const PROXY_URL = process.env.GOV_PROXY_URL;
// 등록 시 섞인 개행은 제거 — HTTP 헤더에 개행이 있으면 undici 가 throw 한다.
const PROXY_SECRET = process.env.GOV_PROXY_SECRET?.trim();
const HOSTS = new Set(
  (process.env.GOV_PROXY_HOSTS ||
    "apis.data.go.kr,www.myhome.go.kr,data.myhome.go.kr,api.vworld.kr")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
);

if (PROXY_URL && PROXY_SECRET) {
  const directFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      return directFetch(input, init);
    }
    if (!HOSTS.has(host)) return directFetch(input, init);

    const proxied = `${PROXY_URL}?url=${encodeURIComponent(url)}`;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("x-proxy-key", PROXY_SECRET);
    return directFetch(proxied, { ...init, headers });
  };
  console.log(`[proxy-fetch] 정부 API 프록시 활성: ${[...HOSTS].join(", ")}`);
}
