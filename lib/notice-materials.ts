export type MaterialKind = 'notice' | 'floorplan' | 'layout' | 'photo' | 'form' | 'housing-list' | 'other';
export type Material = { name: string; url: string; kind: MaterialKind };
export type MaterialRecord = {
  title: string; sourceUrl: string; checkedAt: string;
  status: 'collected' | 'empty' | 'error'; materials: Material[]; error?: string;
};
export type MaterialsStore = { lastRun: string | null; records: Record<string, MaterialRecord> };
export const MATERIAL_LABELS: Record<MaterialKind,string> = {
  notice: '공고문', floorplan: '평면도', layout: '배치도', photo: '단지 이미지',
  form: '신청 서류', 'housing-list': '공급 주택 목록', other: '기타 첨부',
};
