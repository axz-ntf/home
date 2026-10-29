import { LH_LISTINGS, LH_DISTRICTS } from "@/lib/lh-adapter";
import { SH_PUBLIC_LISTINGS } from "@/lib/sh-adapter";
import { YOUTH_PUBLIC_LISTINGS } from "@/lib/youth-adapter";
import { dedupeCorrections } from "@/lib/dedupe-corrections";
import { AppShell } from "@/components/app-shell";
import { getAllTips } from "@/lib/tips";
import "../m/tokens.css";
import "../m/mobile.css";
import "./compare.css";

export const metadata = { title: "관심 공고 비교 · 내 집 준비" };

export default function ComparePage() {
  const listings = dedupeCorrections([...LH_LISTINGS, ...SH_PUBLIC_LISTINGS, ...YOUTH_PUBLIC_LISTINGS]);
  const tips = getAllTips().map(({ slug, title, summary, cover, tags }) => ({ slug, title, summary, cover, tags }));
  return <AppShell listings={listings} districts={LH_DISTRICTS} tips={tips} initialCompare />;
}
