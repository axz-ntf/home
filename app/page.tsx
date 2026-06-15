import { AppShell } from "@/components/app-shell";
import { LH_DISTRICTS, LH_LISTINGS, LH_REGIONAL_LISTINGS } from "@/lib/lh-adapter";
import { YOUTH_PUBLIC_LISTINGS } from "@/lib/youth-adapter";
import { effectiveStatus } from "@/lib/dday";
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

  // 청년주택(청년안심) 공개 매물 — 좌표 보유분을 지도에 합류 (공급유형 "청년주택" 필터 대상).
  const listings = [...LH_LISTINGS, ...YOUTH_PUBLIC_LISTINGS];

  return <AppShell listings={listings} districts={LH_DISTRICTS} regionalCount={regionalCount} />;
}
