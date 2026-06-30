// 카카오 Local REST — 좌표 반경 내 카테고리별 장소 개수(meta.total_count).
// 서버 전용(KAKAO_REST_API_KEY). 지도(네이버)와 무관한 데이터 전용 호출.
// 카테고리 코드: https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-category

const CATEGORIES = {
  cvs: "CS2", // 편의점
  mart: "MT1", // 대형마트
  food: "FD6", // 음식점
  cafe: "CE7", // 카페
  hospital: "HP8", // 병원
  pharmacy: "PM9", // 약국
  bank: "BK9", // 은행
  academy: "AC5", // 학원
  culture: "CT1", // 문화시설
} as const;

export type LocalCounts = Record<keyof typeof CATEGORIES, number>;

// 반경(m) 내 카테고리별 개수. 키 없거나 좌표 없으면 null. 개별 실패는 0 처리.
export async function localCounts(
  lat: number | null | undefined,
  lng: number | null | undefined,
  radius = 500,
): Promise<LocalCounts | null> {
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (!key || !lat || !lng) return null;

  const entries = await Promise.all(
    Object.entries(CATEGORIES).map(async ([name, code]) => {
      const url =
        `https://dapi.kakao.com/v2/local/search/category.json` +
        `?category_group_code=${code}&x=${lng}&y=${lat}&radius=${radius}&size=1`;
      try {
        const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
        if (!r.ok) return [name, 0] as const;
        const j = await r.json();
        return [name, j.meta?.total_count ?? 0] as const;
      } catch {
        return [name, 0] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as LocalCounts;
}

export type RegionInfo = { lawdCd: string; umd: string; sigungu: string };

// 좌표 → 법정동(시군구코드 5자리 + 법정동명). 국토부 실거래가 LAWD_CD 용.
export async function coord2region(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<RegionInfo | null> {
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (!key || !lat || !lng) return null;
  try {
    const r = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`, {
      headers: { Authorization: `KakaoAK ${key}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const docs: Array<Record<string, string>> = j.documents ?? [];
    const b = docs.find((d) => d.region_type === "B") ?? docs[0];
    if (!b?.code) return null;
    return {
      lawdCd: String(b.code).slice(0, 5),
      umd: b.region_3depth_name ?? "",
      sigungu: b.region_2depth_name ?? "",
    };
  } catch {
    return null;
  }
}
