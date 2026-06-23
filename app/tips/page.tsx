import Link from "next/link";
import { LH_LISTINGS } from "@/lib/lh-adapter";
import { YOUTH_PUBLIC_LISTINGS } from "@/lib/youth-adapter";
import { SH_PUBLIC_LISTINGS } from "@/lib/sh-adapter";
import { dedupeCorrections } from "@/lib/dedupe-corrections";
import { effectiveStatus, dDayText } from "@/lib/dday";
import { depositText, rentText } from "@/lib/price-label";
import type { Listing } from "@/lib/types";
import "../m/tokens.css";
import "../m/mobile.css";

export const metadata = {
  title: "청년 주거 팁 — 공공임대·청약 쉽게 | 다음부동산",
  description: "행복주택·장기전세·청년안심주택 등 청년을 위한 공공임대 자격·신청 방법을 쉽게 정리했어요. 이번 주 청년이 노릴 만한 모집중 공고도 함께.",
};

// 청년 관련: 청년주택/행복주택이거나 자격에 청년·대학생·신혼 포함.
function isYouthRelevant(l: Listing): boolean {
  if (l.type === "youth" || l.type === "happy") return true;
  const e = l.eligible ?? [];
  return e.some((x) => /청년|대학생|신혼/.test(x));
}

const TIPS: { q: string; a: string[] }[] = [
  {
    q: "공공임대, 청년한테 뭐가 맞아요?",
    a: [
      "행복주택 — 청년·신혼·대학생 주력. 시세 60~80%, 최대 6~10년. 청년이 가장 먼저 볼 유형.",
      "청년안심주택(민간임대) — 역세권 신축, 청년·신혼 특화. 보증금 지원도.",
      "장기전세(SH) — 보증금만 내고 최대 20년 거주, 월세 없음. 소득·자산 기준 있음.",
      "국민임대 — 무주택 저소득, 30년. 영구임대 — 기초수급·취약계층 위주.",
      "매입·전세임대 — LH가 집을 사거나 전세로 빌려 재임대. 청년 매입임대 유형도 있음.",
    ],
  },
  {
    q: "자격, 딱 3가지만 기억하세요",
    a: [
      "① 무주택 — 본인(또는 세대구성원 전원)이 집이 없어야 함.",
      "② 소득 — 도시근로자 월평균소득 기준(유형·순위별 70~150%). 맞벌이는 완화.",
      "③ 자산 — 총자산·자동차가액 한도. 유형마다 다름(예: 장기전세 총자산 약 6.6억·차 4,542만 이하).",
      "→ 정확한 내 기준은 각 공고 상세에서 'AI 자격상담'으로 물어보면 빠릅니다.",
    ],
  },
  {
    q: "청약통장, 청년이면 이렇게",
    a: [
      "주택청약종합저축에 가입해 두세요 — 행복주택·장기전세 등 순위 산정에 납입회차가 쓰입니다.",
      "매월 꾸준히 납입(회차 인정)이 핵심. 공고 신청 직전 몰아넣기는 인정 안 되는 경우가 많아요.",
      "청년우대형 청약통장은 금리·비과세 혜택이 있어 청년이라면 우선 고려.",
    ],
  },
  {
    q: "어디서 신청하나요?",
    a: [
      "LH 공급 — LH청약플러스(apply.lh.or.kr) 또는 마이홈(myhome.go.kr).",
      "SH(서울) 공급 — 서울주택도시공사(i-sh.co.kr).",
      "청년안심주택 — 서울시 청년안심주택 포털(soco.seoul.go.kr) 또는 운영사 채널.",
      "공고마다 '접수기간'이 짧습니다(보통 3~5일). 마감 임박 알림을 꼭 확인하세요.",
    ],
  },
  {
    q: "이런 실수, 자주 해요",
    a: [
      "중복신청 — 같은 공고에 여러 번 넣으면 전부 무효 처리되는 경우가 많습니다.",
      "소득 기준 착오 — 세전/세후, 가구원 수 기준을 헷갈림. 공고문 표를 꼭 확인.",
      "마감일 놓침 — 접수기간이 짧아 하루 이틀이면 끝납니다. 관심 공고는 미리 체크.",
      "서류 미제출 — 서류심사 대상이 되면 기간 내 제출 필수. 안 하면 탈락.",
    ],
  },
];

export default function TipsPage() {
  const all = dedupeCorrections([...LH_LISTINGS, ...YOUTH_PUBLIC_LISTINGS, ...SH_PUBLIC_LISTINGS]);
  const picks = all
    .filter((l) => {
      const s = effectiveStatus(l.status, l.deadline ?? "", l.beginDate);
      return (s === "open" || s === "closing") && isYouthRelevant(l);
    })
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
    .slice(0, 8);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 64px", color: "var(--seed-semantic-color-ink-text)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 0" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "inherit" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="다음" width={24} height={24} />
          <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>부동산</strong>
        </Link>
      </header>

      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", margin: "8px 0 4px" }}>청년 주거 팁</h1>
      <p style={{ fontSize: 14, color: "var(--seed-semantic-color-ink-text-low)", lineHeight: 1.6, margin: "0 0 24px" }}>
        공공임대·청약, 어렵게 느껴지죠? 청년이 꼭 알아야 할 것만 쉽게 정리했어요.
      </p>

      {picks.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>이번 주 청년이 노릴 만한 공고</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {picks.map((l) => {
              const dday = dDayText(l.deadline ?? "", effectiveStatus(l.status, l.deadline ?? "", l.beginDate));
              const dep = depositText(l), rent = rentText(l);
              return (
                <Link
                  key={l.id}
                  href={`/listings/${encodeURIComponent(l.id)}`}
                  style={{
                    display: "block", padding: "12px 14px", borderRadius: 12, textDecoration: "none",
                    border: "1px solid var(--seed-semantic-color-line-default, #eee)", color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontSize: 14.5, letterSpacing: "-0.02em" }}>{l.title}</strong>
                    {dday && <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--seed-scale-color-red-600, #e5484d)", whiteSpace: "nowrap" }}>{dday}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--seed-semantic-color-ink-text-low)", marginTop: 4 }}>
                    {l.district} · {l.agency}{dep ? ` · 보 ${dep}` : ""}{rent ? ` · 월 ${rent}` : ""}
                  </div>
                </Link>
              );
            })}
          </div>
          <Link href="/" style={{ display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 700, color: "var(--seed-semantic-color-primary, #3182f6)", textDecoration: "none" }}>
            지도에서 더 보기 →
          </Link>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px" }}>알아두면 좋은 것</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {TIPS.map((t, i) => (
            <details key={i} style={{ border: "1px solid var(--seed-semantic-color-line-default, #eee)", borderRadius: 12, padding: "12px 14px" }}>
              <summary style={{ fontSize: 14.5, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.02em" }}>{t.q}</summary>
              <ul style={{ margin: "10px 0 0", padding: "0 0 0 2px", listStyle: "none", display: "grid", gap: 6 }}>
                {t.a.map((line, j) => (
                  <li key={j} style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--seed-semantic-color-ink-text-low)" }}>{line}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <p style={{ fontSize: 12, color: "var(--seed-semantic-color-ink-text-low)", marginTop: 24, lineHeight: 1.6 }}>
        정확한 자격·서류 기준은 각 공고문과 LH 청약플러스(apply.lh.or.kr)·마이홈(myhome.go.kr)에서 확인하세요.
        내 상황에 맞는 답은 매물 상세의 <strong>AI 자격상담</strong>에서 바로 물어볼 수 있어요.
      </p>
    </div>
  );
}
