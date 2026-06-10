import Link from "next/link";
import { LH_ADMIN_LISTINGS, needsSupplyReview } from "@/lib/lh-adapter";
import { OVERRIDES, type ManualOverride } from "@/lib/manual-overrides";
import AdminShell, { type NavItem } from "../admin-shell";
import { getAdminUser } from "@/lib/admin-user";

const TYPE_LABEL: Record<string, string> = {
  happy: "행복주택", nation: "국민임대", integ: "통합공공임대", perm: "영구임대",
  buy: "매입임대", jeonse: "전세임대", fifty: "50년임대", sale: "분양",
};

// override 의 메타 키 (변경 필드 아님)
const META_KEYS = new Set(["_reviewedAt", "_note"]);

// 사람이 변경한 필드만 추출 (rows 제외 — 별도 렌더)
function changedKeys(o: ManualOverride): string[] {
  return Object.keys(o).filter((k) => !META_KEYS.has(k) && k !== "rows");
}

// 필드 라벨 + 값 포맷 — 화면용
function formatField(key: string, value: unknown): { label: string; value: string } {
  const labels: Record<string, string> = {
    supplyUnits: "공급 세대수",
    deposit: "보증금 (만원)",
    rent: "월세 (만원)",
    salePriceManwon: "분양가 (만원)",
    area: "면적",
    status: "활성 상태",
    noticeStatus: "공고 종류",
    progressStatus: "모집 진행",
    deadline: "마감일",
  };
  const statusLabel: Record<string, string> = {
    open: "모집중", upcoming: "모집예정", closing: "마감임박", closed: "마감",
  };
  const label = labels[key] ?? key;
  let display: string;
  if (value == null || value === "") display = "—";
  else if (key === "status" && typeof value === "string") display = statusLabel[value] ?? value;
  else if (typeof value === "number") display = value.toLocaleString();
  else display = String(value);
  return { label, value: display };
}

export default function ActivityPage() {
  const needsReview = LH_ADMIN_LISTINGS.filter(
    (l) => !(l.id in OVERRIDES) && needsSupplyReview(l),
  ).length;

  const navItems: NavItem[] = [
    { href: "/admin/review", label: "대시보드", icon: "dash" },
    { href: "/admin/review?filter=review", label: "검수 큐", icon: "listing", badge: needsReview, badgeKind: "danger" },
    { href: "/admin/activity", label: "검수 내역", icon: "history", badge: Object.keys(OVERRIDES).length, badgeKind: "subtle" },
    { href: "/admin/complexes", label: "단지 관리", icon: "building" },
    { href: "/admin/settings", label: "설정", icon: "settings" },
  ];

  // 매물 ID 로 listing 조회 맵
  const listingMap = new Map(LH_ADMIN_LISTINGS.map((l) => [l.id, l] as const));

  // OVERRIDES → 시간 역순 정렬 (최근이 위)
  const activities = Object.entries(OVERRIDES)
    .map(([id, o]) => ({ id, override: o, listing: listingMap.get(id) }))
    .sort((a, b) => (b.override._reviewedAt || "").localeCompare(a.override._reviewedAt || ""));

  // 날짜별 그룹
  const byDate = new Map<string, typeof activities>();
  for (const a of activities) {
    const d = a.override._reviewedAt || "(날짜 없음)";
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(a);
  }

  return (
    <AdminShell
      pageTitle="검수 내역"
      pageSub={`총 ${activities.length.toLocaleString()}건의 검수 활동`}
      navItems={navItems}
      user={getAdminUser()}
    >
      {activities.length === 0 ? (
        <div className="a-card" style={{ padding: "60px 40px", textAlign: "center", maxWidth: 560, margin: "40px auto" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.025em" }}>
            아직 검수 내역이 없어요
          </div>
          <div style={{ fontSize: 13, color: "var(--a-ink-3)", lineHeight: 1.6 }}>
            대시보드에서 공고를 검수하면 여기에 기록이 쌓여요.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 880 }}>
          {Array.from(byDate.entries()).map(([date, items]) => (
            <section key={date}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: "var(--a-ink-3)",
                letterSpacing: "0.06em", textTransform: "uppercase",
                marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--a-line)",
              }}>
                {date} · {items.length}건
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map(({ id, override, listing }) => {
                  const fields = changedKeys(override);
                  return (
                    <article key={id} className="a-card" style={{ padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {listing ? (
                            <Link
                              href={`/admin/review/${encodeURIComponent(id)}`}
                              style={{
                                fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em",
                                color: "var(--a-ink)", textDecoration: "none",
                                display: "block",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}
                            >
                              {listing.title}
                            </Link>
                          ) : (
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--a-ink-3)" }}>
                              (매물 정보 없음 · 삭제됐을 수 있음)
                            </div>
                          )}
                          {listing && (
                            <div style={{ fontSize: 11.5, color: "var(--a-ink-3)", marginTop: 2, fontWeight: 500 }}>
                              {listing.district} · {TYPE_LABEL[listing.type] ?? listing.type}
                              {" · "}
                              <code style={{ fontFamily: "ui-monospace, monospace" }}>{id}</code>
                            </div>
                          )}
                        </div>
                        <Link
                          href={`/admin/review/${encodeURIComponent(id)}`}
                          className="a-icon-btn"
                          aria-label="편집"
                          title="다시 편집"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M 9 2 L 12 5 L 5 12 L 2 12 L 2 9 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                          </svg>
                        </Link>
                      </div>

                      {fields.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {fields.map((k) => {
                            const f = formatField(k, (override as unknown as Record<string, unknown>)[k]);
                            return (
                              <div
                                key={k}
                                style={{
                                  padding: "5px 10px",
                                  background: "var(--a-bg-2)",
                                  borderRadius: 6,
                                  fontSize: 11.5,
                                  display: "inline-flex",
                                  gap: 6,
                                  alignItems: "baseline",
                                }}
                              >
                                <span style={{ color: "var(--a-ink-3)", fontWeight: 600 }}>{f.label}</span>
                                <strong style={{ color: "var(--a-ink)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{f.value}</strong>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {override.rows && override.rows.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--a-ink-3)", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                            평형별 ({override.rows.length}개)
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
                            {override.rows.map((row, i) => (
                              <div key={i} style={{
                                padding: "6px 10px",
                                background: "var(--a-bg-2)",
                                borderRadius: 6,
                                fontSize: 11.5,
                                display: "flex",
                                gap: 12,
                                alignItems: "baseline",
                                fontVariantNumeric: "tabular-nums",
                              }}>
                                <strong style={{ color: "var(--a-ink)", minWidth: 60 }}>{row.houseType}</strong>
                                {row.area && <span style={{ color: "var(--a-ink-3)" }}>{row.area}</span>}
                                {row.supplyUnits != null && <span><span style={{ color: "var(--a-ink-3)" }}>세대수</span> <strong>{row.supplyUnits.toLocaleString()}</strong></span>}
                                {row.salePriceManwon != null && <span><span style={{ color: "var(--a-ink-3)" }}>분양가</span> <strong>{row.salePriceManwon.toLocaleString()}</strong>만원</span>}
                                {row.deposit != null && <span><span style={{ color: "var(--a-ink-3)" }}>보증금</span> <strong>{row.deposit.toLocaleString()}</strong>만원</span>}
                                {row.rent != null && <span><span style={{ color: "var(--a-ink-3)" }}>월세</span> <strong>{row.rent.toLocaleString()}</strong>만원</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {override._note && (
                        <div style={{
                          marginTop: 10, padding: "8px 12px",
                          background: "var(--a-yellow-low)", color: "var(--a-yellow)",
                          borderRadius: 6, fontSize: 12, fontWeight: 500,
                          display: "flex", gap: 6,
                        }}>
                          <span>📝</span>
                          <span>{override._note}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
