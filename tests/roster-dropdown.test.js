/**
 * tests/roster-dropdown.test.js
 *
 * The cr TYPED sign-in (the "type my username instead" fallback on both surfaces)
 * now shows a filterable class-roster dropdown like the Desk: type a name OR a
 * username -> pick a classmate -> the input fills with the canonical username.
 * cr is environment:'node' — source pins on the real module + both wirings.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
let src = '', indexHtml = '', auth = '';
beforeAll(() => {
  src = readFileSync(resolve(ROOT, 'roster-dropdown.js'), 'utf8');
  indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  auth = readFileSync(resolve(ROOT, 'js/auth.js'), 'utf8');
});

describe('cr typed sign-in — roster dropdown (matches the Desk)', () => {
  it('fetches the PeriodX roster + filters by realName OR username', () => {
    expect(src).toMatch(/window\.RosterDropdown/);
    expect(src).toMatch(/\/roster\/section\/PeriodX/);
    expect(src).toMatch(/realName \|\| ''\)\.toLowerCase\(\)\.indexOf\(ft\)/);
    expect(src).toMatch(/username \|\| ''\)\.toLowerCase\(\)\.indexOf\(ft\)/);
  });
  it('picking a row fills the input with the username + dispatches input', () => {
    expect(src).toMatch(/input\.value = r\.username/);
    expect(src).toMatch(/new Event\('input'/);
    expect(src).toMatch(/function attach/);
  });
  it('index.html loads the module + BOTH typed forms attach it', () => {
    expect(indexHtml).toContain('<script src="roster-dropdown.js"></script>');
    expect(indexHtml).toMatch(/RosterDropdown\.attach\(u,/);    // FAB fallback form
    expect(auth).toMatch(/RosterDropdown\.attach\(userEl,/);    // on-load sign-in form
  });
});
