// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../offline-queue.js', import.meta.url), 'utf8');

function asyncQueue(failFirstWrite) {
  const rows = new Map();
  // Like IndexedDB, reads and writes finish in separate tasks. The synchronous
  // memory fallback cannot exercise overlapping read/modify/write operations.
  const later = work => new Promise((resolve, reject) => setImmediate(() => {
    try { resolve(work()); } catch (error) { reject(error); }
  }));
  const store = {
    get: key => later(() => rows.get(key)),
    put: (key, value) => later(() => {
      if (failFirstWrite) {
        failFirstWrite = false;
        throw new Error('first write failed');
      }
      rows.set(key, value);
    }),
    del: key => later(() => rows.delete(key)),
    getAll: () => later(() => [...rows.values()]),
  };
  const window = { Date, testStore: store };
  // Inject only the storage adapter; execute the real enqueue/lock/merge code.
  expect(source).toContain('var _store = null;');
  runInNewContext(source.replace('var _store = null;', 'var _store = root.testStore;'), { window });
  return window.OfflineQueue;
}

const record = sequence => ({
  source: 'quiz', itemId: 'Q1', response: 'answer-' + sequence,
  transportSequence: sequence, ts: sequence,
});

describe('OfflineQueue lock ownership after an earlier operation settles', () => {
  it.each([false, true])('keeps the newest answer when an older failure arrives later (first write fails: %s)', async failFirstWrite => {
    const queue = asyncQueue(failFirstWrite);
    const first = queue.enqueue(record(1));
    const newest = queue.enqueue(record(3));
    if (failFirstWrite) await expect(first).rejects.toThrow('first write failed');
    else await first;

    // The first completion must not erase the lock held by the pending newest
    // write. This older call must read the store after that write has finished.
    const older = queue.enqueue(record(2));
    await Promise.all([newest, older]);
    const rows = await queue.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBe('answer-3');
  });

  it('a successful drain cannot delete a newer answer being enqueued', async () => {
    const queue = asyncQueue(false);
    await queue.enqueue(record(1));
    let edit;
    await queue.drain(async () => {
      edit = queue.enqueue(record(2));
      return { ok: true };
    });
    await edit;
    const rows = await queue.all();
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBe('answer-2');
  });
});
