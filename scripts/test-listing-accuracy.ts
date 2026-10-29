import test from "node:test";
import assert from "node:assert/strict";
import { budgetMatch } from "../lib/budget-match";
import { formatManwon } from "../lib/format";
import { rentText } from "../lib/price-label";
import { summarizePrice } from "../lib/price-summary";
import { LH_LISTINGS } from "../lib/lh-adapter";
import type { Listing } from "../lib/types";

test("김포 원문 → 어댑터 → 카드/비교/예산까지 정밀도 유지", () => {
  const l = LH_LISTINGS.find(l => l.id === "lh-rental-0000061160")!;
  assert.ok(l);
  assert.equal(l.type, "public");
  assert.equal(l.totalUnits, 1763);
  assert.equal(l.beginDate, "2026.09.10");
  assert.equal(l.rent, 43.397);
  assert.deepEqual(summarizePrice(l).rent, { min: 43.397, max: 49.654 });
  assert.equal(formatManwon(l.deposit), "6,880.1만원");
  assert.equal(rentText(l), "43.397만~49.654만");
  assert.equal(budgetMatch(l, 10000, 43).text, "설정한 예산 초과");
  assert.equal(budgetMatch(l, 10000, 44).text, "일부 주택형만 예산 충족");
  assert.equal(budgetMatch(l, 10000, 50).tone, "green");
  assert.ok(!l.eligible.includes("소득70"));
});

test("서로 다른 주택형의 최저 보증금·월세를 조합하지 않음", () => {
  const l = { type: "public", complexes: [{ name: null, rows: [
    { deposit: 10000000, rent: 600000 }, { deposit: 50000000, rent: 200000 },
  ] }] } as Listing;
  assert.equal(budgetMatch(l, 2000, 30).tone, "amber");
  assert.equal(budgetMatch({ ...l, priceUnverified: true }, 10000, 100).tone, "neutral");
  assert.equal(budgetMatch({ ...l, complexes: [] }, 10000, 100).tone, "neutral");
});

test("대구 다중 단지는 자기 단지 가격과 주소만 사용", () => {
  const items = LH_LISTINGS.filter(l => l.id.startsWith("lh-rental-0000061156-c"));
  assert.equal(items.length, 2);
  const geumho = items.find(l => l.complexName?.includes("금호"))!;
  const yeongyeong = items.find(l => l.complexName?.includes("연경"))!;
  assert.equal(geumho.rent, 55);
  assert.equal(yeongyeong.rent, 45.15);
  assert.notEqual(geumho.address, yeongyeong.address);
  assert.notEqual(geumho.lat, yeongyeong.lat);
});
