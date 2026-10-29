"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { DdsIcon } from "@/components/dds-icon";
import { Button } from "@/components/button";
import type { Listing } from "@/lib/types";
import { useCompareSelection, useHomeConditions } from "@/lib/use-home-discovery";
import { depositText, rentText } from "@/lib/price-label";
import syncMeta from "@/lib/_sync-meta.json";
import { budgetMatch } from "@/lib/budget-match";
import { conditionMatch, DEFAULT_CONDITIONS } from "@/lib/home-discovery";
import { effectiveStatus } from "@/lib/dday";

const CHECKS = ["공고문에서 신청 자격 확인", "내 공급 유형과 신청 일정 확인", "공고문 기준 제출 서류 확인", "공식 신청 페이지와 접수 방법 확인"];
const STORAGE = "doongji:prepare:v1";
const name = (l: Listing) => l.complexName || l.title;

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

type CompareProps = { listings: Listing[]; onClose?: () => void };

export function CompareClient({ listings, onClose }: CompareProps) {
  const ready = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return ready ? <CompareWorkspace listings={listings} onClose={onClose} /> : <div className="cp-root cp-empty">관심 공고를 불러오고 있어요…</div>;
}

function CompareWorkspace({ listings, onClose }: CompareProps) {
  const [selectedIds, persistSelection] = useCompareSelection();
  const [conditions] = useHomeConditions();
  const setSelected = persistSelection;
  const [deposit, setDeposit] = useState(conditions.deposit);
  const [rent, setRent] = useState(conditions.rent);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [prepared, setPrepared] = useState<Record<string, number[]>>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) || "{}");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return Object.fromEntries(Object.entries(raw).filter(([, v]) => Array.isArray(v) && v.every(n => Number.isInteger(n) && n >= 0 && n < CHECKS.length)));
      }
    } catch { /* 저장 불가 환경에서도 목업은 사용 가능 */ }
    return {};
  });
  const [tab, setTab] = useState<"compare" | "prepare">("compare");
  const [notice, setNotice] = useState("");
  const tabsRef = useRef<HTMLElement & { activeIndex?: number }>(null);

  // The runtime can upgrade after hydration. React's pre-upgrade activeIndex
  // attribute is lowercased, while DDS observes active-index. Sync that official
  // attribute immediately and the property once the element has upgraded.
  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const activeIndex = tab === "compare" ? 0 : 1;
    let disposed = false;
    tabs.setAttribute("active-index", String(activeIndex));
    const sync = () => { if (!disposed) tabs.activeIndex = activeIndex; };
    if (customElements.get("dds-tab")) sync();
    else customElements.whenDefined("dds-tab").then(sync);
    return () => { disposed = true; };
  }, [tab]);

  // Native Enter/Space activation and pointer input both emit DDS's change event.
  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const change = (event: Event) => {
      const { activeIndex } = (event as CustomEvent<{ activeIndex: number }>).detail;
      setTab(activeIndex === 1 ? "prepare" : "compare");
    };
    tabs.addEventListener("dds-tab-change", change);
    return () => tabs.removeEventListener("dds-tab-change", change);
  }, []);

  const ordered = [...listings].sort((a, b) => {
    const score = (l: Listing) => Number(effectiveStatus(l.status, l.deadline, l.beginDate) !== "closed") * 10 + Number(Boolean(l.coverPhotoUrl)) * 3 + Number(l.deposit > 0 && l.rent > 0);
    return score(b) - score(a);
  });
  const ids = selectedIds.filter(id => listings.some(l => l.id === id));
  const items = ids.map(id => listings.find(l => l.id === id)).filter((l): l is Listing => !!l);
  const preparation = listings.filter(l => Object.hasOwn(prepared, l.id));

  function persist(next: Record<string, number[]>) {
    setPrepared(next);
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); setNotice("이 브라우저에 저장했어요."); }
    catch { setNotice("브라우저 저장이 제한되어 새로고침하면 초기화돼요."); }
  }
  function add(l: Listing) {
    persist({ ...prepared, [l.id]: prepared[l.id] ?? [] });
    setTab("prepare");
  }

  return <section className="cp-root" aria-label="공고 비교 및 신청 준비">
    <header className="cp-heading"><div><h1>공고 비교 <dds-badge variant="weak" color="primary" size="md">{items.length}/3</dds-badge></h1><p>관심 있는 공고의 조건을 한눈에 확인하세요.</p></div><Button size="sm" color="subtlest" className="cp-close" aria-label="비교 닫기" onClick={onClose}><DdsIcon name="close" size={20} /><span className="cp-sr-only">닫기</span></Button></header>
    <dds-tab ref={tabsRef} className="cp-tabs" aria-label="공고 비교 화면" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : tab === "compare" ? 1 : 0;
      setTab(next === 0 ? "compare" : "prepare");
      const item = tabsRef.current?.querySelectorAll("dds-tab-item")[next];
      item?.shadowRoot?.querySelector<HTMLElement>('[role="tab"]')?.focus();
    }}><dds-tab-item onClick={() => setTab("compare")}>조건 비교</dds-tab-item><dds-tab-item onClick={() => setTab("prepare")}>신청 준비 {preparation.length}</dds-tab-item></dds-tab>
    {tab === "compare" ? <>
      <div className="cp-toolbar"><span>내 예산 <b>{deposit === "" ? "보증금 제한 없음" : `보증금 ${Number(deposit).toLocaleString()}만 이하`}</b> · <b>{rent === "" ? "월세 제한 없음" : `월세 ${rent}만 이하`}</b></span><Button size="sm" color="subtlest" onClick={() => setEditing(!editing)} aria-expanded={editing}>예산 설정</Button><Button size="sm" color="subtlest" onClick={() => setPicker(!picker)} aria-expanded={picker}>공고 선택</Button></div>
      {editing && <div className="cp-budget-editor"><label>보증금 상한 (만원)<input type="number" min="0" value={deposit} placeholder="제한 없음" onChange={e => { if (e.target.value === "" || Number(e.target.value) >= 0) setDeposit(e.target.value); }} /></label><label>월세 상한 (만원)<input type="number" min="0" value={rent} placeholder="제한 없음" onChange={e => { if (e.target.value === "" || Number(e.target.value) >= 0) setRent(e.target.value); }} /></label></div>}
      <p className="cp-caption">목록 수집일 · LH {syncMeta.lh.at.slice(0, 10)} · SH {syncMeta.sh.at.slice(0, 10)} · 청년 {syncMeta.youth.at.slice(0, 10)} (UTC)</p>
      {picker && <section className="cp-picker"><label htmlFor="cp-search">공고 이름·지역 검색 (최대 3개)</label><input id="cp-search" placeholder="단지, 지역 검색" value={query} onChange={e => setQuery(e.target.value)} /><div>{ordered.filter(l => `${name(l)} ${l.address}`.includes(query)).slice(0, 30).map(l => <label key={l.id}><input type="checkbox" checked={ids.includes(l.id)} disabled={!ids.includes(l.id) && ids.length >= 3} onChange={() => setSelected(ids.includes(l.id) ? ids.filter(id => id !== l.id) : [...ids, l.id])} /><span>{name(l)}<small>{l.district} · {l.agency}</small></span></label>)}</div></section>}
      {items.length ? <div className="cp-table-scroll"><table className={`cp-table cp-table--${items.length}`}><caption className="cp-sr-only">선택한 공고의 보증금, 월세, 면적, 모집 상태 비교</caption><thead><tr><th scope="col">비교 항목</th>{items.map(l => <th scope="col" key={l.id}><div className="cp-listing-head"><dds-badge variant="outline" color="ghost" size="sm">{l.agency}</dds-badge><Button size="sm" color="subtlest" aria-label={`${name(l)} 비교에서 제외`} onClick={() => setSelected(ids.filter(id => id !== l.id))}><DdsIcon name="close" size={20} /><span className="cp-sr-only">{name(l)} 비교에서 제외</span></Button></div><Link href={`/listings/${encodeURIComponent(l.id)}`}>{name(l)}</Link><small>{l.district}</small></th>)}</tr></thead><tbody>
        <tr><th scope="row">모집 상태</th>{items.map(l => <td key={l.id}><dds-badge variant={effectiveStatus(l.status, l.deadline, l.beginDate) === "closed" ? "outline" : "weak"} color={effectiveStatus(l.status, l.deadline, l.beginDate) === "closed" ? "ghost" : "primary"} size="sm">{({ open: "모집중", closing: "마감임박", upcoming: "모집예정", closed: "모집마감" })[effectiveStatus(l.status, l.deadline, l.beginDate)]}</dds-badge></td>)}</tr>
        <tr className="cp-price-row"><th scope="row">보증금</th>{items.map(l => <td key={l.id}>{l.type === "sale" ? "분양 공고" : depositText(l) || "공고문 확인"}</td>)}</tr>
        <tr className="cp-price-row"><th scope="row">월 임대료</th>{items.map(l => <td key={l.id}>{l.type === "sale" ? "해당 없음" : rentText(l) || "공고문 확인"}</td>)}</tr>
        <tr><th scope="row">내 예산</th>{items.map(l => { const partial = conditionMatch(l, { ...DEFAULT_CONDITIONS, deposit, rent }); const match = deposit === "" && rent === "" ? { text: "예산을 설정해 주세요", tone: "neutral" } : deposit !== "" && rent !== "" ? budgetMatch(l, Number(deposit), Number(rent)) : l.type === "sale" ? { text: "분양 조건 별도 확인", tone: "neutral" } : { text: partial === "match" ? "설정한 조건 충족 주택형 있음" : partial === "outside" ? "설정한 예산 초과" : "금액 확인 필요", tone: partial === "match" ? "green" : "neutral" }; return <td key={l.id} className={`cp-match ${match.tone}`}>{match.text}</td>; })}</tr>
        <tr><th scope="row">전용면적</th>{items.map(l => <td key={l.id}>{l.area || "공고문 확인"}</td>)}</tr>
        <tr><th scope="row">접수 마감</th>{items.map(l => <td key={l.id}>{l.deadline || "공고문 확인"}</td>)}</tr>
        <tr><th scope="row">신청 자격</th>{items.map(l => <td key={l.id}>공고별 확인 필요</td>)}</tr>
        <tr><th scope="row">가격 확인</th>{items.map(l => <td key={l.id} className="cp-muted">{l.priceUnverified ? "미검수 · 원문 확인" : l.priceSource === "ai-validated" ? "AI 원문 대조 완료" : l.priceSource === "lh-official-table" ? "LH 공식 주택형 표" : "주택형별 조건 확인"}</td>)}</tr>
        <tr><th scope="row">신청 준비</th>{items.map(l => <td key={l.id}><Button size="md" color="primary" fullWidth className="dds-full" onClick={() => add(l)}>{Object.hasOwn(prepared, l.id) ? "준비 이어가기" : "준비함에 담기"}</Button></td>)}</tr>
      </tbody></table></div> : <div className="cp-empty"><strong>어떤 공고가 나에게 맞을까요?</strong><p>홈에서 관심 공고를 담거나, 여기서 최대 3개를 선택해 주세요.</p><Button size="sm" color="subtlest" onClick={() => setPicker(true)}>공고 선택하기</Button></div>}
      <p className="cp-caption">관리비·대출 이자는 별도이며, 예산 비교는 입주 자격 판정이 아니에요.</p>
    </> : <div className="cp-preparation"><p className="cp-caption">공통 준비 항목이에요. 자격과 제출 서류는 해당 공고문에서 확인하세요.</p>{preparation.length === 0 ? <div className="cp-empty">준비 중인 공고가 없어요.<Button size="sm" color="subtlest" onClick={() => setTab("compare")}>공고 비교하기</Button></div> : preparation.map(l => <article className="cp-prep-card" key={l.id}><div className="cp-prep-title"><div><span className="cp-muted">{l.agency} · 마감 {l.deadline || "원문 확인"}</span><h3>{name(l)}</h3></div><Button size="sm" color="subtlest" aria-label={`${name(l)} 준비함에서 제거`} onClick={() => { const next = { ...prepared }; delete next[l.id]; persist(next); }}><DdsIcon name="close" size={20} /><span className="cp-sr-only">{name(l)} 준비함에서 제거</span></Button></div><progress value={prepared[l.id].length} max={CHECKS.length} /><p className="cp-caption">{prepared[l.id].length} / {CHECKS.length} 확인 · 신청 완료를 의미하지 않아요</p><div className="cp-checks">{CHECKS.map((check, i) => <label key={check}><input type="checkbox" checked={prepared[l.id].includes(i)} onChange={() => persist({ ...prepared, [l.id]: prepared[l.id].includes(i) ? prepared[l.id].filter(n => n !== i) : [...prepared[l.id], i] })} /><span>{check}</span></label>)}</div><div className="cp-prep-links"><Link href={`/listings/${encodeURIComponent(l.id)}`}>공고 상세 <DdsIcon name="arrow-right" size={16} /></Link>{l.sourceUrl && <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer">공식 공고 <DdsIcon name="arrow-up-right" size={16} /></a>}</div></article>)}</div>}
    <div className="cp-feedback" role="status">{notice || (tab === "prepare" ? "준비 항목은 이 브라우저에 저장돼요." : "같은 항목을 나란히 확인하고, 자세한 조건은 공고 제목을 눌러 확인하세요.")}</div>
  </section>;
}
