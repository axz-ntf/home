import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMaterials, officialUrl, category } from './lib/notice-materials.mjs';
const source = 'https://apply.lh.or.kr/lhapply/test.do';
test('collects documents, images and floorplans separately without duplicates', () => {
 const html = `<a onclick="fileDownLoad('123')">모집공고문.pdf</a><a onclick="fileDownLoad('123')">공고문.pdf</a>
 <script>list.push("{cmnAhflSn=456, slPanAhflDsCdNm=평면도, cmnAhflNm=36A.jpg}");list.push("{cmnAhflSn=789, lsSplInfUplFlDsCdNm=단지조감도, cmnAhflNm=view.jpg}");</script>`;
 const result = parseMaterials(html,source);
 assert.equal(result.length,3);
 assert.deepEqual(result.map(x=>x.kind).sort(), ['floorplan','notice','photo']);
});
test('rejects unsafe and unofficial URLs, resolves relative official attachments', () => {
 assert.equal(officialUrl('https://apply.lh.or.kr.evil.test/a.pdf'),false);
 assert.equal(officialUrl('http://apply.lh.or.kr/a.pdf'),false);
 assert.equal(officialUrl('https://u:p@apply.lh.or.kr/a.pdf'),false);
 const result = parseMaterials('<a href="/files/form.pdf">신청서</a><a href="https://evil.test/x.pdf">bad</a><a href="javascript:fileDown()">bad</a>',source);
 assert.equal(result.length,1); assert.equal(result[0].kind,'form');
});
test('no attachment is an empty result, not a fabricated source',()=>{
 assert.deepEqual(parseMaterials('<html>공고문을 참조하세요</html>',source),[]);
 assert.equal(category('공급 주택 설명'), 'other');
 assert.equal(category('동호배치도.pdf'), 'layout');
});

test('housing files with separators or notice labels are collected as housing lists',()=>{
 assert.equal(category('공고문_공급_목록.xlsx'),'housing-list');
 assert.equal(category('주택 보유 목록.xlsx'),'housing-list');
});
