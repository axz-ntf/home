import Link from "next/link";
import { LH_LISTINGS } from "@/lib/lh-adapter";
import { YOUTH_PUBLIC_LISTINGS } from "@/lib/youth-adapter";
import { SH_PUBLIC_LISTINGS } from "@/lib/sh-adapter";
import { dedupeCorrections } from "@/lib/dedupe-corrections";
import { effectiveStatus, dDayText } from "@/lib/dday";
import { depositText, rentText } from "@/lib/price-label";
import { getAllTips, thumbClass } from "@/lib/tips";
import "../m/tokens.css";
import "../m/mobile.css";
import "./tips.css";

export const metadata = {
  title: "주거 가이드 — 공공임대·청약 쉽게 | 다음부동산",
  description: "행복주택·장기전세·국민임대 등 청년·신혼부부·고령자·다자녀 가구를 위한 공공임대 자격·신청 방법을 쉽게 정리했어요. 이번 주 노릴 만한 모집중 공고도 함께.",
};

export default function TipsPage() {
  const all = dedupeCorrections([...LH_LISTINGS, ...YOUTH_PUBLIC_LISTINGS, ...SH_PUBLIC_LISTINGS]);
  const picks = all
    .filter((l) => {
      const s = effectiveStatus(l.status, l.deadline ?? "", l.beginDate);
      return s === "open" || s === "closing";
    })
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
    .slice(0, 8);
  const posts = getAllTips();

  return (
    // body 가 overflow:hidden(지도 풀스크린용)이라 이 페이지는 자체 스크롤 컨테이너로 둔다.
    <div style={{ height: "100dvh", overflowY: "auto" }}>
      <div className="tips-hub">
        <header className="tips-gnb">
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "inherit" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="다음" width={24} height={24} />
            <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>부동산</strong>
          </Link>
        </header>

        <h1 className="tips-title">주거 가이드</h1>
        <p className="tips-sub">공공임대·청약, 어렵게 느껴지죠? 청년·신혼·고령자·다자녀까지, 꼭 알아야 할 것만 쉽게 정리했어요.</p>

        {posts.length > 0 && (
          <section className="tips-section">
            <div className="tips-section-head">
              <h2 className="tips-h2">전체 가이드</h2>
            </div>
            <div className="tips-grid">
              {posts.map((p) => (
                <Link key={p.slug} href={`/tips/${p.slug}`} className="tip-card">
                  <div
                    className={`tip-card-thumb ${p.cover ? "" : thumbClass(p.slug)}`}
                    style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined}
                  >
                    {!p.cover && <span className="tip-card-thumb-label">{p.tags[0] ?? "주거 가이드"}</span>}
                  </div>
                  <strong className="tip-card-title">{p.title}</strong>
                  {p.summary && <p className="tip-card-desc">{p.summary}</p>}
                  {p.tags.length > 0 && (
                    <div className="tip-card-tags">
                      {p.tags.map((t) => <span key={t} className="tip-chip">{t}</span>)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {picks.length > 0 && (
          <section className="tips-section">
            <div className="tips-section-head">
              <h2 className="tips-h2">이번 주 눈여겨볼 공고</h2>
              <Link href="/" className="tips-more">지도에서 더 보기 →</Link>
            </div>
            <div className="tips-listing-grid">
              {picks.map((l) => {
                const dday = dDayText(l.deadline ?? "", effectiveStatus(l.status, l.deadline ?? "", l.beginDate));
                const dep = depositText(l), rent = rentText(l);
                return (
                  <Link key={l.id} href={`/listings/${encodeURIComponent(l.id)}`} className="tips-listing-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 14.5, letterSpacing: "-0.02em" }}>{l.title}</strong>
                      {dday && <span suppressHydrationWarning style={{ fontSize: 12.5, fontWeight: 800, color: "var(--seed-scale-color-red-600, #e5484d)", whiteSpace: "nowrap" }}>{dday}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--seed-semantic-color-ink-text-low)", marginTop: 4 }}>
                      {l.district} · {l.agency}{dep ? ` · 보 ${dep}` : ""}{rent ? ` · 월 ${rent}` : ""}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <p style={{ fontSize: 12, color: "var(--seed-semantic-color-ink-text-low)", marginTop: 24, lineHeight: 1.6, maxWidth: 720 }}>
          정확한 자격·서류 기준은 각 공고문과 LH 청약플러스(apply.lh.or.kr)·마이홈(myhome.go.kr)에서 확인하세요.
          내 상황에 맞는 답은 매물 상세의 <strong>AI 자격상담</strong>에서 바로 물어볼 수 있어요.
        </p>
      </div>
    </div>
  );
}
