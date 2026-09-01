// 정부 API 프록시 — GitHub Actions 러너(해외 IP)가 정부 서버 해외 차단에 막혀
// 크롤링이 실패하는 문제 우회. icn1(서울) 리전에서 대신 fetch 해 그대로 돌려준다.
// 호출 측: scripts/lib/proxy-fetch.mjs (NODE_OPTIONS --import 프리로드).
// 보안: GOV_PROXY_SECRET 헤더 일치 + 대상 호스트 화이트리스트. 그 외 요청은 모두 거부.

export const maxDuration = 120;

const ALLOWED_HOSTS = new Set([
  "apis.data.go.kr",
  "www.myhome.go.kr",
  "data.myhome.go.kr",
  "apply.lh.or.kr",
  "api.vworld.kr",
  "www.i-sh.co.kr",
  "soco.seoul.go.kr",
  "housing.seoul.go.kr",
]);

// 요청 헤더 중 대상 서버로 전달할 것만 통과 (host/connection 류는 fetch 가 재계산).
const FORWARD_REQ_HEADERS = ["accept", "content-type", "user-agent", "referer", "cookie"];

async function proxy(req: Request): Promise<Response> {
  // env 등록 시 파일 끝 개행이 값에 섞여 들어올 수 있어 trim 후 비교.
  const secret = process.env.GOV_PROXY_SECRET?.trim();
  if (!secret || req.headers.get("x-proxy-key")?.trim() !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const target = new URL(req.url).searchParams.get("url");
  if (!target) return Response.json({ error: "url 파라미터 필요" }, { status: 400 });

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return Response.json({ error: "잘못된 url" }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
    return Response.json({ error: `허용되지 않은 호스트: ${targetUrl.hostname}` }, { status: 403 });
  }

  const headers = new Headers();
  for (const name of FORWARD_REQ_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    redirect: "follow",
    // @ts-expect-error — node fetch(undici) 스트리밍 body 전달에 필요
    duplex: "half",
  });

  // 응답을 그대로 스트리밍. content-encoding/length 는 fetch 가 이미 디코딩했으므로 제외.
  const resHeaders = new Headers();
  for (const [name, value] of upstream.headers) {
    if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name)) {
      resHeaders.set(name, value);
    }
  }
  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}

export const GET = proxy;
export const POST = proxy;
