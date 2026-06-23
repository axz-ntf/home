import "./tokens.css";
import "./mobile.css";
import { MobileApp } from "./MobileV1";
import { LH_DISTRICTS, LH_LISTINGS } from "@/lib/lh-adapter";
import { YOUTH_PUBLIC_LISTINGS } from "@/lib/youth-adapter";
import { SH_PUBLIC_LISTINGS } from "@/lib/sh-adapter";
import { dedupeCorrections } from "@/lib/dedupe-corrections";

// /m URL — 실제 모바일 앱 모드. props 직렬화 부담 줄이기 위해 모바일 카드에 필요한
// 필드만 골라서 전달 (12MB JSON 통째 전달은 hydration 부담).
export default function MobileDemoPage() {
  // LH + 청년안심 + SH 합류 + 정정공고 dedup (데스크탑과 동일).
  const combined = dedupeCorrections([...LH_LISTINGS, ...YOUTH_PUBLIC_LISTINGS, ...SH_PUBLIC_LISTINGS]);
  const slim = combined.map((l) => ({
    id: l.id, title: l.title, type: l.type, agency: l.agency,
    districtId: l.districtId, district: l.district, address: l.address,
    lat: l.lat, lng: l.lng, deposit: l.deposit, rent: l.rent, area: l.area,
    depositRange: l.depositRange ?? null, rentRange: l.rentRange ?? null,
    status: l.status, deadline: l.deadline, eligible: l.eligible,
    thumbSeed: l.thumbSeed, supplyUnits: l.supplyUnits,
    heatMethod: l.heatMethod, suplyTyNm: l.suplyTyNm,
    layout: "", features: [], transit: "", competition: null,
    sourceUrl: l.sourceUrl,
  }));
  return (
    <div className="mobile-only-force">
      <MobileApp listings={slim} districts={LH_DISTRICTS} />
    </div>
  );
}
