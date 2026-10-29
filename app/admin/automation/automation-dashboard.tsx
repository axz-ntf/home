'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import type {AutomationData,AutomationRow} from './automation-data';
import {DdsIcon} from '@/components/dds-icon';
const statusLabels={published:'검증값 있음',deferred:'보류',retry:'처리 오류',expired:'검증 만료',waiting:'기록 없음'};
const date=(s:string|null)=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'기록 없음';
const detail=(r:AutomationRow)=>`/admin/review/${encodeURIComponent(r.id)}`;
export default function AutomationDashboard({data}:{data:AutomationData}){
 const router=useRouter();const [tab,setTab]=useState<'notices'|'files'>('notices');const [query,setQuery]=useState('');const [agency,setAgency]=useState('all');const [filter,setFilter]=useState('all');const [page,setPage]=useState(1);const [refreshing,startRefresh]=useTransition();
 const q=query.trim().toLowerCase();
 const rows=data.rows.filter(r=>(agency==='all'||r.agency===agency)&&(!q||`${r.title} ${r.district}`.toLowerCase().includes(q))&&(filter==='all'||(filter==='extracted'?!!r.extractedAt:filter==='pending'?!r.extractedAt:['deferred','retry','expired'].includes(r.priceState))));
 const files=data.files.filter(f=>(agency==='all'||f.agency===agency)&&(!q||`${f.title} ${f.name}`.toLowerCase().includes(q)));
 const total=tab==='files'?files.length:rows.length;
 const pageCount=Math.max(1,Math.ceil(total/8)),currentPage=Math.min(page,pageCount),start=(currentPage-1)*8;
 const reset=()=>setPage(1);
 const agencies=[...new Set([...data.rows.map(r=>r.agency),...data.files.map(f=>f.agency)])];
 const tabs=[{id:'notices',label:'공고별 자료',count:data.rows.length},{id:'files',label:'저장된 파일',count:data.files.length}] as const;
 return <div className="auto-page">
  <header className="auto-heading"><div><h1>수집 현황</h1><p>공공 API로 공고를 수집하고, 부족한 정보는 공식 첨부자료로 보완합니다.</p></div><button className="auto-refresh" disabled={refreshing} onClick={()=>startRefresh(()=>router.refresh())}>{refreshing?'갱신 중…':'현황 새로고침'}</button></header>
  <section className="auto-panel" style={{padding:24,marginBottom:16}}><h2>API 우선 수집</h2><p>공공 API와 공식 사이트 → 공고·단지 수집 → 첨부 원본 확인 → 주택목록 주소 추출</p><p>자동 수집은 AI 호출 없이 정해진 코드로 실행합니다. 공식 공고문은 별도 작업에서 Supabase에 저장합니다.</p><p>{data.pipeline ? `최근 실행: ${data.pipeline.status === 'completed' ? '완료' : data.pipeline.status === 'awaiting-ai' ? '이전 실행 기록 · 상태 재확인 필요' : data.pipeline.status === 'failed' ? '실패 · 로그 확인 필요' : '실행 중 또는 중단 여부 확인 필요'} · ${data.pipeline.stage} · ${date(data.pipeline.finishedAt ?? data.pipeline.startedAt)}` : '새 수집 방식의 실행 기록이 아직 없습니다.'}</p></section>
  <p className="auto-worker-note">로컬 API 수집 처리기: {data.worker.active?'실행 확인':'실행 확인 안 됨'} · 마지막 응답 {date(data.worker.at)}<br/>아래 내용은 저장된 기록입니다. 전체 수집 작업의 실행 여부나 다음 실행 시각을 나타내지는 않습니다.</p>
   <section className="auto-panel auto-list-panel">
    <nav className="auto-tabs" aria-label="수집 자료 보기">{tabs.map(t=><button key={t.id} aria-pressed={tab===t.id} className={tab===t.id?'is-active':''} onClick={()=>{setTab(t.id);setFilter('all');reset();}}>{t.label}<span>{t.count}</span></button>)}</nav>
    <div className="auto-toolbar"><label className="auto-search"><DdsIcon name="search" aria-hidden="true"/><span className="auto-sr-only">공고명 또는 파일명 검색</span><input value={query} onChange={e=>{setQuery(e.target.value);reset();}} placeholder={tab==='files'?'공고명 또는 파일명 검색':'공고명 또는 지역 검색'}/></label><label><span className="auto-sr-only">기관</span><select value={agency} onChange={e=>{setAgency(e.target.value);reset();}}><option value="all">전체 기관</option>{agencies.map(value=><option key={value} value={value}>{value}</option>)}</select></label>{tab==='notices'&&<label><span className="auto-sr-only">처리 상태</span><select value={filter} onChange={e=>{setFilter(e.target.value);reset();}}><option value="all">전체 상태</option><option value="extracted">정보 추출 완료</option><option value="pending">추출 기록 없음</option><option value="attention">보류 · 오류 · 만료</option></select></label>}</div>
    {total===0?<div className="auto-empty"><DdsIcon name="search" aria-hidden="true"/><strong>일치하는 결과가 없습니다</strong><p>다른 검색어나 필터를 선택해 보세요.</p><button onClick={()=>{setQuery('');setAgency('all');setFilter('all');reset();}}>필터 초기화</button></div>:<div className="auto-table-scroll">
     {tab==='notices'&&<table className="auto-table"><thead><tr><th scope="col">공고명</th><th scope="col">원본 파일</th><th scope="col">정보 추출 기록</th><th scope="col">가격 검증 기록</th></tr></thead><tbody>{rows.slice(start,start+8).map(r=><tr key={r.id}><td><div className="auto-notice-meta">{r.agency} · {r.district} · {r.date||'공고일 미확보'}</div><Link className="auto-notice-title" href={detail(r)}>{r.title}</Link></td><td>{r.fileCount?`${r.fileCount}개 저장`:'저장 파일 없음'}</td><td>{date(r.extractedAt)}</td><td><span className={`auto-pill ${r.priceState}`} title={r.reason}>{statusLabels[r.priceState]}</span><small className="auto-result-date">{date(r.checkedAt)}</small></td></tr>)}</tbody></table>}
     {tab==='files'&&<table className="auto-table auto-files-table"><thead><tr><th>저장된 파일</th><th>형식</th><th>용량</th><th>저장 일시</th><th>다운로드</th></tr></thead><tbody>{files.slice(start,start+8).map(f=><tr key={f.url+f.name}><td><div className="auto-notice-meta">{f.agency} · 실제 원본 파일</div><a className="auto-notice-title" href={f.url} target="_blank" rel="noreferrer">{f.name}</a></td><td><span className={`auto-format ${f.type==='PDF'?'pdf':''}`}>{f.type}</span></td><td>{(f.bytes/1024/1024).toFixed(2)} MB</td><td className="auto-date-cell">{date(f.at)}</td><td><a className="auto-row-link" href={f.url} download={f.name} aria-label={`${f.name} 다운로드`}><DdsIcon name="arrow-down"/></a></td></tr>)}</tbody></table>}
    </div>}
    <footer className="auto-pagination"><span>전체 {total.toLocaleString()}개 중 {total?start+1:0}–{Math.min(start+8,total)}개</span><div><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)} aria-label="이전 페이지"><DdsIcon name="chevron-left"/></button><span><b>{currentPage}</b> / {pageCount}</span><button disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)} aria-label="다음 페이지"><DdsIcon name="chevron-right"/></button></div></footer>
   </section>
  <footer className="auto-page-foot"><span>자료 수집 기록 {date(data.lastMaterialsRun)}</span><span>최근 가격 검증 {date(data.lastPriceRun)}</span></footer>
 </div>;
}
