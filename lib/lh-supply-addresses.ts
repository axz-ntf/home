/** Read only the official supply section, never the application-office section. */
export function readLhSupplyAddresses(html: string): string[] {
 const clean = html.replace(/<!--[\s\S]*?-->/g, '');
 const section = clean.match(/<h3\b[^>]*>\s*공급정보\s*<\/h3>([\s\S]*?)(?=<h3\b|$)/)?.[1];
 if (!section) return [];
 const addresses = [...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(m =>
  m[1].replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
 ).filter(s => /^소재지\s*:?\s*/.test(s)).map(s => s.replace(/^소재지\s*:?\s*/, '').trim());
 return [...new Set(addresses.filter(s => /(?:로|길|동|리)\s*\d/.test(s) && !/주거복지지사|접수처|지역본부/.test(s)))];
}
