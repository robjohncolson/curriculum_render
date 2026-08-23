/** Privacy and correctness contract for persisted quiz appeals. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const ROOT = resolve(__dirname, '..');
let server = '';
let migration = '';
let reviewUiSource = '';
let gradingEngine = '';
let index = '';

beforeAll(() => {
  server = readFileSync(resolve(ROOT, 'railway-server/server.js'), 'utf8');
  migration = readFileSync(resolve(ROOT, 'railway-server/migrations/0002_quiz_reviews.sql'), 'utf8');
  reviewUiSource = readFileSync(resolve(ROOT, 'js/quiz-reviews.js'), 'utf8');
  gradingEngine = readFileSync(resolve(ROOT, 'js/grading/grading-engine.js'), 'utf8');
  index = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
});

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function getQuizReviewsHandler(result, calls, serviceEnabled = true) {
  const start = server.indexOf("app.get('/api/quiz-reviews'");
  const end = server.indexOf('// Get question statistics', start);
  const source = server.slice(start, end);
  let handler;
  const app = { get(_path, fn) { handler = fn; } };
  const chain = {
    select(fields) { calls.select = fields; return this; },
    eq(column, value) { calls.eq = [column, value]; return this; },
    order(column, options) { calls.order = [column, options]; return Promise.resolve(result); }
  };
  const client = serviceEnabled ? { from(table) { calls.table = table; return chain; } } : null;
  new Function('app', 'quizReviewsSupabase', 'sidFromRequest', 'isMissingRelation', source)(
    app,
    client,
    req => req.sid || null,
    error => !!error && ['42P01', 'PGRST205', 'PGRST202'].includes(error.code)
  );
  return handler;
}

function reviewUi() {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.runInNewContext(reviewUiSource, sandbox);
  return sandbox.QuizReviewUI;
}

describe('quiz review service-only persistence', () => {
  it('uses the service client and conflict-ignore upsert for retry idempotency', async () => {
    const start = server.indexOf('function isMissingRelation');
    const end = server.indexOf('// Classroom registry', start);
    const helperSource = server.slice(start, end);
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    const client = { from: vi.fn(() => ({ upsert })) };
    const persist = new Function('quizReviewsSupabase', 'console',
      `${helperSource}; return persistQuizReview;`)(client, { warn: vi.fn() });

    await persist({ sid: 'student-1', question_id: 'Q1', appeal_text: 'because' });
    expect(client.from).toHaveBeenCalledWith('quiz_reviews');
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), { ignoreDuplicates: true });
  });

  it.each(['42P01', 'PGRST205', 'PGRST202'])('maps missing-relation shape %s to 503', async code => {
    const start = server.indexOf('function isMissingRelation');
    const end = server.indexOf('// Classroom registry', start);
    const helperSource = server.slice(start, end);
    const client = { from: () => ({ upsert: () => Promise.resolve({ error: { code, message: 'missing' } }) }) };
    const persist = new Function('quizReviewsSupabase', 'console',
      `${helperSource}; return persistQuizReview;`)(client, { warn: vi.fn() });
    await expect(persist({})).rejects.toMatchObject({ code, statusCode: 503 });
  });

  it('returns a clean 503 for authenticated appeal persistence when the service key is absent', () => {
    expect(server).toMatch(/if \(sid && !quizReviewsSupabase\) \{\s*return res\.status\(503\)/);
    expect(server).toContain('SUPABASE_SERVICE_KEY');
    expect(server).toContain("console.info('Quiz review persistence is disabled:");
  });
});

describe('GET /api/quiz-reviews authorization', () => {
  it('returns 401 when no valid roster bearer resolves to a sid', async () => {
    const calls = {};
    const handler = getQuizReviewsHandler({ data: [], error: null }, calls);
    const res = mockResponse();
    await handler({ query: { username: 'Anyone' }, sid: null }, res);
    expect(res.statusCode).toBe(401);
    expect(calls.table).toBeUndefined();
  });

  it('queries only the bearer sid and defensively denies cross-sid rows', async () => {
    const calls = {};
    const handler = getQuizReviewsHandler({
      data: [
        { sid: 'student-1', username: 'Apple_Bear', question_id: 'Q1' },
        { sid: 'student-2', username: 'Banana_Cat', question_id: 'Q2' }
      ],
      error: null
    }, calls);
    const res = mockResponse();
    await handler({ query: { username: 'Banana_Cat' }, sid: 'student-1' }, res);
    expect(calls.eq).toEqual(['sid', 'student-1']);
    expect(res.statusCode).toBe(200);
    expect(res.body.reviews).toEqual([
      { username: 'Apple_Bear', question_id: 'Q1' }
    ]);
  });

  it('returns 503 when the service credential is absent', async () => {
    const res = mockResponse();
    await getQuizReviewsHandler({}, {}, false)({ query: {}, sid: 'student-1' }, res);
    expect(res.statusCode).toBe(503);
  });

  it.each(['42P01', 'PGRST205', 'PGRST202'])('returns 503 for missing-table code %s', async code => {
    const handler = getQuizReviewsHandler({ data: null, error: { code, message: 'missing' } }, {});
    const res = mockResponse();
    await handler({ query: {}, sid: 'student-1' }, res);
    expect(res.statusCode).toBe(503);
  });
});

describe('migration privacy and retry contract', () => {
  it('enables RLS with zero policies and revokes direct client privileges', () => {
    expect(migration).toMatch(/alter table public\.quiz_reviews enable row level security/);
    expect(migration).toMatch(/revoke all on table public\.quiz_reviews from anon, authenticated/);
    expect(migration).toContain("tablename = 'quiz_reviews'");
    expect(migration).toMatch(/drop policy if exists/);
    expect(migration).not.toMatch(/create policy/i);
    expect(migration).toMatch(/Deliberately ZERO RLS policies/i);
  });

  it('pins credit bounds and the appeal-content idempotency index', () => {
    expect(migration).toMatch(/check \(credit between 0 and 1\)/);
    expect(migration).toMatch(/create unique index if not exists[\s\S]*\(sid, question_id, md5\(appeal_text\)\)/);
  });
});

describe('safe, deduplicated rendering', () => {
  it('escapes every persisted appeal_text and feedback interpolation', () => {
    const ui = reviewUi();
    const html = ui.formatReview({
      question_id: 'Q1', appeal_text: '<script>mine</script>', verdict: 'P', credit: 2 / 3,
      feedback: '<img src=x onerror=alert(1)>', created_at: '2026-08-23T00:00:00.000Z'
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });

  it('escapes feedback in displayAppealResult itself', () => {
    const start = index.indexOf('function displayAppealResult');
    const end = index.indexOf('// Share reasoning with peers', start);
    const source = index.slice(start, end);
    const feedbackContainer = { innerHTML: '' };
    const document = { getElementById: vi.fn(id => id.startsWith('grading-feedback-') ? feedbackContainer : null) };
    const ui = reviewUi();
    const display = new Function('document', 'window', 'classData',
      `${source}; return displayAppealResult;`)(document, { QuizReviewUI: ui }, { users: {} });
    display('Q1', { score: 'P', appealResponse: '<img src=x onerror=alert(1)>' }, { score: 'I' });
    expect(feedbackContainer.innerHTML).not.toContain('<img');
    expect(feedbackContainer.innerHTML).toContain('&lt;img');
  });

  it('deduplicates retries and sorts reviews newest-first', () => {
    const ui = reviewUi();
    const indexed = ui.indexRows([
      { question_id: 'Q1', appeal_text: 'same', created_at: '2026-08-23T02:00:00Z' },
      { question_id: 'Q1', appeal_text: 'same', created_at: '2026-08-23T01:00:00Z' },
      { question_id: 'Q1', appeal_text: 'different', created_at: '2026-08-23T03:00:00Z' }
    ]);
    expect(indexed.Q1).toHaveLength(2);
    expect(indexed.Q1.map(row => row.appeal_text)).toEqual(['different', 'same']);
  });
});

describe('review credit ladder', () => {
  it.each([
    [{ score: 'E' }, 1],
    [{ score: 'P' }, 2 / 3],
    [{ score: 'I' }, 1 / 3],
    [{ score: 'I', exceptionGranted: true }, 1]
  ])('maps %j to %s credit', (result, expected) => {
    const start = server.indexOf('function quizReviewCredit');
    const end = server.indexOf('function isMissingRelation', start);
    const credit = new Function(`${server.slice(start, end)}; return quizReviewCredit;`)();
    expect(credit(result)).toBe(expected);
    expect(reviewUi().creditForResult(result)).toBe(expected);
  });
});

describe('live wiring', () => {
  it('sends roster auth and never hydrates history through a username URL', () => {
    expect(gradingEngine).toMatch(/headers\.Authorization\s*=\s*`Bearer \$\{rosterToken\}`/);
    expect(index).toContain("base + '/api/quiz-reviews'");
    expect(index).not.toContain("'/api/quiz-reviews?username='");
    expect(index).toContain("if (!token) return;");
  });
});
