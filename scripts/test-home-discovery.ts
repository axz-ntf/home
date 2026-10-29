import test from "node:test";
import assert from "node:assert/strict";
import { conditionMatch, DEFAULT_CONDITIONS, listingFingerprint, changedFields } from "../lib/home-discovery";
import { isNewListing } from "../lib/new-listings";
import type { Listing } from "../lib/types";
const listing = { id: "a", districtId: "seoul", type: "public", deposit: 1000, rent: 60, status: "open", deadline: "2026.10.10", complexes: [{ name: "A", rows: [
  { houseType: "26", area: 26, deposit: 10000000, rent: 600000 },
  { houseType: "46", area: 46, deposit: 50000000, rent: 200000 },
] }] } as Listing;

test("조건은 동일 주택형의 가격·면적을 동시에 만족해야 함", () => {
  assert.equal(conditionMatch(listing, { ...DEFAULT_CONDITIONS, deposit: "2000", rent: "30" }), "outside");
  assert.equal(conditionMatch(listing, { ...DEFAULT_CONDITIONS, deposit: "5000", rent: "30", area: "40" }), "match");
  assert.equal(conditionMatch(listing, { ...DEFAULT_CONDITIONS, deposit: "2000", area: "40" }), "outside");
  assert.equal(conditionMatch(listing, { ...DEFAULT_CONDITIONS, region: "gyeonggi" }), "outside");
});
test("미검수·누락 가격은 예산 일치가 아닌 확인 필요", () => {
  assert.equal(conditionMatch({ ...listing, priceUnverified: true }, { ...DEFAULT_CONDITIONS, rent: "100" }), "unknown");
  assert.equal(conditionMatch({ ...listing, complexes: [] }, { ...DEFAULT_CONDITIONS, area: "20" }), "unknown");
  assert.equal(conditionMatch(listing, { ...DEFAULT_CONDITIONS, rent: "0" }), "outside");
  assert.equal(conditionMatch(listing, DEFAULT_CONDITIONS), "match");
});
test("첫 방문에는 변경 표시 없음, 실제 일정·가격 변화만 구분", () => {
  assert.deepEqual(changedFields(undefined, listing), []);
  const before = listingFingerprint(listing);
  assert.deepEqual(changedFields(before, { ...listing, title: "표시명 정리" }), []);
  assert.deepEqual(changedFields(before, { ...listing, deadline: "2026.10.12" }), ["접수 일정 변경"]);
  assert.deepEqual(changedFields(before, { ...listing, rent: 61 }), ["임대조건 변경"]);
});
test("미래·오래된 공고는 최근 7일 새 공고에서 제외", () => {
  const now = new Date(2026, 9, 3, 12).getTime();
  assert.equal(isNewListing({ ...listing, announceDate: "2026.10.02" }, now), true);
  assert.equal(isNewListing({ ...listing, announceDate: "2026.10.05" }, now), false);
  assert.equal(isNewListing({ ...listing, announceDate: "2026.09.01" }, now), false);
});
