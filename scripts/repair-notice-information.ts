// Curated corrections are tied to exact downloaded PDFs. No network or AI calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import repairs from './fixtures/notice-information-repairs.json';
import { EXTRACTION_VERSION, normalizeNoticeFields } from '../lib/notice-extraction-quality';
import type { ExtractedFields } from '../lib/solar-extract';

async function main() {
  const write = process.argv.includes('--write');
  for (const patch of repairs) {
    const destination = path.join('lib/notice-information', patch.file);
    const original = await fs.readFile(destination, 'utf8');
    const current = JSON.parse(original);
    const pdf = path.join('public/notice-files', patch.sourceHash + '.pdf');
    if (current.sourceHash !== patch.sourceHash) throw new Error(`Source changed: ${patch.file}`);
    const bytes = await fs.readFile(pdf);
    if (createHash('sha256').update(bytes).digest('hex') !== patch.sourceHash) throw new Error(`PDF hash mismatch: ${pdf}`);
    const source = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    const fields = normalizeNoticeFields(patch.fields as ExtractedFields, source);
    if (fields.supplyGroups?.length !== (patch.fields.supplyGroups?.length ?? 0) || fields.eligibility?.length !== (patch.fields.eligibility?.length ?? 0)) throw new Error(`Evidence missing: ${patch.file}`);
    if (current.schemaVersion === EXTRACTION_VERSION && JSON.stringify(current.fields) === JSON.stringify(fields)) { console.log(`unchanged ${patch.file}`); continue; }
    if (write) {
      const backupDir = '.cache/notice-information-backups';
      await fs.mkdir(backupDir, { recursive: true });
      const hash = createHash('sha256').update(original).digest('hex');
      await fs.writeFile(path.join(backupDir, hash + '.json'), original, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
      const corrected = { ...current, schemaVersion: EXTRACTION_VERSION, correctedAt: new Date().toISOString(), correctionNote: patch.correctionNote, fields };
      await fs.writeFile(destination + '.tmp', JSON.stringify(corrected, null, 2) + '\n');
      await fs.rename(destination + '.tmp', destination);
    }
    console.log(`${write ? 'repaired' : 'verified'} ${current.sourceLabel}`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
