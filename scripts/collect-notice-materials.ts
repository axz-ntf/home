import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { LH_ADMIN_LISTINGS } from '../lib/lh-adapter';
import { officialUrl, parseMaterials } from './lib/notice-materials.mjs';
import { effectiveStatus } from '../lib/dday';
import type { Material, MaterialsStore } from '../lib/notice-materials';
const file = 'lib/notice-materials.json';
const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i+1]; };
async function main() {
  const limit = Number(arg('--limit') ?? 15), id = arg('--id');
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('limit must be 1..500');
  const store: MaterialsStore = JSON.parse(await fs.readFile(file, 'utf8'));
  const unique = new Map<string, (typeof LH_ADMIN_LISTINGS)[number]>();
  for (const listing of LH_ADMIN_LISTINGS) {
    if (id ? listing.id !== id : effectiveStatus(listing.status, listing.deadline, listing.beginDate) === 'closed') continue;
    if (listing.sourceUrl && officialUrl(listing.sourceUrl) && !unique.has(listing.sourceUrl)) unique.set(listing.sourceUrl, listing);
  }
  const targets = [...unique.values()].filter(l => id || process.argv.includes('--force') || !store.records[l.sourceUrl!] || Date.now() - Date.parse(store.records[l.sourceUrl!].checkedAt) >= 86400000).sort((a,b) => (store.records[a.sourceUrl!]?.checkedAt ?? '').localeCompare(store.records[b.sourceUrl!]?.checkedAt ?? '')).slice(0,limit);
  console.log(`공식 첨부자료 수집 ${targets.length}건 / 활성 원문 ${unique.size}건`);
  if (process.argv.includes('--dry-run')) return;
  let failed = 0;
  const save = async () => { await fs.writeFile(file + '.tmp',JSON.stringify(store,null,2)+'\n'); await fs.rename(file+'.tmp',file); };
  for (const listing of targets) {
    const sourceUrl = listing.sourceUrl!;
    try {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30000), redirect: 'error', headers: { 'User-Agent': 'daum-public-housing-app/1.0 (notice materials)' } });
      if (!response.ok) throw new Error(`원문 HTTP ${response.status}`);
      const html = await response.text();
      if (!/<html|<!doctype/i.test(html) || html.length < 1000) throw new Error('원문 페이지 응답 형식 확인 필요');
      const materials = parseMaterials(html,sourceUrl) as Material[];
      // Existing official PDF references are explicitly distinguished in their label.
      if (listing.noticePdfUrl && officialUrl(listing.noticePdfUrl) && !materials.some(m=>m.url===listing.noticePdfUrl)) {
        materials.push({ name: '공고문 PDF (기존 수집 링크)', url: listing.noticePdfUrl, kind: 'notice' });
      }
      store.records[sourceUrl] = { title: listing.title, sourceUrl, checkedAt: new Date().toISOString(), status: materials.length ? 'collected' : 'empty', materials };
      console.log(`${listing.id}: 원문 링크 ${materials.length}개`);
    } catch(error) {
      failed++;
      store.records[sourceUrl] = { title: listing.title, sourceUrl, checkedAt: new Date().toISOString(), status: 'error', materials: store.records[sourceUrl]?.materials ?? [], error: error instanceof Error ? error.message : '수집 실패' };
      console.log(`${listing.id}: ${store.records[sourceUrl].error}`);
    }
    await save();
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  store.lastRun = new Date().toISOString(); await save();
  // Collecting notice links also archives the actual documents by default.
  if (!process.argv.includes('--links-only')) {
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/download-notice-files.ts', '--limit', '500'], { stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', resolve);
    });
    if (code !== 0) failed++;
  }
  if (failed) process.exitCode = 1;
}
main().catch(error=>{ console.error(error.message);process.exitCode=1; });
