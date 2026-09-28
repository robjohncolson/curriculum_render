/**
 * /api/peer-data must return EVERY quiz answer, not the newest 1000 rows.
 *
 * The shared `answers` table also holds worksheet fill-in rows (`WS-...`),
 * ~7x more numerous than quiz rows. PostgREST caps an un-ranged select at
 * 1000, so older units' quiz peers silently vanished (2026-09-28: 11,998 rows,
 * 10,436 of them WS-, Unit 1 quiz peers unreachable). The fetch now excludes
 * WS- rows and pages explicitly.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
let server = '';

beforeAll(() => {
  server = readFileSync(resolve(ROOT, 'railway-server/server.js'), 'utf8');
});

function loadFetcher() {
  const start = server.indexOf('const PEER_PAGE_SIZE');
  const end = server.indexOf("// Get all peer data with optional delta", start);
  const source = server.slice(start, end);
  const sandbox = { supabase: null };
  vm.createContext(sandbox);
  vm.runInContext(source + '\nthis.fetchAllQuizAnswers = fetchAllQuizAnswers; this.PEER_PAGE_SIZE = PEER_PAGE_SIZE;', sandbox);
  return sandbox;
}

// A fake supabase client: `table` is the full answers table, newest first.
function fakeClient(table, calls) {
  return {
    from(name) {
      calls.push({ from: name });
      const q = { filters: [] };
      const chain = {
        select(fields) { q.select = fields; return chain; },
        not(column, op, value) { q.filters.push([column, op, value]); return chain; },
        order(column, opts) { q.order = [column, opts]; return chain; },
        range(from, to) {
          q.range = [from, to];
          calls[calls.length - 1].query = q;
          const filtered = table.filter(row => !q.filters.some(([col, op, val]) =>
            op === 'like' && val === 'WS-%' && String(row[col]).startsWith('WS-')));
          return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
        }
      };
      return chain;
    }
  };
}

function rows(prefix, n) {
  return Array.from({ length: n }, (_, i) => ({ question_id: `${prefix}${i}`, username: 'u', timestamp: n - i }));
}

describe('peer-data: every quiz answer, no worksheet rows', () => {
  it('excludes WS- rows and pages past the 1000-row PostgREST cap', async () => {
    const { fetchAllQuizAnswers, PEER_PAGE_SIZE } = loadFetcher();
    const calls = [];
    const table = [...rows('WS-U3-Q', 2500), ...rows('U1-L2-Q', 1240), ...rows('U3-L1-Q', 128)];
    const out = await fetchAllQuizAnswers(fakeClient(table, calls));

    expect(out).toHaveLength(1240 + 128);
    expect(out.some(r => r.question_id.startsWith('WS-'))).toBe(false);
    expect(calls.length).toBe(2);                       // 1368 rows = one full page + one short page
    expect(calls[0].query.range).toEqual([0, PEER_PAGE_SIZE - 1]);
    expect(calls[1].query.range).toEqual([PEER_PAGE_SIZE, 2 * PEER_PAGE_SIZE - 1]);
    expect(calls[0].query.filters).toEqual([['question_id', 'like', 'WS-%']]);
    expect(calls[0].query.order).toEqual(['timestamp', { ascending: false }]);
  });

  it('stops after one page when the table is small, and returns [] on an empty table', async () => {
    const { fetchAllQuizAnswers } = loadFetcher();
    const small = [];
    expect(await fetchAllQuizAnswers(fakeClient(rows('U2-L1-Q', 169), small))).toHaveLength(169);
    expect(small.length).toBe(1);
    const empty = [];
    expect(await fetchAllQuizAnswers(fakeClient([], empty))).toEqual([]);
    expect(empty.length).toBe(1);
  });

  it('keeps fetching when the row count lands exactly on a page boundary', async () => {
    const { fetchAllQuizAnswers, PEER_PAGE_SIZE } = loadFetcher();
    const calls = [];
    const out = await fetchAllQuizAnswers(fakeClient(rows('U1-L1-Q', PEER_PAGE_SIZE), calls));
    expect(out).toHaveLength(PEER_PAGE_SIZE);
    expect(calls.length).toBe(2);                       // second page comes back empty and ends the loop
  });

  it('surfaces a Supabase error instead of returning a partial list', async () => {
    const { fetchAllQuizAnswers } = loadFetcher();
    const failing = { from() { const c = { select: () => c, not: () => c, order: () => c,
      range: () => Promise.resolve({ data: null, error: new Error('boom') }) }; return c; } };
    await expect(fetchAllQuizAnswers(failing)).rejects.toThrow('boom');
  });

  it('the /api/peer-data route uses the paged fetch and no longer selects the table un-ranged', () => {
    const start = server.indexOf("app.get('/api/peer-data'");
    const end = server.indexOf('app.get(', start + 10);
    const route = server.slice(start, end);
    expect(route).toContain('await fetchAllQuizAnswers()');
    expect(route).not.toContain(".from('answers')");
  });
});
