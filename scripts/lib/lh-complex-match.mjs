// LH 공고 → 단지 매칭 (순수 함수). sync-lh-api.mjs 와 테스트가 공유해 로직 불일치 방지.
//
// 배경: 지역광역 예비입주자 공고("화성서부권 국민임대주택 예비입주자 모집" 등)는
// 물리적 단지 하나에 대응되지 않는데, 과거 noticeKeywords 가 "국민임대주택" 같은
// 주택유형어를 키워드로 남겨 같은 시도의 아무 국민임대 단지(예: 성남판교대장 A-9)에
// 오매칭 → 단지명·좌표·주소·가격을 전부 오염시켰다. (성남판교대장 5개 뭉침 버그)
// → noticeKeywords 에서 주택유형어를 제거해, 단지 고유명이 있을 때만 매칭되게 한다.

// 블록번호 추출: "A-9블록" / "A8 BL" / "A10(2)BL" / "AA35-2블록" / "1BL" / "A82블럭"
//   → "A9" / "A8" / "A10-2" / "AA35-2" / "1" / "A82". 숫자 앞 0 은 버림 ("Ac-05" → "AC5").
// 괄호·하이픈 부번호와 알파벳 없는 블록을 못 읽으면 블록 검증을 건너뛰어
// 같은 지구의 다른 블록(양주회천 A-26 ↔ A10(2))에 오매칭된다.
export function extractBlock(s) {
  if (!s) return null;
  const m = String(s).match(/(?:^|[^A-Za-z0-9])([A-Z]{0,3})-?(\d+)(?:(?:\((\d+)\))|-(\d+))?\s*(?:BL[OoKk]*\b|블[록럭]?)/i);
  if (!m) return null;
  const sub = m[3] ?? m[4];
  return `${m[1].toUpperCase()}${Number(m[2])}${sub ? `-${Number(sub)}` : ""}`;
}

// 매칭 검증용 블록: "블록/BL" 접미사 없이 쓴 표기도 잡는다 ("A-20(3)(공임리츠)" · "LH38단지" · "A-9 신혼희망타운").
// 키워드 필터엔 쓰지 않는다(너무 넓음) — 매칭 시 양쪽 블록 비교에만.
function blockOf(s) {
  const strict = extractBlock(s);
  if (strict) return strict;
  const m = String(s ?? "").match(/(?:^|[^A-Za-z0-9])([A-Z]{1,3})-?(\d+)(?:\((\d+)\)|-(\d+))?/i);
  if (!m) return null;
  const sub = m[3] ?? m[4];
  return `${m[1].toUpperCase()}${Number(m[2])}${sub ? `-${Number(sub)}` : ""}`;
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

const GENERIC_WORDS = /^(아파트|주택|추가|정정|선착순|입주자격완화|자격완화|LH)$/;

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
  // 블록 표기("A-2블록"·"1BL")와 일반어("아파트")는 단지 고유명이 아니라서 제외 —
  // 남겨두면 다른 지역의 같은 블록/아무 아파트에 붙는다 (의정부우정 A-2 ↔ 수원당수 A-2).
  return cleaned
    .split(/\s+/)
    .filter((s) => s.length >= 2 && !extractBlock(s) && !GENERIC_WORDS.test(s));
}

// 공고 → 단지 매칭 (시도 일치 + 키워드 substring + 블록번호 검증)
// 블록: 둘 다 있으면 같아야 하고, 단지에만 있으면 거절(공고가 그 블록이라는 근거 없음).
// 공고에만 블록이 있고 단지명엔 없으면, 키워드에 맞는 후보가 하나뿐일 때만 허용.
export function findMatchingComplex(notice, complexesByKey, sidoCode) {
  if (!sidoCode) return null;
  const keywords = noticeKeywords(notice.PAN_NM).filter((kw) => kw.length >= 3);
  if (!keywords.length) return null;
  const noticeBlock = blockOf(notice.PAN_NM);

  const candidates = [];
  for (const [key, list] of complexesByKey.entries()) {
    if (key.startsWith(sidoCode + "-")) candidates.push(...list);
  }

  const fallbacks = new Set();
  for (const kw of keywords) {
    for (const c of candidates) {
      const blob = `${c.hsmpNm || ""} ${c.rnAdres || ""}`;
      if (!blob.includes(kw)) continue;
      const cBlock = blockOf(c.hsmpNm);
      if (cBlock && !noticeBlock) continue;
      if (noticeBlock && cBlock) {
        if (noticeBlock === cBlock) return c;
        continue;
      }
      fallbacks.add(c);
    }
  }
  // 공고엔 블록이 있는데 블록 없는 단지로 넘어가는 경우 — 그 지구에 후보가 하나뿐일 때만 (양주옥정 A-4(1) ↔ 양주옥정3단지 방지)
  if (noticeBlock && fallbacks.size > 1) return null;
  return fallbacks.values().next().value ?? null;
}
