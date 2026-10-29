import Link from "next/link";
import { DdsIcon } from "@/components/dds-icon";
import { LH_ADMIN_LISTINGS } from "@/lib/lh-adapter";
import { OVERRIDES, type ManualOverride, type OverrideRow } from "@/lib/manual-overrides";
import { adminNav } from "@/lib/admin-nav";
import { getAdminUser } from "@/lib/admin-user";
import AdminShell from "../admin-shell";
import "./activity.css";

const TYPE_LABEL: Record<string, string> = {
  public: "공공임대", rental: "임대 · 유형 확인", happy: "행복주택", nation: "국민임대", integ: "통합공공임대", perm: "영구임대",
  buy: "매입임대", jeonse: "전세임대", fifty: "50년임대", sale: "분양", youth: "청년주택",
};
const PRICE_LABEL: Record<string, string> = {
  "rows-by-area": "평형별 임대조건", "tiered-by-income": "소득계층별 임대조건", "by-household-size": "가구원수별 임대조건",
  "support-limit": "지원한도", "deposit-only": "전세보증금", "per-unit-sale": "동·호별 분양가",
};
const META_KEYS = new Set(["_reviewedAt", "_note"]);
const STRUCT_KEYS = new Set(["rows", "tiers", "householdTypes", "supportLimit", "conversion", "schedule", "complexMeta"]);

function changedKeys(override: ManualOverride): string[] {
  return Object.keys(override).filter((key) => !META_KEYS.has(key) && !STRUCT_KEYS.has(key));
}

function structSummaries(override: ManualOverride): string[] {
  const summaries: string[] = [];
  if (override.rows?.length) summaries.push(`평형별 ${override.rows.length}행`);
  if (override.tiers?.length) summaries.push(`소득계층 ${override.tiers.length}평형`);
  if (override.householdTypes?.length) summaries.push(`가구원수 ${override.householdTypes.length}유형`);
  if (override.supportLimit?.byHousehold?.length) summaries.push(`지원한도 ${override.supportLimit.byHousehold.length}구간`);
  if (override.conversion) summaries.push("전환보증금");
  const scheduleLabels = { applyStart: "접수 시작", applyEnd: "접수 마감", docResultAt: "서류 발표", winnerAt: "당첨 발표" };
  for (const [key, label] of Object.entries(scheduleLabels)) {
    const value = override.schedule?.[key as keyof typeof scheduleLabels];
    if (value) summaries.push(`${label} ${value}`);
  }
  if (override.complexMeta) {
    const labels = { addressJibun: "지번 주소", firstMoveIn: "최초 입주", structure: "구조", contact: "문의처" };
    for (const [key, label] of Object.entries(labels)) {
      const value = override.complexMeta[key as keyof typeof labels];
      if (value) summaries.push(`${label} ${value}`);
    }
  }
  return summaries;
}

function formatField(key: string, value: unknown): { label: string; value: string } {
  const labels: Record<string, string> = {
    supplyUnits: "공급 세대수", deposit: "보증금 (만원)", rent: "월세 (만원)", salePriceManwon: "분양가 (만원)",
    area: "면적", address: "주소", status: "활성 상태", noticeStatus: "공고 종류", progressStatus: "모집 진행", deadline: "마감일", priceModel: "가격 유형",
  };
  const statusLabels: Record<string, string> = { open: "모집중", upcoming: "모집예정", closing: "마감임박", closed: "마감" };
  let display: string;
  if (value == null || value === "") display = "—";
  else if (key === "status" && typeof value === "string") display = statusLabels[value] ?? value;
  else if (key === "priceModel" && typeof value === "string") display = PRICE_LABEL[value] ?? value;
  else if (typeof value === "number") display = value.toLocaleString("ko-KR");
  else display = String(value);
  return { label: labels[key] ?? key, value: display };
}

function dateKey(value: string): string {
  if (!value) return "";
  // Date-only values are already Korean calendar dates; timestamps are grouped in Korea time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

function displayDate(value: string): string {
  return value ? value.replaceAll("-", ".") : "날짜 미기록";
}

function SavedRows({ rows }: { rows: OverrideRow[] }) {
  const columns = [
    { key: "supplyUnits", label: "세대수" }, { key: "deposit", label: "보증금" },
    { key: "rent", label: "월세" }, { key: "salePriceManwon", label: "분양가" },
  ].filter(({ key }) => rows.some((row) => row[key as keyof OverrideRow] != null));
  return (
    <div className="act-rows">
      <div className="act-rows-heading"><h4>평형별 정보 <span>{rows.length}개</span></h4><span>금액 단위: 만원</span></div>
      <div className="act-table-scroll" tabIndex={0} role="region" aria-label="평형별 수정 정보">
        <table className="act-table">
          <thead><tr><th scope="col">평형</th><th scope="col">면적</th>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => (
            <tr key={index}><th scope="row">{row.houseType || "미기록"}</th><td>{row.area || "—"}</td>{columns.map((column) => {
              const value = row[column.key as keyof OverrideRow];
              return <td key={column.key}>{typeof value === "number" ? value.toLocaleString("ko-KR") : "—"}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  const params = await searchParams;
  const query = (typeof params.q === "string" ? params.q : "").slice(0, 200).trim();
  const listingMap = new Map(LH_ADMIN_LISTINGS.map((listing) => [listing.id, listing] as const));
  // The source retains the latest saved override per listing, not an append-only edit log.
  const activities = Object.entries(OVERRIDES)
    .map(([id, override]) => ({ id, override, listing: listingMap.get(id), day: dateKey(override._reviewedAt) }))
    .sort((a, b) => b.day.localeCompare(a.day) || (b.override._reviewedAt || "").localeCompare(a.override._reviewedAt || ""));
  const filtered = activities.filter(({ id, listing, override }) =>
    `${id} ${listing?.title ?? ""} ${override._note ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const requested = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Math.min(pageCount, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const pageHref = (value: number) => `/admin/activity?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(value) })}`;
  const byDate = new Map<string, typeof activities>();
  for (const activity of filtered.slice((page - 1) * 12, page * 12)) {
    if (!byDate.has(activity.day)) byDate.set(activity.day, []);
    byDate.get(activity.day)!.push(activity);
  }

  return (
    <AdminShell pageTitle="저장된 수정" pageSub="공고에 저장된 최신 수정 내용" navItems={adminNav()} user={getAdminUser()}>
      <div className="act-page">
        <header className="act-heading">
          <div><div className="act-eyebrow"><DdsIcon name="clock" size={16} /> 운영 기록</div><h1>저장된 수정</h1><p>공고별로 마지막에 저장한 수정 내용과 메모를 확인하세요.</p></div>
          <Link className="act-button" href="/admin/review">공고 관리 <DdsIcon name="chevron-right" size={18} /></Link>
        </header>

        <form className="act-search" action="/admin/activity">
          <label htmlFor="activity-query">공고명 · ID · 메모 검색</label>
          <div><input id="activity-query" name="q" defaultValue={query} maxLength={200} placeholder="찾고 싶은 공고나 메모" /><button className="act-button" type="submit">검색</button>{query && <Link className="act-button" href="/admin/activity">초기화</Link>}</div>
        </form>
        <div className="act-records-heading"><h2><DdsIcon name="list" size={20} /> 공고별 수정 내용</h2><span>검색 결과 {filtered.length}건 · 전체 {activities.length}건</span></div>
        <div className="act-info"><DdsIcon name="info" size={18} /><p>공고마다 가장 최근에 저장된 내용을 보여줍니다. AI 수집·추출 결과는 <Link href="/admin/automation">수집 현황</Link>에서 확인할 수 있어요.</p></div>

        {filtered.length === 0 ? (
          <section className="act-empty"><span><DdsIcon name="clock" size={32} /></span><h2>{query ? "검색 결과가 없습니다" : "아직 저장된 수정이 없어요"}</h2><p>{query ? "다른 검색어로 찾아보세요." : "공고 정보를 수정하고 저장하면 여기에 표시됩니다."}</p><Link className="act-button" href="/admin/review">공고 살펴보기 <DdsIcon name="chevron-right" size={18} /></Link></section>
        ) : (
          <div className="act-timeline">
            {Array.from(byDate.entries()).map(([day, items]) => (
              <section key={day} className="act-date-group">
                <div className="act-date-heading"><span className="act-date-mark"><DdsIcon name="calendar" size={16} /></span><h2>{day ? <time dateTime={day}>{displayDate(day)}</time> : "날짜 미기록"}</h2><span className="act-count">이 페이지 {items.length}개 공고</span></div>
                <div className="act-date-records">
                  {items.map(({ id, override, listing }) => {
                    const fields = changedKeys(override);
                    const summaries = structSummaries(override);
                    return (
                      <article key={id} className="act-record">
                        <header className="act-record-heading">
                          <span className="act-record-icon"><DdsIcon name="edit" size={20} /></span>
                          <div className="act-record-title">
                            <div className="act-record-meta"><span className="act-saved"><DdsIcon name="check" size={12} /> 수정 내용 저장</span>{listing && <span>{listing.district} · {TYPE_LABEL[listing.type] ?? listing.type}</span>}</div>
                            <h3>{listing ? <Link href={`/admin/review/${encodeURIComponent(id)}`}>{listing.title}</Link> : "현재 목록에서 찾을 수 없는 공고"}</h3>
                            {!listing && <p className="act-missing">이전에 저장된 수정 내용입니다. ({id})</p>}
                          </div>
                          {listing && <Link className="act-record-link" href={`/admin/review/${encodeURIComponent(id)}`} aria-label={`${listing.title} 상세 보기`}><span>상세 보기</span><DdsIcon name="chevron-right" size={18} /></Link>}
                        </header>

                        <details className="act-record-details"><summary>저장 내용 보기</summary>
                        {(fields.length > 0 || summaries.length > 0) && <div className="act-values">
                          {fields.map((key) => {
                            const field = formatField(key, (override as unknown as Record<string, unknown>)[key]);
                            return <div className="act-value" key={key}><span>{field.label}</span><strong>{field.value}</strong></div>;
                          })}
                          {summaries.map((summary) => <span className="act-structure" key={summary}>{summary}</span>)}
                        </div>}

                        {!!override.rows?.length && <SavedRows rows={override.rows} />}
                        {override._note && <div className="act-note"><DdsIcon name="summary" size={18} /><div><h4>수정 메모</h4><p>{override._note}</p></div></div>}
                        </details>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        <nav className="act-pagination" aria-label="저장된 수정 페이지">
          {page > 1 ? <Link className="act-button" href={pageHref(page - 1)}>이전</Link> : <span>이전</span>}
          <span>{page} / {pageCount}</span>
          {page < pageCount ? <Link className="act-button" href={pageHref(page + 1)}>다음</Link> : <span>다음</span>}
        </nav>
      </div>
    </AdminShell>
  );
}
