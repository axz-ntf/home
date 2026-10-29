const hosts = new Set(['apply.lh.or.kr', 'www.i-sh.co.kr', 'i-sh.co.kr', 'soco.seoul.go.kr', 'housing.seoul.go.kr']);
export function officialUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && hosts.has(u.hostname) && !u.username && !u.password; } catch { return false; }
}
const clean = s => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
export function category(name) {
  if (/평면|주택형별/.test(name)) return 'floorplan';
  if (/배치도/.test(name)) return 'layout';
  if (/조감도|투시도|전경|단지사진/.test(name)) return 'photo';
  if (/주택목록|주택보유목록|공급목록|주택내역|공급대상/.test(name.replace(/[_\s]/g,''))) return 'housing-list';
  if (/공고문|모집공고/.test(name)) return 'notice';
  if (/신청|동의서|제출|양식/.test(name)) return 'form';
  if (/주택목록|공급목록|주택내역/.test(name)) return 'housing-list';
  return 'other';
}
export function parseMaterials(html, sourceUrl) {
  if (!officialUrl(sourceUrl)) throw new Error('지원하는 공식 원문 주소가 아닙니다');
  const out = new Map();
  const add = (name, url, kind) => {
    if (!officialUrl(url)) return;
    const previous = out.get(url);
    // Preserve the descriptive metadata over generic anchor text.
    if (previous && previous.kind !== 'other') return;
    out.set(url, { name: clean(name) || '원문 첨부파일', url, kind: kind ?? category(clean(name)) });
  };
  if (new URL(sourceUrl).hostname === 'apply.lh.or.kr') {
    for (const m of html.matchAll(/list\.push\("\{([\s\S]*?)\}"\)\s*;?/g)) {
      const fields = {};
      const matches = [...m[1].matchAll(/(?:^|,\s*)([A-Za-z][A-Za-z0-9]*)=/g)];
      matches.forEach((v,i) => { fields[v[1]] = m[1].slice(v.index + v[0].length, matches[i+1]?.index ?? m[1].length).trim(); });
      if (!/^\d+$/.test(fields.cmnAhflSn ?? '')) continue;
      const label = [fields.slPanAhflDsCdNm, fields.lsSplInfUplFlDsCdNm, fields.ahflDesc, fields.cmnAhflNm].filter(v => v && v !== 'null').join(' · ');
      add(label, `https://apply.lh.or.kr/lhapply/lhFile.do?fileid=${fields.cmnAhflSn}`);
    }
    for (const m of html.matchAll(/<a\b[^>]*fileDownLoad\(\s*['"](\d+)['"]\s*\)[^>]*>([\s\S]*?)<\/a>/gi)) {
      add(m[2], `https://apply.lh.or.kr/lhapply/lhFile.do?fileid=${m[1]}`);
    }
  }
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const raw = clean(m[1]);
    if (!/\.(?:pdf|hwp|hwpx|xlsx?|zip|jpe?g|png)(?:[?#]|$)|fileDown|innoFD/i.test(raw)) continue;
    try { add(m[2], new URL(raw, sourceUrl).href); } catch { /* invalid source link */ }
  }
  return [...out.values()];
}
