/**
 * cr offline-queue.js (OFFLINE_MODE_SPEC §4.A) — pure helpers + in-memory durable
 * API. Node env (no jsdom), vm-loaded — mirrors the follow-alongs copy.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const SRC = readFileSync(resolve(__dirname, '..', 'offline-queue.js'), 'utf8');

function loadFresh(extra = {}) {
  const win = { Date, ...extra };
  const ctx = createContext({ window: win, globalThis: win });
  runInContext(SRC, ctx);
  return win.OfflineQueue;
}

const rec = (over = {}) => ({ source: 'quiz', itemId: 'Q1', response: 'a', score: 1, attempt: 1, ts: 1000, ...over });

describe('cr OfflineQueue', () => {
  let Q;
  beforeEach(() => { Q = loadFresh(); });

  it('keyOf + mergeRecord dedup latest-wins', () => {
    expect(Q.keyOf({ source: 'quiz', itemId: 'Q1' })).toBe('quiz|Q1|1');
    let list = Q.mergeRecord([], rec({ response: 'old', ts: 1 }));
    list = Q.mergeRecord(list, rec({ response: 'new', ts: 2 }));
    expect(list).toHaveLength(1);
    expect(list[0].response).toBe('new');
  });

  it('enqueue/all/drain/clear work via the in-memory fallback', async () => {
    await Q.enqueue(rec({ itemId: 'A', ts: 1 }));
    await Q.enqueue(rec({ itemId: 'B', ts: 2 }));
    expect(await Q.all()).toHaveLength(2);
    const r = await Q.drain((x) => ({ ok: x.itemId === 'A' }));
    expect(r.sent).toBe(1);
    expect((await Q.all()).map((x) => x.itemId)).toEqual(['B']);
    await Q.clear();
    expect(await Q.all()).toHaveLength(0);
  });

  it('toBundle + isOffline', () => {
    const b = Q.toBundle([rec()], { studentId: 's1' }, { now: 7 });
    expect(b.schema).toBe('apstats-offline-export/v1');
    expect(b.records).toHaveLength(1);
    expect(loadFresh({ OFFLINE_MODE: true }).isOffline()).toBe(true);
  });
});
