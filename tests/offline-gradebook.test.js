/**
 * cr gradebook-client.js offline capture (OFFLINE_MODE_SPEC §4.A). The quiz feeder
 * records grades via gradebookClient.record, so this is the quiz app's offline path.
 * Node env: a plain vm sandbox (no jsdom) with offline-queue.js + gradebook-client.js.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const ROOT = resolve(__dirname, '..');
const QUEUE_SRC = readFileSync(resolve(ROOT, 'offline-queue.js'), 'utf8');
const GBC_SRC = readFileSync(resolve(ROOT, 'gradebook-client.js'), 'utf8');

function boot({ offline = false } = {}) {
  const store = new Map();
  const win = {
    Date, console,
    OFFLINE_MODE: offline || undefined,
    ROSTER_SERVICE_URL: 'https://roster.test',
    rosterClient: { token: () => 'tok', studentId: () => 'stu-1' },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    addEventListener: () => {},
  };
  win.window = win; win.globalThis = win;
  const ctx = createContext(win);
  runInContext(QUEUE_SRC, ctx);
  runInContext(GBC_SRC, ctx);
  return win;
}

const quiz = (over = {}) => ({ source: 'quiz', itemId: 'WS-U1L1-Q1', response: 'B', score: 1, attempt: 1, ...over });

describe('cr gradebook-client offline capture (quiz feeder path)', () => {
  it('OFFLINE_MODE: enqueues, no fetch, returns ok+queued', async () => {
    const win = boot({ offline: true });
    win.fetch = vi.fn();
    const r = await win.gradebookClient.record(quiz());
    expect(r).toMatchObject({ ok: true, queued: true });
    expect(win.fetch).not.toHaveBeenCalled();
    const q = await win.OfflineQueue.all();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ source: 'quiz', itemId: 'WS-U1L1-Q1', studentId: 'stu-1' });
  });

  it('unreachable fetch: enqueues, keeps reason="network", adds queued:true', async () => {
    const win = boot();
    win.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const r = await win.gradebookClient.record(quiz({ itemId: 'Q2' }));
    expect(r).toMatchObject({ ok: false, reason: 'network', queued: true });
    expect(await win.OfflineQueue.all()).toHaveLength(1);
  });

  it('read-only: never enqueues or fetches', async () => {
    const win = boot({ offline: true });
    win.__WS_READ_ONLY__ = true;
    win.fetch = vi.fn();
    const r = await win.gradebookClient.record(quiz({ itemId: 'Q3' }));
    expect(r).toMatchObject({ ok: false, reason: 'read-only' });
    expect(win.fetch).not.toHaveBeenCalled();
    expect(await win.OfflineQueue.all()).toHaveLength(0);
  });

  it('a 401 is auth-expired and is NOT queued (server reachable)', async () => {
    const win = boot();
    win.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const r = await win.gradebookClient.record(quiz({ itemId: 'Q4' }));
    expect(r.reason).toBe('auth-expired');
    expect(await win.OfflineQueue.all()).toHaveLength(0);
  });

  it('syncOfflineQueue drains queued quiz records once back online', async () => {
    const win = boot({ offline: true });
    win.fetch = vi.fn();
    await win.gradebookClient.record(quiz({ itemId: 'A' }));
    await win.gradebookClient.record(quiz({ itemId: 'B' }));
    expect(await win.OfflineQueue.all()).toHaveLength(2);

    win.OFFLINE_MODE = undefined;
    win.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, ledgerId: 'L1' }) });
    const res = await win.gradebookClient.syncOfflineQueue();
    expect(res.sent).toBe(2);
    expect(await win.OfflineQueue.all()).toHaveLength(0);
  });
});
