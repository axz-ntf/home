import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { coord2region, localCounts } from "../lib/kakao-local";
import { marketRent } from "../lib/molit-rent";

function useTestKeys(t: TestContext) {
  for (const name of ["KAKAO_REST_API_KEY", "MOLIT_API_KEY"]) {
    const previous = process.env[name];
    process.env[name] = "test-only";
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
}

function requestUrl(input: RequestInfo | URL) {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

function regionResponse(lawdCd: string) {
  return Response.json({ documents: [{
    region_type: "B", code: `${lawdCd}00000`,
    region_3depth_name: "테스트동", region_2depth_name: "테스트구",
  }] });
}

const transaction = "<item><umdNm>테스트동</umdNm><deposit>10,000</deposit><monthlyRent>0</monthlyRent><excluUseAr>50</excluUseAr></item>";

function monthResponse(items = transaction, totalCount = 1, resultCode = "000") {
  return new Response(`<response><header><resultCode>${resultCode}</resultCode></header><body><items>${items}</items><totalCount>${totalCount}</totalCount></body></response>`);
}

test("카카오가 확인한 시설 0개는 조회 실패와 구분한다", async (t) => {
  useTestKeys(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    assert.ok(init?.signal);
    assert.equal(init?.cache, "no-store");
    return Response.json({ meta: { total_count: 0 } });
  });
  assert.deepEqual(await localCounts(37.5, 127), {
    cvs: 0, mart: 0, food: 0, cafe: 0, hospital: 0,
    pharmacy: 0, bank: 0, academy: 0, culture: 0,
  });
  assert.equal(calls, 9);
});

test("한 카테고리의 HTTP·JSON·메타 오류도 시설 0개로 바꾸지 않는다", async (t) => {
  useTestKeys(t);
  let failedResponse: () => Response = () => new Response(null, { status: 503 });
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    if (requestUrl(input).searchParams.get("category_group_code") === "CS2") return failedResponse();
    return Response.json({ meta: { total_count: 3 } });
  });
  const responses = [
    () => new Response(null, { status: 503 }),
    () => new Response("invalid JSON"),
    () => Response.json({}),
    ...[null, "0", -1, 1.5].map((count) => () => Response.json({ meta: { total_count: count } })),
  ];
  for (const response of responses) {
    failedResponse = response;
    assert.equal(await localCounts(37.5, 127), null);
  }
});

test("카카오 장소·법정동 조회는 제한 시간 후 null로 종료한다", async (t) => {
  useTestKeys(t);
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, "timeout", (delay: number) => {
    deadlines.push(delay);
    return AbortSignal.abort(new DOMException("Request timed out", "TimeoutError"));
  });
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    throw new Error("Expected an aborted request");
  });
  assert.equal(await localCounts(37.5, 127), null);
  assert.equal(await coord2region(37.5, 127), null);
  assert.deepEqual(deadlines, [...Array<number>(9).fill(4000), 3000]);
});

const incompleteMonths = [
  { name: "HTTP 오류", response: () => new Response(null, { status: 503 }) },
  { name: "HTTP 200의 API 오류", response: () => monthResponse("", 0, "22") },
  { name: "응답 메타 누락", response: () => new Response("<response><body><items/></body></response>") },
  { name: "800건 제한으로 잘린 월", response: () => monthResponse(transaction, 801) },
  { name: "월세 필드 누락", response: () => monthResponse(transaction.replace("<monthlyRent>0</monthlyRent>", "")) },
];

for (const [index, failure] of incompleteMonths.entries()) {
  test(`국토부 ${failure.name}: 부분 평균을 반환하거나 실패를 캐시하지 않는다`, async (t) => {
    useTestKeys(t);
    let monthlyCalls = 0;
    t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (requestUrl(input).hostname === "dapi.kakao.com") return regionResponse(String(11101 + index));
      monthlyCalls++;
      assert.ok(init?.signal);
      assert.equal(init?.cache, "no-store");
      return monthlyCalls === 1 ? failure.response() : monthResponse();
    });
    assert.equal(await marketRent(37.5, 127), null);
    assert.equal(monthlyCalls, 3);

    const recovered = await marketRent(37.5, 127);
    assert.equal(recovered?.jeonseAvg, 10000);
    assert.equal(recovered?.jeonseCount, 3);
    assert.equal(monthlyCalls, 6);
    assert.deepEqual(await marketRent(37.5, 127), recovered);
    assert.equal(monthlyCalls, 6, "세 달 모두 확인된 거래만 재사용한다");
  });
}

test("국토부 조회가 시간 초과하면 부분 평균 없이 종료하고 재시도한다", async (t) => {
  useTestKeys(t);
  const deadlines: number[] = [];
  let expireMonths = true;
  t.mock.method(AbortSignal, "timeout", (delay: number) => {
    deadlines.push(delay);
    return expireMonths && delay === 4000
      ? AbortSignal.abort(new DOMException("Request timed out", "TimeoutError"))
      : new AbortController().signal;
  });
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    return requestUrl(input).hostname === "dapi.kakao.com" ? regionResponse("11110") : monthResponse();
  });
  assert.equal(await marketRent(37.5, 127), null);
  assert.deepEqual(deadlines, [3000, 4000, 4000, 4000]);
  expireMonths = false;
  assert.equal((await marketRent(37.5, 127))?.jeonseCount, 3);
});

test("정상 응답의 거래 0건은 임의 평균 없이 처리한다", async (t) => {
  useTestKeys(t);
  let monthlyCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    if (requestUrl(input).hostname === "dapi.kakao.com") return regionResponse("11111");
    monthlyCalls++;
    return monthResponse("", 0);
  });
  assert.equal(await marketRent(37.5, 127), null);
  assert.equal(await marketRent(37.5, 127), null);
  assert.equal(monthlyCalls, 3, "세 달 모두 확인된 0건 응답은 재사용할 수 있다");
});

test("한국 시간 기준 월이 바뀌면 이전 3개월 캐시 대신 새 기간을 조회한다", async (t) => {
  useTestKeys(t);
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-30T15:00:00Z") });
  const queriedMonths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.hostname === "dapi.kakao.com") return regionResponse("11112");
    queriedMonths.push(url.searchParams.get("DEAL_YMD")!);
    return monthResponse();
  });
  assert.deepEqual((await marketRent(37.5, 127))?.months, ["202609", "202608", "202607"]);
  t.mock.timers.setTime(new Date("2026-10-31T15:00:00Z").getTime());
  assert.deepEqual((await marketRent(37.5, 127))?.months, ["202610", "202609", "202608"]);
  assert.deepEqual(queriedMonths, ["202609", "202608", "202607", "202610", "202609", "202608"]);
});
