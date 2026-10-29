/** Keep the source address intact; only remove building/unit annotations for lookup. */
export function addressSearchKeyword(address: string): string {
  const clean = address.replace(/\([^)]*\).*$/, '').trim();
  const road = clean.match(/^(.+?(?:로|길)\s+\d+(?:-\d+)?)(?=\s|,|$)/);
  return road ? road[1] : clean;
}

/** Server-side road-address search. Never return or log the request URL/key. */
export async function searchRoadAddress(address: string): Promise<string | null> {
  const key = process.env.JUSO_API_KEY;
  const keyword = addressSearchKeyword(address);
  // A region or building name alone must never be promoted to a housing address.
  if (!key || !/(?:로|길|동|리)\s*\d/.test(keyword)) return null;
  try {
    const params = new URLSearchParams({ confmKey: key, currentPage: '1', countPerPage: '2', keyword, resultType: 'json' });
    const response = await fetch(`https://business.juso.go.kr/addrlink/addrLinkApi.do?${params}`, {
      cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = data?.results;
    if (String(result?.common?.errorCode) !== '0' || Number(result?.common?.totalCount) !== 1 || result?.juso?.length !== 1) return null;
    const road = result.juso[0]?.roadAddrPart1;
    return typeof road === 'string' && /(?:로|길)\s*\d/.test(road) ? road : null;
  } catch {
    return null;
  }
}
