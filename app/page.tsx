import { AppShell } from "@/components/app-shell";
import { LH_DISTRICTS, LH_LISTINGS, LH_REGIONAL_LISTINGS } from "@/lib/lh-adapter";
import { YOUTH_PUBLIC_LISTINGS } from "@/lib/youth-adapter";
import { SH_PUBLIC_LISTINGS } from "@/lib/sh-adapter";
import { dedupeCorrections } from "@/lib/dedupe-corrections";
import { effectiveStatus } from "@/lib/dday";
import { getAllTips } from "@/lib/tips";
import type { Listing } from "@/lib/types";
import "./m/tokens.css";
import "./m/mobile.css";

export default function Page() {
  // "전체 공고" 버튼 배지 — 활성(모집중/예정/마감임박) 공고 수, 공고 단위(분리 핀 합산).
  const noticeKey = (l: Listing) => l.pblancId || l.id.replace(/-m\d+$/, "");
  const seen = new Set<string>();
  for (const l of [...LH_LISTINGS, ...LH_REGIONAL_LISTINGS]) {
    if (effectiveStatus(l.status, l.deadline ?? "", l.beginDate) === "closed") continue;
    seen.add(noticeKey(l));
  }
  const regionalCount = seen.size;

  // LH + 청년안심 + SH 공개 매물 합류. 정정공고가 있는 공고는 일반 버전 숨김(정정 우선).
  const listings = dedupeCorrections([...LH_LISTINGS, ...YOUTH_PUBLIC_LISTINGS, ...SH_PUBLIC_LISTINGS]);

  const tips = getAllTips().map(({ slug, title, summary, cover, tags }) => ({ slug, title, summary, cover, tags }));

  return <AppShell listings={listings} districts={LH_DISTRICTS} regionalCount={regionalCount} tips={tips} />;
}
