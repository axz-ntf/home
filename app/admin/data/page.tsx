import { withCatalogLocations } from "@/lib/catalog-location-overlay";
import { HOUSING_TYPES } from "@/lib/mock-data";
import Link from "next/link";
import AdminShell from "../admin-shell";
import { adminNav } from "@/lib/admin-nav";
import { getAdminUser } from "@/lib/admin-user";
import { DATASETS, datasetById, queryCatalog, noteKey, NOTE_STATES, type CatalogQuery, type CatalogNote } from "@/lib/housing-catalog";
import { readCatalog, sourceTimes, displayTime, sourceIsStale } from "@/lib/housing-catalog-store";
import { readCatalogNotes } from "@/lib/housing-data-notes";
import { DdsIcon } from "@/components/dds-icon";
import "./data.css";
import { SourceReference } from "./source-reference";

export default async function HousingDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const source = datasetById(value("source")) ?? DATASETS[0];
  const [snapshots, times, notesResult] = await Promise.all([
    Promise.all(DATASETS.map(d => readCatalog(d.id))), sourceTimes(),
    readCatalogNotes().then(notes => ({ notes, error: false })).catch(() => ({ notes: {} as Record<string, CatalogNote>, error: true })),
  ]);
  const storedSnapshot = snapshots[DATASETS.findIndex(d => d.id === source.id)];
  const snapshot = source.id === "lh-listings" ? { ...storedSnapshot, records: await withCatalogLocations(storedSnapshot.records) } : storedSnapshot;
  const query: CatalogQuery = Object.fromEntries(["q", "region", "type", "quality", "page", "sort", "managed"].map(k => [k, value(k)]));
  const result = queryCatalog(snapshot.records, query, notesResult.notes, source.id);
  const regions = [...new Set(snapshot.records.map(r => r.region))].sort((a, b) => a.localeCompare(b, "ko"));
  const types = [...new Set(snapshot.records.flatMap(r => r.types))].sort((a, b) => a.localeCompare(b, "ko"));
  const pageUrl = (page: number) => { const sp = new URLSearchParams({ source: source.id, ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), page: String(page) }); return `/admin/data?${sp}`; };
  const collected = times[source.meta];
  const stale = sourceIsStale(collected, source.meta === "complexes" ? 7 : 2);
  return <AdminShell pageTitle="공공주택 데이터" pageSub="수집 원본부터 서비스 데이터까지" navItems={adminNav()} user={getAdminUser()}>
    <div className="hd-page">
      <header className="hd-heading"><div><span className="hd-eyebrow">DATA CATALOG</span><h1>공공주택 찾아보기</h1><p>공고와 단지를 검색하고, 상세 정보와 공식 출처를 확인하세요.</p></div><Link className="a-btn secondary" href="/admin/automation"><DdsIcon name="setting" size={18} /> 수집 운영</Link></header>
      <section className="hd-panel" style={{padding:'16px 20px',marginBottom:16}}><Link href="/admin/data/buildings/dongtan-a40">센트럴힐즈 동탄 · 항공지도와 실제 3D 보기 →</Link><p className="hd-footnote">VWorld 항공영상·3D 건물 · A40 단지 위치 표시</p></section>
      <nav className="hd-sources" aria-label="데이터 종류">{DATASETS.map((d, i) => <Link key={d.id} href={`/admin/data?source=${d.id}`} className={`hd-source ${source.id === d.id ? "selected" : ""}`} aria-current={source.id === d.id ? "page" : undefined}>
        <span>{d.kind}<DdsIcon name={d.id.endsWith("complexes") ? "home" : "contents"} size={20} /></span><strong>{d.label}</strong><div>{snapshots[i].error ? "파일 확인 필요" : <>{snapshots[i].records.length.toLocaleString()}<small>{d.id.endsWith("complexes") ? "개 단지" : "건"}</small></>}</div>
      </Link>)}</nav>
      <section className="hd-panel">
        <form key={JSON.stringify([source.id, query])} className="hd-filters" action="/admin/data">
          <input type="hidden" name="source" value={source.id} />
          <label className="hd-search">공고명·단지명·주소 검색<input name="q" defaultValue={query.q} maxLength={200} placeholder="찾고 싶은 공고, 단지 또는 지역을 입력하세요" /></label>
          <div className="hd-filter-row">
            <label>지역<select aria-label="지역" name="region" defaultValue={query.region}><option value="">전체 지역</option>{regions.map(r => <option key={r}>{r}</option>)}</select></label>
            <label>공급 유형<select aria-label="공급 유형" name="type" defaultValue={query.type}><option value="">전체 유형</option>{types.map(t => <option key={t} value={t}>{HOUSING_TYPES.find(h => h.id === t)?.name ?? t}</option>)}</select></label>
            <label>정렬<select aria-label="정렬" name="sort" defaultValue={query.sort}><option value="">{source.id.endsWith("complexes") ? "기본순 (이름순)" : "공고일 최신순"}</option><option value="name">이름순</option></select></label>
            <button className="a-btn primary" type="submit">검색</button><Link className="hd-reset" href={`/admin/data?source=${source.id}`}>초기화</Link>
          </div>
          <details className="hd-advanced" open={Boolean(query.quality || query.managed)}><summary>관리 조건{(query.quality || query.managed) ? " · 적용 중" : ""}</summary><div className="hd-filter-row">            <label>데이터 항목<select aria-label="데이터 항목" name="quality" defaultValue={query.quality}><option value="">전체</option><option value="missing">미수집 항목 있음</option><option value="complete">기본 항목 있음</option></select></label>
            <label>관리 표시<select aria-label="관리 표시" name="managed" defaultValue={query.managed}><option value="">전체</option>{Object.entries(NOTE_STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
</div></details>
        </form>
      </section>
      {notesResult.error && <p className="hd-alert" role="alert">관리 메모를 읽지 못했습니다. 현재 관리 표시 필터는 정확하지 않을 수 있습니다.</p>}
      {snapshot.error ? <div className="hd-empty" role="alert"><h2>수집 파일을 확인해 주세요</h2><p>{snapshot.error}</p><code>lib/{source.file}</code><p>파일 누락을 수집 결과 0건으로 판단하지 않습니다.</p></div> : <>
        <div className="hd-result-heading"><h2>{source.label} <em>{result.total.toLocaleString()}</em>{source.id.endsWith("complexes") ? "개 단지" : "건"}</h2><span>페이지당 24개 · 저장된 데이터 기준</span></div>
        {result.records.length ? <div className="hd-grid">{result.records.map(r => <Link className="hd-record" key={r.id} href={`/admin/data/${source.id}/${encodeURIComponent(r.id)}?${new URLSearchParams({ returnTo: pageUrl(result.page) })}`}>
          <div className="hd-record-top"><span className="hd-pill">{HOUSING_TYPES.find(t => t.id === r.type)?.name ?? r.type}</span><DdsIcon name="chevron-right" size={18} /></div><h3>{r.title}</h3><p>{r.address || "주소 미수집"}</p>
          <div className="hd-record-meta"><span>{r.region}</span><span>{r.date || (source.id.endsWith("complexes") ? `원본 ${r.rows.length}행` : "공고일 미수집")}</span></div>
          <div className="hd-record-bottom"><span className={r.issues.length ? "hd-quality" : ""}>{r.issues.length ? `미수집·보완 ${r.issues.length}항목` : "기본 항목 있음"}</span><span>{NOTE_STATES[notesResult.notes[noteKey(source.id, r.id)]?.state ?? "none"]}</span></div>
        </Link>)}</div> : <div className="hd-empty"><h2>조건에 맞는 데이터가 없습니다</h2><p>검색어나 필터를 바꿔보세요.</p><Link href={`/admin/data?source=${source.id}`}>검색 초기화</Link></div>}
        <nav className="hd-pagination" aria-label="데이터 페이지">{result.page > 1 ? <Link className="a-btn secondary" href={pageUrl(result.page - 1)}>이전</Link> : <span>이전</span>}<span>{result.page} / {result.pages}</span>{result.page < result.pages ? <Link className="a-btn secondary" href={pageUrl(result.page + 1)}>다음</Link> : <span>다음</span>}</nav>
      </>}
      <section className="hd-panel hd-source-footer" aria-label="데이터 출처와 수집 기록">        <div className="hd-source-info"><div><h2>{source.label}</h2><p>{source.description}</p></div><span className={`hd-pill ${stale ? "warn" : ""}`}>{collected ? stale ? "갱신 확인 필요" : "최근 수집 기록 있음" : "수집 시각 미확인"}</span></div>
        <div className="hd-provenance"><span>출처 <b>{source.provider}</b></span><span>소스 수집 기록 <b>{displayTime(collected)}</b></span><span>원본 <b>{snapshot.rawCount.toLocaleString()}행</b></span></div>
        <SourceReference key={source.id} source={source.id} />
</section>
      <p className="hd-footnote">미수집은 실제 정보가 없다는 뜻이 아닙니다. 이 목록은 저장된 수집 파일을 조회하며 외부 API나 AI를 다시 호출하지 않습니다.</p>
    </div>
  </AdminShell>;
}
