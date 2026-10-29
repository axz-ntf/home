import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readLhSupplyAddresses} from '../lib/lh-supply-addresses';
test('supply addresses exclude office addresses and commented-out values',()=>{
 const html='<h3>공급정보</h3><li>소재지 : 세종특별자치시 시청대로 643(집현동)</li><!-- <li>소재지 : 서울특별시 다른로 1</li> --><li><strong>소재지</strong> 경상북도 경산시 봉황길 53</li><h3>접수처정보</h3><li>소재지 : 세종특별자치시 다정중앙로 20</li>';
 assert.deepEqual(readLhSupplyAddresses(html),['세종특별자치시 시청대로 643(집현동)','경상북도 경산시 봉황길 53']);
 assert.deepEqual(readLhSupplyAddresses('<h3>접수처정보</h3><li>소재지 : 서울특별시 다른로 1</li>'),[]);
});
