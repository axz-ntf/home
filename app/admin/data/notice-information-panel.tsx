import type { NoticeInformation } from '@/lib/notice-information';
import { displayTime } from '@/lib/housing-catalog-store';
import { extractedMoney, extractedSupply, extractedArea, noticeMoney } from '@/lib/notice-extraction-summary';

export function NoticeInformationPanel({ information }: { information: NoticeInformation | null }) {
  if (!information) return <section id="notice-information" className="hd-panel hd-section"><h2>공고문 추출 정보</h2><p>이 공고와 일치하는 저장된 추출 결과가 없습니다. 연결된 서비스 공고에서 수집 상태를 확인할 수 있습니다.</p></section>;
  const f = information.fields;
  const facts = [
    ['주소', f.address || '미확보'], ['전용면적', extractedArea(f)], ['공급 규모', extractedSupply(f)],
    ['보증금', extractedMoney(f, 'deposit')], ['월 임대료', extractedMoney(f, 'rent')], ['분양가', extractedMoney(f, 'salePriceManwon')],
    ['접수 시작', f.schedule?.applyStart || '미확보'], ['접수 마감', f.schedule?.applyEnd || f.deadline || '미확보'],
    ['서류 대상자 발표', f.schedule?.docResultAt || '미확보'], ['당첨자 발표', f.schedule?.winnerAt || '미확보'],
  ];
  return <section id="notice-information" className="hd-panel hd-section">
    <h2>공고문 추출 정보 <span className="hd-pill">공식 첨부자료 기준</span></h2>
    <p>{information.sourceLabel} · 추출 {displayTime(information.collectedAt)}</p>
    {information.correctedAt && <p>보완 {displayTime(information.correctedAt)}</p>}
    <dl className="hd-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {f.rows.length > 0 && <details className="hd-raw"><summary>주택형별 금액 {f.rows.length}개 조건</summary><div className="hd-table-scroll"><table className="hd-table"><thead><tr><th>주택형</th><th>면적 ㎡</th><th>보증금</th><th>월 임대료</th><th>분양가</th></tr></thead><tbody>{f.rows.map((r,i) => <tr key={i}><td>{r.houseType}</td><td>{r.area ?? '미확보'}</td><td>{noticeMoney(r.deposit)}</td><td>{noticeMoney(r.rent)}</td><td>{r.salePriceRange ? r.salePriceRange.map(noticeMoney).join(' ~ ') : noticeMoney(r.salePriceManwon)}</td></tr>)}</tbody></table></div></details>}
    {f.tiers?.length ? <details className="hd-raw"><summary>소득 구간별 임대조건</summary><dl className="hd-facts">{f.tiers.flatMap((tier,i) => tier.incomes.map((income,j) => <div key={`${i}:${j}`}><dt>{tier.houseType} · {income.label}</dt><dd>보증금 {noticeMoney(income.deposit)} / 월 임대료 {noticeMoney(income.rent)}</dd></div>))}</dl></details> : null}
    {f.householdTypes?.length ? <details className="hd-raw"><summary>가구별 임대조건</summary><dl className="hd-facts">{f.householdTypes.map((h,i) => <div key={i}><dt>{h.label}</dt><dd>면적 {h.areaRange || '미확보'} / 보증금 {Array.isArray(h.deposit) ? h.deposit.map(noticeMoney).join(' ~ ') : noticeMoney(h.deposit)} / 월 임대료 {Array.isArray(h.rent) ? h.rent.map(noticeMoney).join(' ~ ') : noticeMoney(h.rent)}</dd></div>)}</dl></details> : null}
    {f.supportLimit?.byHousehold.length ? <details className="hd-raw"><summary>가구별 지원 한도</summary><dl className="hd-facts">{f.supportLimit.byHousehold.map((h,i) => <div key={i}><dt>{h.label}</dt><dd>{noticeMoney(h.limitManwon)}</dd></div>)}</dl></details> : null}
    {f.conversion && <details className="hd-raw"><summary>보증금 전환조건</summary><p>증액 전환율 {f.conversion.rateUp == null ? '미확보' : `${f.conversion.rateUp}%`} / 감액 전환율 {f.conversion.rateDown == null ? '미확보' : `${f.conversion.rateDown}%`}</p><dl className="hd-facts">{f.conversion.perHouseType?.map((c,i) => <div key={i}><dt>{c.houseType} · {c.direction === 'increase' ? '증액' : c.direction === 'decrease' ? '감액' : '방향 미확보'}</dt><dd>한도 {noticeMoney(c.limitManwon)} / 전환 후 보증금 {noticeMoney(c.maxDeposit)} / 전환 후 월 임대료 {noticeMoney(c.minRent)}</dd></div>)}</dl></details>}
    {f.eligibility?.length ? <details className="hd-raw"><summary>입주 자격 {f.eligibility.length}개 항목</summary><dl className="hd-facts">{f.eligibility.map((e,i) => <div key={i}><dt>{e.label}</dt><dd>{e.detail}<details><summary>원문 근거</summary><p>{e.evidence}</p></details></dd></div>)}</dl></details> : null}
    {f.warnings?.map((w,i) => <p className="hd-alert" key={i}>{w}</p>)}
    <details className="hd-raw"><summary>전체 추출값 · 전환조건 · 원문 근거</summary><pre>{JSON.stringify(f,null,2)}</pre></details>
    <p className="hd-footnote">공고문에서 추출한 저장값입니다. API 원본은 아래 수집 데이터에 그대로 보존하며, 여러 주택형의 공급 수를 임의로 합산하지 않습니다.</p>
  </section>;
}
