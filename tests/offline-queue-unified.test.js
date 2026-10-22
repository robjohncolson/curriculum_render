/**
 * Shared behaviour suite for the ONE offline-queue.js (sprint C2, 2026-10-22).
 * Mirrored byte-identical into curriculum_render by scripts/sync-offline-queue.mjs,
 * so it must stay repo-neutral: vm sandbox, no jsdom, no sibling imports.
 *
 * Pins the behaviours that only follow-alongs had before the merge, so the
 * curriculum_render mirror is guaranteed to carry them too:
 *   - latest-wins by transportSequence (call START), falling back to ts
 *   - supersede(): a successful direct send deletes older/equal rows only
 *   - per-key lock: enqueue()/supersede() on one key run in call order
 *   - drain(): re-reads each row before sending; a superseded row is not re-POSTed
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const SRC = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'offline-queue.js'), 'utf8');

function loadFresh() {
  const win = { Date };
  runInContext(SRC, createContext({ window: win, globalThis: win }));
  return win.OfflineQueue;
}

const rec = (over = {}) => ({ source: 'quiz', itemId: 'Q1', response: 'a', attempt: 1, ts: 1000, ...over });

describe('unified OfflineQueue: latest-wins by transportSequence', () => {
  let Q;
  beforeEach(() => { Q = loadFresh(); });

  it('a stored row always carries transportSequence (defaults to ts)', async () => {
    const stored = await Q.enqueue(rec({ ts: 1234 }));
    expect(stored.transportSequence).toBe(1234);
    expect(stored.ts).toBe(1234);
  });

  it('a row with neither ts nor transportSequence gets both from Date.now()', async () => {
    const before = Date.now();
    const stored = await Q.enqueue({ source: 'quiz', itemId: 'Q9', response: 'x' });
    expect(stored.transportSequence).toBeGreaterThanOrEqual(before);
    expect(stored.ts).toBe(stored.transportSequence);
  });

  it('a slow OLDER call (lower sequence, later ts) never replaces the newer answer', async () => {
    await Q.enqueue(rec({ response: 'new', transportSequence: 2, ts: 50 }));
    await Q.enqueue(rec({ response: 'old', transportSequence: 1, ts: 99 }));
    const rows = await Q.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBe('new');
  });

  it('mergeRecord (pure) orders by transportSequence the same way', () => {
    let list = Q.mergeRecord([], rec({ response: 'new', transportSequence: 2, ts: 50 }));
    list = Q.mergeRecord(list, rec({ response: 'old', transportSequence: 1, ts: 99 }));
    expect(list.map((r) => r.response)).toEqual(['new']);
  });

  it('rows without a sequence (legacy / quiz-app rows) still compare by ts', async () => {
    await Q.enqueue(rec({ response: 'old', ts: 1 }));
    await Q.enqueue(rec({ response: 'new', ts: 2 }));
    await Q.enqueue(rec({ response: 'stale', ts: 1 }));
    expect((await Q.all())[0].response).toBe('new');
  });
});

describe('unified OfflineQueue: supersede()', () => {
  let Q;
  beforeEach(() => { Q = loadFresh(); });

  it('deletes the queued row when the sent record is at least as new, and reports it', async () => {
    await Q.enqueue(rec({ transportSequence: 5 }));
    expect(await Q.supersede(rec({ transportSequence: 5 }))).toBe(true);
    expect(await Q.all()).toEqual([]);
  });

  it('keeps a NEWER queued edit and reports false', async () => {
    await Q.enqueue(rec({ response: 'newer', transportSequence: 6 }));
    expect(await Q.supersede(rec({ transportSequence: 5 }))).toBe(false);
    expect((await Q.all())[0].response).toBe('newer');
  });

  it('is a no-op (false) when nothing is queued under that key', async () => {
    expect(await Q.supersede(rec({ transportSequence: 5 }))).toBe(false);
  });

  it('only touches its own key', async () => {
    await Q.enqueue(rec({ itemId: 'Q1', transportSequence: 5 }));
    await Q.enqueue(rec({ itemId: 'Q2', transportSequence: 5 }));
    await Q.supersede(rec({ itemId: 'Q1', transportSequence: 5 }));
    expect((await Q.all()).map((r) => r.itemId)).toEqual(['Q2']);
  });
});

describe('unified OfflineQueue: per-key lock', () => {
  let Q;
  beforeEach(() => { Q = loadFresh(); });

  it('enqueue then supersede fired without awaiting still run in call order', async () => {
    // Without the lock all three get() calls read an empty store at once and the
    // supersede sees nothing to delete (false). With it, supersede sees seq 1.
    const [, superseded] = await Promise.all([
      Q.enqueue(rec({ response: 'first', transportSequence: 1 })),
      Q.supersede(rec({ transportSequence: 1 })),
      Q.enqueue(rec({ response: 'second', transportSequence: 2 })),
    ]);
    expect(superseded).toBe(true);
    const rows = await Q.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBe('second');
  });

  it('different keys do not wait on each other', async () => {
    const order = [];
    await Promise.all([
      Q.enqueue(rec({ itemId: 'A', transportSequence: 1 })).then(() => order.push('A')),
      Q.enqueue(rec({ itemId: 'B', transportSequence: 1 })).then(() => order.push('B')),
    ]);
    expect(order.sort()).toEqual(['A', 'B']);
    expect((await Q.all()).map((r) => r.itemId).sort()).toEqual(['A', 'B']);
  });
});

describe('unified OfflineQueue: drain() re-reads before each send', () => {
  let Q;
  beforeEach(() => { Q = loadFresh(); });

  it('a row superseded while an earlier row was in flight is NOT re-POSTed', async () => {
    await Q.enqueue(rec({ itemId: 'A', transportSequence: 1 }));
    await Q.enqueue(rec({ itemId: 'B', transportSequence: 2 }));
    const sentIds = [];
    const result = await Q.drain(async (row) => {
      sentIds.push(row.itemId);
      // A direct send of B lands while A is on the wire.
      if (row.itemId === 'A') await Q.supersede(rec({ itemId: 'B', transportSequence: 2 }));
      return { ok: true };
    });
    expect(sentIds).toEqual(['A']);
    expect(result).toEqual({ sent: 1, failed: 0, remaining: 0 });
  });

  it('a row re-edited while an earlier row was in flight is sent in its NEW form', async () => {
    await Q.enqueue(rec({ itemId: 'A', transportSequence: 1 }));
    await Q.enqueue(rec({ itemId: 'B', response: 'old', transportSequence: 2 }));
    const seen = [];
    const result = await Q.drain(async (row) => {
      seen.push(row.itemId + ':' + row.response);
      if (row.itemId === 'A') await Q.enqueue(rec({ itemId: 'B', response: 'new', transportSequence: 3 }));
      return { ok: true };
    });
    // The snapshot's B (seq 2) is skipped this round; the new edit drains next round.
    expect(seen).toEqual(['A:a']);
    expect(result).toEqual({ sent: 1, failed: 0, remaining: 1 });
    expect(await Q.drain(async () => ({ ok: true }))).toEqual({ sent: 1, failed: 0, remaining: 0 });
  });

  it('parked rows are never handed to the sender but still count as remaining', async () => {
    await Q.enqueue(rec({ itemId: 'P' }));
    for (let i = 0; i < 12; i++) await Q.drain(async () => ({ ok: false, status: 500 }));
    let calls = 0;
    const result = await Q.drain(async () => { calls += 1; return { ok: true }; });
    expect(calls).toBe(0);
    expect(result).toEqual({ sent: 0, failed: 0, remaining: 1 });
    expect((await Q.parked()).map((r) => r.itemId)).toEqual(['P']);
  });
});
