/**
 * tests/version-check.test.js
 *
 * The quiz app polls version.json (no-store) and nudges a reload when the deployed
 * build differs from the running APP_BUILD (stale-tab fix, mirroring the Desk). The
 * two stamps are bumped together by scripts/bump-build.mjs and MUST match at commit
 * time — if version.json were ever ahead of version-check.js a fresh load would loop.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
let src = '', version = null, indexHtml = '';
beforeAll(() => {
  src = readFileSync(resolve(ROOT, 'version-check.js'), 'utf8');
  version = JSON.parse(readFileSync(resolve(ROOT, 'version.json'), 'utf8'));
  indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
});

describe('quiz-app update nudge (stale-tab fix)', () => {
  it('version.json build MATCHES APP_BUILD (else stale clients nudge-loop)', () => {
    const m = /var APP_BUILD = '([^']*)'/.exec(src);
    expect(m, 'APP_BUILD declared').not.toBeNull();
    expect(m[1]).not.toBe('init');               // the bump script ran
    expect(version.build).toBe(m[1]);
  });
  it('polls version.json (no-store) + compares to APP_BUILD + re-checks on refocus', () => {
    expect(src).toMatch(/fetch\('version\.json\?_='/);
    expect(src).toMatch(/cache:\s*'no-store'/);
    expect(src).toMatch(/v\.build !== APP_BUILD/);
    expect(src).toMatch(/visibilitychange/);
  });
  it('the nudge is dismissible + offers Reload; index.html loads it', () => {
    expect(src).toMatch(/location\.reload\(\)/);
    expect(src).toMatch(/aria-label', 'Dismiss'/);
    expect(indexHtml).toContain('<script src="version-check.js"></script>');
  });
});
