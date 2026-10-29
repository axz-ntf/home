import type { ExtractedFields } from './solar-extract';
import { formatManwon } from './format';

export const noticeMoney = (n: number | null | undefined) => n == null ? '미확보' : n === 0 ? '0원' : formatManwon(n);
export function extractedMoney(fields: ExtractedFields | null, key: 'deposit' | 'rent' | 'salePriceManwon'): string {
  if (!fields) return '미확보';
  const values: (number | null)[] = fields.rows.flatMap(row => key === 'salePriceManwon' && row.salePriceRange ? row.salePriceRange : [row[key]]);
  if (key !== 'salePriceManwon') {
    for (const tier of fields.tiers ?? []) for (const income of tier.incomes) values.push(income[key]);
    for (const household of fields.householdTypes ?? []) { const v = household[key]; values.push(...(Array.isArray(v) ? v : [v])); }
  }
  const known = values.filter((n): n is number => n != null && Number.isFinite(n));
  if (!known.length) return '미확보';
  const min = Math.min(...known), max = Math.max(...known);
  return `${min === max ? noticeMoney(min) : `${noticeMoney(min)} ~ ${noticeMoney(max)}`}${values.some(n => n == null) ? ' (일부 확인)' : ''}`;
}
export function extractedSupply(fields: ExtractedFields | null): string {
  if (!fields) return '미확보';
  const groups = fields.supplyGroups ?? [];
  const grouped = new Set(groups.flatMap(g => g.houseTypes));
  const rows = [...fields.rows, ...(fields.tiers ?? []), ...(fields.householdTypes ?? []).map(h => ({ ...h, houseType: h.label }))].filter(r => !grouped.has(r.houseType));
  const parts = groups.map(g => `${g.label}: ${g.kind === 'reserve' ? '예비자' : '공급'} ${g.count}${g.kind === 'reserve' ? '명' : '세대'}`);
  // Without an explicit grouping relationship, never infer a total from price rows.
  for (const row of rows) if (row.supplyUnits != null) parts.push(`${row.houseType}: ${row.supplyUnits}세대`);
  return parts.join(' / ') || '미확보';
}
export function extractedArea(fields: ExtractedFields | null): string {
  if (!fields) return '미확보';
  const areas = [...new Set([...fields.rows, ...(fields.tiers ?? [])].map(r => r.area).filter((s): s is string => !!s).map(s => /㎡|m²/i.test(s) ? s : s + '㎡'))];
  return areas.join(' / ') || '미확보';
}
export function noticeProgress(fields: ExtractedFields | null, now = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year:'numeric',month:'2-digit',day:'2-digit' }).format(now).replaceAll('-', '.');
  const start = fields?.schedule?.applyStart;
  const end = fields?.schedule?.applyEnd ?? fields?.deadline;
  if (end && end < today) return '접수 마감';
  if (start && start > today) return '접수 예정';
  if (start && end) return '접수 기간';
  return '원문 일정 확인';
}
export function retryLabel(nextAt: string | undefined, now = Date.now()): string {
  const target = Date.parse(nextAt ?? '');
  if (!Number.isFinite(target)) return '예약 기록 없음';
  if (target <= now) return '예정 시각 경과 · 실행 기록 확인 필요';
  return `${new Date(target).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})} (예약 기록)`;
}
