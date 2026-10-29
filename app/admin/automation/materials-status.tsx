import Link from 'next/link';
import { LH_ADMIN_LISTINGS } from '@/lib/lh-adapter';
import { effectiveStatus } from '@/lib/dday';
import { getEligibility } from '@/lib/notice-eligibility';
import raw from '@/lib/notice-materials.json';
import insight from '@/lib/insight-cache.json';
import { MATERIAL_LABELS, type MaterialsStore } from '@/lib/notice-materials';

export default function MaterialsStatus() {
  const store = raw as MaterialsStore;
  const listings = LH_ADMIN_LISTINGS.filter(l => effectiveStatus(l.status,l.deadline,l.beginDate) !== 'closed');
  const summary = listings.map(l => {
    const record = store.records[l.sourceUrl ?? ''];
    const files = record?.status === 'collected' ? record.materials : [];
    const eligibility = getEligibility(l.id);
    const areaKey = `${l.lat.toFixed(4)},${l.lng.toFixed(4)},${l.type}`;
    const hasInsight = !l.coordApprox && !!l.lat && !!l.lng && Object.hasOwn(insight,areaKey);
    return { l, record, files, flags: {
      '공고문': !!l.noticePdfUrl || files.some(f=>f.kind==='notice'),
      '접수 일정': !!l.beginDate && !!l.deadline,
      '자격 추출': !!eligibility?.tiers?.length,
      '단지 이미지': !!l.coverPhotoUrl || files.some(f=>f.kind==='photo') || !!l.photos?.some(p=>/조감|전경|단지사진/.test(p.kind ?? '')),
      '평면도': files.some(f=>f.kind==='floorplan') || !!l.photos?.some(p=>/평면/.test(p.kind ?? '')),
      '주변 분석': hasInsight,
    } };
  });
  const labels = ['공고문','접수 일정','자격 추출','단지 이미지','평면도','주변 분석'] as const;
  return <section className="a-card">
    <div className="a-card-title">공고 자료 수집 현황</div>
    <p className="a-card-sub">활성 공고 {listings.length}건 · 첨부파일은 공식 원문 링크입니다. 자격 추출·주변 분석은 AI 가공 데이터이며 정확성 검증 완료를 의미하지 않습니다.</p>
    <div style={{ display:'flex', gap: 20, flexWrap:'wrap', margin:'20px 0' }}>
      {labels.map(label=><div key={label}><div className="a-card-sub">{label}</div><strong>{summary.filter(row=>row.flags[label]).length} / {listings.length}</strong></div>)}
    </div>
    <p className="a-card-sub">첨부 수집 실행: {store.lastRun ? new Date(store.lastRun).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : '실행 전'} · 미확보는 원문에 없는 경우와 아직 수집하지 못한 경우를 포함합니다. 첨부 링크의 다운로드 성공 여부는 별도 확인이 필요합니다.</p>
    {summary.map(({l,record,files,flags})=><details key={l.id} style={{borderTop:'1px solid var(--a-line)',padding:'12px 0'}}>
      <summary style={{cursor:'pointer'}}>{l.title}<span className="a-card-sub"> · {Object.values(flags).filter(Boolean).length}/6 항목 확보</span></summary>
      <p>{labels.map(label=>`${label}: ${flags[label] ? '데이터 있음' : '미확보'}`).join(' · ')}</p>
      <p className="a-card-sub">첨부 수집: {!record ? '아직 수집하지 않음' : record.status === 'error' ? `실패 — ${record.error}` : record.status === 'empty' ? '페이지에서 첨부 링크를 찾지 못함' : `${files.length}개 원문 링크 확보`}</p>
      {files.length > 0 && <ul>{files.map(file=><li key={file.url}><a href={file.url} target="_blank" rel="noreferrer">{MATERIAL_LABELS[file.kind]} · {file.name}</a></li>)}</ul>}
      <Link href={`/admin/review/${encodeURIComponent(l.id)}`}>공고 상세</Link>
      {l.sourceUrl && <> · <a href={l.sourceUrl} target="_blank" rel="noreferrer">공식 공고</a></>}
    </details>)}
  </section>;
}
