import { DdsIcon } from "@/components/dds-icon";
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractedMoney, extractedSupply, extractedArea, noticeMoney, noticeProgress, retryLabel } from '@/lib/notice-extraction-summary';
import CollectInformationButton from './collect-information-button';
import { readNoticeInformation } from '@/lib/notice-information';
import Link from 'next/link';
import type { Listing } from '@/lib/types';
import { getSavedDocuments } from '@/lib/saved-documents';
import autoRaw from '@/lib/auto-prices.json';
import { usableAuto, type AutoStore } from '@/lib/auto-prices';
import DocumentViewer from './document-viewer';
import './notice-workspace.css';

async function localWorkerActive() {
  try {
    const state=JSON.parse(await fs.readFile(path.join(process.cwd(),'.cache/information-worker.json'),'utf8'));
    const age=Date.now()-Date.parse(state.at);
    return age>=0 && age<45000;
  } catch { return false; }
}
export default async function NoticeWorkspace({listing,anomalies}:{listing:Listing;anomalies:string[]}) {
  const workerActive=await localWorkerActive();
  const files=listing.sourceUrl?await getSavedDocuments(listing.sourceUrl):[];
  const collected=await readNoticeInformation(listing.id);
  const extracted=collected && collected.sourceUrl===listing.sourceUrl?collected.fields:null;
  const storedRecord=(autoRaw as AutoStore).records[listing.id];
  const record=storedRecord?.sourceUrl===listing.sourceUrl?storedRecord:undefined;
  const approved=usableAuto(record,listing.sourceUrl);
  const status=approved?'검증값 반영':record?.status==='published'?'검증 만료':record?.status==='deferred'?'가격 반영 보류':record?.status==='retry'?'가격 검증 미완료':'가격 검증 기록 없음';
  const date=(s:string)=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const money=noticeMoney;
  const rows=[
    ['접수 시작',listing.beginDate||'미확보',extracted?.schedule?.applyStart],
    ['접수 마감',listing.deadline||'미확보',extracted?.schedule?.applyEnd??extracted?.deadline],
    ['보증금',listing.deposit?money(listing.deposit):'미확보',extractedMoney(extracted,'deposit')],
    ['월 임대료',listing.deposit||listing.rent?money(listing.rent):'미확보',extractedMoney(extracted,'rent')],
    ...(listing.type==='sale'?[['분양가',money(listing.salePriceManwon),extractedMoney(extracted,'salePriceManwon')]]:[]),
    ['전용 면적',listing.area||'미확보',extractedArea(extracted)],
    ['모집 인원',listing.supplyUnits!=null?`${listing.supplyUnits}세대`:'미확보',extractedSupply(extracted)],
    ['서류대상자 발표','미확보',extracted?.schedule?.docResultAt],
    ['당첨자 발표',listing.winnerAt||'미확보',extracted?.schedule?.winnerAt],
    ['주소',listing.address||'미확보',extracted?.address],
  ];
  const steps=[
    {name:'공고문 수집',done:files.length>0,detail:files.length?`원본 ${files.length}개 저장 · ${date(files[0].downloadedAt)}`:'저장된 원본 없음'},
    {name:'AI 원문 분석',done:!!extracted,detail:extracted&&collected?`정보 수집 완료 ${date(collected.collectedAt)}`:record?.sourceHash?`최근 시도 ${date(record.checkedAt)}`:record?'지원 범위 확인 · 원문 분석 전':'추출 기록 없음'},
    {name:'가격 검증',done:!!approved,detail:record?.reason||'원문 표·단위·추출 결과를 대조합니다'},
    {name:'서비스 반영',done:!!approved,detail:approved?'검증된 가격 자동 반영 완료':'검증된 가격 없음 · 추출값은 미반영'},
  ];
  return <>
    <div className="nw-heading">
      <div><Link className="nw-breadcrumb" href="/admin/review">공고 관리 / 공고 상세</Link><h1>{listing.title}</h1><div className="nw-meta"><span>{listing.agency}</span><span>{listing.district}</span><span>공고 {listing.announceDate||'일자 미확보'}</span><span className={`nw-tag ${approved?'nw-success':'nw-pending'}`}>{status}</span></div></div>
      <div className="nw-heading-actions"><span className={`nw-tag ${workerActive?'nw-success':''}`}>{workerActive?'로컬 정보 처리기 실행 확인':'로컬 정보 처리기 실행 확인 안 됨'}</span><CollectInformationButton listingId={listing.id}/><Link className="a-btn secondary" href="/admin/review"><DdsIcon name="arrow-left" size={16}/> 목록으로</Link></div>
    </div>
    <div className="nw-workspace">
      <DocumentViewer files={files}/>
      <section className="nw-card nw-information">
        <header className="nw-card-heading"><h2>수집 정보 확인</h2><span className="nw-tag">원문 기반</span></header>
        <p className="nw-description">저장된 원문 추출 결과입니다. 여러 조건의 가격은 범위로, 통합 모집 인원은 한 번만 표시합니다.</p>
        <div className="nw-table-scroll"><table className="nw-comparison"><thead><tr><th scope="col">항목</th><th scope="col">현재 정보</th><th scope="col">원문 추출 결과 · 미반영</th></tr></thead><tbody>{rows.map(([label,current,value])=><tr key={label}><th scope="row">{label}</th><td className={current==='미확보'?'nw-muted':''}>{current}</td><td className={value?'nw-value':'nw-muted'}>{value||'미확보'}</td></tr>)}</tbody></table></div>
        {extracted && <div className="nw-context"><h3>원문에서 추출한 가격 조건</h3><p className="nw-description">{collected ? date(collected.collectedAt) : ''} 수집 · {noticeProgress(extracted)}</p>{collected?.correctionNote&&<p className="nw-description">원문 대조 정리: {collected.correctionNote}</p>}
          {extracted.rows.map((r,i)=><div key={i} className="nw-extracted-row"><strong>{r.houseType}</strong><p>{r.area ? (/㎡/.test(r.area)?r.area:r.area+'㎡'):'면적 미확보'}{r.supplyUnits!=null?` · ${r.supplyUnits}세대`:''}</p>{extracted.priceModel==='per-unit-sale'?<p>분양가 {r.salePriceRange?r.salePriceRange.map(money).join(' ~ '):money(r.salePriceManwon)}</p>:<p>보증금 {money(r.deposit)} · 월세 {money(r.rent)}</p>}{r.priceBasis&&<p>{r.priceBasis}</p>}</div>)}
          {extracted.tiers?.map((t,i)=><div key={i} className="nw-extracted-row"><strong>{t.houseType}</strong>{t.incomes.map((income,j)=><p key={j}>{income.label} · 보증금 {money(income.deposit)} · 월세 {money(income.rent)}</p>)}</div>)}
          {extracted.householdTypes?.map((h,i)=><div key={i} className="nw-extracted-row"><strong>{h.label}</strong><p>{h.areaRange}</p><p>보증금 {Array.isArray(h.deposit)?h.deposit.map(money).join(' ~ '):money(h.deposit)} · 월세 {Array.isArray(h.rent)?h.rent.map(money).join(' ~ '):money(h.rent)}</p></div>)}
          {extracted.supportLimit?.byHousehold.map((h,i)=><p key={i}>{h.label} · 지원 한도 {money(h.limitManwon)}</p>)}
        </div>}
        {!!extracted?.supplyGroups?.length&&<div className="nw-context"><h3>통합 모집 인원</h3>{extracted.supplyGroups.map(group=><div key={group.label} className="nw-extracted-row"><strong>{group.label}</strong><p>{group.kind==='reserve'?'예비입주자':'공급'} {group.count}{group.kind==='reserve'?'명':'세대'} · 대상별로 합산하지 않습니다.</p><details><summary>원문 근거</summary><p>{group.evidence}</p></details></div>)}</div>}
        <div className="nw-context"><h3>신청 자격과 완화 조건</h3>{extracted?.eligibility?.length?extracted.eligibility.map(rule=><div key={rule.label} className="nw-extracted-row"><strong>{rule.label}</strong><p>{rule.detail}</p><details><summary>원문 근거</summary><p>{rule.evidence}</p></details></div>):<p className="nw-description">저장된 자격 추출 정보가 없습니다. 원문 자격 조건을 확인하세요.</p>}</div>
        {!!extracted?.conversion?.perHouseType?.length&&<details className="nw-context"><summary>보증금 증액·감액 조건</summary><p>증액 시 월세 인하 이율 {extracted.conversion.rateDown??'미확보'}% · 감액 시 월세 증가 이율 {extracted.conversion.rateUp??'미확보'}%</p>{extracted.conversion.perHouseType.map((c,i)=><div className="nw-extracted-row" key={i}><strong>{c.houseType} · {c.direction==='increase'?'보증금 증액':c.direction==='decrease'?'보증금 감액':'방향 미확인'}</strong><p>전환 후 보증금 {money(c.maxDeposit)} · 월세 {money(c.minRent)}</p></div>)}</details>}
        {!!extracted?.warnings?.length&&<div className="nw-attention"><h3>추출 확인 사항</h3><ul>{extracted.warnings.map(w=><li key={w}>{w}</li>)}</ul></div>}
        <div className="nw-context"><h3>자료 상태</h3><dl><div><dt>주소</dt><dd>{listing.address||'주소 미확보'}</dd></div><div><dt>첨부자료</dt><dd>{listing.attachments?.length??0}개 원문 링크 · 공고 전체 기준</dd></div></dl></div>
        {anomalies.length>0&&<div className="nw-attention"><h3>자동 처리에서 확인할 항목</h3><ul>{anomalies.map(item=><li key={item}>{item}</li>)}</ul></div>}
        <div className="nw-info-note">추출 결과는 자동 저장됩니다. 검증 전 정보는 서비스 가격에 반영하지 않습니다.</div>
      </section>
      <aside className="nw-card nw-processing">
        <header className="nw-card-heading"><h2>처리 상태</h2></header><p className="nw-description">마지막 저장 결과입니다. 추출 완료와 가격 검증 완료는 별개입니다.</p>
        <ol className="nw-timeline">{steps.map((step,i)=><li key={step.name} className={step.done?'is-done':''}><span className="nw-step-dot" aria-hidden="true">{step.done?<DdsIcon name="check" size={14}/>:i+1}</span><div><h3>{step.name}</h3><p>{step.detail}</p></div></li>)}</ol>
        <div className="nw-run-info"><h3>실행 정보</h3><dl><div><dt>가격 검증 시도</dt><dd>{record?.attempts??0}회</dd></div><div><dt>재시도 예약 기록</dt><dd>{retryLabel(record?.nextAttemptAt)}</dd></div></dl><Link href="/admin/automation">전체 수집 현황 보기 <DdsIcon name="arrow-right" size={16}/></Link></div>
      </aside>
    </div>
    <div className="nw-bottom"><span className="nw-bottom-note"><DdsIcon name="info" size={16}/> 검증을 통과한 값만 자동 반영됩니다.</span>{listing.sourceUrl&&<a className="a-btn secondary" href={listing.sourceUrl} target="_blank" rel="noreferrer">공식 공고 열기 <DdsIcon name="arrow-up-right" size={16}/></a>}</div>
  </>;
}
