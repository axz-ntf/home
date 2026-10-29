import { readNoticeLocations } from "@/lib/notice-locations";
import { readNoticeInformation } from "@/lib/notice-information";
import { matchingCatalogInformation, catalogDisplayAddress } from "@/lib/catalog-notice-information";
import { NoticeInformationPanel } from "../../notice-information-panel";
import { HOUSING_TYPES } from "@/lib/mock-data";
import Link from "next/link";
import { notFound } from "next/navigation";
import AdminShell from "../../../admin-shell";
import { adminNav } from "@/lib/admin-nav";
import { getAdminUser } from "@/lib/admin-user";
import { datasetById, noteKey, textValue, type CatalogNote } from "@/lib/housing-catalog";
import { readCatalog, sourceTimes, displayTime } from "@/lib/housing-catalog-store";
import { readCatalogNotes, notesWritable } from "@/lib/housing-data-notes";
import NoteEditor from "../../note-editor";
import "../../data.css";
import {readBuildingRegisterCandidate,readBuildingRegisterAddress,readAddressBuildingModel} from "@/lib/building-models/register-candidates";
import AddressBuildingPreview from '@/components/address-building-preview';
import '../../buildings/dongtan-a40/viewer.css';
import HousingLocationMap, {type HousingMapPoint} from "@/components/housing-location-map";
import { DdsIcon } from '@/components/dds-icon';
import { SourceReference } from "../../source-reference";

function registerMessage(result:{status:string;reason:string;updatedAt:string}) {
  if(result.status !== 'request_failed') return result.reason;
  if(result.reason === '건축HUB HTTP 503') return '건축물대장 제공 서버가 현재 요청을 처리하지 못했습니다. 데이터가 없는 것으로 확정된 것은 아니며, 나중에 다시 조회해야 합니다.';
  return '주소 또는 건축물대장 조회에 실패했습니다. 데이터 유무를 확인하지 못했으며 다시 조회해야 합니다.';
}
function registerStatus(result:{status:string;buildings:unknown[]}) {
  if(result.status === 'request_failed') return '조회 실패 · 재조회 필요';
  if(result.status === 'address_unconfirmed') return '주소 확인 필요';
  if(result.status === 'register_unavailable') return '일치하는 높이 미확인';
  return `높이 확인 ${result.buildings.length}개 동`;
}

const FIELD_LABELS: Record<string, string> = {
  id: "서비스 식별자", pblancId: "공고 식별자", hsmpSn: "단지 식별자", homeCode: "단지 코드", seq: "공고 번호", boardId: "게시물 번호",
  title: "공고명", hsmpNm: "단지명", homeName: "단지명", address: "주소", rnAdres: "도로명 주소", pnu: "필지 코드",
  brtcNm: "시도", signguNm: "시군구", sido: "시도", district: "지역", gu: "자치구", insttNm: "공급 기관", provider: "공급 기관",
  suplyTyNm: "공급 유형", housingType: "공급 유형", supplyType: "공급 유형", houseTyNm: "건물 유형", houseType: "건물 유형",
  styleNm: "주택형", suplyPrvuseAr: "전용면적 (㎡)", suplyCmnuseAr: "공용면적 (㎡)", bassRentGtn: "기본 보증금 (원)", bassMtRntchrg: "기본 월임대료 (원)",
  depositManwon: "보증금 (만원)", monthlyRentManwon: "월임대료 (만원)", depositLowWon: "최저 보증금 (원)", rentLowWon: "최저 월임대료 (원)",
  hshldCo: "원본 세대 수", totalUnits: "총 세대 수", supplyUnits: "모집 세대 수", lat: "위도", lng: "경도", postedAt: "공고 게시일", announceDate: "공고일",
  officialNoticeStatus: "LH 공식 공고상태", officialStatusCheckedAt: "공식 상태 확인 시각", collectionMethod: "수집 방식", status: "수집 당시 상태", progressStatus: "수집 당시 모집상태", deadline: "마감일", beginDate: "접수 시작일", endDate: "접수 종료일", detailFetchedAt: "상세 수집 시각",
};
export default async function HousingDataDetail({ params, searchParams }: { params: Promise<{ source: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { source: sourceId, id } = await params;
  const source = datasetById(sourceId);
  if (!source) notFound();
  const [snapshot, times, notesResult, query] = await Promise.all([
    readCatalog(source.id), sourceTimes(), readCatalogNotes().then(notes => ({ notes, error: false })).catch(() => ({ notes: {} as Record<string, CatalogNote>, error: true })), searchParams,
  ]);
  const record = snapshot.records.find(r => r.id === id);
  if (!record) notFound();
  const note = notesResult.notes[noteKey(source.id, id)];
  const returnTo = typeof query.returnTo === "string" && /^\/admin\/data(?:\?|$)/.test(query.returnTo) ? query.returnTo : `/admin/data?source=${source.id}`;
  const requested = Number(query.rowPage);
  const pages = Math.ceil(record.rows.length / 20);
  const rowPage = Math.max(1, Math.min(pages, Number.isSafeInteger(requested) ? requested : 1));
  const rows = record.rows.slice((rowPage - 1) * 20, rowPage * 20);
  const rowHref = (page: number) => `/admin/data/${source.id}/${encodeURIComponent(id)}?${new URLSearchParams({ returnTo, rowPage: String(page) })}`;
  const { LH_ADMIN_LISTINGS } = await import("@/lib/lh-adapter");
  const pnu = textValue(record.rows[0].pnu);
  const related = LH_ADMIN_LISTINGS.filter(l =>
    (source.id === "lh-listings" && l.id === id) || (source.id === "sh-notices" && l.id === `sh-${id}`) || (source.id === "youth-notices" && l.id === `youth-${id}`)
    || (record.sourceUrl && l.sourceUrl === record.sourceUrl)
    || (source.id === "lh-complexes" && ((l.houseSn != null && String(l.houseSn) === id) || (pnu && l.pnu === pnu))));
  const noticeId = source.id === "lh-listings" ? id : related.find(l => l.sourceUrl === record.sourceUrl)?.id;
  const information = matchingCatalogInformation(source.id, record.sourceUrl, noticeId ? await readNoticeInformation(noticeId) : null);
  const locationData = noticeId && !source.id.endsWith("complexes") ? await readNoticeLocations(noticeId, record.sourceUrl) : null;
  const locations = locationData?.locations ?? [];
  const locationReview = locationData?.review;
  const located = locations.filter(l => l.lat != null && l.lng != null).length;
  // Do not replace multi-property notices with one approximate representative location.
  const plausible=(lat:unknown,lng:unknown):lat is number=>typeof lat==='number'&&Number.isFinite(lat)&&lat>=33&&lat<=39&&typeof lng==='number'&&Number.isFinite(lng)&&lng>=124&&lng<=132;
  const candidates:HousingMapPoint[]=locations.length ? locations.filter(l=>plausible(l.lat,l.lng)).map(l=>({lat:l.lat!,lng:l.lng!,label:l.address,status:l.coordinateStatus})) : record.rows.filter(r=>plausible(r.lat,r.lng)).map(r=>({lat:r.lat as number,lng:r.lng as number,label:textValue(r.address)||textValue(r.rnAdres)||record.title,status:r.coordApprox===true||r.geocoded==='regional'?'대표 위치 · 실제 건물 위치 아님':'수집된 좌표 · 정확도 확인 필요'}));
  const unique=[...new Map(candidates.map(p=>[`${p.lat},${p.lng},${p.label}`,p])).values()];const mapPoints=unique.slice(0,300);

  const address = locations.length ? { value: locations.length === 1 ? locations[0].address : `공급주택 ${locations.length}개 주소 · 아래 주택목록 참조`, fromNotice: true } : catalogDisplayAddress(record.address, information);
  // A multi-address notice must never inherit one building register as if it described all homes.
  const registerAddress=locations.length===1?locations[0].address:locations.length===0?address.value:'';
  const sharedRegister=await readBuildingRegisterAddress(registerAddress);
  const legacyRegister=source.id==='lh-listings'&&registerAddress?await readBuildingRegisterCandidate(id):null;
  const normalizeAddress=(value:string)=>value.replace(/\s*\([^)]*\)\s*$/,'').replace(/\s+/g,'');
  const buildingRegister=sharedRegister??(legacyRegister?.inputAddress&&normalizeAddress(legacyRegister.inputAddress)===normalizeAddress(registerAddress)?legacyRegister:null);
  const singleModel=registerAddress?await readAddressBuildingModel(registerAddress):null;
  const locationRegisters=locations.length>1?(await Promise.all(locations.slice(0,300).map(async l=>({address:l.address,result:await readBuildingRegisterAddress(l.address),model:await readAddressBuildingModel(l.address)})))).filter(x=>x.result):[];
  const issues = address.value ? record.issues.filter(issue => issue !== "주소 미수집" && !(locations.length && located === locations.length && issue === "좌표 미수집")) : record.issues;
  if(locationReview?.status === 'not-published') { for(const label of ['주소 미수집','좌표 미수집']) { const index=issues.indexOf(label); if(index>=0) issues.splice(index,1); } issues.push('공고문 상세주소 미공개'); }
  if(locationReview?.status === 'partial') issues.push('일부 단지 주소 확인 중');
  if(locations.length && located < locations.length && !issues.includes('좌표 미수집')) issues.push('일부 공급주택 좌표 미확인');
  return <AdminShell pageTitle="데이터 상세" pageSub={source.label} navItems={adminNav()} user={getAdminUser()}>
    <div className="hd-page">
      <Link className="hd-back" href={returnTo}>← 검색 결과로 돌아가기</Link>
      <header className="hd-heading"><div><span className="hd-eyebrow">{source.provider} · {source.kind}</span><h1>{record.title}</h1><p>{address.value || (locationReview?.status === "not-published" ? "공고문 상세주소 미공개" : "주소 미수집")}{address.fromNotice && <span className="hd-pill">{locations.length ? "공급주택 자료" : "공고문 추출"}</span>}</p></div><a className="a-btn secondary" href={record.sourceUrl ?? source.url} target="_blank" rel="noreferrer">{record.sourceUrl ? "공식 원문 보기 ↗" : "제공 기관 보기 ↗"}</a></header>
      <nav className="hd-detail-nav" aria-label="상세 정보 바로가기"><a href="#overview">기본 정보</a>{locations.length > 0 && <a href="#housing-locations">공급주택 위치</a>}{!source.id.endsWith("complexes") && <a href="#notice-information">공고문 추출 정보</a>}<a href="#related">연결된 공고</a><a href="#collected">수집 데이터</a><a href="#provenance">출처 · API</a><a href="#management">관리 메모</a></nav>
      <div className="hd-detail-layout">
        <div className="hd-detail-main">
          {source.id === 'lh-listings' && ['lh-rental-0000061177','lh-rental-0000061173'].includes(id) && <section className="hd-panel hd-section"><h2>A40블록 · 항공지도와 실제 3D</h2><p>VWorld 항공영상과 3D 건물을 연결했습니다. A40 단지 위치를 지도에서 확인할 수 있습니다.</p><Link className="a-btn secondary" href="/admin/data/buildings/dongtan-a40">단지 3D 보기 →</Link></section>}
          {singleModel&&<section className="hd-panel hd-section"><h2>건물 3D · 그림자</h2><AddressBuildingPreview model={singleModel}/></section>}
          <HousingLocationMap points={mapPoints} total={unique.length} hasHeight={Boolean(buildingRegister?.buildings.length)} hasModel={Boolean(singleModel||locationRegisters.some(x=>x.model))}/>
          {locationRegisters.length>0&&<section className="hd-panel hd-section hd-register-section"><div className="hd-location-header"><div><h2>주소별 건축물대장</h2><p>공고에 포함된 주소별로 확인한 건물 정보를 살펴보세요.</p></div><span className="hd-data-badge">{locationRegisters.length}곳 조회 기록</span></div><div className="hd-register-list">{locationRegisters.map(({address,result,model})=><details className="hd-register-item" key={address}><summary><span className="hd-register-address"><DdsIcon name="location-arrow" size={18}/><span>{address}<small>{registerStatus(result!)}{model?' · 3D 보기 가능':''}</small></span></span><DdsIcon name="chevron-down" size={18}/></summary><div className="hd-register-body"><p>{model?'동명과 좌표로 일부 윤곽을 연결했습니다. 공식 배치도 확인은 필요합니다.':registerMessage(result!)}</p>{result!.status==='request_failed'&&<p className="hd-footnote">마지막 조회: {displayTime(result!.updatedAt)}</p>}{model&&<AddressBuildingPreview model={model}/ >}{result!.buildings.length>0&&<div className="hd-table-scroll"><table className="hd-table hd-register-table"><thead><tr><th>동명</th><th>지상층수</th><th>높이</th></tr></thead><tbody>{result!.buildings.map((b,i)=><tr key={`${b.name}-${i}`}><td>{b.name}</td><td>{b.floors}층</td><td>{b.height}m</td></tr>)}</tbody></table></div>}<a className="hd-register-source" href={result!.sourceUrl} target="_blank" rel="noreferrer">건축HUB 출처 <DdsIcon name="blank" size={14}/></a></div></details>)}</div>{locations.length>300&&<p>처음 300개 주소만 확인합니다.</p>}</section>}
          {buildingRegister&&<section className="hd-panel hd-section"><h2>건축물대장 높이 확인 <small>{buildingRegister.buildings.length}개 동</small></h2><p>{singleModel?'동명과 좌표로 일부 윤곽을 연결했습니다. 공식 배치도 확인은 필요합니다.':registerMessage(buildingRegister)}</p>{buildingRegister.status==='request_failed'&&<p className="hd-footnote">마지막 조회: {displayTime(buildingRegister.updatedAt)}</p>}{buildingRegister.buildings.length>0&&<><p>공식 주소: {buildingRegister.officialAddress} · 수집: {buildingRegister.updatedAt.slice(0,10)}</p><div className="hd-table-scroll"><table className="hd-table"><thead><tr><th>동명</th><th>높이</th><th>지상층수</th></tr></thead><tbody>{buildingRegister.buildings.map((b,i)=><tr key={`${b.name}-${i}`}><td>{b.name}</td><td>{b.height}m</td><td>{b.floors}층</td></tr>)}</tbody></table></div></>}<p className="hd-footnote">동별 높이는 건축물대장 표제부와 도로명주소 상세 건물명의 일치 결과입니다. 건축물대장만으로는 건물 위치·윤곽을 확인할 수 없습니다. 별도 윤곽을 연결한 경우에만 참고용 3D를 표시합니다.</p><a href={buildingRegister.sourceUrl} target="_blank" rel="noreferrer">건축HUB 출처 ↗</a></section>}

          <section id="overview" className="hd-panel hd-section"><h2>기본 정보</h2><dl className="hd-facts"><dt>공급 유형</dt><dd>{HOUSING_TYPES.find(t => t.id === record.type)?.name ?? record.type}</dd><dt>지역</dt><dd>{record.region}</dd><dt>주소</dt><dd>{address.value || (locationReview?.status === "not-published" ? "공고문 상세주소 미공개" : "미수집")}{address.fromNotice && <span className="hd-pill">{locations.length ? "공급주택 자료" : "공고문 추출"}</span>}</dd><dt>공고일</dt><dd>{record.date || "미수집"}</dd><dt>제공 기관</dt><dd>{source.provider}</dd></dl></section>
          {locationReview && <section className="hd-panel hd-section"><h2>공급위치 확인 상태</h2><p>{locationReview.message}</p><details><summary>공고문 근거 보기</summary><p>{locationReview.evidence}</p><a href={locationReview.localUrl}>{locationReview.sourceLabel} ↗</a></details></section>}
          {locations.length > 0 && <section id="housing-locations" className="hd-panel hd-section"><h2>공급주택 주소 · 좌표</h2><p>{locations.some(l => l.units > 0) ? `별첨 주택목록 ${locations.reduce((n,l) => n+l.units,0)}개 행 · ` : "공식 수집자료 · "}{locations.length}개 주소 · 좌표 확인 {located}개</p>{locations.length > 1 && <p>여러 주택을 묶은 공고입니다. 단일 대표 좌표로 표시하지 않습니다.</p>}<details open={locations.length <= 8}><summary>공급주택 주소 {locations.length}개 보기</summary><dl className="hd-facts">{locations.map((l,i) => <div key={i}><dt>{l.units ? `${l.units}개 주택 행` : "공급주택 주소"}</dt><dd>{l.address}<p>{l.coordinateStatus}{l.lat != null && l.lng != null ? ` · ${l.lat}, ${l.lng}` : ''}</p><details><summary>주소 원문 근거</summary><p>{l.evidence}</p><a href={l.localUrl}>{l.sourceLabel} ↓</a></details></dd></div>)}</dl></details></section>}
          {!source.id.endsWith("complexes") && <NoticeInformationPanel information={information} />}
          <section id="related" className="hd-panel hd-section"><h2>연결된 서비스 공고 <small>{related.length}건</small></h2>{related.length ? <ul className="hd-related">{related.map(l => <li key={l.id}><Link href={`/admin/review/${encodeURIComponent(l.id)}`}>{l.title} →</Link></li>)}</ul> : <p>같은 식별자·원문 주소·필지 코드로 연결된 서비스 공고가 없습니다.</p>}<p className="hd-footnote">수집 데이터 수와 서비스에 표시되는 공고 수는 다를 수 있습니다.</p></section>
          <section className="hd-panel hd-section"><h2>데이터 확인 항목</h2>{issues.length ? <div className="hd-issues">{issues.map(issue => <span className="hd-pill warn" key={issue}>{issue}</span>)}</div> : <p>이름·주소 등 기본 항목이 있습니다.</p>}<p className="hd-footnote">미수집은 API와 연결된 공고문 추출값에서 확인할 수 없는 항목입니다. 자동 검수의 통과·실패를 의미하지 않습니다.</p></section>
          {source.id === "lh-complexes" && <section className="hd-panel hd-section"><h2>주택형별 수집 정보 <small>{record.rows.length}행</small></h2><div className="hd-table-scroll"><table className="hd-table"><thead><tr><th>공급 유형</th><th>주택형</th><th>전용면적 ㎡</th><th>기본 보증금 원</th><th>월임대료 원</th><th>원본 세대 수</th></tr></thead><tbody>{rows.map((r, i) => <tr key={(rowPage - 1) * 20 + i}>{[r.suplyTyNm, r.styleNm, r.suplyPrvuseAr, r.bassRentGtn, r.bassMtRntchrg, r.hshldCo].map((v, j) => <td key={j}>{typeof v === "number" ? v.toLocaleString("ko-KR") : textValue(v) || "미수집"}</td>)}</tr>)}</tbody></table></div><p className="hd-footnote">원본 세대 수는 합산하지 않습니다. 주택형별 행에 같은 단지의 세대 수가 반복될 수 있습니다.</p>{pages > 1 && <nav className="hd-pagination" aria-label="원본 행 페이지">{rowPage > 1 ? <Link href={rowHref(rowPage - 1)}>이전</Link> : <span>이전</span>}<span>{rowPage} / {pages}</span>{rowPage < pages ? <Link href={rowHref(rowPage + 1)}>다음</Link> : <span>다음</span>}</nav>}</section>}
          <section id="collected" className="hd-panel hd-section"><details className="hd-fields"><summary>수집 필드 · 원본 값 보기</summary><p className="hd-footnote">{record.rows.length > 1 ? "첫 번째 원본 행의 값입니다. 전체 행은 원본 JSON에서 확인할 수 있습니다." : "저장된 원본 값입니다. 원·만원 단위를 구분해 표시합니다."}</p><dl className="hd-facts">{Object.entries(record.rows[0]).filter(([key]) => FIELD_LABELS[key]).map(([key, value]) => <div key={key}><dt>{FIELD_LABELS[key]}<small>{key}</small></dt><dd>{textValue(value) || "미수집"}</dd></div>)}</dl><details className="hd-raw"><summary>첫 번째 행 JSON 보기</summary><pre>{JSON.stringify(record.rows[0], null, 2)}</pre></details></details></section>
          <section id="provenance" className="hd-panel hd-section"><h2>출처와 수집 상태</h2><dl className="hd-facts"><dt>데이터 종류</dt><dd>{source.label}</dd><dt>식별자</dt><dd>{record.id}</dd><dt>공급 유형</dt><dd>{HOUSING_TYPES.find(t => t.id === record.type)?.name ?? record.type}</dd><dt>지역</dt><dd>{record.region}</dd><dt>소스 수집 기록</dt><dd>{displayTime(times[source.meta])}</dd><dt>원본 행 수</dt><dd>{record.rows.length.toLocaleString()}행 {source.id === "lh-complexes" && "· 같은 단지 식별자의 주택형별 행"}</dd><dt>출처</dt><dd><a href={record.sourceUrl ?? source.url} target="_blank" rel="noreferrer">{record.sourceUrl ? "공식 상세 열기" : "제공 기관 홈페이지"} ↗</a></dd></dl><p className="hd-footnote">소스 수집 시각은 마지막 수집 실행 기록입니다. 개별 행의 최신성이나 정보의 정확성을 보증하지 않습니다.</p><SourceReference source={source.id} /><a className="hd-download" href={`/api/admin/housing-data/${source.id}/${encodeURIComponent(id)}`}>전체 원본 JSON 받기 ↓</a></section>

        </div>
        <aside id="management" className="hd-panel hd-section hd-note-panel">{notesResult.error ? <p role="alert" className="hd-alert">기존 메모를 읽을 수 없어 편집을 중단했습니다. 저장 파일을 확인해 주세요.</p> : <NoteEditor key={`${source.id}:${id}`} source={source.id} id={id} initial={note} writable={notesWritable()} />}{note && <p className="hd-footnote">메모 수정 {displayTime(note.updatedAt)}</p>}</aside>
      </div>
    </div>
  </AdminShell>;
}
