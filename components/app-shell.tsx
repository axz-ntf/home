"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { comma } from "@/lib/format";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MdOutlineSearch, MdClose } from "react-icons/md";
import { NewsHomeIcon, GuideBookIcon, SaveBookmarkIcon, SparklesIcon, HandleIcon } from "./icons";
import { isNewListing } from "@/lib/new-listings";
import type { Density, District, Filters, HousingTypeId, Listing, SortKey } from "@/lib/types";
import { effectiveStatus } from "@/lib/dday";
import { FilterBar } from "./filter-bar";
import { ListingPanel } from "./listing-panel";
import { NaverMapView } from "./kakao-map";
import { DetailPanel } from "./detail-panel";
import { DetailAiPanel } from "./detail-ai-panel";
import { EligibilityModal } from "./eligibility-modal";
import { ChatPanelBody } from "./chat-panel-body";
import { SavedClient } from "@/app/saved/saved-client";
import { TweaksPanel } from "./tweaks-panel";
import { MobileChrome } from "./mobile-chrome";

const INITIAL_FILTERS: Filters = {
  type: [],
  status: [],
  agency: [],
};

type GuideTip = { slug: string; title: string; summary: string; cover: string; tags: string[] };

// 매물 칸 자리에 표시되는 주거 가이드 목록 (페이지 이동 X — 인-플레이스 교체).
function GuidePanel({ tips }: { tips: GuideTip[] }) {
  return (
    <div className="listing guide-panel">
      <div className="listing-head">
        <div className="listing-count">주거 가이드 <em>{tips.length}</em></div>
      </div>
      <div className="guide-list">
        {tips.map((p) => (
          <Link key={p.slug} href={`/tips/${p.slug}`} className="guide-row">
            {p.cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="guide-thumb" src={p.cover} alt="" loading="lazy" />
            )}
            <div className="guide-row-body">
              <strong className="guide-row-title">{p.title}</strong>
              {p.summary && <p className="guide-row-desc">{p.summary}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}


export function AppShell({
  listings,
  districts,
  regionalCount = 0,
  tips = [],
}: {
  listings: Listing[];
  districts: District[];
  regionalCount?: number;
  tips?: GuideTip[];
}) {
  const router = useRouter();
  // "new" 는 홈의 드릴인 뷰 (사이드바 탭 없음) — 배너 클릭으로 진입, 뒤로가기로 홈 복귀.
  const [activeSection, setActiveSection] = useState<"home" | "new" | "tips" | "saved" | "ai">("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  // 입력값(타이핑)과 적용된 검색어(query)를 분리 — 엔터 시에만 query 반영(라이브 필터 방지).
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<SortKey>("recent");
  const [activeDistrict, setActiveDistrict] = useState<string | null>(null);
  const [searchBounds, setSearchBounds] = useState<{
    swLat: number; swLng: number; neLat: number; neLng: number;
  } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [eliOpen, setEliOpen] = useState(false);
  const [density, setDensity] = useState<Density>("comfort");
  const [showLegend, setShowLegend] = useState(false);
  // 모바일 바텀시트 — 기본 hidden (지도 풀스크린).
  // floating "목록 보기" 버튼 or "이 지역 검색" 시 expanded.
  const [sheetSnap, setSheetSnap] = useState<"hidden" | "expanded">("hidden");
  // 마운트 게이트 — 마감 여부(effectiveStatus)는 현재 시각 의존이라 SSR(빌드 시각)과 어긋나
  // 목록 필터/정렬 결과가 달라짐 → hydration #418. 마운트 전엔 원본 status 로 계산해 SSR과 일치시킨다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    void density;
  }, [density]);

  const filtered = useMemo(() => {
    // 마운트 전엔 시각 무관 원본 status, 후엔 정확한 effectiveStatus (hydration 일치용).
    const eff = mounted
      ? (x: Listing) => effectiveStatus(x.status, x.deadline, x.beginDate)
      : (x: Listing) => x.status;
    // 마감 공고는 기본 숨김 — 지도에 마감 핀까지 뜨면 혼란 (사용자 피드백).
    // "마감" 필터를 켜면 회색 핀/흐림 카드로 함께 표시 (개선안1차 절충).
    const showClosed = filters.status.includes("closed");
    let list = listings.slice();
    if (!showClosed) list = list.filter((x) => eff(x) !== "closed");
    if (filters.type.length) list = list.filter((x) => filters.type.includes(x.type));
    // 마감임박(closing)은 raw status 에 없고 deadline 으로 derive 되므로 effectiveStatus 비교.
    if (filters.status.length) list = list.filter((x) => filters.status.includes(eff(x)));
    if (filters.agency.length) list = list.filter((x) => filters.agency.includes(x.agency));
    // 지역 필터: 지도 영역 모드가 우선, 그 다음 시도 클릭 모드
    if (searchBounds) {
      list = list.filter((x) =>
        x.lat >= searchBounds.swLat &&
        x.lat <= searchBounds.neLat &&
        x.lng >= searchBounds.swLng &&
        x.lng <= searchBounds.neLng,
      );
    } else if (activeDistrict) {
      list = list.filter((x) => x.districtId === activeDistrict);
    }
    // 텍스트 검색 — 단지명·제목·주소·자치구 어디든 매치(공백 무시, 대소문자 무관).
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((x) =>
        [x.complexName, x.title, x.address, x.district]
          .some((f) => (f ?? "").toLowerCase().includes(q)),
      );
    }

    if (sort === "deadline") {
      list.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    } else if (sort === "low-rent") {
      list.sort((a, b) => a.rent - b.rent);
    } else if (sort === "low-depo") {
      list.sort((a, b) => a.deposit - b.deposit);
    } else {
      // 최신순 = 공고일(announceDate) 내림차순. (이전엔 id 문자열 정렬이라 LH 뒤로 SH·청년이
      // 전부 밀려 무한스크롤 하단에 묻혔음 — 최근 공고가 기관 무관하게 위로 오도록 날짜 정렬.)
      list.sort((a, b) => (b.announceDate || "").localeCompare(a.announceDate || "") || a.id.localeCompare(b.id));
    }
    // 마감 공고는 어떤 정렬에서든 뒤로 — 모집중·예정이 먼저 보이게.
    // stable sort 라 각 그룹 내에선 위 정렬 순서가 유지된다.
    list.sort((a, b) =>
      Number(eff(a) === "closed") - Number(eff(b) === "closed"),
    );
    return list;
  }, [filters, sort, activeDistrict, searchBounds, listings, query, mounted]);

  const districtCounts = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    // filtered 와 동일 정책 — 마감은 필터 켰을 때만 카운트.
    const showClosed = filters.status.includes("closed");
    let list = listings.slice();
    if (!showClosed) list = list.filter((x) => effectiveStatus(x.status, x.deadline, x.beginDate) !== "closed");
    if (filters.type.length) list = list.filter((x) => filters.type.includes(x.type));
    if (filters.status.length) list = list.filter((x) => filters.status.includes(effectiveStatus(x.status, x.deadline, x.beginDate)));
    if (filters.agency.length) list = list.filter((x) => filters.agency.includes(x.agency));
    list.forEach((x) => {
      map[x.districtId] = (map[x.districtId] ?? 0) + 1;
    });
    districts.forEach((d) => {
      if (!map[d.id]) map[d.id] = 0;
    });
    return map;
  }, [filters, listings, districts]);

  // 신규 뷰 — 현재 필터·검색·정렬을 물려받고 공고일 7일 이내만.
  const newItems = useMemo(() => {
    if (!mounted) return [];
    return filtered.filter((x) => isNewListing(x));
  }, [filtered, mounted]);
  // 신규 뷰에선 목록·지도 핀 모두 신규만.
  const visibleItems = activeSection === "new" ? newItems : filtered;

  const resetFilters = () => setFilters(INITIAL_FILTERS);

  const selectedItem = filtered.find((x) => x.id === selectedId) ?? listings.find((x) => x.id === selectedId);

  const handleSelect = useCallback((id: string) => {
    // 모바일 viewport: 풀스크린 라우트로 이동 (overlay 대신 별도 페이지)
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      router.push(`/listings/${id}`);
      return;
    }
    setSelectedId(id);
    setDetailOpen(true);
    setAiFocusId(null); // 다른 공고 선택 시 이전 공고의 AI 상담 패널은 닫는다
  }, [router]);
  const handleDistrictClick = useCallback((id: string) => {
    setActiveDistrict(id);
    setSearchBounds(null);
  }, []);
  const handleDistrictClear = useCallback(() => {
    setActiveDistrict(null);
    setSearchBounds(null);
  }, []);
  const handleSearchHere = useCallback(
    (b: { swLat: number; swLng: number; neLat: number; neLng: number }) => {
      setSearchBounds(b);
      setActiveDistrict(null);
      // 검색 직후 결과를 list 로 자동 노출
      setSheetSnap("expanded");
    },
    [],
  );
  const handleDetailClose = useCallback(() => { setDetailOpen(false); setAiFocusId(null); }, []);

  // 브랜드("부동산") 클릭 → 깨끗한 메인 홈으로 (열린 패널·필터·지역 모두 초기화).
  const goHome = useCallback(() => {
    setDetailOpen(false);
    setTweaksOpen(false);
    setEliOpen(false);
    setSelectedId(null);
    setAiFocusId(null);
    setActiveDistrict(null);
    setSearchBounds(null);
    setFilters(INITIAL_FILTERS);
  }, []);

  // 상세 옆 도킹 AI 상담 — PC 는 컬럼으로, 모바일/태블릿은 /ai 풀스크린 라우트.
  const [aiFocusId, setAiFocusId] = useState<string | null>(null);
  const aiFocusItem = aiFocusId ? (listings.find((x) => x.id === aiFocusId) ?? null) : null;
  const handleAskAI = useCallback((id: string) => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1199px)").matches) {
      router.push(`/ai?focus=${encodeURIComponent(id)}`);
      return;
    }
    // 새로 열 때마다 이전 대화 기록 비우고 시작 (공고별 새 상담).
    try { sessionStorage.removeItem("doongji:ai-chat:messages"); } catch {}
    setAiFocusId(id);
  }, [router]);

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* 모바일 전용 상단 (지역선택 + 필터칩) — desktop 에서는 CSS 로 숨김 */}
      <MobileChrome.Top
        regionLabel={
          searchBounds
            ? "지도 영역"
            : activeDistrict
              ? districts.find((d) => d.id === activeDistrict)?.name ?? "전체 지역"
              : "전체 지역"
        }
        districts={districts}
        activeDistrict={activeDistrict}
        districtCounts={districtCounts}
        onDistrictClick={handleDistrictClick}
        onDistrictClear={handleDistrictClear}
        filters={filters}
        setFilters={setFilters}
        onReset={resetFilters}
      />
      <header className="topbar">
        <button
          type="button"
          className="topbar-menu"
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          <HandleIcon />
        </button>
        <div className="brand">
          <button
            type="button"
            className="brand-home"
            onClick={goHome}
            aria-label="홈으로"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
          >
            <span className="brand-name">부동산</span>
          </button>
        </div>
        <div className="topbar-search">
          <MdOutlineSearch className="topbar-search-ico" />
          <input
            type="text"
            className="topbar-search-input"
            placeholder="단지, 지역, 지하철, 초등학교 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setQuery(searchInput.trim()); setActiveSection("home"); }
            }}
          />
          {searchInput && (
            <button type="button" className="topbar-search-clear" onClick={() => { setSearchInput(""); setQuery(""); }} aria-label="검색어 지우기">
              <MdClose />
            </button>
          )}
        </div>
        <div className="topbar-spacer" />
        {/* 로그인 기능 임시 숨김 (개인정보 처리 위험 검토 전까지) — AuthButton + /login·/signup·/onboarding·/profile 비활성 */}
      </header>

      <div className={`main ${detailOpen && selectedItem ? "detail-open" : ""} ${aiFocusItem ? "ai-open" : ""}`}>
        <aside className="app-sidebar">
          <nav className="app-sidebar-nav">
            {[
              { id: "home", label: "홈", Icon: NewsHomeIcon },
              { id: "tips", label: "가이드", Icon: GuideBookIcon },
              { id: "saved", label: "저장", Icon: SaveBookmarkIcon },
              { id: "ai", label: "AI", Icon: SparklesIcon },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`app-sidebar-item ${activeSection === id || (id === "home" && activeSection === "new") ? "active" : ""}`}
                onClick={() => { setActiveSection(id as typeof activeSection); setSheetSnap("expanded"); }}
                title={label}
              >
                <span className="app-sidebar-ico"><Icon /></span>
                <span className="app-sidebar-label">{label}</span>
              </button>
            ))}
          </nav>
        </aside>
        {activeSection === "home" && (
          <ListingPanel
            items={filtered}
            sort={sort}
            setSort={setSort}
            hoveredId={hoveredId}
            selectedId={selectedId}
            activeDistrict={activeDistrict}
            onHover={setHoveredId}
            onSelect={handleSelect}
            snap={sheetSnap}
            setSnap={setSheetSnap}
            newCount={newItems.length}
            onNewClick={() => setActiveSection("new")}
          />
        )}
        {activeSection === "new" && (
          <ListingPanel
            items={newItems}
            sort={sort}
            setSort={setSort}
            hoveredId={hoveredId}
            selectedId={selectedId}
            activeDistrict={activeDistrict}
            onHover={setHoveredId}
            onSelect={handleSelect}
            snap={sheetSnap}
            setSnap={setSheetSnap}
            heading="이번 주 새 공고"
            onBack={() => setActiveSection("home")}
          />
        )}
        {activeSection === "tips" && <GuidePanel tips={tips} />}
        {activeSection === "saved" && (
          <div className="listing section-panel">
            <SavedClient listings={listings} />
          </div>
        )}
        {activeSection === "ai" && (
          <div className="ai-section-panel">
            <div className="listing-head">
              <div className="listing-count">AI 자격상담</div>
            </div>
            <ChatPanelBody allListings={listings} />
          </div>
        )}
        {/* 모바일 전용 — 시트 hidden 일 때 하단 "목록 N건" floating 버튼 (opacity 트랜지션) */}
        <button
          type="button"
          className={`m-list-fab ${sheetSnap === "hidden" ? "is-visible" : ""}`}
          onClick={() => setSheetSnap("expanded")}
          aria-label="매물 목록 보기"
          aria-hidden={sheetSnap !== "hidden"}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M 2 3 L 12 3 M 2 7 L 12 7 M 2 11 L 12 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>목록 {comma(visibleItems.length)}건</span>
        </button>

        <NaverMapView
          districts={districts}
          districtCounts={districtCounts}
          activeDistrict={activeDistrict}
          onDistrictClick={handleDistrictClick}
          onDistrictClear={handleDistrictClear}
          onSearchHere={handleSearchHere}
          pins={visibleItems}
          hoveredId={hoveredId}
          selectedId={selectedId}
          onPinHover={setHoveredId}
          onPinClick={handleSelect}
          showLegend={showLegend}
          overlay={
            <FilterBar filters={filters} setFilters={setFilters} onReset={resetFilters} />
          }
        />

        <DetailPanel item={selectedItem} open={detailOpen} onClose={handleDetailClose} onAskAI={handleAskAI} />
        {aiFocusItem && (
          <DetailAiPanel listing={aiFocusItem} allListings={listings} onClose={() => setAiFocusId(null)} />
        )}
      </div>

      <EligibilityModal
        open={eliOpen}
        onClose={() => setEliOpen(false)}
        onApplyFilter={(types: HousingTypeId[]) => setFilters({ ...filters, type: types })}
      />

      <TweaksPanel
        open={tweaksOpen}
        density={density}
        setDensity={setDensity}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
      />
    </div>
  );
}
