import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingCatalogInformation, catalogDisplayAddress } from '../lib/catalog-notice-information';
import { readNoticeInformation } from '../lib/notice-information';

test('saved notice address is connected without changing API data', async () => {
 const info = await readNoticeInformation('lh-rental-2015122300020871');
 assert.ok(info);
 const matched = matchingCatalogInformation('lh-listings', info.sourceUrl, info);
 assert.equal(catalogDisplayAddress('', matched).value, '전북특별자치도 군산시 돌끝로 52');
 assert.equal(catalogDisplayAddress('API 주소', matched).fromNotice, true);
 assert.equal(matched?.fields.schedule?.applyEnd, '2026.10.15');
});
test('unrelated notices and complex-wide addresses cannot be mixed', async () => {
 const info = await readNoticeInformation('lh-rental-2015122300020871');
 assert.ok(info);
 assert.equal(matchingCatalogInformation('lh-listings','https://different.example',info),null);
 assert.equal(matchingCatalogInformation('lh-complexes',info.sourceUrl,info),null);
 assert.equal(matchingCatalogInformation('lh-notices',null,info),null);
 assert.deepEqual(catalogDisplayAddress('API 주소',null),{value:'API 주소',fromNotice:false});
});
test('uncollected notice remains explicitly empty', async () => {
 assert.equal(await readNoticeInformation('test-nonexistent-catalog-notice'),null);
 assert.deepEqual(catalogDisplayAddress('',null),{value:'',fromNotice:false});
});
