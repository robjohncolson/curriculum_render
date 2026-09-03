/**
 * Build-stamp freshness: the SW cache name (sw.js BUILD) must be bumped whenever a
 * file the service worker precaches changes. Before 2026-09-03 the stamp sat at
 * 2026-06-26 while curriculum.js/styles changed in July — students had to hard
 * refresh. Assets are now network-first (self-healing), but the bump still drives
 * the "new version available" nudge and purges the old cache, so keep it honest.
 *
 * Fails with the fix spelled out: `node scripts/bump-build.mjs`.
 * Compares COMMIT history only (uncommitted edits are the author's business).
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const STAMP_FILES = ['sw.js', 'version.json', 'version-check.js'];

function lastCommitTime(paths) {
  const out = execSync(`git log -1 --format=%ct -- ${paths.map((p) => JSON.stringify(p)).join(' ')}`, { cwd: ROOT }).toString().trim();
  return out ? Number(out) : 0;
}

function precachedFiles() {
  const sw = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
  const block = sw.slice(sw.indexOf('const CORE = ['), sw.indexOf('];', sw.indexOf('const CORE = [')));
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => f !== './' && !STAMP_FILES.includes(f));
}

describe('sw.js BUILD stamp is not older than the precached assets', () => {
  it('every CORE asset was last committed no later than the stamp', () => {
    let gitOk = true;
    try { execSync('git rev-parse --is-inside-work-tree', { cwd: ROOT, stdio: 'ignore' }); } catch (_) { gitOk = false; }
    if (!gitOk) return; // not a git checkout (e.g. a packed USB copy) — nothing to compare

    const stampAt = lastCommitTime(STAMP_FILES);
    const stale = precachedFiles().filter((f) => lastCommitTime([f]) > stampAt);
    expect(stale, `stale precache: ${stale.join(', ')} changed after the last bump — run: node scripts/bump-build.mjs`).toEqual([]);
  });
});
