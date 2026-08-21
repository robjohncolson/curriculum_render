import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  AI_GRADE_PATHS,
  aiGradeJsonErrorHandlerFor,
  createAiGradeAuth,
  getAiGradeAuthHealth,
  getAiGradeRouteConfig,
  normalizeAiGradeAuthMode,
  safeSecretEqual,
} from '../railway-server/ai-grade-auth.js';
import {
  AI_GRADE_CORPUS_EVIDENCE,
  MAXIMUM_BATCH_BODY,
  STUDY_GUIDE_FOCUS_BODY,
  WORKSHEET_75_BODY,
  WORKSHEET_81_BODY,
  WS_U8L6_MAX_ANSWER_BODY,
} from './fixtures/ai-grade-corpus.js';

const here = dirname(fileURLToPath(import.meta.url));
const requireFromRailway = createRequire(resolve(here, '../railway-server/package.json'));
const express = requireFromRailway('express');
const cors = requireFromRailway('cors');

function mockRequest(path, body = {}, headers = {}, ip = '203.0.113.10') {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    path,
    body,
    headers: normalizedHeaders,
    ip,
    get(name) {
      return normalizedHeaders[String(name).toLowerCase()];
    },
  };
}

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    set(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
      return this;
    },
  };
}

function invoke(authFor, req, canonicalPath = req.path) {
  const res = mockResponse();
  const next = vi.fn();
  const middleware = authFor.config ? authFor(canonicalPath) : authFor;
  middleware(req, res, next);
  return { res, next };
}

function validGradeBody() {
  return {
    scenario: { questionId: 'q1' },
    answers: { answer: 'response' },
    prompt: 'rubric',
  };
}

function validBatchBody(count = 3) {
  return {
    scenario: { topic: 'AP Statistics' },
    items: Array.from({ length: count }, (_, index) => ({
      questionId: 'q' + index,
      prompt: 'real prompt',
      answer: 'student answer',
    })),
  };
}

function validBodyForRoute(path) {
  if (path === '/api/ai/grade') return validGradeBody();
  if (path === '/api/ai/grade-batch') return validBatchBody(1);
  return { blanks: [{ id: 'blank-1', studentAnswer: 'response' }] };
}

function overFieldCapBody(path) {
  if (path === '/api/ai/grade') {
    return { ...validGradeBody(), prompt: 'P'.repeat(48 * 1024 + 1) };
  }
  if (path === '/api/ai/grade-batch') {
    return {
      items: [{
        questionId: 'q1',
        prompt: 'P'.repeat(32 * 1024 + 1),
        answer: 'response',
      }],
    };
  }
  return { blanks: [{ id: 'blank-1', studentAnswer: 'A'.repeat(8 * 1024 + 1) }] };
}

function routeVariants(path) {
  return [
    ['uppercase', path.toUpperCase()],
    ['trailing slash', path + '/'],
    ['mixed case', path.replace('/api/ai/', '/Api/aI/').replace('grade', 'gRaDe')],
  ];
}

function buildExpressApp({ env = {}, includeAuth = true } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  const routeConfig = getAiGradeRouteConfig(env);
  const authFor = includeAuth
    ? createAiGradeAuth({
        env,
        sidFromRequest: (req) => req.get('x-test-sid') || null,
        logger: { info: vi.fn() },
      })
    : () => (_req, _res, next) => next();

  for (const path of AI_GRADE_PATHS) {
    app.post(
      path,
      express.json({ limit: routeConfig[path].bodyBytes }),
      authFor(path),
      aiGradeJsonErrorHandlerFor(path),
    );
  }
  app.use(express.json());
  for (const path of AI_GRADE_PATHS) {
    app.post(path, (req, res) => {
      res.json({
        accepted: true,
        path: req.path,
        bodyBytes: Buffer.byteLength(JSON.stringify(req.body || {})),
        count: Array.isArray(req.body?.items)
          ? req.body.items.length
          : Array.isArray(req.body?.blanks) ? req.body.blanks.length : 1,
      });
    });
  }
  return { app, auth: authFor };
}

function buildLegacyGlobalParserApp() {
  const app = express();
  app.use(express.json());
  for (const path of AI_GRADE_PATHS) {
    app.post(path, (req, res) => {
      res.json({
        accepted: true,
        path: req.path,
        bodyBytes: Buffer.byteLength(JSON.stringify(req.body || {})),
      });
    });
  }
  return app;
}

async function withListener(app, callback) {
  const server = createServer(app);
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;
  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function postJson(baseUrl, path, body, headers = {}) {
  const response = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get('content-type'),
    retryAfter: response.headers.get('retry-after'),
  };
}

async function optionsPreflight(baseUrl, path) {
  const response = await fetch(baseUrl + path, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://classroom.example',
      'access-control-request-method': 'POST',
    },
  });
  return {
    status: response.status,
    text: await response.text(),
    allowMethods: response.headers.get('access-control-allow-methods'),
  };
}

describe('production route-specific limits', () => {
  it('uses the corpus-proven defaults without test-only overrides', () => {
    const auth = createAiGradeAuth({ env: { AI_GRADE_AUTH: 'enforce' } });
    expect(auth.config.routes).toEqual({
      '/api/ai/grade': {
        bodyBytes: 64 * 1024,
        promptBytes: 48 * 1024,
        answerBytes: 8 * 1024,
      },
      '/api/ai/grade-batch': {
        bodyBytes: 384 * 1024,
        promptBytes: 32 * 1024,
        answerBytes: 8 * 1024,
      },
      '/api/ai/grade-worksheet': {
        bodyBytes: 128 * 1024,
        answerBytes: 8 * 1024,
      },
    });
    expect(auth.config.sidItemsPerMinute).toBe(30);
    expect(auth.config.ipItemsPerMinute).toBe(600);
    expect(auth.config.bucketsPerKey).toBe(7);
    expect(auth.config.bucketMs).toBe(10_000);
  });

  it('supports route-specific and shared environment overrides', () => {
    const routes = getAiGradeRouteConfig({
      AI_GRADE_MAX_BODY_BYTES: '900',
      AI_GRADE_MAX_PROMPT_BYTES: '800',
      AI_GRADE_MAX_ANSWER_BYTES: '700',
      AI_GRADE_MAX_GRADE_BODY_BYTES: '601',
      AI_GRADE_MAX_BATCH_BODY_BYTES: '602',
      AI_GRADE_MAX_WORKSHEET_BODY_BYTES: '603',
      AI_GRADE_MAX_GRADE_PROMPT_BYTES: '501',
      AI_GRADE_MAX_BATCH_PROMPT_BYTES: '502',
      AI_GRADE_MAX_WORKSHEET_ANSWER_BYTES: '401',
    });
    expect(routes['/api/ai/grade']).toEqual({
      bodyBytes: 601,
      promptBytes: 501,
      answerBytes: 700,
    });
    expect(routes['/api/ai/grade-batch']).toEqual({
      bodyBytes: 602,
      promptBytes: 502,
      answerBytes: 700,
    });
    expect(routes['/api/ai/grade-worksheet']).toEqual({
      bodyBytes: 603,
      answerBytes: 401,
    });
  });

  it('freezes real corpus evidence at the reviewed body sizes', () => {
    expect(AI_GRADE_CORPUS_EVIDENCE.maximumBatchBodyBytes).toBe(83_929);
    expect(Buffer.byteLength(JSON.stringify(MAXIMUM_BATCH_BODY))).toBe(83_929);
    expect(AI_GRADE_CORPUS_EVIDENCE.wsU8L6MaxAnswerBodyBytes).toBe(86_450);
    expect(Buffer.byteLength(JSON.stringify(WS_U8L6_MAX_ANSWER_BODY))).toBe(86_450);
    expect(AI_GRADE_CORPUS_EVIDENCE.studyGuideMcqCount).toBe(81);
    expect(AI_GRADE_CORPUS_EVIDENCE.studyGuidePromptBytes).toBe(37_693);
    expect(AI_GRADE_CORPUS_EVIDENCE.studyGuideBodyBytes).toBe(39_747);
    expect(Buffer.byteLength(JSON.stringify(WORKSHEET_81_BODY))).toBe(23_805);
    expect(Buffer.byteLength(JSON.stringify(WORKSHEET_75_BODY))).toBe(19_146);
  });
});

describe('real Express parser ordering and rollout compatibility', () => {
  const callerFixtures = [
    ['/api/ai/grade', STUDY_GUIDE_FOCUS_BODY],
    ['/api/ai/grade-batch', MAXIMUM_BATCH_BODY],
    ['/api/ai/grade-worksheet', WORKSHEET_81_BODY],
    ['/api/ai/grade-worksheet', WORKSHEET_75_BODY],
  ];

  it.each([undefined, 'off', 'future-mode'])(
    'keeps every in-cap caller response byte-identical to the new-parser baseline in %s mode',
    async (mode) => {
      const env = { AI_GRADE_AUTH: mode };
      const baseline = buildExpressApp({ env, includeAuth: false }).app;
      const wrapped = buildExpressApp({ env, includeAuth: true }).app;
      await withListener(baseline, async (baselineUrl) => {
        await withListener(wrapped, async (wrappedUrl) => {
          for (const [path, body] of callerFixtures) {
            const before = await postJson(baselineUrl, path, body);
            const after = await postJson(wrappedUrl, path, body);
            expect(after).toEqual(before);
          }
        });
      });
    },
  );

  it.each(['off', 'future-mode', 'log', 'enforce'])(
    'accepts maximum grade, batch, 81-blank, and 75-blank fixtures in %s mode',
    async (mode) => {
      const { app } = buildExpressApp({ env: { AI_GRADE_AUTH: mode } });
      await withListener(app, async (baseUrl) => {
        const headers = { 'x-test-sid': 'student-1' };
        for (const [path, body] of [
          ['/api/ai/grade-batch', MAXIMUM_BATCH_BODY],
          ['/api/ai/grade-batch', WS_U8L6_MAX_ANSWER_BODY],
          ['/api/ai/grade', STUDY_GUIDE_FOCUS_BODY],
          ['/api/ai/grade-worksheet', WORKSHEET_81_BODY],
          ['/api/ai/grade-worksheet', WORKSHEET_75_BODY],
        ]) {
          const response = await postJson(baseUrl, path, body, headers);
          expect(response.status).toBe(200);
        }
      });
    },
  );

  it('documents the accepted 64-100 KiB grade-body compatibility delta', async () => {
    const body = { ...validGradeBody(), padding: 'x'.repeat(70 * 1024) };
    const bodyBytes = Buffer.byteLength(JSON.stringify(body));
    expect(bodyBytes).toBeGreaterThan(64 * 1024);
    expect(bodyBytes).toBeLessThan(100 * 1024);

    // DOCUMENTED CHANGE: the legacy global 100 KB parser accepted this body.
    // The route-specific 64 KiB boundary now intentionally returns JSON 413.
    const legacy = buildLegacyGlobalParserApp();
    const wrapped = buildExpressApp({ env: { AI_GRADE_AUTH: 'off' } }).app;
    await withListener(legacy, async (legacyUrl) => {
      await withListener(wrapped, async (wrappedUrl) => {
        expect((await postJson(legacyUrl, '/api/ai/grade', body)).status).toBe(200);
        const after = await postJson(wrappedUrl, '/api/ai/grade', body);
        expect(after.status).toBe(413);
        expect(after.contentType).toMatch(/^application\/json/);
        expect(JSON.parse(after.text)).toEqual({ error: 'request body too large' });
      });
    });
  });

  it('parses a contract-maximum batch before the unchanged global 100 KB parser', async () => {
    const body = {
      scenario: { topic: 'aggregate boundary' },
      items: Array.from({ length: 8 }, (_, index) => ({
        questionId: 'q' + index,
        prompt: 'P'.repeat(32 * 1024),
        answer: 'A'.repeat(8 * 1024),
      })),
    };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(100 * 1024);
    const { app } = buildExpressApp({
      env: { AI_GRADE_AUTH: 'enforce', ROSTER_GRADER_SECRET: 'secret' },
    });
    await withListener(app, async (baseUrl) => {
      const response = await postJson(
        baseUrl,
        '/api/ai/grade-batch',
        body,
        { 'x-roster-grader-secret': 'secret' },
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(response.text).count).toBe(8);
    });
  });

  it.each([
    ['/api/ai/grade', 64 * 1024],
    ['/api/ai/grade-batch', 384 * 1024],
    ['/api/ai/grade-worksheet', 128 * 1024],
  ])('returns stable JSON for parser-generated 413s on %s', async (path, limit) => {
    const { app } = buildExpressApp({ env: { AI_GRADE_AUTH: 'off' } });
    await withListener(app, async (baseUrl) => {
      const response = await postJson(baseUrl, path, { padding: 'x'.repeat(limit) });
      expect(response.status).toBe(413);
      expect(response.contentType).toMatch(/^application\/json/);
      expect(JSON.parse(response.text)).toEqual({ error: 'request body too large' });
    });
  });

  const variantCases = AI_GRADE_PATHS.flatMap((path) =>
    routeVariants(path).map(([variant, requestPath]) => [path, variant, requestPath]));

  it.each(variantCases)(
    'binds %s auth and caps for its %s variant',
    async (canonicalPath, _variant, requestPath) => {
      const { app } = buildExpressApp({ env: { AI_GRADE_AUTH: 'enforce' } });
      await withListener(app, async (baseUrl) => {
        const unauthorized = await postJson(
          baseUrl,
          requestPath,
          validBodyForRoute(canonicalPath),
        );
        expect(unauthorized.status).toBe(401);
        expect(JSON.parse(unauthorized.text)).toEqual({ error: 'roster sign-in required' });

        const headers = { 'x-test-sid': 'student-variant' };
        const capped = await postJson(
          baseUrl,
          requestPath,
          overFieldCapBody(canonicalPath),
          headers,
        );
        expect(capped.status).toBe(413);
        expect(JSON.parse(capped.text).error).toMatch(/too large/);

        const routeLimit = getAiGradeRouteConfig()[canonicalPath].bodyBytes;
        const parserCapped = await postJson(
          baseUrl,
          requestPath,
          { padding: 'x'.repeat(routeLimit) },
          headers,
        );
        expect(parserCapped.status).toBe(413);
        expect(parserCapped.contentType).toMatch(/^application\/json/);
        expect(JSON.parse(parserCapped.text)).toEqual({ error: 'request body too large' });
      });
    },
  );

  it('shares rate state between canonical routes and their Express variants', async () => {
    const { app } = buildExpressApp({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '1',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '100',
      },
    });
    await withListener(app, async (baseUrl) => {
      for (const [index, path] of AI_GRADE_PATHS.entries()) {
        const headers = { 'x-test-sid': 'variant-rate-' + index };
        expect((await postJson(baseUrl, path, validBodyForRoute(path), headers)).status).toBe(200);
        const mixedCase = routeVariants(path)[2][1];
        const limited = await postJson(baseUrl, mixedCase, validBodyForRoute(path), headers);
        expect(limited.status).toBe(429);
        expect(limited.retryAfter).not.toBeNull();
      }
    });
  });

  it.each(AI_GRADE_PATHS)('leaves OPTIONS preflight public on %s', async (path) => {
    const { app, auth } = buildExpressApp({ env: { AI_GRADE_AUTH: 'enforce' } });
    await withListener(app, async (baseUrl) => {
      const response = await optionsPreflight(baseUrl, path);
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.allowMethods).toContain('POST');
      expect(auth.rateLimitStats().allocatedBucketCells).toBe(0);
    });
  });

  it('uses the same shape for a wrapper-generated body 413', () => {
    const auth = createAiGradeAuth({
      env: { AI_GRADE_AUTH: 'off', AI_GRADE_MAX_GRADE_BODY_BYTES: '1' },
    });
    const { res, next } = invoke(auth, mockRequest('/api/ai/grade', validGradeBody()));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: 'request body too large' });
  });
});

describe('authentication and cap behavior', () => {
  it('normalizes missing and unknown modes to off', () => {
    expect(normalizeAiGradeAuthMode(undefined)).toBe('off');
    expect(normalizeAiGradeAuthMode('future-mode')).toBe('off');
  });

  it('compares the internal secret safely at equal and unequal lengths', () => {
    expect(safeSecretEqual('server-secret', 'server-secret')).toBe(true);
    expect(safeSecretEqual('server-secreu', 'server-secret')).toBe(false);
    expect(safeSecretEqual('short', 'server-secret')).toBe(false);
    expect(safeSecretEqual('server-secret-with-suffix', 'server-secret')).toBe(false);
    expect(safeSecretEqual('', '')).toBe(false);
  });

  it('does not enable the secret path for an empty configured secret', () => {
    const auth = createAiGradeAuth({
      env: { AI_GRADE_AUTH: 'enforce', ROSTER_GRADER_SECRET: '' },
      sidFromRequest: () => null,
    });
    const { res } = invoke(
      auth,
      mockRequest(
        '/api/ai/grade',
        validGradeBody(),
        { 'x-roster-grader-secret': '' },
      ),
    );
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['missing credentials', {}],
    ['garbage roster token', { authorization: 'Bearer garbage' }],
  ])('rejects %s with the stable 401 response', (_label, headers) => {
    const auth = createAiGradeAuth({
      env: { AI_GRADE_AUTH: 'enforce' },
      sidFromRequest: () => null,
    });
    const { res, next } = invoke(
      auth,
      mockRequest('/api/ai/grade', validGradeBody(), headers),
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'roster sign-in required' });
  });

  it('lets the internal secret bypass both rate maps', () => {
    const auth = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        ROSTER_GRADER_SECRET: 'server-secret',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '1',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '1',
      },
      sidFromRequest: vi.fn(),
      now: () => 1_000,
    });
    for (let index = 0; index < 100; index += 1) {
      const request = mockRequest(
        '/api/ai/grade-batch',
        validBatchBody(8),
        { 'x-roster-grader-secret': 'server-secret' },
      );
      expect(invoke(auth, request).next).toHaveBeenCalledOnce();
    }
    expect(auth.rateLimitStats().allocatedBucketCells).toBe(0);
  });

  it.each([
    ['/api/ai/grade', { scenario: {}, answers: { answer: 'a' }, prompt: 'P'.repeat(48 * 1024 + 1) }],
    ['/api/ai/grade-batch', { items: [{ questionId: 'q', prompt: 'P'.repeat(32 * 1024 + 1), answer: 'a' }] }],
    ['/api/ai/grade-worksheet', { blanks: [{ studentAnswer: 'A'.repeat(8 * 1024 + 1) }] }],
  ])('enforces the per-field cap on %s even in off mode', (path, body) => {
    const auth = createAiGradeAuth({ env: { AI_GRADE_AUTH: 'off' } });
    const { res, next } = invoke(auth, mockRequest(path, body));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.body.error).toMatch(/too large/);
  });

  it('only creates route-bound middleware for the three protected routes', () => {
    const sidFromRequest = vi.fn();
    const auth = createAiGradeAuth({
      env: { AI_GRADE_AUTH: 'enforce', AI_GRADE_MAX_GRADE_BODY_BYTES: '1' },
      sidFromRequest,
    });
    expect(() => auth('/api/ai/status')).toThrow(/Unknown AI grade route/);
    expect(sidFromRequest).not.toHaveBeenCalled();
    expect(auth.rateLimitStats().allocatedBucketCells).toBe(0);
  });
});

describe('quota correctness and poisoning resistance', () => {
  it('retains the oldest overlapping bucket at 50 and 60 seconds, then releases it at 70', () => {
    let currentTime = 9_999;
    const auth = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '1',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '100',
      },
      sidFromRequest: () => 'boundary-student',
      now: () => currentTime,
    });
    const request = () => mockRequest('/api/ai/grade', validGradeBody());

    expect(invoke(auth, request()).next).toHaveBeenCalledOnce();
    currentTime = 50_000;
    let limited = invoke(auth, request());
    expect(limited.res.statusCode).toBe(429);
    expect(limited.res.headers['retry-after']).toBe('20');
    currentTime = 60_000;
    limited = invoke(auth, request());
    expect(limited.res.statusCode).toBe(429);
    expect(limited.res.headers['retry-after']).toBe('10');
    currentTime = 70_000;
    expect(invoke(auth, request()).next).toHaveBeenCalledOnce();
  });

  it('counts batch FRQ items but each worksheet request as one model call', () => {
    const batchAuth = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '5',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '100',
      },
      sidFromRequest: () => 'student-1',
      now: () => 2_000,
    });
    expect(invoke(batchAuth, mockRequest('/api/ai/grade-batch', validBatchBody(4))).next)
      .toHaveBeenCalledOnce();
    expect(invoke(batchAuth, mockRequest('/api/ai/grade-batch', validBatchBody(2))).res.statusCode)
      .toBe(429);

    for (const body of [WORKSHEET_81_BODY, WORKSHEET_75_BODY]) {
      const worksheetAuth = createAiGradeAuth({
        env: {
          AI_GRADE_AUTH: 'enforce',
          AI_GRADE_MAX_ITEMS_PER_MIN_SID: '1',
          AI_GRADE_MAX_ITEMS_PER_MIN_IP: '2',
        },
        sidFromRequest: () => 'student-1',
        now: () => 2_000,
      });
      expect(invoke(
        worksheetAuth,
        mockRequest('/api/ai/grade-worksheet', body),
      ).next).toHaveBeenCalledOnce();
      expect(invoke(
        worksheetAuth,
        mockRequest('/api/ai/grade-worksheet', body),
      ).res.statusCode).toBe(429);
    }
  });

  it('allows 37 distinct sids to send three reflections behind one classroom NAT', () => {
    const auth = createAiGradeAuth({
      env: { AI_GRADE_AUTH: 'enforce' },
      sidFromRequest: (req) => req.get('x-test-sid'),
      now: () => 3_000,
    });
    for (let student = 1; student <= 37; student += 1) {
      const result = invoke(
        auth,
        mockRequest(
          '/api/ai/grade-batch',
          validBatchBody(3),
          { 'x-test-sid': 'student-' + student },
          '198.51.100.8',
        ),
      );
      expect(result.next).toHaveBeenCalledOnce();
      expect(result.res.statusCode).toBe(200);
    }
  });

  it('rejects unauthenticated floods before consuming sid or IP quota', () => {
    const auth = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '1',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '1',
      },
      sidFromRequest: (req) => req.get('x-test-sid') || null,
      now: () => 4_000,
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      expect(invoke(
        auth,
        mockRequest('/api/ai/grade', validGradeBody(), {}, '198.51.100.9'),
      ).res.statusCode).toBe(401);
    }
    expect(auth.rateLimitStats().allocatedBucketCells).toBe(0);
    const legitimate = invoke(
      auth,
      mockRequest(
        '/api/ai/grade',
        validGradeBody(),
        { 'x-test-sid': 'student-1' },
        '198.51.100.9',
      ),
    );
    expect(legitimate.next).toHaveBeenCalledOnce();
  });

  it('lets invalid and over-max batches reach their 400 handler without quota cost', () => {
    const auth = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '8',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '8',
      },
      sidFromRequest: () => 'student-1',
      now: () => 5_000,
    });
    for (const invalid of [
      {},
      { items: 'not-an-array' },
      validBatchBody(9),
      { items: [{ questionId: 'q', prompt: '' }] },
    ]) {
      expect(invoke(
        auth,
        mockRequest('/api/ai/grade-batch', invalid),
      ).next).toHaveBeenCalledOnce();
    }
    expect(auth.rateLimitStats().allocatedBucketCells).toBe(0);
    expect(invoke(
      auth,
      mockRequest('/api/ai/grade-batch', validBatchBody(8)),
    ).next).toHaveBeenCalledOnce();
  });

  it('bounds tracked keys and shared overflow buckets under a flood', () => {
    const auth = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '10000',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '10000',
        AI_GRADE_MAX_TRACKED_SIDS: '3',
        AI_GRADE_MAX_TRACKED_IPS: '2',
      },
      sidFromRequest: (req) => req.get('x-test-sid'),
      now: () => 6_000,
    });
    for (let index = 0; index < 500; index += 1) {
      invoke(
        auth,
        mockRequest(
          '/api/ai/grade',
          validGradeBody(),
          { 'x-test-sid': 'student-' + index },
          '198.51.100.' + index,
        ),
      );
    }
    const stats = auth.rateLimitStats();
    expect(stats.sid.keys).toBe(3);
    expect(stats.ip.keys).toBe(2);
    expect(stats.sid.bucketsPerKey).toBe(7);
    expect(stats.ip.bucketsPerKey).toBe(7);
    expect(stats.sid.overflowAllocated).toBe(true);
    expect(stats.ip.overflowAllocated).toBe(true);
    expect(stats.allocatedBucketCells).toBe(49);
    expect(stats.maxBucketCells).toBe(49);

    const hot = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '1',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '1',
        AI_GRADE_MAX_TRACKED_SIDS: '1',
        AI_GRADE_MAX_TRACKED_IPS: '1',
      },
      sidFromRequest: () => 'hot-student',
      now: () => 7_000,
    });
    invoke(hot, mockRequest('/api/ai/grade', validGradeBody()));
    for (let attempt = 0; attempt < 5_000; attempt += 1) {
      expect(invoke(hot, mockRequest('/api/ai/grade', validGradeBody())).res.statusCode)
        .toBe(429);
    }
    expect(hot.rateLimitStats().allocatedBucketCells).toBe(14);
  });

  it('rate-limits fresh-key overflow without resetting established live keys', () => {
    const auth = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '1',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '1',
        AI_GRADE_MAX_TRACKED_SIDS: '2',
        AI_GRADE_MAX_TRACKED_IPS: '2',
      },
      sidFromRequest: (req) => req.get('x-test-sid'),
      now: () => 9_000,
    });
    const attempt = (name) => invoke(
      auth,
      mockRequest(
        '/api/ai/grade',
        validGradeBody(),
        { 'x-test-sid': 'student-' + name },
        '198.51.100.' + name,
      ),
    );

    expect(attempt('1').next).toHaveBeenCalledOnce();
    expect(attempt('2').next).toHaveBeenCalledOnce();
    // The first unseen key uses the collective overflow allowance.
    expect(attempt('3').next).toHaveBeenCalledOnce();
    for (let index = 4; index < 100; index += 1) {
      expect(attempt(String(index)).res.statusCode).toBe(429);
    }
    // The original implementation evicted this live key and allowed it again.
    expect(attempt('1').res.statusCode).toBe(429);
    const stats = auth.rateLimitStats();
    expect(stats.sid.keys).toBe(2);
    expect(stats.ip.keys).toBe(2);
    expect(stats.sid.overflowAllocated).toBe(true);
    expect(stats.ip.overflowAllocated).toBe(true);
  });

  it('reclaims genuinely stale entries before using overflow', () => {
    let currentTime = 9_999;
    const auth = createAiGradeAuth({
      env: {
        AI_GRADE_AUTH: 'enforce',
        AI_GRADE_MAX_ITEMS_PER_MIN_SID: '1',
        AI_GRADE_MAX_ITEMS_PER_MIN_IP: '1',
        AI_GRADE_MAX_TRACKED_SIDS: '1',
        AI_GRADE_MAX_TRACKED_IPS: '1',
      },
      sidFromRequest: (req) => req.get('x-test-sid'),
      now: () => currentTime,
    });
    const request = (sid, ip) => mockRequest(
      '/api/ai/grade',
      validGradeBody(),
      { 'x-test-sid': sid },
      ip,
    );
    expect(invoke(auth, request('student-old', '198.51.100.1')).next)
      .toHaveBeenCalledOnce();

    currentTime = 70_000;
    expect(invoke(auth, request('student-new', '198.51.100.2')).next)
      .toHaveBeenCalledOnce();
    const stats = auth.rateLimitStats();
    expect(stats.sid.keys).toBe(1);
    expect(stats.ip.keys).toBe(1);
    expect(stats.sid.overflowAllocated).toBe(false);
    expect(stats.ip.overflowAllocated).toBe(false);
  });
});

describe('approved health exception and server wiring', () => {
  it('adds exactly the two approved health fields in off and unknown modes', () => {
    const baseline = {
      status: 'healthy',
      connections: 0,
      cache: 'cold',
      receipts: { enabled: false, pubkey: null },
      rosterAuth: false,
      timestamp: 'frozen',
    };
    for (const env of [{}, { AI_GRADE_AUTH: 'future-mode' }]) {
      const additions = getAiGradeAuthHealth(env);
      expect(additions).toEqual({ aiGradeAuth: 'off', graderSecret: false });
      const health = { ...baseline, ...additions };
      expect(Object.keys(health).filter((key) => !(key in baseline))).toEqual([
        'aiGradeAuth',
        'graderSecret',
      ]);
      expect(Object.fromEntries(
        Object.entries(health).filter(([key]) => key in baseline),
      )).toEqual(baseline);
    }
  });

  it('documents trust proxy, health approval, and bound pre-global route parsers', () => {
    const source = readFileSync(resolve(here, '../railway-server/server.js'), 'utf8');
    expect(source).toMatch(/app\.set\('trust proxy', 1\)/);
    expect(source).toMatch(/direct access to this origin could spoof/);
    expect(source).toMatch(/APPROVED COMPATIBILITY EXCEPTION \(O5\)/);
    expect(source).toMatch(/\.\.\.getAiGradeAuthHealth\(\)/);
    const globalParser = source.indexOf('app.use(express.json());');
    for (const path of AI_GRADE_PATHS) {
      // Whitespace-tolerant: the mount is multi-line (app.post(\n  '<path>',\n  express.json...).
      const mountRe = new RegExp(
        "app\\.post\\(\\s*'" + path.replace(/[/]/g, '\\/') + "',\\s*express\\.json\\(\\{ limit:",
      );
      const match = mountRe.exec(source);
      expect(match, path + ' route parser mount').not.toBeNull();
      expect(match.index).toBeLessThan(globalParser);
    }
    expect(source.match(/express\.json\(\{ limit: aiGradeRouteConfig/g)).toHaveLength(3);
    expect(source.match(/aiGradeAuthFor\('\/api\/ai\/grade/g)).toHaveLength(3);
    expect(source.match(/aiGradeJsonErrorHandlerFor\('\/api\/ai\/grade/g)).toHaveLength(3);
    expect(source).not.toMatch(/app\.get\('\/api\/ai\/status', aiGradeAuth/);
  });
});
