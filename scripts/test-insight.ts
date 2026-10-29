import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { computeInsight, insightCacheKey, isFreshInsight, type InsightResult } from "../lib/insight";
import { POST } from "../app/api/insight/route";

const counts = { CS2: 2, MT1: 0, FD6: 8, CE7: 0, HP8: 1, PM9: 0, BK9: 0, AC5: 0, CT1: 0 };
let fixtureId = 0;
function useFixture(t: TestContext, options: {
  ai?: "success" | "error" | "invalid";
  summary?: string;
  facilities?: "ok" | "missing" | "zero";
  market?: "ok" | "sparse";
} = {}) {
  const originalEnv = process.env;
  process.env = { ...originalEnv, SOLAR_API_KEY: "test-key", KAKAO_REST_API_KEY: "test-key", MOLIT_API_KEY: "test-key", SOLAR_BASE_URL: "https://solar.test/v1", INSIGHT_MODEL: "solar-pro4" };
  t.after(() => { process.env = originalEnv; });
  const region = String(80000 + fixtureId++);
  const calls = { ai: 0, categories: 0, region: 0, market: 0, model: "" };
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.includes("chat/completions")) {
      calls.ai++;
      const body = JSON.parse(String(init?.body));
      calls.model = body.model;
      assert.equal(body.response_format.type, "json_schema");
      const prompt = JSON.parse(body.messages.find((message: { role: string }) => message.role === "user").content);
      assert.equal("marketReference" in prompt, false);
      // Pending requests must overlap long enough to exercise in-flight deduplication.
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (options.ai === "error") return Response.json({ error: { message: "fixture unavailable" } }, { status: 503 });
      const content = options.ai === "invalid" ? "not-json" : JSON.stringify({ summary: options.summary ?? "주변에서 조회된 시설과 학교 위치를 참고할 수 있습니다. 실제 경로와 학교 배정은 별도 확인이 필요합니다.", tags: ["학교 거리 확인"] });
      return Response.json({ id: "fixture", model: body.model, created: 1, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }
    if (url.pathname.includes("search/category")) {
      calls.categories++;
      if (options.facilities === "missing" && url.searchParams.get("category_group_code") === "MT1") return Response.json({}, { status: 503 });
      const value = options.facilities === "zero" ? 0 : counts[url.searchParams.get("category_group_code") as keyof typeof counts];
      return Response.json({ meta: { total_count: value } });
    }
    if (url.pathname.includes("coord2regioncode")) {
      calls.region++;
      return Response.json({ documents: [{ region_type: "B", code: `${region}00000`, region_3depth_name: "테스트동", region_2depth_name: "테스트시" }] });
    }
    if (url.pathname.includes("getRTMSDataSvcAptRent")) {
      calls.market++;
      const count = options.market === "sparse" ? (calls.market === 1 ? 2 : 0) : 1;
      const item = "<item><umdNm>테스트동</umdNm><deposit>10,000</deposit><monthlyRent>0</monthlyRent><excluUseAr>50</excluUseAr></item>";
      return new Response(`<response><header><resultCode>000</resultCode></header><body><totalCount>${count}</totalCount><items>${item.repeat(count)}</items></body></response>`);
    }
    throw new Error("Unexpected network request in insight test");
  });
  return calls;
}

function request(body: unknown): Request {
  return new Request("http://local.test/api/insight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("AI failure preserves collected facts and never claims zero-count facilities exist", async (t) => {
  const calls = useFixture(t, { ai: "error" });
  const result = await computeInsight(37.5357383, 126.6680565, "테스트", "", "sale");
  assert.equal(result.version, 2);
  assert.equal(result.summarySource, "data");
  assert.ok(Number.isFinite(Date.parse(result.generatedAt)));
  assert.equal(calls.ai, 1, "provider failures must not retry");
  assert.match(result.groups.life!.value, /편의점·음식점/);
  assert.doesNotMatch(result.groups.life!.value, /마트|카페|은행/);
  assert.match(result.groups.medical!.value, /병원/);
  assert.doesNotMatch(result.groups.medical!.value, /약국/);
  assert.ok(result.warnings.some((warning) => warning.includes("AI 요약")));
  assert.ok(result.groups.edu?.value.includes("추정"));
});

test("unavailable facilities remain unknown", async (t) => {
  useFixture(t, { ai: "error", facilities: "missing" });
  const result = await computeInsight(35.9963422, 126.7577634);
  assert.equal(result.signals.counts, null);
  assert.equal(result.groups.life, null);
  assert.equal(result.groups.medical, null);
  assert.match(result.summary, /미조회/);
  assert.doesNotMatch(result.summary, /생활·의료시설 검색 결과가 없습니다/);
});

test("actual zero counts remain valid search results", async (t) => {
  useFixture(t, { ai: "error", facilities: "zero" });
  const zero = await computeInsight(35.9963422, 126.7577634);
  assert.equal(zero.signals.counts?.cvs, 0);
  assert.match(zero.groups.life!.value, /검색 결과 없음/);
});

test("insufficient market samples suppress both market text and price-ratio input", async (t) => {
  useFixture(t, { market: "sparse" });
  const result = await computeInsight(37.5357383, 126.6680565);
  assert.equal(result.summarySource, "ai");
  assert.ok(result.tags.includes("편의점 조회됨"));
  assert.ok(!result.tags.includes("학교 거리 확인"), "tags must be based on actual data, not model output");
  assert.equal(result.marketText, null);
  assert.equal(result.marketPerM2, null);
  assert.ok(result.warnings.some((warning) => warning.includes("표본")));
});

test("invalid structured AI output falls back to source data", async (t) => {
  const calls = useFixture(t, { ai: "invalid" });
  const result = await computeInsight(35.9963422, 126.7577634);
  assert.equal(result.summarySource, "data");
  assert.equal(calls.ai, 1);
  assert.notEqual(result.summary, "not-json");
});

test("AI summary preserves verified station, school and facility figures", async (t) => {
  const summary = "군산역까지 도보 약 8분으로 추정됩니다. 군산내흥초등학교까지는 도보 약 5분으로 추정되며, 반경 500m에서 편의점 2곳이 조회됩니다.";
  useFixture(t, { summary });
  const result = await computeInsight(35.9963422, 126.7577634, "군산내흥7");
  assert.equal(result.summarySource, "ai");
  assert.equal(result.summary, summary);
});

for (const [label, summary] of [
  ["invented walking range", "군산역까지 도보 약 5~8분으로 추정됩니다."],
  ["missing estimate qualification", "군산역까지 도보 약 8분 거리입니다."],
  ["station and school times swapped", "군산역까지 도보 약 5분으로 추정됩니다. 군산내흥초등학교까지 도보 약 8분으로 추정됩니다."],
  ["invented facility count", "반경 500m에서 편의점 9곳이 조회됩니다."],
  ["market figure reintroduced", "전세 시세는 평균 2.7억 수준입니다."],
]) {
  test(`AI numeric verification rejects ${label}`, async (t) => {
    useFixture(t, { summary: summary + " 실제 경로를 별도로 확인해 주세요." });
    const result = await computeInsight(35.9963422, 126.7577634, "군산내흥7");
    assert.equal(result.summarySource, "data");
    assert.notEqual(result.summary, summary);
    assert.match(result.summary, /군산역까지 도보 약 8분으로 추정/);
    assert.ok(result.warnings.some((warning) => warning.includes("AI 요약의 수치")));
  });
}

for (const [label, summary] of [
  ["overlong", `${"주변 시설을 참고해 주세요. ".repeat(30)}`],
  ["four sentences", "주변 시설이 조회됩니다. 가까운 학교가 있습니다. 철도역도 조회됩니다. 경로 확인이 필요합니다."],
]) {
  test(`AI summary rejects ${label} output`, async (t) => {
    useFixture(t, { summary });
    const result = await computeInsight(35.9963422, 126.7577634);
    assert.equal(result.summarySource, "data");
    assert.ok(result.summary.length <= 350);
    assert.notEqual(result.summary, summary);
  });
}

test("model selection defaults to Solar, respects chat configuration and explicit insight override", async (t) => {
  const calls = useFixture(t);
  delete process.env.INSIGHT_MODEL;
  process.env.SOLAR_CHAT_MODEL = "solar-pro3";
  await computeInsight(35.9963422, 126.7577634);
  assert.equal(calls.model, "solar-pro3");
  delete process.env.SOLAR_CHAT_MODEL;
  await computeInsight(35.9963422, 126.7577634);
  assert.equal(calls.model, "solar-pro4");
  process.env.INSIGHT_MODEL = "solar-mini4";
  await computeInsight(35.9963422, 126.7577634);
  assert.equal(calls.model, "solar-mini4");
});

test("AI generation has a 12-second abort deadline and returns data on cancellation", async (t) => {
  const calls = useFixture(t);
  const deadline = new AbortController();
  const timeoutCalls: number[] = [];
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    timeoutCalls.push(milliseconds);
    if (milliseconds !== 12_000) return originalTimeout(milliseconds);
    deadline.abort(new DOMException("Timed out", "TimeoutError"));
    return deadline.signal;
  });
  const result = await computeInsight(35.9963422, 126.7577634);
  assert.ok(timeoutCalls.includes(12_000));
  assert.equal(result.summarySource, "data");
  assert.equal(calls.ai, 0, "cancelled AI work must not reach provider");
});

test("cache rejects legacy, expired, invalid and future records", () => {
  const now = Date.parse("2026-10-06T00:00:00Z");
  const cached = (source: "ai" | "data", age: number) => ({ version: 2, summarySource: source, generatedAt: new Date(now - age).toISOString(), signals: { counts: {} }, groups: { edu: {} } }) as InsightResult;
  assert.equal(isFreshInsight({ summary: "legacy" } as InsightResult, now), false);
  assert.equal(isFreshInsight(cached("ai", 24 * 60 * 60 * 1000 - 1), now), true);
  assert.equal(isFreshInsight(cached("ai", 24 * 60 * 60 * 1000), now), false);
  assert.equal(isFreshInsight(cached("data", 59_999), now), true);
  assert.equal(isFreshInsight(cached("data", 60_000), now), false);
  assert.equal(isFreshInsight({ ...cached("ai", 60_000), signals: { ...cached("ai", 0).signals, counts: null } }, now), false);
  assert.equal(isFreshInsight({ ...cached("ai", 60_000), groups: { ...cached("ai", 0).groups, edu: null } }, now), false);
  assert.equal(isFreshInsight(cached("ai", -1000), now), false);
  assert.equal(isFreshInsight({ ...cached("ai", 0), generatedAt: "invalid" }, now), false);
  assert.equal(insightCacheKey(35.9963422, 126.7577634, "happy"), "35.9963,126.7578,happy");
});

test("API rejects invalid bodies before reaching external services", async (t) => {
  const calls = useFixture(t);
  const invalid = [null, [], "bad", {}, { lat: 0, lng: 127 }, { lat: 37, lng: 0 }, { lat: "37", lng: 127 }, { lat: 91, lng: 127 }, { lat: 37, lng: 181 }, { lat: 37, lng: 127, name: {} }, { lat: 37, lng: 127, type: "unknown" }, { lat: 37, lng: 127, address: null }];
  for (const body of invalid) assert.equal((await POST(request(body))).status, 400);
  assert.equal((await POST({ json: async () => ({ lat: Infinity, lng: NaN }) } as Request)).status, 400);
  assert.equal((await POST(new Request("http://local.test/api/insight", { method: "POST", body: "{" }))).status, 400);
  assert.equal(calls.ai + calls.categories + calls.region + calls.market, 0);
});

test("API refreshes legacy seeds, shares concurrent work and retries fallback after one minute", async (t) => {
  const calls = useFixture(t, { ai: "error" });
  const body = { lat: 37.5357383, lng: 126.6680565, type: "sale" };
  const responses = await Promise.all([POST(request(body)), POST(request(body)), POST(request(body))]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200]);
  const results = await Promise.all(responses.map((response) => response.json() as Promise<InsightResult>));
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].version, 2);
  assert.equal(results[0].summarySource, "data");
  assert.equal(calls.ai, 1);
  assert.equal(calls.categories, 9);
  await POST(request(body));
  assert.equal(calls.ai, 1, "fresh fallback should be reused");
  const future = Date.parse(results[0].generatedAt) + 60_001;
  t.mock.method(Date, "now", () => future);
  await POST(request(body));
  assert.equal(calls.ai, 2, "fallback must be retried after expiry");
});
