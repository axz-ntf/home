import { parseSupplyTable } from "./extract-supply-from-md.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseNumber, mapHousingType, noticeRows, hasNextPage, collectPages, extractPriceArea } from "./lib/lh-data-quality.mjs";
import { applyComplexTables } from "./lib/lh-official-tables.mjs";
import { buildComplexIndex, findMatchingComplex } from "./lib/lh-complex-match.mjs";

test("API 금액 정밀도·범위 보존, 행 개수는 공급세대수가 아님", () => {
  const s = extractPriceArea({ dsList01: [
    { DDO_AR: "74.95", LS_GMY: "68,801,000", MM_RFE: "433,970" },
    { DDO_AR: "84.86", LS_GMY: "74,481,000", MM_RFE: "496,540" },
  ], dsListNm: [{ name: "메타" }] });
  assert.equal(s.monthlyRentManwon, 43.397);
  assert.deepEqual(s.depositRange, [6880.1, 7448.1]);
  assert.equal(s.supplyUnits, null);
  assert.equal(parseNumber("1,000~2,000"), null);
  assert.equal(parseNumber("공고문 확인"), null);
  assert.equal(parseNumber("0"), 0);
});

test("공공임대 및 미확인 유형에 국민임대 기본값을 부여하지 않음", () => {
  assert.equal(mapHousingType("김포한강 10년 공공임대주택"), "public");
  assert.equal(mapHousingType("통합공공임대 모집"), "integ");
  assert.equal(mapHousingType("추가 입주자 모집"), "rental");
  assert.equal(mapHousingType("50년 공공임대"), "fifty");
});

test("지역별 2,500건의 2·3페이지를 누락하지 않음", () => {
  for (let region = 0; region < 2; region++) {
    assert.equal(hasNextPage(1000, 1000, 2500, 1000), true);
    assert.equal(hasNextPage(2000, 1000, 2500, 1000), true);
    assert.equal(hasNextPage(2500, 500, 2500, 1000), false);
  }
  assert.throws(() => hasNextPage(1000, 0, 2500, 1000));
  assert.throws(() => noticeRows({ error: "invalid key" }));
  assert.throws(() => noticeRows([{}, {}]));
  assert.deepEqual(noticeRows([{}, { dsList: [] }]), []);
});

test("김포 공식 HTML: 주택형·주소·좌표·정확한 원 금액 및 세대수", () => {
  const html = fs.readFileSync(new URL("./fixtures/lh-gimpo-supply.html", import.meta.url), "utf8");
  const l = { title: "김포 10년 공공임대 예비입주자", houseType: "오피스텔" };
  assert.equal(applyComplexTables(l, html), true);
  assert.equal(l.complexes[0].rows[0].houseType, "74.9500A-1");
  assert.equal(l.complexes[0].rows[0].rent, 433970);
  assert.equal(l.complexes[0].rows[0].supplyThisRound, 0);
  assert.equal(l.totalUnits, 1763);
  assert.equal(l.supplyUnits, null);
  assert.equal(l.houseType, null);
  assert.match(l.address, /김포한강8로 15/);
  assert.equal(l.lat, 37.635754);
  assert.deepEqual(l.rentRange, [43.397, 49.654]);
});

test("도로명만 일치하는 오피스텔로 공공임대 단지를 매칭하지 않음", () => {
  const { byKey } = buildComplexIndex([{ brtcCode: "41", signguCode: "570", hsmpNm: "경기도 김포시", rnAdres: "경기도 김포시 김포한강11로 288-5" }]);
  assert.equal(findMatchingComplex({ PAN_NM: "김포한강 Ac-05블록 10년 공공임대주택 예비입주자 모집" }, byKey, "41"), null);
});

test("최종 sync 뒤 공식표와 PDF가 보강되는 파이프라인 순서", () => {
  const pipeline = fs.readFileSync(new URL("./sync-api-first.mjs", import.meta.url), "utf8");
  assert.ok(pipeline.indexOf("scripts/sync-lh-api.mjs") < pipeline.indexOf("scripts/enrich-complexes.mjs"));
  assert.ok(pipeline.indexOf("scripts/enrich-complexes.mjs") < pipeline.indexOf("scripts/extract-supply-from-md.mjs"));
});


test("실제 페이지 순회: 질의 간 건수 분리, 중간 빈 응답·중복 응답 거절", async () => {
  for (const offset of [0, 10000]) {
    const calls = [];
    const rows = await collectPages(async page => {
      calls.push(page);
      return { items: Array.from({ length: page === 3 ? 500 : 1000 }, (_, i) => offset + (page - 1) * 1000 + i), totalCount: 2500 };
    }, 1000);
    assert.equal(rows.length, 2500);
    assert.deepEqual(calls, [1, 2, 3]);
  }
  await assert.rejects(() => collectPages(async page => ({ items: page === 1 ? [1, 2] : [], totalCount: page === 1 ? 3 : 0 }), 2));
  await assert.rejects(() => collectPages(async () => ({ items: [1, 2], totalCount: 4 }), 2));
});

test("공급일정은 첫 순위의 마감이 아닌 전체 신청기간", () => {
  const html = fs.readFileSync(new URL("./fixtures/lh-gimpo-supply.html", import.meta.url), "utf8") + `<table><caption>공급일정</caption><thead><tr><th>구분</th><th>신청일시</th></tr></thead><tbody><tr><td>1순위</td><td>2026.09.10 10:00 ~ 2026.09.11 16:00</td></tr><tr><td>2순위</td><td>2026.09.12 10:00 ~ 2026.09.13 16:00</td></tr></tbody></table>`;
  const listing = {title: "예비입주자"};
  applyComplexTables(listing, html);
  assert.equal(listing.beginDate, "2026.09.10");
  assert.equal(listing.deadline, "2026.09.13");
});


test("모집인원이 동일한 주택형도 합산하고 명시된 통합인원만 예외 처리", () => {
  const md = "| 주택형 | 전용면적 | 모집할 예비자수 |\n| --- | --- | --- |\n| 36A | 36.5 | 20 |\n| 46A | 46.5 | 20 |";
  assert.equal(parseSupplyTable(md).supplyTotal, 40);
  assert.equal(parseSupplyTable(md.replace("모집할 예비자수", "모집할 예비자수 (20)")).supplyTotal, 20);
});
