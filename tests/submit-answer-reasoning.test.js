/**
 * POST /api/submit-answer carries an optional `reasoning` (QUIZ_FIRST_ANSWER_SPEC v2 §3).
 *
 * - stored (and broadcast) only when the student wrote one;
 * - until migration 0003 adds answers.reasoning, the upsert is retried WITHOUT it
 *   so the answer itself is never lost.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const ROOT = resolve(__dirname, '..');
let server = '';

beforeAll(() => {
  server = readFileSync(resolve(ROOT, 'railway-server/server.js'), 'utf8');
});

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

// Fake supabase: records every upsert; `missingColumn` rejects rows carrying `reasoning`;
// `stored` = the row already in the table (for the last-writer-by-timestamp check).
function fakeSupabase({ missingColumn = false, stored = null } = {}) {
  const upserts = [];
  return {
    upserts,
    from(table) {
      const read = {
        select() { return read; },
        eq() { return read; },
        maybeSingle() { return Promise.resolve({ data: stored, error: null }); },
      };
      return {
        ...read,
        upsert(rows, options) {
          upserts.push({ table, row: rows[0], options });
          if (missingColumn && 'reasoning' in rows[0]) {
            return Promise.resolve({ data: null, error: { code: 'PGRST204', message: "Could not find the 'reasoning' column of 'answers' in the schema cache" } });
          }
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  };
}

function loadSubmitHandler(supabase) {
  const start = server.indexOf('// Optional quiz explanation');
  const end = server.indexOf('// Batch submit answers', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const source = server.slice(start, end);
  let handler;
  const app = { post(_path, fn) { handler = fn; } };
  const broadcasts = [];
  const quietConsole = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  new Function(
    'app', 'supabase', 'normalizeUsername', 'sidFromRequest', 'normalizeTimestamp',
    'cache', 'broadcastToClients', 'wsClients', 'issueReceipt', 'console',
    source
  )(
    app,
    supabase,
    (name) => name,
    () => null,
    (ts) => Number(ts),
    { lastUpdate: 1, questionStats: new Map() },
    (update) => broadcasts.push(update),
    new Set(),
    () => null,
    quietConsole
  );
  return { handler, broadcasts, quietConsole };
}

const body = { username: 'Apple_Bear', question_id: 'U1-L7-Q03', answer_value: 'B', timestamp: 1000 };

describe('POST /api/submit-answer reasoning', () => {
  it('stores and broadcasts reasoning when provided (trimmed)', async () => {
    const supabase = fakeSupabase();
    const { handler, broadcasts } = loadSubmitHandler(supabase);
    const res = mockResponse();
    await handler({ body: { ...body, reasoning: '  I misread the axis  ' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(supabase.upserts).toHaveLength(1);
    expect(supabase.upserts[0].table).toBe('answers');
    expect(supabase.upserts[0].row.reasoning).toBe('I misread the axis');
    expect(supabase.upserts[0].options).toEqual({ onConflict: 'username,question_id' });
    expect(broadcasts[0]).toMatchObject({ type: 'answer_submitted', answer_value: 'B', reasoning: 'I misread the axis' });
  });

  it('omits reasoning entirely when the field is absent (the stored explanation is untouched)', async () => {
    const supabase = fakeSupabase();
    const { handler, broadcasts } = loadSubmitHandler(supabase);
    await handler({ body }, mockResponse());
    expect(supabase.upserts).toHaveLength(1);
    expect('reasoning' in supabase.upserts[0].row).toBe(false);
    expect('reasoning' in broadcasts[0]).toBe(false);
  });

  it('an explicit empty reasoning CLEARS it (null in the row, "" in the broadcast)', async () => {
    const supabase = fakeSupabase();
    const { handler, broadcasts } = loadSubmitHandler(supabase);
    await handler({ body: { ...body, reasoning: '' } }, mockResponse());
    await handler({ body: { ...body, reasoning: '   ' } }, mockResponse());
    for (const call of supabase.upserts) expect(call.row.reasoning).toBeNull();
    for (const update of broadcasts) expect(update.reasoning).toBe('');
  });

  it('a clear still falls back without the column when migration 0003 has not run', async () => {
    const supabase = fakeSupabase({ missingColumn: true });
    const { handler } = loadSubmitHandler(supabase);
    const res = mockResponse();
    await handler({ body: { ...body, reasoning: '' } }, res);
    expect(res.statusCode).toBe(200);
    expect(supabase.upserts).toHaveLength(2);
    expect('reasoning' in supabase.upserts[1].row).toBe(false);
  });

  it('caps reasoning length', async () => {
    const supabase = fakeSupabase();
    const { handler } = loadSubmitHandler(supabase);
    await handler({ body: { ...body, reasoning: 'x'.repeat(5000) } }, mockResponse());
    expect(supabase.upserts[0].row.reasoning.length).toBe(2000);
  });

  it('retries WITHOUT reasoning when the column does not exist yet', async () => {
    const supabase = fakeSupabase({ missingColumn: true });
    const { handler, quietConsole } = loadSubmitHandler(supabase);
    const res = mockResponse();
    await handler({ body: { ...body, reasoning: 'I misread the axis' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(supabase.upserts).toHaveLength(2);
    expect(supabase.upserts[0].row.reasoning).toBe('I misread the axis');
    expect('reasoning' in supabase.upserts[1].row).toBe(false);
    expect(supabase.upserts[1].row.answer_value).toBe('B');
    expect(quietConsole.warn).toHaveBeenCalledTimes(1);
  });

  it('a write OLDER than the stored row is ignored (a late refused retry cannot overwrite its rollback)', async () => {
    const supabase = fakeSupabase({ stored: { timestamp: 5000 } });
    const { handler, broadcasts } = loadSubmitHandler(supabase);
    const res = mockResponse();
    await handler({ body: { ...body, timestamp: 4000, reasoning: 'refused explanation' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, skipped: 'stale' });
    expect(supabase.upserts).toHaveLength(0);
    expect(broadcasts).toHaveLength(0);
  });

  it('a newer (or equal) write goes through; an ISO stored timestamp is compared as time', async () => {
    const supabase = fakeSupabase({ stored: { timestamp: 5000 } });
    const { handler } = loadSubmitHandler(supabase);
    await handler({ body: { ...body, timestamp: 5000 } }, mockResponse());
    await handler({ body: { ...body, timestamp: 6000 } }, mockResponse());
    expect(supabase.upserts).toHaveLength(2);
    const iso = fakeSupabase({ stored: { timestamp: '2026-09-29T10:00:00Z' } });
    const h2 = loadSubmitHandler(iso).handler;
    await h2({ body: { ...body, timestamp: Date.parse('2026-09-29T09:00:00Z') } }, mockResponse());
    expect(iso.upserts).toHaveLength(0);
  });

  it('peer-data reads select(*) so reasoning flows to clients', () => {
    const start = server.indexOf('async function fetchAllQuizAnswers');
    const fetcher = server.slice(start, server.indexOf("// Get all peer data", start));
    expect(fetcher).toContain(".select('*')");
  });
});
