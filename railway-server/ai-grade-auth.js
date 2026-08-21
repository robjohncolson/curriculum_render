import { createHash, timingSafeEqual } from 'node:crypto';

export const AI_GRADE_PATHS = Object.freeze([
  '/api/ai/grade',
  '/api/ai/grade-batch',
  '/api/ai/grade-worksheet',
]);

const GRADE_PATHS = new Set(AI_GRADE_PATHS);
const RATE_BUCKET_MS = 10_000;
// Six buckets cannot retain the partially overlapping oldest bucket when a
// rolling minute crosses an aligned boundary. The seventh slot makes this
// fixed-bucket design conservative for the full 60-second window.
const RATE_BUCKET_COUNT = 7;

const ROUTE_DEFAULTS = Object.freeze({
  '/api/ai/grade': Object.freeze({
    bodyBytes: 64 * 1024,
    promptBytes: 48 * 1024,
    answerBytes: 8 * 1024,
  }),
  '/api/ai/grade-batch': Object.freeze({
    bodyBytes: 384 * 1024,
    promptBytes: 32 * 1024,
    answerBytes: 8 * 1024,
  }),
  '/api/ai/grade-worksheet': Object.freeze({
    bodyBytes: 128 * 1024,
    answerBytes: 8 * 1024,
  }),
});

const RATE_DEFAULTS = Object.freeze({
  sidItemsPerMinute: 30,
  ipItemsPerMinute: 600,
  maxSidKeys: 10_000,
  maxIpKeys: 2_048,
  windowMs: 60_000,
});

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function capFromEnv(env, routeKey, sharedKey, fallback) {
  return positiveInteger(env[routeKey], positiveInteger(env[sharedKey], fallback));
}

export function getAiGradeRouteConfig(env = process.env) {
  const answerFallback = positiveInteger(
    env.AI_GRADE_MAX_ANSWER_BYTES,
    ROUTE_DEFAULTS['/api/ai/grade'].answerBytes,
  );
  return Object.freeze({
    '/api/ai/grade': Object.freeze({
      bodyBytes: capFromEnv(
        env,
        'AI_GRADE_MAX_GRADE_BODY_BYTES',
        'AI_GRADE_MAX_BODY_BYTES',
        ROUTE_DEFAULTS['/api/ai/grade'].bodyBytes,
      ),
      promptBytes: capFromEnv(
        env,
        'AI_GRADE_MAX_GRADE_PROMPT_BYTES',
        'AI_GRADE_MAX_PROMPT_BYTES',
        ROUTE_DEFAULTS['/api/ai/grade'].promptBytes,
      ),
      answerBytes: positiveInteger(env.AI_GRADE_MAX_GRADE_ANSWER_BYTES, answerFallback),
    }),
    '/api/ai/grade-batch': Object.freeze({
      bodyBytes: capFromEnv(
        env,
        'AI_GRADE_MAX_BATCH_BODY_BYTES',
        'AI_GRADE_MAX_BODY_BYTES',
        ROUTE_DEFAULTS['/api/ai/grade-batch'].bodyBytes,
      ),
      promptBytes: capFromEnv(
        env,
        'AI_GRADE_MAX_BATCH_PROMPT_BYTES',
        'AI_GRADE_MAX_PROMPT_BYTES',
        ROUTE_DEFAULTS['/api/ai/grade-batch'].promptBytes,
      ),
      answerBytes: positiveInteger(env.AI_GRADE_MAX_BATCH_ANSWER_BYTES, answerFallback),
    }),
    '/api/ai/grade-worksheet': Object.freeze({
      bodyBytes: capFromEnv(
        env,
        'AI_GRADE_MAX_WORKSHEET_BODY_BYTES',
        'AI_GRADE_MAX_BODY_BYTES',
        ROUTE_DEFAULTS['/api/ai/grade-worksheet'].bodyBytes,
      ),
      answerBytes: positiveInteger(env.AI_GRADE_MAX_WORKSHEET_ANSWER_BYTES, answerFallback),
    }),
  });
}

export function normalizeAiGradeAuthMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'log' || mode === 'enforce' ? mode : 'off';
}

export function getAiGradeAuthHealth(env = process.env) {
  return {
    aiGradeAuth: normalizeAiGradeAuthMode(env.AI_GRADE_AUTH),
    graderSecret: !!env.ROSTER_GRADER_SECRET,
  };
}

function sha256Digest(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest();
}

// Public helper used by focused tests and callers outside the middleware
// factory. The request path below precomputes the configured digest once.
export function safeSecretEqual(candidate, configuredSecret) {
  const secret = String(configuredSecret ?? '');
  const contentsMatch = timingSafeEqual(sha256Digest(candidate), sha256Digest(secret));
  return secret.length > 0 && contentsMatch;
}

function requestHeader(req, name) {
  if (typeof req.get === 'function') return req.get(name);
  return req.headers?.[name.toLowerCase()];
}

function utf8Bytes(value) {
  return Buffer.byteLength(String(value == null ? '' : value), 'utf8');
}

function serializedBodyBytes(req) {
  const declared = Number.parseInt(requestHeader(req, 'content-length'), 10);
  let parsed = 0;
  try {
    parsed = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
  } catch {
    parsed = Number.POSITIVE_INFINITY;
  }
  return Math.max(Number.isFinite(declared) && declared >= 0 ? declared : 0, parsed);
}

function hasOversizeString(value, maxBytes, seen = new Set()) {
  if (typeof value === 'string') return utf8Bytes(value) > maxBytes;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => hasOversizeString(entry, maxBytes, seen));
  return Object.values(value).some((entry) => hasOversizeString(entry, maxBytes, seen));
}

function capViolation(req, path, caps) {
  if (serializedBodyBytes(req) > caps.bodyBytes) return 'request body too large';
  const body = req.body || {};

  if (path === '/api/ai/grade') {
    if (hasOversizeString(body.prompt, caps.promptBytes) ||
        hasOversizeString(body.aiPromptTemplate, caps.promptBytes)) {
      return 'grading prompt too large';
    }
    if (hasOversizeString(body.answers, caps.answerBytes)) return 'answer too large';
  }

  if (path === '/api/ai/grade-batch' && Array.isArray(body.items)) {
    for (const item of body.items) {
      if (hasOversizeString(item?.prompt, caps.promptBytes)) return 'grading prompt too large';
      if (hasOversizeString(item?.answer, caps.answerBytes)) return 'answer too large';
    }
  }

  if (path === '/api/ai/grade-worksheet' && Array.isArray(body.blanks)) {
    for (const blank of body.blanks) {
      if (hasOversizeString(blank?.studentAnswer, caps.answerBytes)) return 'answer too large';
    }
  }

  return null;
}

function validRouteShape(req, path) {
  const body = req.body || {};
  if (path === '/api/ai/grade') return !!body.scenario && !!body.answers;
  if (path === '/api/ai/grade-batch') {
    return Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 8 &&
      body.items.every((item) => item && item.questionId &&
        typeof item.prompt === 'string' && item.prompt.length > 0);
  }
  if (path === '/api/ai/grade-worksheet') {
    return Array.isArray(body.blanks) && body.blanks.length > 0;
  }
  return false;
}

function itemCount(req, path) {
  if (path === '/api/ai/grade-batch') return req.body.items.length;
  // A worksheet submission is one gradingQueue.add call, regardless of blanks.
  return 1;
}

function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

class FixedBucketRateWindow {
  constructor(windowMs, maxKeys) {
    this.windowMs = windowMs;
    this.bucketMs = RATE_BUCKET_MS;
    this.bucketCount = RATE_BUCKET_COUNT;
    this.maxKeys = maxKeys;
    this.entries = new Map();
  }

  activeBuckets(entry, now) {
    const cutoff = now - this.windowMs;
    const active = [];
    for (let index = 0; index < this.bucketCount; index += 1) {
      const count = entry.counts[index];
      const start = entry.starts[index];
      // A bucket can contain an event at any point before start + bucketMs.
      // Retain it until that entire bucket is outside the rolling cutoff.
      if (count > 0 && start + this.bucketMs > cutoff) active.push({ start, count });
    }
    return active.sort((left, right) => left.start - right.start);
  }

  createEntry() {
    return {
      starts: new Float64Array(this.bucketCount),
      counts: new Float64Array(this.bucketCount),
    };
  }

  pruneStaleEntries(now) {
    for (const [key, entry] of this.entries) {
      if (this.activeBuckets(entry, now).length === 0) this.entries.delete(key);
    }
  }

  resolveEntry(key, now) {
    const existing = this.entries.get(key);
    if (existing) return { entry: existing, overflow: false };

    if (this.entries.size >= this.maxKeys) this.pruneStaleEntries(now);
    if (this.entries.size < this.maxKeys) return { entry: null, overflow: false };

    // Live per-key quota is never evicted. New cardinality pressure shares one
    // bounded bucket so a key flood is collectively limited instead of reset.
    return { entry: this.overflowEntry, overflow: true };
  }

  check(key, count, limit, now) {
    const { entry } = this.resolveEntry(key, now);
    const active = entry ? this.activeBuckets(entry, now) : [];
    const currentTotal = active.reduce((sum, bucket) => sum + bucket.count, 0);
    const proposedTotal = currentTotal + count;
    if (proposedTotal <= limit) return { exceeded: false, retryAfterSeconds: 0 };

    let removable = 0;
    let retryAt = now + this.windowMs;
    for (const bucket of active) {
      removable += bucket.count;
      retryAt = bucket.start + this.bucketMs + this.windowMs;
      if (proposedTotal - removable <= limit) break;
    }
    return {
      exceeded: true,
      retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)),
    };
  }

  commit(key, count, now) {
    const resolved = this.resolveEntry(key, now);
    let entry = resolved.entry;
    if (!entry) {
      entry = this.createEntry();
      if (resolved.overflow) this.overflowEntry = entry;
      else this.entries.set(key, entry);
    }

    const bucketStart = Math.floor(now / this.bucketMs) * this.bucketMs;
    const slot = Math.floor(bucketStart / this.bucketMs) % this.bucketCount;
    if (entry.starts[slot] !== bucketStart) {
      entry.starts[slot] = bucketStart;
      entry.counts[slot] = 0;
    }
    entry.counts[slot] += count;
  }

  stats() {
    const overflowAllocated = !!this.overflowEntry;
    return {
      keys: this.entries.size,
      maxKeys: this.maxKeys,
      bucketsPerKey: this.bucketCount,
      overflowAllocated,
      allocatedBucketCells: (this.entries.size + (overflowAllocated ? 1 : 0)) * this.bucketCount,
      maxBucketCells: (this.maxKeys + 1) * this.bucketCount,
    };
  }
}

function setResponseHeader(res, name, value) {
  if (typeof res.set === 'function') res.set(name, value);
  else if (typeof res.setHeader === 'function') res.setHeader(name, value);
}

function writeLog(logger, message) {
  const method = typeof logger?.info === 'function' ? logger.info : logger?.log;
  if (typeof method === 'function') method.call(logger, message);
}

function isEntityTooLarge(error) {
  return error?.type === 'entity.too.large' ||
    (error?.status === 413 && Number.isFinite(error?.limit));
}

function canonicalRouteFromExpress(req) {
  const routePath = req.route?.path;
  return typeof routePath === 'string' && GRADE_PATHS.has(routePath) ? routePath : null;
}

function writeBodyTooLarge(error, routePath, res, next) {
  if (isEntityTooLarge(error) && GRADE_PATHS.has(routePath)) {
    return res.status(413).json({ error: 'request body too large' });
  }
  return next(error);
}

// Compatibility export for a global error mount. Scope comes only from
// Express's canonical matched route, never the spelling in req.path.
export function aiGradeJsonErrorHandler(error, req, res, next) {
  return writeBodyTooLarge(error, canonicalRouteFromExpress(req), res, next);
}

// Production mounts this bound handler in the same app.post chain as its
// parser. The bound canonical identity covers Express's case-insensitive and
// optional-trailing-slash variants without reinterpreting req.path.
export function aiGradeJsonErrorHandlerFor(canonicalPath) {
  if (!GRADE_PATHS.has(canonicalPath)) {
    throw new TypeError('Unknown AI grade route: ' + canonicalPath);
  }
  return function boundAiGradeJsonErrorHandler(error, req, res, next) {
    const routePath = canonicalRouteFromExpress(req) || canonicalPath;
    return writeBodyTooLarge(error, routePath, res, next);
  };
}

export function createAiGradeAuth(options = {}) {
  const env = options.env || process.env;
  const mode = normalizeAiGradeAuthMode(env.AI_GRADE_AUTH);
  const sidFromRequest = options.sidFromRequest || (() => null);
  const now = options.now || Date.now;
  const logger = options.logger || console;
  const configuredSecret = String(env.ROSTER_GRADER_SECRET ?? '');
  const secretEnabled = configuredSecret.length > 0;
  const configuredSecretDigest = sha256Digest(configuredSecret);
  const genericMaxKeys = positiveInteger(env.AI_GRADE_MAX_TRACKED_KEYS, RATE_DEFAULTS.maxSidKeys);
  const config = Object.freeze({
    routes: getAiGradeRouteConfig(env),
    sidItemsPerMinute: positiveInteger(
      env.AI_GRADE_MAX_ITEMS_PER_MIN_SID,
      RATE_DEFAULTS.sidItemsPerMinute,
    ),
    ipItemsPerMinute: positiveInteger(
      env.AI_GRADE_MAX_ITEMS_PER_MIN_IP,
      RATE_DEFAULTS.ipItemsPerMinute,
    ),
    maxSidKeys: positiveInteger(env.AI_GRADE_MAX_TRACKED_SIDS, genericMaxKeys),
    maxIpKeys: positiveInteger(
      env.AI_GRADE_MAX_TRACKED_IPS,
      positiveInteger(env.AI_GRADE_MAX_TRACKED_KEYS, RATE_DEFAULTS.maxIpKeys),
    ),
    windowMs: RATE_DEFAULTS.windowMs,
    bucketMs: RATE_BUCKET_MS,
    bucketsPerKey: RATE_BUCKET_COUNT,
  });

  // Process-local limits are bounded by
  // (maxSidKeys + maxIpKeys + 2 overflow entries) * 7 bucket cells. Move them
  // to shared storage before scaling Railway horizontally.
  const sidWindow = new FixedBucketRateWindow(config.windowMs, config.maxSidKeys);
  const ipWindow = new FixedBucketRateWindow(config.windowMs, config.maxIpKeys);

  const aiGradeAuthFor = function aiGradeAuthFor(canonicalPath) {
    const routeCaps = config.routes[canonicalPath];
    if (!routeCaps) {
      throw new TypeError('Unknown AI grade route: ' + canonicalPath);
    }

    return function aiGradeAuth(req, res, next) {
      const violation = capViolation(req, canonicalPath, routeCaps);
      if (violation) return res.status(413).json({ error: violation });

      // Deploy safety: live worksheets can still omit roster auth. Off/unknown
      // preserves route behavior except for the approved byte-cap boundaries.
      if (mode === 'off') return next();

      const candidateDigest = sha256Digest(requestHeader(req, 'x-roster-grader-secret'));
      const secretValid = secretEnabled &&
        timingSafeEqual(candidateDigest, configuredSecretDigest);
      let sid = null;
      if (!secretValid) {
        try {
          sid = sidFromRequest(req) || null;
        } catch {
          sid = null;
        }
      }
      const authenticated = secretValid || !!sid;

      // In enforce mode, unauthenticated traffic never reaches either quota map.
      if (mode === 'enforce' && !authenticated) {
        return res.status(401).json({ error: 'roster sign-in required' });
      }
      if (!authenticated) {
        const decision = 'would-reject-auth';
        setResponseHeader(res, 'X-AI-Grade-Auth', decision);
        writeLog(logger, '[ai-grade-auth] mode=log path=' + canonicalPath +
          ' decision=' + decision + ' items=0 sid=no');
        return next();
      }

      // Let the existing route return its byte-identical 400, without charging a
      // quota. In particular, arrays over the public max of eight cost nothing.
      if (!validRouteShape(req, canonicalPath)) {
        if (mode === 'log') {
          setResponseHeader(res, 'X-AI-Grade-Auth', 'allow-auth+skip-invalid');
          writeLog(logger, '[ai-grade-auth] mode=log path=' + canonicalPath +
            ' decision=allow-auth+skip-invalid items=0 sid=' + (sid ? 'yes' : 'no'));
        }
        return next();
      }

      const count = itemCount(req, canonicalPath);
      let sidRate = { exceeded: false, retryAfterSeconds: 0 };
      let ipRate = { exceeded: false, retryAfterSeconds: 0 };
      if (!secretValid) {
        const currentTime = now();
        sidRate = sidWindow.check(String(sid), count, config.sidItemsPerMinute, currentTime);
        ipRate = ipWindow.check(requestIp(req), count, config.ipItemsPerMinute, currentTime);
        // Check both first, then commit atomically. Rejected attempts consume no
        // quota and cannot grow per-key memory.
        if (!sidRate.exceeded && !ipRate.exceeded) {
          sidWindow.commit(String(sid), count, currentTime);
          ipWindow.commit(requestIp(req), count, currentTime);
        }
      }

      const rateExceeded = sidRate.exceeded || ipRate.exceeded;
      if (mode === 'log') {
        const decisions = ['allow-' + (secretValid ? 'secret' : 'roster')];
        if (sidRate.exceeded) decisions.push('rate-sid');
        if (ipRate.exceeded) decisions.push('rate-ip');
        const decision = decisions.join('+');
        setResponseHeader(res, 'X-AI-Grade-Auth', decision);
        writeLog(
          logger,
          '[ai-grade-auth] mode=log path=' + canonicalPath + ' decision=' + decision +
            ' items=' + count + ' sid=' + (sid ? 'yes' : 'no'),
        );
        return next();
      }

      if (rateExceeded) {
        const retryAfter = Math.max(sidRate.retryAfterSeconds, ipRate.retryAfterSeconds, 1);
        setResponseHeader(res, 'Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'AI grading rate limit exceeded' });
      }
      return next();
    };
  };

  aiGradeAuthFor.mode = mode;
  aiGradeAuthFor.config = config;
  aiGradeAuthFor.rateLimitStats = () => {
    const sid = sidWindow.stats();
    const ip = ipWindow.stats();
    return {
      sid,
      ip,
      allocatedBucketCells: sid.allocatedBucketCells + ip.allocatedBucketCells,
      maxBucketCells: sid.maxBucketCells + ip.maxBucketCells,
    };
  };
  return aiGradeAuthFor;
}
