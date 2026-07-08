// LH 공고 → 단지 매칭 (순수 함수). sync-lh-api.mjs 와 테스트가 공유해 로직 불일치 방지.
//
// 배경: 지역광역 예비입주자 공고("화성서부권 국민임대주택 예비입주자 모집" 등)는
// 물리적 단지 하나에 대응되지 않는데, 과거 noticeKeywords 가 "국민임대주택" 같은
// 주택유형어를 키워드로 남겨 같은 시도의 아무 국민임대 단지(예: 성남판교대장 A-9)에
// 오매칭 → 단지명·좌표·주소·가격을 전부 오염시켰다. (성남판교대장 5개 뭉침 버그)
// → noticeKeywords 에서 주택유형어를 제거해, 단지 고유명이 있을 때만 매칭되게 한다.

// 블록번호 추출: "A-9블록" / "A8 BL" → "A9" / "A8"
export function extractBlock(s) {
  if (!s) return null;
  const m = String(s).match(/([A-Z]+)[-\s]?(\d+)\s*(?:BL[OoKk]*|블[록]?)/i);
  if (!m) return null;
  return (m[1] + m[2]).toUpperCase();
}

export function buildComplexIndex(complexes) {
  // 시군구 단위 그룹 + 단지명/주소 키워드별 인덱스
  const byKey = new Map(); // "brtc-signgu" -> Complex[]
  for (const c of complexes) {
    const k = `${c.brtcCode}-${c.signguCode}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }
  return { byKey };
}

// 주택유형어 — 단지 고유명이 아니라 제도 이름이라 매칭 키워드에서 제외 (오매칭 방지).
// 긴 것 먼저(국민임대주택 > 국민임대) — 부분 제거로 "주택" 이 남지 않게.
const HOUSING_TYPE_WORDS =
  "국민임대주택|영구임대주택|공공임대주택|통합공공임대|신혼희망타운|장기전세주택|" +
  "행복주택|국민임대|영구임대|공공임대|매입임대|전세임대|장기전세|분양전환";

// 공고 PAN_NM 에서 단지명 후보 추출
export function noticeKeywords(panNm) {
  if (!panNm) return [];
  // 1) 대괄호 안 내용 제거 (정정공고/긴급 등)
  // 2) 주택유형어 + "공고/모집/입주자모집" 등 보일러플레이트 제거
  // 3) 남은 토큰 중 길이 2자+ (매칭엔 3자+ 만 사용)
  const cleaned = panNm
    .replace(/\[[^\]]*\]/g, " ")
    .replace(new RegExp(HOUSING_TYPE_WORDS, "g"), " ")
    .replace(/공공분양주택|공공주택|입주자모집공고|입주자모집|예비입주자|모집공고|모집|공고/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(/\s+/).filter((s) => s.length >= 2);
}

// 공고 → 단지 매칭 (시도 일치 + 키워드 substring + 블록번호 검증)
// 블록 미일치는 명백한 거짓매칭이라 제외. 한쪽만 블록 없으면 키워드만으로 fallback 허용.
export function findMatchingComplex(notice, complexesByKey, sidoCode) {
  if (!sidoCode) return null;
  const keywords = noticeKeywords(notice.PAN_NM);
  if (!keywords.length) return null;
  const noticeBlock = extractBlock(notice.PAN_NM);

  const candidates = [];
  for (const [key, list] of complexesByKey.entries()) {
    if (key.startsWith(sidoCode + "-")) candidates.push(...list);
  }
  if (!candidates.length) return null;

  // Pass 1: 키워드 매칭 + 블록 둘 다 존재하면 일치 강제
  for (const kw of keywords) {
    if (kw.length < 3) continue;
    for (const c of candidates) {
      const blob = `${c.hsmpNm || ""} ${c.rnAdres || ""}`;
      if (!blob.includes(kw)) continue;
      const cBlock = extractBlock(c.hsmpNm);
      if (noticeBlock && cBlock) {
        if (noticeBlock === cBlock) return c;
        continue;
      }
      // 한쪽만 블록 있는 경우는 Pass 2 에서 fallback
    }
  }

  // Pass 2: 블록이 한쪽만 있거나 둘 다 없으면 키워드 매칭 첫 후보
  for (const kw of keywords) {
    if (kw.length < 3) continue;
    for (const c of candidates) {
      const blob = `${c.hsmpNm || ""} ${c.rnAdres || ""}`;
      if (!blob.includes(kw)) continue;
      const cBlock = extractBlock(c.hsmpNm);
      // 둘 다 블록 있는데 다른 케이스는 이미 Pass 1 에서 거른 상태
      if (noticeBlock && cBlock && noticeBlock !== cBlock) continue;
      return c;
    }
  }

  return null;
}
