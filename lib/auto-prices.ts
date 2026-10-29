import type { ManualOverride } from './manual-overrides';

export type AutoRecord = {
  title: string; sourceUrl: string; checkedAt: string; nextAttemptAt: string;
  status: 'published' | 'retry' | 'deferred'; attempts: number; reason: string;
  sourceHash?: string; fields?: ManualOverride;
  evidence?: { model: string; first: TableSelection; second: TableSelection };
};
export type AutoStore = { lastRun: string | null; records: Record<string, AutoRecord> };
export const MAX_AGE = 48 * 60 * 60 * 1000;
export function usableAuto(record: AutoRecord | undefined, sourceUrl: string | undefined, now = Date.now()) {
  const age = now - Date.parse(record?.checkedAt ?? '');
  return record?.status === 'published' && record.sourceUrl === sourceUrl && record.sourceHash &&
    Number.isFinite(age) && age >= 0 && age < MAX_AGE ? record.fields : undefined;
}

// The model selects a complete original table; deterministic code reads its cells.
export type TableSelection = {
  simpleSingleComplex: boolean; table: string; unitQuote: string; unit: '원' | '천원' | '만원';
  houseColumn: number; depositColumn: number; rentColumn: number;
};
export class AutoValidationError extends Error {}
export function validateTables(md: string, first: TableSelection, second: TableSelection): ManualOverride {
  function parse(s: TableSelection) {
    if (!s?.simpleSingleComplex) throw new AutoValidationError('복수 단지·조건별 가격: 자동 반영 보류');
    if (!s.table || !md.includes(s.table) || !s.unitQuote || !md.includes(s.unitQuote)) throw new AutoValidationError('원문 근거 불일치');
    const factor = { '원': 0.0001, '천원': 0.1, '만원': 1 }[s.unit];
    if (!factor || !new RegExp(`단위\\s*[:：]?\\s*${s.unit}`).test(s.unitQuote) || s.unitQuote.length > 120) throw new AutoValidationError('금액 단위 불명확');
    const start = md.indexOf(s.table), unitAt = md.lastIndexOf(s.unitQuote, start);
    if (unitAt < 0 || start - unitAt > 500) throw new AutoValidationError('표와 단위 근거가 떨어져 있음');
    const before = md.slice(0, start).trimEnd().split('\n').at(-1) ?? '';
    const after = md.slice(start + s.table.length).trimStart().split('\n')[0] ?? '';
    if (before.trim().startsWith('|') || after.trim().startsWith('|')) throw new AutoValidationError('부분 표 추출 거부');
    const lines = s.table.trim().split('\n');
    const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim());
    if (lines.length < 3 || !/^\|?[\s:|\-]+\|?$/.test(lines[1])) throw new AutoValidationError('표 구조 불명확');
    const header = cells(lines[0]);
    const columns = [s.houseColumn, s.depositColumn, s.rentColumn];
    if (new Set(columns).size !== 3 || columns.some(x => !Number.isInteger(x) || x < 0 || x >= header.length)) throw new AutoValidationError('열 매칭 실패');
    if (!/형|면적/.test(header[s.houseColumn]) || !/보증금/.test(header[s.depositColumn]) || !/월.*임대료|월세/.test(header[s.rentColumn])) throw new AutoValidationError('가격 열 제목 불일치');
    const money = (v: string) => {
      if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(v)) throw new AutoValidationError('가격 숫자 불명확');
      const n = Math.round(Number(v.replaceAll(',', '')) * factor * 10000) / 10000;
      if (!Number.isFinite(n) || n < 0) throw new AutoValidationError('가격 범위 오류');
      return n;
    };
    const rows = lines.slice(2).map(line => {
      const c = cells(line);
      if (c.length !== header.length || !c[s.houseColumn]) throw new AutoValidationError('누락된 표 셀');
      const deposit = money(c[s.depositColumn]), rent = money(c[s.rentColumn]);
      if (deposit <= 0 || deposit > 300000 || rent > 1000) throw new AutoValidationError('가격 범위 이상');
      return { houseType: c[s.houseColumn], deposit, rent };
    });
    if (!rows.length || new Set(rows.map(r => r.houseType)).size !== rows.length) throw new AutoValidationError('중복 평형 또는 조건별 가격');
    return rows.sort((a,b) => a.houseType.localeCompare(b.houseType));
  }
  const rows = parse(first), other = parse(second);
  if (first.table !== second.table || JSON.stringify(rows) !== JSON.stringify(other)) throw new AutoValidationError('독립 추출 결과 불일치');
  const cheapest = [...rows].sort((a,b) => a.deposit - b.deposit)[0];
  return { rows, deposit: cheapest.deposit, rent: cheapest.rent, _reviewedAt: '', priceModel: 'rows-by-area' };
}
