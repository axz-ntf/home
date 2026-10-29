import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTables, usableAuto, MAX_AGE, type TableSelection, type AutoRecord } from '../lib/auto-prices';
const table = '| 주택형 | 임대보증금 | 월임대료 |\n| --- | --- | --- |\n| 36A | 10,000,000 | 123,450 |\n| 46A | 20,000,000 | 100,000 |';
const md = `단위: 원\n${table}`;
const selection: TableSelection = { simpleSingleComplex: true, table, unit: '원', unitQuote: '단위: 원', houseColumn: 0, depositColumn: 1, rentColumn: 2 };
test('preserves fractional rent and paired headline', () => {
  const result = validateTables(md, selection, selection);
  assert.equal(result.deposit, 1000); assert.equal(result.rent, 12.345);
  assert.equal(result.rows?.length, 2);
});
test('rejects invented evidence and wrong units', () => {
  assert.throws(() => validateTables(md, {...selection, table: table.replace('123,450', '555')}, selection));
  assert.throws(() => validateTables(md, {...selection, unit: '만원'}, selection));
});
test('rejects complex conditions and mismatched passes', () => {
  assert.throws(() => validateTables(md, {...selection, simpleSingleComplex: false}, selection));
  assert.throws(() => validateTables(md, selection, {...selection, depositColumn: 2, rentColumn: 1}));
});
test('rejects a partial table and duplicate price conditions', () => {
  const part = {...selection, table: table.split('\n').slice(0,3).join('\n')};
  assert.throws(() => validateTables(md, part, part));
  const duplicate = table.replace('46A', '36A');
  assert.throws(() => validateTables(`단위: 원\n${duplicate}`, {...selection, table: duplicate}, {...selection, table: duplicate}));
});
test('never publishes retry, changed source, expired or future records', () => {
  const now = Date.now();
  const r: AutoRecord = { title: 'test', sourceUrl: 'https://example.com', checkedAt: new Date(now).toISOString(), nextAttemptAt: '', status: 'published', attempts: 1, reason: '', sourceHash: 'abc', fields: validateTables(md,selection,selection) };
  assert.ok(usableAuto(r,r.sourceUrl,now));
  assert.equal(usableAuto({...r,status:'retry'},r.sourceUrl,now),undefined);
  assert.equal(usableAuto(r,'changed',now),undefined);
  assert.equal(usableAuto(r,r.sourceUrl,now+MAX_AGE),undefined);
  assert.equal(usableAuto(r,r.sourceUrl,now-1),undefined);
});

test('manual and official values take precedence; drafts cannot publish prices', async () => {
  const { applyOverride, OVERRIDES } = await import('../lib/manual-overrides');
  const base = { id: 'no-auto-record', deposit: 500, rent: 10, priceSource: 'lh-api', priceUnverified: false } as import('../lib/types').Listing;
  assert.equal(applyOverride(base), base);
  assert.equal(applyOverride({...base, priceSource: 'unknown',priceUnverified:true}).priceUnverified, true);
  OVERRIDES['test-manual-priority'] = { deposit: 700, rent: 12, _reviewedAt: '2026-10-04' };
  try { assert.equal(applyOverride({...base,id:'test-manual-priority'}).deposit,700); }
  finally { delete OVERRIDES['test-manual-priority']; }
});
