import type { Listing } from "./types";

export type HomeConditions = { region: string; deposit: string; rent: string; area: string; includeUnknown: boolean };
export const DEFAULT_CONDITIONS: HomeConditions = { region: "", deposit: "", rent: "", area: "", includeUnknown: true };

export function conditionMatch(l: Listing, c: HomeConditions): "match" | "unknown" | "outside" {
  if (c.region && l.districtId !== c.region) return "outside";
  const hasPrice = c.deposit !== "" || c.rent !== "";
  if (!hasPrice && c.area === "") return "match";
  if (hasPrice && l.type === "sale") return "outside";
  const rows = l.complexes?.flatMap(x => x.rows) ?? [];
  if (!rows.length || (hasPrice && (l.priceUnverified || l.priceDetail))) return "unknown";
  let unknown = false;
  for (const r of rows) {
    let missing = false, outside = false;
    for (const [input, value, multiplier, minimum] of [
      [c.deposit, r.deposit, 10000, false], [c.rent, r.rent, 10000, false], [c.area, r.area, 1, true],
    ] as const) {
      if (input === "") continue;
      if (value == null || !Number.isFinite(value) || (minimum && value <= 0)) { missing = true; continue; }
      if (minimum ? value < Number(input) : value > Math.round(Number(input) * multiplier)) outside = true;
    }
    if (!outside && !missing) return "match";
    if (!outside && missing) unknown = true;
  }
  return unknown ? "unknown" : "outside";
}

export function listingFingerprint(l: Listing) {
  return {
    deadline: l.deadline, begin: l.beginDate ?? "", status: l.status,
    price: JSON.stringify([l.deposit, l.rent, l.depositRange, l.rentRange, l.priceUnverified, l.complexes?.map(c => c.rows.map(r => [r.houseType, r.deposit, r.rent]))]),
  };
}
export type ListingFingerprint = ReturnType<typeof listingFingerprint>;
export function changedFields(before: ListingFingerprint | undefined, l: Listing): string[] {
  if (!before) return [];
  const now = listingFingerprint(l), labels = [];
  if (before.deadline !== now.deadline || before.begin !== now.begin) labels.push("접수 일정 변경");
  if (before.price !== now.price) labels.push("임대조건 변경");
  if (before.status !== now.status) labels.push("모집 상태 변경");
  return labels;
}
