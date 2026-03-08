import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { describe, test, expect, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const gradingEngineSource = readFileSync(
  path.join(repoRoot, 'js/grading/grading-engine.js'),
  'utf8'
);
const gradingRulesSource = readFileSync(
  path.join(repoRoot, 'js/grading/frq-grading-rules.js'),
  'utf8'
);
const serverSource = readFileSync(
  path.join(repoRoot, 'railway-server/server.js'),
  'utf8'
);

const proxySource = extractBetween(
  serverSource,
  'const GRADING_PROXY =',
  '// Get server statistics'
);

const SCORE_ORDER = { I: 1, P: 2, E: 3 };
const socsContext = {
  questionId: 'U4-L2-Q01',
  partId: 'answer',
  topic: 'AP Statistics',
  prompt: 'Describe the distribution of the exam scores.',
  variable: 'scores'
};

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  if (start === -1 || end === -1) {
    throw new Error(`Could not extract source between "${startMarker}" and "${endMarker}"`);
  }

  return source.slice(start, end).trim();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function scoreValue(score) {
  return SCORE_ORDER[score] || 0;
}

function createBrowserHarness(options = {}) {
  const {
    fetchImpl = vi.fn(),
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    serverUrl = 'https://test-server.example.com'
  } = options;

  const sandbox = {
    window: {},
    fetch: fetchImpl,
    console,
    AbortController,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl
  };

  sandbox.window = sandbox;
  sandbox.window.RAILWAY_SERVER_URL = serverUrl;

  vm.createContext(sandbox);
  vm.runInContext(gradingRulesSource, sandbox, { filename: 'frq-grading-rules.js' });
  vm.runInContext(gradingEngineSource, sandbox, { filename: 'grading-engine.js' });

  return {
    engine: new sandbox.window.GradingEngine({ serverUrl }),
    FRQGradingRules: sandbox.window.FRQGradingRules
  };
}

function createServerHarness() {
  const routes = new Map();
  const fetchCalls = [];
  const queuedResponses = [];
  const timeoutCalls = [];

  const fetchImpl = vi.fn(async (url, options = {}) => {
    fetchCalls.push({
      url,
      method: options.method,
      headers: clone(options.headers),
      body: options.body ? JSON.parse(options.body) : undefined,
      signal: options.signal
    });

    if (queuedResponses.length === 0) {
      throw new Error(`No queued proxy response for ${url}`);
    }

    const next = queuedResponses.shift();
    if (next instanceof Error) {
      throw next;
    }

    const status = next.status ?? 200;
    const ok = next.ok ?? (status >= 200 && status < 300);
    const rawText = next.rawText ?? JSON.stringify(next.body ?? {});

    return {
      ok,
      status,
      async text() {
        return rawText;
      }
    };
  });

  const sandbox = {
    process: {
      env: {
        GRADING_PROXY_URL: 'https://shared-grading-proxy.example.com'
      }
    },
    AbortSignal: {
      timeout(ms) {
        timeoutCalls.push(ms);
        return { timeoutMs: ms };
      }
    },
    fetch: fetchImpl,
    app: {
      get(route, handler) {
        routes.set(`GET ${route}`, handler);
      },
      post(route, handler) {
        routes.set(`POST ${route}`, handler);
      }
    },
    console,
    JSON,
    Object
  };

  vm.createContext(sandbox);
  vm.runInContext(proxySource, sandbox, { filename: 'server-ai-proxy.js' });

  return {
    fetchCalls,
    timeoutCalls,
    queueProxyResponse(response) {
      queuedResponses.push(response);
    },
    async invoke(method, route, body) {
      const handler = routes.get(`${method} ${route}`);
      if (!handler) {
        throw new Error(`No route registered for ${method} ${route}`);
      }

      let statusCode = 200;
      let payload;

      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          payload = data;
          return this;
        }
      };

      await handler({ body }, res);

      return {
        ok: statusCode >= 200 && statusCode < 300,
        status: statusCode,
        payload
      };
    }
  };
}

function createRouteFetch(server) {
  return vi.fn(async (url, options = {}) => {
    const requestUrl = new URL(url, 'https://test-server.example.com');
    const body = options.body ? JSON.parse(options.body) : undefined;
    const result = await server.invoke('POST', requestUrl.pathname, body);

    return {
      ok: result.ok,
      status: result.status,
      async json() {
        return result.payload;
      }
    };
  });
}

function createImmediateAbortFetch() {
  return vi.fn(async () => {
    const error = new Error('Request aborted');
    error.name = 'AbortError';
    throw error;
  });
}

describe('Tier 1: Keyword Grading', () => {
  test('exact match scores E', async () => {
    const { engine, FRQGradingRules } = createBrowserHarness();

    const result = await engine.gradeAnswer(
      'There is a strong positive linear association.',
      FRQGradingRules.describeAssociation
    );

    expect(result.score).toBe('E');
    expect(result.correct).toBe(true);
    expect(result.matched).toEqual(expect.arrayContaining(['direction', 'form', 'strength']));
  });

  test('partial match scores P', async () => {
    const { engine, FRQGradingRules } = createBrowserHarness();

    const result = await engine.gradeAnswer(
      'There is a positive linear association.',
      FRQGradingRules.describeAssociation
    );

    expect(result.score).toBe('P');
    expect(result.matched).toEqual(expect.arrayContaining(['direction', 'form']));
    expect(result.missing).toContain('strength');
  });

  test('no match scores I', async () => {
    const { engine, FRQGradingRules } = createBrowserHarness();

    const result = await engine.gradeAnswer(
      'The graph exists.',
      FRQGradingRules.describeAssociation
    );

    expect(result.score).toBe('I');
    expect(result.correct).toBe(false);
  });

  test('MCQ correct answer scores E immediately', async () => {
    const { engine } = createBrowserHarness();

    const result = await engine.gradeAnswer('B', {
      type: 'exact',
      expected: 'B'
    });

    expect(result.score).toBe('E');
    expect(result.correct).toBe(true);
  });
});

describe('Tier 2: AI Review', () => {
  test('AI score upgrades keyword I to P', async () => {
    const server = createServerHarness();
    server.queueProxyResponse({
      body: {
        score: 'P',
        feedback: 'The response shows some understanding of the distribution.'
      }
    });

    const { engine, FRQGradingRules } = createBrowserHarness({
      fetchImpl: createRouteFetch(server)
    });

    const result = await engine.gradeDual(
      'The scores are skewed right.',
      FRQGradingRules.describeDistributionSOCS,
      socsContext
    );

    expect(result.score).toBe('P');
    expect(result._upgraded).toBe(true);
    expect(result._regexScore).toBe('I');
  });

  test('AI score cannot downgrade keyword P to I', async () => {
    const server = createServerHarness();
    server.queueProxyResponse({
      body: {
        score: 'I',
        feedback: 'The AI was harsher than the rubric baseline.'
      }
    });

    const { engine, FRQGradingRules } = createBrowserHarness({
      fetchImpl: createRouteFetch(server)
    });

    const result = await engine.gradeDual(
      'The scores are skewed right with no outliers and a center around 50.',
      FRQGradingRules.describeDistributionSOCS,
      socsContext
    );

    expect(result.score).toBe('P');
    expect(result._aiIgnored).toBe(true);
    expect(result._aiScore).toBe('I');
  });

  test('AI timeout falls back to keyword score', async () => {
    const { engine, FRQGradingRules } = createBrowserHarness({
      fetchImpl: createImmediateAbortFetch(),
      setTimeoutImpl(callback) {
        callback();
        return 1;
      },
      clearTimeoutImpl() {}
    });

    const result = await engine.gradeDual(
      'The scores are skewed right with no outliers and a center around 50.',
      FRQGradingRules.describeDistributionSOCS,
      socsContext
    );

    expect(result.score).toBe('P');
    expect(result._bestOf).toBe('regex');
    expect(result._aiResult._error).toBe('timeout');
  });
});

describe('Tier 3: Appeal', () => {
  test('appeal can upgrade P to E with good reasoning', async () => {
    const server = createServerHarness();
    server.queueProxyResponse({
      body: {
        score: 'E',
        feedback: 'Your explanation connects simulation to long-run probability.',
        appealGranted: true,
        appealResponse: 'Your reasoning shows the missing idea clearly.'
      }
    });

    const { engine } = createBrowserHarness({
      fetchImpl: createRouteFetch(server)
    });

    const result = await engine.submitAppeal(
      'Simulation uses random trials.',
      'I explained that repeated trials estimate the long-run probability through relative frequency.',
      { score: 'P', feedback: 'Needs the long-run interpretation.' },
      {
        questionId: 'U4-L2-Q01',
        topic: 'AP Statistics',
        prompt: 'Explain how simulation estimates probability.',
        questionType: 'free-response'
      }
    );

    expect(result.success).toBe(true);
    expect(result.score).toBe('E');
    expect(result.upgraded).toBe(true);
    expect(result.appealGranted).toBe(true);
  });

  test('appeal CANNOT downgrade E to P', async () => {
    const server = createServerHarness();
    server.queueProxyResponse({
      body: {
        score: 'P',
        feedback: 'This appeal should not lower the student score.',
        appealGranted: false
      }
    });

    const { engine } = createBrowserHarness({
      fetchImpl: createRouteFetch(server)
    });

    const result = await engine.submitAppeal(
      'Simulation uses repeated random trials.',
      'I still think the original answer was strong.',
      { score: 'E', feedback: 'Full credit already awarded.' },
      {
        questionId: 'U4-L2-Q01',
        topic: 'AP Statistics',
        prompt: 'Explain how simulation estimates probability.',
        questionType: 'free-response'
      }
    );

    expect(result.success).toBe(true);
    expect(result.score).toBe('E');
    expect(result.upgraded).toBe(false);
    expect(result._downgradeBlocked).toBe(true);
  });

  test('appeal CANNOT downgrade P to I', async () => {
    const server = createServerHarness();
    server.queueProxyResponse({
      body: {
        score: 'I',
        feedback: 'This appeal should not lower the student score.',
        appealGranted: false
      }
    });

    const { engine } = createBrowserHarness({
      fetchImpl: createRouteFetch(server)
    });

    const result = await engine.submitAppeal(
      'Simulation uses random trials to estimate probability.',
      'I connected the answer to repeated random outcomes.',
      { score: 'P', feedback: 'Partial credit already awarded.' },
      {
        questionId: 'U4-L2-Q01',
        topic: 'AP Statistics',
        prompt: 'Explain how simulation estimates probability.',
        questionType: 'free-response'
      }
    );

    expect(result.success).toBe(true);
    expect(result.score).toBe('P');
    expect(result.upgraded).toBe(false);
    expect(result._downgradeBlocked).toBe(true);
  });
});

describe('Railway Proxy Behavior', () => {
  test('server forwards grading requests to the shared proxy', async () => {
    const server = createServerHarness();
    const body = {
      scenario: { questionId: 'U1-L1-Q01' },
      answers: { answer: 'test' },
      keywordScore: 'P'
    };

    server.queueProxyResponse({
      body: { score: 'E', feedback: 'Proxy response.' }
    });

    const response = await server.invoke('POST', '/api/ai/grade', body);

    expect(response.status).toBe(200);
    expect(response.payload.score).toBe('E');
    expect(server.fetchCalls).toHaveLength(1);
    expect(server.fetchCalls[0].url).toBe('https://shared-grading-proxy.example.com/grade');
    expect(server.fetchCalls[0].body).toEqual(body);
    expect(server.timeoutCalls).toContain(35000);
  });

  test('server falls back to the keyword score when grading proxy fails', async () => {
    const server = createServerHarness();
    server.queueProxyResponse(new Error('proxy unavailable'));

    const response = await server.invoke('POST', '/api/ai/grade', {
      keywordScore: 'P'
    });

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
      score: 'P',
      feedback: 'AI unavailable',
      provider: 'fallback',
      _provider: 'fallback'
    });
  });

  test('server forwards appeal requests to the shared proxy', async () => {
    const server = createServerHarness();
    const body = {
      currentScore: 'P',
      previousResults: {
        answer: { score: 'P', feedback: 'Initial result.' }
      }
    };

    server.queueProxyResponse({
      body: {
        score: 'E',
        feedback: 'Proxy appeal response.',
        appealGranted: true
      }
    });

    const response = await server.invoke('POST', '/api/ai/appeal', body);

    expect(response.status).toBe(200);
    expect(response.payload.score).toBe('E');
    expect(server.fetchCalls).toHaveLength(1);
    expect(server.fetchCalls[0].url).toBe('https://shared-grading-proxy.example.com/appeal');
    expect(server.fetchCalls[0].body).toEqual(body);
    expect(server.timeoutCalls).toContain(35000);
  });

  test('server falls back to the current score when appeal proxy fails', async () => {
    const server = createServerHarness();
    server.queueProxyResponse(new Error('proxy unavailable'));

    const response = await server.invoke('POST', '/api/ai/appeal', {
      currentScore: 'P',
      previousResults: {
        answer: { score: 'P', feedback: 'Initial result.' }
      }
    });

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
      score: 'P',
      feedback: 'Appeal service unavailable',
      appealResponse: 'Appeal service unavailable.',
      appealGranted: false,
      upgraded: false,
      _provider: 'fallback'
    });
  });
});

describe('Invariant: Score Can Only Go Up', () => {
  test('full escalation chain: I -> P (AI) -> E (appeal)', async () => {
    const server = createServerHarness();
    server.queueProxyResponse({
      body: {
        score: 'P',
        feedback: 'The AI recognized partial understanding.'
      }
    });
    server.queueProxyResponse({
      body: {
        score: 'E',
        feedback: 'The appeal demonstrated the missing concepts.',
        appealGranted: true,
        appealResponse: 'Your reasoning now shows full understanding.'
      }
    });

    const { engine, FRQGradingRules } = createBrowserHarness({
      fetchImpl: createRouteFetch(server)
    });

    const keywordResult = engine.gradeRegex(
      'The scores are skewed right.',
      FRQGradingRules.describeDistributionSOCS,
      socsContext
    );
    const aiResult = await engine.gradeDual(
      'The scores are skewed right.',
      FRQGradingRules.describeDistributionSOCS,
      socsContext
    );
    const appealResult = await engine.submitAppeal(
      'The scores are skewed right.',
      'I meant that simulation uses repeated trials to estimate long-run probability through relative frequency.',
      aiResult,
      {
        questionId: 'U4-L2-Q01',
        topic: 'AP Statistics',
        prompt: 'Explain how simulation estimates probability.',
        questionType: 'free-response'
      }
    );

    expect(keywordResult.score).toBe('I');
    expect(aiResult.score).toBe('P');
    expect(appealResult.score).toBe('E');
    expect(scoreValue(aiResult.score)).toBeGreaterThanOrEqual(scoreValue(keywordResult.score));
    expect(scoreValue(appealResult.score)).toBeGreaterThanOrEqual(scoreValue(aiResult.score));
  });

  test('client-side enforcement blocks downgrade', async () => {
    const server = createServerHarness();
    server.queueProxyResponse({
      body: {
        score: 'I',
        feedback: 'The AI is harsher than the rubric.'
      }
    });

    const { engine, FRQGradingRules } = createBrowserHarness({
      fetchImpl: createRouteFetch(server)
    });

    const result = await engine.gradeDual(
      'The scores are skewed right with no outliers and a center around 50.',
      FRQGradingRules.describeDistributionSOCS,
      socsContext
    );

    expect(result.score).toBe('P');
    expect(result._aiIgnored).toBe(true);
    expect(result._bestOf).toBe('regex');
  });
});
