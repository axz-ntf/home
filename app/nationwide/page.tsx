import { LH_REGIONAL_LISTINGS } from "@/lib/lh-adapter";
import { effectiveStatus } from "@/lib/dday";
import NationwideList, { type NationwideRow } from "./nationwide-list";

export const dynamic = "force-dynamic";

// 광역(전국·다지점) 매물 — 지도에 못 띄워서 메인 리스트에서 빠진 매물.
// 활성 (모집중/예정) 만 노출. 마감은 제외.
export default function NationwidePage() {
  const rows: NationwideRow[] = LH_REGIONAL_LISTINGS
    .map((l) => {
      const status = effectiveStatus(l.status, l.deadline ?? "", l.beginDate);
      return { l, status };
    })
    .filter(({ status }) => status === "open" || status === "upcoming" || status === "closing")
    .map(({ l, status }) => ({
      id: l.id,
      title: l.title,
      type: l.type,
      district: l.district,
      status,
      deadline: l.deadline ?? "",
      announceDate: l.announceDate ?? "",
      supplyUnits: typeof l.supplyUnits === "number" ? l.supplyUnits : null,
      deposit: l.deposit ?? 0,
      rent: l.rent ?? 0,
      salePriceManwon: l.salePriceManwon ?? null,
      area: l.area ?? "",
      eligible: l.eligible ?? [],
      sourceUrl: l.sourceUrl ?? "",
    }))
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));

  return <NationwideList rows={rows} />;
}
