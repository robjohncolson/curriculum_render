/**
 * tests/name-finder.test.js
 *
 * name-finder.js — the roster-aligned "find your name" dial sign-in (a port of
 * the AP Stats Desk's Name Finder). cr tests are environment:'node' (no jsdom),
 * so we run the PURE narrowing helpers via Node `vm` (loading the IIFE with a
 * bare `window` stub) and source-pin the dial flow + the cr index.html wiring —
 * mirroring the dn2d test conventions.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const ROOT = resolve(__dirname, '..');
let nfSrc, indexHtml;
beforeAll(() => {
  nfSrc = readFileSync(resolve(ROOT, 'name-finder.js'), 'utf8');
  indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
});

// Load the IIFE in a fresh vm context with only a bare `window` (the module
// touches document/fetch ONLY inside functions, never at load) and return the
// exposed pure helpers.
function loadInternals() {
  const sandbox = { window: {} };
  createContext(sandbox);
  runInContext(nfSrc, sandbox);
  return sandbox.window.RosterNameFinder._internals;
}

describe('name-finder — pure narrowing helpers (real code via vm)', () => {
  it('friendly: first name + last initial; falls back to username', () => {
    const { friendly } = loadInternals();
    expect(friendly({ realName: 'Ana Brown' })).toBe('Ana B.');
    expect(friendly({ realName: 'Cher' })).toBe('Cher');
    expect(friendly({ username: 'kiwi_otter' })).toBe('kiwi_otter');
    expect(friendly({})).toBe('(unnamed)');
  });

  it('rangeKey: first two letters, title-cased', () => {
    const { rangeKey } = loadInternals();
    expect(rangeKey({ realName: 'ana brown' })).toBe('An');
    expect(rangeKey({})).toBe('?');
  });

  it('buckets: <=4 -> one leaf per name (final press picks a person)', () => {
    const { buckets } = loadInternals();
    const four = buckets(0, 3);
    expect(four).toHaveLength(4);
    expect(four.every((b) => b.leaf)).toBe(true);
    expect(four.map((b) => b.lo)).toEqual([0, 1, 2, 3]);
  });

  it('buckets: >4 -> 4 contiguous ranges covering [lo,hi] with no gaps/overlaps', () => {
    const { buckets } = loadInternals();
    const big = buckets(0, 26); // 27 names
    expect(big).toHaveLength(4);
    expect(big.every((b) => !b.leaf)).toBe(true);
    expect(big[0].lo).toBe(0);
    expect(big[3].hi).toBe(26);
    for (let i = 1; i < big.length; i++) expect(big[i].lo).toBe(big[i - 1].hi + 1);
  });

  it('buckets: narrowing always shrinks the window (terminates)', () => {
    const { buckets } = loadInternals();
    let lo = 0, hi = 99, steps = 0; // 100 names
    while (hi - lo + 1 > 1 && steps < 50) {
      const b = buckets(lo, hi)[0]; // always descend into the first bucket
      lo = b.lo; hi = b.hi; steps++;
      expect(hi - lo + 1).toBeLessThan(100);
    }
    expect(hi - lo + 1).toBe(1); // reaches a singleton
    expect(steps).toBeLessThan(12); // ~log4(100) ≈ 4 presses to a single name
  });
});

describe('name-finder — dial flow source pins', () => {
  it('arrow keys map ↑←→↓ to the four buckets; Backspace=back, Escape=close', () => {
    expect(nfSrc).toMatch(/ArrowUp:\s*0,\s*ArrowLeft:\s*1,\s*ArrowRight:\s*2,\s*ArrowDown:\s*3/);
    expect(nfSrc).toContain("e.key === 'Backspace'");
    expect(nfSrc).toContain("e.key === 'Escape'");
  });
  it('a singleton bucket auto-picks straight to the password screen', () => {
    expect(nfSrc).toMatch(/n <= 1.*selectName\(roster\[lo\]\)/s);
  });
  it('submitPassword calls cfg.signIn, then cfg.onSuccess on ok, then closes', () => {
    expect(nfSrc).toContain('await cfg.signIn(');
    expect(nfSrc).toMatch(/cfg\.onSuccess\(result, r\.username\)/);
    expect(nfSrc).toMatch(/onSuccess[\s\S]{0,120}close\(\)/); // success -> close
    expect(nfSrc).not.toMatch(/value\)\s*\.trim\(\)/); // password NOT trimmed
  });
  it('an empty/offline roster falls back to onTypeUsername (no dead-end)', () => {
    expect(nfSrc).toMatch(/if \(!list \|\| !list\.length\)[\s\S]{0,120}onTypeUsername/);
  });
  it('defaultFetchRoster drops the teacher account', () => {
    expect(nfSrc).toMatch(/role[\s\S]{0,40}!==\s*'teacher'/);
  });
});

describe('cr index.html wires the dial to the universal PeriodX roster', () => {
  it('loads name-finder.js + opens RosterNameFinder over /roster/section/PeriodX', () => {
    expect(indexHtml).toContain('<script src="name-finder.js"></script>');
    expect(indexHtml).toContain('window.RosterNameFinder.open(');
    expect(indexHtml).toMatch(/\/roster\/section\/PeriodX/);
    expect(indexHtml).toContain('onTypeUsername');
  });
  it('keeps the legacy typed form + a single shared success helper', () => {
    expect(indexHtml).toContain('window.openRosterPasswordForm');
    expect(indexHtml).toContain('window.applyRosterSignInResult');
    expect(indexHtml).toMatch(/id="roster-signin-overlay"/);        // legacy overlay retained
    expect(indexHtml).toContain('onclick="submitRosterSignIn()"');  // legacy submit retained
  });
  it('an already-signed-in user gets the form (status/re-auth), not the dial', () => {
    expect(indexHtml).toMatch(/if \(rosterWho\(\)\)\s*\{\s*return window\.openRosterPasswordForm\(\)/);
  });
});
