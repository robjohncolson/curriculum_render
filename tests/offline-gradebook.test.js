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

function boot({ offline = false, studentId = 'stu-1' } = {}) {
  const store = new Map();
  const win = {
    Date, console,
    OFFLINE_MODE: offline || undefined,
    ROSTER_SERVICE_URL: 'https://roster.test',
    rosterClient: { token: () => 'tok', studentId: () => studentId },
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

describe('quiz app sign-in replays captured answers', () => {
  it('applyRosterSignInResult calls gradebookClient.syncOfflineQueue (same-tab sign-in fires no storage event)', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    const start = html.indexOf('window.applyRosterSignInResult = async function');
    expect(start).toBeGreaterThan(0);
    const body = html.slice(start, start + 2500);
    expect(body).toContain('window.gradebookClient.syncOfflineQueue()');
  });
});

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

  it('OFFLINE_MODE without a studentId: refuses honestly ({ok:false, no-identity}), nothing queued', async () => {
    const win = boot({ offline: true, studentId: null });
    win.fetch = vi.fn();
    const r = await win.gradebookClient.record(quiz({ itemId: 'Q0' }));
    expect(r).toEqual({ ok: false, reason: 'no-identity' });
    expect(win.fetch).not.toHaveBeenCalled();
    expect(await win.OfflineQueue.all()).toHaveLength(0);
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

  // 2026-09-09: a quiz taken on an expired session used to be DROPPED with a console
  // warning ("I did the quiz but can't see the grade"). Any attributable non-ok write is
  // captured now and replayed by the ownership-gated drain once the student signs in.
  it('a 401 is auth-expired AND is captured for replay when the studentId is known', async () => {
    const win = boot();
    win.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const r = await win.gradebookClient.record(quiz({ itemId: 'Q4' }));
    expect(r).toMatchObject({ ok: false, reason: 'auth-expired', queued: true });
    const q = await win.OfflineQueue.all();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ source: 'quiz', itemId: 'Q4', studentId: 'stu-1' });
  });

  it.each([429, 500, 503])('a retryable HTTP %s is captured too (reason stays "network")', async (status) => {
    const win = boot();
    win.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) });
    const r = await win.gradebookClient.record(quiz({ itemId: 'Q5' }));
    expect(r).toMatchObject({ ok: false, reason: 'network', queued: true });
    expect(r).not.toHaveProperty('retryable');
    expect(await win.OfflineQueue.all()).toHaveLength(1);
  });

  it('a FINAL reject (4xx validation, or an ok:false body) is NOT queued — it could never drain', async () => {
    const win = boot();
    win.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ ok: false, error: 'bad item' }) });
    const r = await win.gradebookClient.record(quiz({ itemId: 'Q6' }));
    expect(r).toEqual({ ok: false, reason: 'network' });
    expect(await win.OfflineQueue.all()).toHaveLength(0);

    const win2 = boot();
    win2.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'boom' }) });
    const r2 = await win2.gradebookClient.record(quiz({ itemId: 'Q7' }));
    expect(r2).toEqual({ ok: false, reason: 'network' });
    expect(await win2.OfflineQueue.all()).toHaveLength(0);
  });

  it('a 401 WITHOUT a studentId is NOT queued (an unattributed row could never drain)', async () => {
    const win = boot({ studentId: null });
    win.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const r = await win.gradebookClient.record(quiz({ itemId: 'Q7' }));
    expect(r).toMatchObject({ ok: false, reason: 'auth-expired' });
    expect(r.queued).not.toBe(true);
    expect(await win.OfflineQueue.all()).toHaveLength(0);
  });

  it('a 401-captured quiz record drains under the owner once the session is back', async () => {
    const win = boot();
    win.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await win.gradebookClient.record(quiz({ itemId: 'Q8', response: 'C', score: 1 }));
    expect(await win.OfflineQueue.all()).toHaveLength(1);

    win.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, ledgerId: 'L8' }) });
    const res = await win.gradebookClient.syncOfflineQueue();
    expect(res.sent).toBe(1);
    expect(await win.OfflineQueue.all()).toHaveLength(0);
    const body = JSON.parse(win.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ source: 'quiz', itemId: 'Q8', response: 'C', score: 1, token: 'tok' });
  });

  it('shared device: a row captured by student A is NOT drained under student B, and drains once A is back', async () => {
    const win = boot();   // stu-1 captures on an expired session
    win.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await win.gradebookClient.record(quiz({ itemId: 'Q9', response: 'D' }));
    expect(await win.OfflineQueue.all()).toHaveLength(1);

    // student B signs in on the same browser: A's row must stay queued and never POST
    win.rosterClient = { token: () => 'tokB', studentId: () => 'stu-2' };
    win.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, ledgerId: 'X' }) });
    const asB = await win.gradebookClient.syncOfflineQueue();
    expect(win.fetch).not.toHaveBeenCalled();
    expect(asB.sent).toBe(0);
    expect(await win.OfflineQueue.all()).toHaveLength(1);

    // A signs back in: drains under A's NEW token, then clears
    win.rosterClient = { token: () => 'tokA2', studentId: () => 'stu-1' };
    const asA = await win.gradebookClient.syncOfflineQueue();
    expect(asA.sent).toBe(1);
    const body = JSON.parse(win.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ itemId: 'Q9', response: 'D', token: 'tokA2' });
    expect(await win.OfflineQueue.all()).toHaveLength(0);
  });

  it('a legacy queued row with NO studentId never drains (no POST, stays queued)', async () => {
    const win = boot();
    await win.OfflineQueue.enqueue({ source: 'quiz', itemId: 'LEGACY', response: 'A', score: 1, attempt: 1 });
    win.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const res = await win.gradebookClient.syncOfflineQueue();
    expect(win.fetch).not.toHaveBeenCalled();
    expect(res.sent).toBe(0);
    expect(await win.OfflineQueue.all()).toHaveLength(1);
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
