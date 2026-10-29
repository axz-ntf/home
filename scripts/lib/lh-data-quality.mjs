// 원 단위 숫자는 반올림하거나 문자열의 다른 숫자와 합치지 않는다.
export function parseNumber(value) {
  if (value == null || typeof value === "object") return null;
  const text = String(value).trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function mapHousingType(title = "", upper = "", sub = "") {
  const text = `${sub} ${title}`;
  if (upper === "05" || upper === "39") return "sale";
  for (const [pattern, type] of [
    [/통합공공임대|든든/, "integ"], [/행복/, "happy"], [/국민임대/, "nation"],
    [/영구임대/, "perm"], [/매입임대/, "buy"], [/전세임대/, "jeonse"],
    [/50년/, "fifty"], [/공공임대|공임리츠|(?:5|10)년\s*임대/, "public"],
  ]) if (pattern.test(text)) return type;
  return "rental";
}

export function noticeRows(json) {
  const rows = Array.isArray(json) && json[1]?.dsList;
  if (!Array.isArray(rows)) throw new Error("LH 목록 응답 형식 오류 — 기존 데이터 보존");
  return rows;
}

// received 는 반드시 현재 시군구 질의에서 받은 수여야 한다.
export function hasNextPage(received, pageLength, totalCount, pageSize) {
  if (totalCount > 0 && received < totalCount) {
    if (!pageLength) throw new Error("전체 건수 이전에 빈 페이지 수신");
    return true;
  }
  return totalCount > 0 ? false : pageLength === pageSize;
}

export async function collectPages(fetchPage, pageSize) {
  const result = [], fingerprints = new Set();
  let expected = 0;
  for (let page = 1; ; page++) {
    const { items, totalCount } = await fetchPage(page);
    if (!Array.isArray(items) || !Number.isFinite(totalCount) || totalCount < 0) throw new Error("페이지 응답 오류");
    expected = Math.max(expected, totalCount);
    const fingerprint = JSON.stringify(items);
    if (items.length && fingerprints.has(fingerprint)) throw new Error("중복 페이지 응답");
    fingerprints.add(fingerprint);
    result.push(...items);
    if (!hasNextPage(result.length, items.length, expected, pageSize)) return result;
  }
}

export function summarizeRows(rows, title = "") {
  const positive = key => rows.map(r => r[key]).filter(n => Number.isFinite(n) && n > 0);
  const dep = positive("deposit"), rent = rows.map(r => r.rent).filter(n => Number.isFinite(n) && n >= 0), areas = positive("area");
  const sum = key => rows.length && rows.every(r => Number.isInteger(r[key]) && r[key] >= 0)
    ? rows.reduce((n, r) => n + r[key], 0) : null;
  const total = sum("supplyTotal"), supply = sum("supplyThisRound");
  return {
    depositManwon: dep.length ? Math.min(...dep) / 10000 : 0,
    monthlyRentManwon: rent.length ? Math.min(...rent) / 10000 : 0,
    depositRange: dep.length ? [Math.min(...dep) / 10000, Math.max(...dep) / 10000] : null,
    rentRange: rent.length ? [Math.min(...rent) / 10000, Math.max(...rent) / 10000] : null,
    area: areas.length ? [...new Set([Math.min(...areas), Math.max(...areas)])].join("~") : "",
    totalUnits: total,
    // 예비입주자 수와 빈집 수는 다르다. 표의 금회공급 0을 모집인원으로 사용하지 않는다.
    supplyUnits: /예비/.test(title) || (total != null && supply != null && supply > total) ? null : supply,
  };
}

export function extractPriceArea(supply) {
  if (!supply) return null;
  const raw = Object.entries(supply).flatMap(([k, v]) => /^dsList/.test(k) && !/Nm$/.test(k) && Array.isArray(v) ? v : []);
  const rows = raw.filter(r => r.LS_GMY != null || r.MM_RFE != null || r.DDO_AR != null || r.SIL_AMT != null).map(r => ({
    houseType: String(r.HTY_NM ?? r.HTY_CD ?? r.DDO_AR ?? ""),
    area: parseNumber(r.DDO_AR), deposit: parseNumber(r.LS_GMY), rent: parseNumber(r.MM_RFE),
    supplyTotal: null, supplyThisRound: null,
  }));
  if (!rows.length) return null;
  const sales = raw.map(r => parseNumber(r.SIL_AMT)).filter(n => n > 0);
  return { ...summarizeRows(rows), rows, saleMin: sales.length ? Math.min(...sales) : null };
}
