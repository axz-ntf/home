// 공고 제목 → "시도 시군구" 지오코딩 질의 생성 (순수 함수).
// 지역광역 예비입주자 공고("화성서부권 국민임대주택 …")처럼 단일 단지 위치가 없는 건을
// 시군구 중심 좌표로 지도에 올리기 위함. geocode-missing-coords.mjs 와 테스트가 공유.

// 시도 정식명 → 축약형 (Kakao/VWorld 질의에 축약형이 더 잘 맞음).
export const SIDO_SHORT = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천",
  광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종",
  경기도: "경기", 강원특별자치도: "강원", 강원도: "강원", 충청북도: "충북", 충청남도: "충남",
  전북특별자치도: "전북", 전라북도: "전북", 전라남도: "전남", 경상북도: "경북",
  경상남도: "경남", 제주특별자치도: "제주",
};

// 제목에서 시군구를 찾아 "시도short 시군구" 질의를 만든다. 못 찾으면 null.
// - adminCodes: lib/admin-codes.json ({ "41": { name, sigungu:[{code,name}] } })
// - 후보는 공고의 시도 안으로 제한 → 타 시도 동명 지명 오매칭 방지.
// - 시/군 레벨(구는 버림): "성남시 분당구" → "성남시" 중심.
export function sigunguQuery(title, sidoName, adminCodes) {
  if (!title || !sidoName) return null;
  const clean = sidoName.replace(/\s*외\s*$/, "").trim();
  const entry = Object.values(adminCodes).find((s) => s.name === clean);
  if (!entry) return null;

  const cands = [...new Set(entry.sigungu.map((sg) => sg.name.split(" ")[0]))] // 성남시 분당구 → 성남시
    .map((full) => ({ full, stem: full.replace(/(시|군|구)$/, "") }))
    .filter((x) => x.stem.length >= 2)
    .sort((a, b) => b.stem.length - a.stem.length); // 긴 지명 우선 (안성 vs 안산 등 정확도)

  for (const c of cands) {
    if (title.includes(c.stem)) {
      const short = SIDO_SHORT[clean] || clean;
      return `${short} ${c.full}`;
    }
  }
  return null;
}
