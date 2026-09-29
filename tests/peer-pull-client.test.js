/**
 * The quiz page's OWN pullPeerDataFromSupabase (index.html) is the pull that actually runs —
 * its hoisted declaration replaces the Railway override from railway_client.js. It queried the
 * shared `answers` table un-ranged, so PostgREST's silent 1000-row cap (filled by follow-along
 * WS- rows) hid every older unit's quiz peers ("You're the first to answer" on 1.7 while the
 * server held 173 peer rows, 2026-09-29). It must exclude WS- rows and page the initial sync.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
let html = '';
beforeAll(() => { html = readFileSync(resolve(ROOT, 'index.html'), 'utf8'); });

function fnSrc(name) {
  const m = new RegExp('async function ' + name + '\\s*\\(').exec(html);
  if (!m) throw new Error('missing ' + name);
  let depth = 0;
  for (let i = html.indexOf('{', m.index); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

// A fake supabase client over a full answers table (newest first).
function fakeClient(table, calls) {
  return {
    from() {
      const q = { filters: [] };
      const chain = {
        select() { return chain; },
        neq(col, val) { q.filters.push(['neq', col, val]); return chain; },
        not(col, op, val) { q.filters.push(['not', col, op, val]); return chain; },
        order() { return chain; },
        gt(col, val) { q.filters.push(['gt', col, val]); return chain; },
        range(from, to) {
          q.range = [from, to]; calls.push(q);
          const rows = table.filter(r =>
            !q.filters.some(([kind, col, a, b]) =>
              (kind === 'neq' && r[col] === a) ||
              (kind === 'not' && a === 'like' && b === 'WS-%' && String(r[col]).startsWith('WS-')) ||
              (kind === 'gt' && !(r[col] > a))));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return chain;
    },
  };
}

function rows(prefix, n, user = 'peer') {
  return Array.from({ length: n }, (_, i) => ({ username: user, question_id: `${prefix}${i}`, answer_value: 'A', timestamp: 5000 - i }));
}

function run(table, { last = null } = {}) {
  const calls = [];
  const sandbox = {
    turboModeActive: true, supabaseClient: fakeClient(table, calls), lastPeerDataTimestamp: last,
    window: { currentUsername: 'Me' }, safeGetItem: () => 'Me', console: { log() {} },
  };
  vm.createContext(sandbox);
  const src = fnSrc('pullPeerDataFromSupabase');
  return vm.runInContext('(' + src + ')()', sandbox).then(result => ({ result, calls, sandbox }));
}

describe('quiz page peer pull (the one that really runs)', () => {
  it('excludes WS- worksheet rows, pages past 1000, and returns every quiz peer', async () => {
    const table = [...rows('WS-U3-Q', 2500, 'other'), ...rows('U1-L7-Q', 1240, 'peer'), ...rows('U3-L1-Q', 128, 'peer2')];
    const { result, calls } = await run(table);
    const total = Object.values(result).reduce((n, u) => n + Object.keys(u.answers).length, 0);
    expect(total).toBe(1240 + 128);
    expect(Object.keys(result).sort()).toEqual(['peer', 'peer2']);
    expect(calls.length).toBe(2);                                       // one full page + one short page
    expect(calls[0].range).toEqual([0, 999]);
    expect(calls[1].range).toEqual([1000, 1999]);
    expect(calls[0].filters).toContainEqual(['not', 'question_id', 'like', 'WS-%']);
    expect(calls[0].filters).toContainEqual(['neq', 'username', 'Me']);
  });

  it('incremental sync still filters by the last timestamp', async () => {
    const table = [...rows('U1-L7-Q', 10, 'peer')];      // timestamps 5000..4991
    const { result, calls } = await run(table, { last: 4995 });
    expect(calls[0].filters).toContainEqual(['gt', 'timestamp', 4995]);
    expect(Object.keys(result.peer.answers).length).toBe(5);          // 5000..4996
  });

  it('returns null when there is nothing new', async () => {
    const { result } = await run([], { last: 1 });
    expect(result).toBeNull();
  });

  it('delegates to the Railway pull when USE_RAILWAY is on (no Supabase library needed), dropping own rows and advancing the cursor', async () => {
    const calls = [];
    const sandbox = {
      turboModeActive: false, supabaseClient: null, lastPeerDataTimestamp: 100,
      window: {
        currentUsername: 'Me', USE_RAILWAY: true,
        pullPeerDataFromRailway: async (since) => { calls.push(since); return {
          Me: { answers: { 'U1-L7-Q1': { value: 'A', timestamp: 900 } } },
          peer: { answers: { 'U1-L7-Q1': { value: 'B', timestamp: 500 }, 'U1-L7-Q2': { value: 'C', timestamp: 700 } } },
        }; },
      },
      safeGetItem: () => 'Me', console: { log() {} },
    };
    vm.createContext(sandbox);
    const result = await vm.runInContext('(' + fnSrc('pullPeerDataFromSupabase') + ')()', sandbox);
    expect(calls).toEqual([100]);                                   // incremental cursor passed through
    expect(Object.keys(result)).toEqual(['peer']);                  // own rows dropped
    expect(sandbox.lastPeerDataTimestamp).toBe(700);                // cursor advanced from peers only
  });

  it('source pin: initializeTurboMode pulls peers at startup even when the Supabase client is missing', () => {
    const start = html.indexOf('async function initializeTurboMode()');
    const end = html.indexOf('async function', start + 10);
    const fn = html.slice(start, end);
    const elseBranch = fn.slice(fn.indexOf('} else {'));
    expect(elseBranch).toContain('await pullPeerDataFromSupabase()');
    expect(elseBranch).toContain('mergePeerDataIntoStores(initialPeerData)');
    expect(elseBranch.indexOf('pullPeerDataFromSupabase()')).toBeLessThan(elseBranch.indexOf('setInterval(performSyncCheck, 30 * 1000)'));
  });

  it('source pin: railway_client.js exposes window.pullPeerDataFromRailway for that delegation', () => {
    const rc = readFileSync(resolve(ROOT, 'railway_client.js'), 'utf8');
    expect(rc).toContain('window.pullPeerDataFromRailway = pullPeerDataFromRailway;');
  });

  it('source pin: railway_client.js loads BEFORE the page declares pullPeerDataFromSupabase (so the page version wins)', () => {
    const inc = html.indexOf('railway_client.js');
    const decl = html.indexOf('async function pullPeerDataFromSupabase');
    expect(inc).toBeGreaterThan(0);
    expect(decl).toBeGreaterThan(inc);
  });
});
