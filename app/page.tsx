import { AppShell } from "@/components/app-shell";
import { LH_DISTRICTS, LH_LISTINGS, LH_REGIONAL_LISTINGS } from "@/lib/lh-adapter";
import { effectiveStatus } from "@/lib/dday";
import "./m/tokens.css";
import "./m/mobile.css";

export default function Page() {
  // 전국 모집 (광역) 활성 매물 수 — topbar 버튼 배지용.
  const regionalCount = LH_REGIONAL_LISTINGS.filter((l) => {
    const s = effectiveStatus(l.status, l.deadline ?? "", l.beginDate);
    return s === "open" || s === "upcoming" || s === "closing";
  }).length;

  return <AppShell listings={LH_LISTINGS} districts={LH_DISTRICTS} regionalCount={regionalCount} />;
}
