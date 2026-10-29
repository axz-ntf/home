import type { ExtractedFields } from './solar-extract';

export const EXTRACTION_VERSION = 2;
const compact = (s: string) => s.replace(/\s+/g, '');
export function validNoticeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})[.-](\d{2})[.-](\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(+y, +m - 1, +d));
  return date.getUTCFullYear() === +y && date.getUTCMonth() === +m - 1 && date.getUTCDate() === +d ? `${y}.${m}.${d}` : null;
}
export function normalizeNoticeFields(input: ExtractedFields, source: string): ExtractedFields {
  const fields = structuredClone(input);
  const warnings = new Set(fields.warnings ?? []);
  const evidenceExists = (quote: unknown): quote is string => typeof quote === 'string' && compact(quote).length >= 4 && compact(source).includes(compact(quote));
  const seen = new Set<string>();
  fields.rows = fields.rows.filter(row => {
    const key = JSON.stringify([row.houseType, row.area, row.supplyUnits, row.deposit, row.rent, row.salePriceManwon, row.salePriceRange]);
    if (seen.has(key)) { warnings.add('동일한 임대·분양 조건의 중복 행을 제거했습니다.'); return false; }
    seen.add(key); return true;
  });
  for (const row of fields.rows) {
    if (row.supplyUnits != null && (!Number.isSafeInteger(row.supplyUnits) || row.supplyUnits < 0)) row.supplyUnits = null;
    for (const key of ['deposit', 'rent', 'salePriceManwon'] as const) {
      if (row[key] != null && (!Number.isFinite(row[key]) || row[key]! < 0)) row[key] = null;
    }
    if (row.salePriceRange) row.salePriceManwon = null;
  }
  const names = new Set([...fields.rows, ...(fields.tiers ?? []), ...(fields.householdTypes ?? []).map(h => ({ houseType: h.label }))].map(r => r.houseType));
  const claimed = new Set<string>();
  fields.supplyGroups = (fields.supplyGroups ?? []).filter(group => {
    const valid = Number.isSafeInteger(group.count) && group.count >= 0 && group.houseTypes.length > 0 &&
      new Set(group.houseTypes).size === group.houseTypes.length && group.houseTypes.every(name => names.has(name) && !claimed.has(name)) && evidenceExists(group.evidence) && new RegExp(`(^|[^0-9])${group.count}([^0-9]|$)`).test(group.evidence.replaceAll(',', ''));
    if (!valid) { warnings.add('모집 인원 그룹의 원문 근거 또는 연결을 확인하지 못했습니다.'); return false; }
    group.houseTypes.forEach(name => claimed.add(name)); return true;
  });
  // A merged cell belongs to its recruitment group, never to every price option.
  for (const row of [...fields.rows, ...(fields.tiers ?? [])]) if (claimed.has(row.houseType)) row.supplyUnits = null;
  for (const row of fields.householdTypes ?? []) if (claimed.has(row.label)) row.supplyUnits = null;
  fields.eligibility = (fields.eligibility ?? []).filter(rule => {
    if (evidenceExists(rule.evidence)) return true;
    warnings.add('원문 근거를 찾지 못한 자격 조건을 제외했습니다.'); return false;
  });
  if (fields.schedule) {
    for (const key of ['applyStart', 'applyEnd', 'docResultAt', 'winnerAt'] as const) fields.schedule[key] = validNoticeDate(fields.schedule[key]);
    if (fields.schedule.applyStart && fields.schedule.applyEnd && fields.schedule.applyStart > fields.schedule.applyEnd) {
      warnings.add('접수 시작·마감일 순서가 맞지 않아 일정 확인이 필요합니다.');
      fields.schedule.applyStart = null; fields.schedule.applyEnd = null;
    }
  }
  fields.deadline = fields.schedule?.applyEnd ?? validNoticeDate(fields.deadline);
  // Recruitment status is time-dependent; never persist an LLM's "currently open" guess.
  fields.progressStatus = null;
  const conversion = fields.conversion;
  if (conversion?.perHouseType) {
    conversion.perHouseType = conversion.perHouseType.flatMap((item): NonNullable<typeof conversion.perHouseType> => {
      const base = fields.rows.find(row => row.houseType === item.houseType);
      if (!base || base.deposit == null || base.rent == null || item.maxDeposit == null || item.minRent == null) {
        warnings.add('전환 방향은 원문 조건별 확인이 필요합니다.'); return [{ ...item, direction: undefined }];
      }
      const increase = item.maxDeposit > base.deposit && item.minRent <= base.rent;
      const decrease = item.maxDeposit < base.deposit && item.minRent >= base.rent;
      if (!increase && !decrease) { warnings.add('기본 임대조건과 맞지 않는 보증금 전환값을 제외했습니다.'); return []; }
      return [{ ...item, direction: increase ? 'increase' as const : 'decrease' as const }];
    });
  }
  // Clearing a merged quota can make two previously different rows identical.
  seen.clear();
  fields.rows = fields.rows.filter(row => {
    const key = JSON.stringify([row.houseType, row.area, row.supplyUnits, row.deposit, row.rent, row.salePriceManwon, row.salePriceRange]);
    if (seen.has(key)) { warnings.add('동일한 임대·분양 조건의 중복 행을 제거했습니다.'); return false; }
    seen.add(key); return true;
  });
  fields.warnings = [...warnings];
  return fields;
}
