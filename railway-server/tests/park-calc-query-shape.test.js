import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { createCalcReadHandlers } from '../apstat-park/calc-read-routes.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const express = require('express');

async function request(path) {
  const park = { calcDue: vi.fn(() => ({})), calcProgress: vi.fn(() => ({})) };
  const handlers = createCalcReadHandlers({ park });
  const app = express();
  app.get('/due', handlers.due);
  app.get('/progress', handlers.progress);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { status: response.status, body: await response.json(), park };
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

describe('calculator reads reject non-text Express query values', () => {
  it.each([
    '/due?section[toString]=x&username=alice',
    '/progress?section=PeriodB&username[toString]=x',
    '/due?section=PeriodB&username=alice&skills[toString]=x',
    '/progress?section[]=PeriodB&username=alice',
    '/due?section=PeriodB&username[]=alice',
    '/due?section=PeriodB&username=alice&skills[]=mean',
  ])('%s returns 400 before reaching the park', async path => {
    const result = await request(path);
    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    expect(result.park.calcDue).not.toHaveBeenCalled();
    expect(result.park.calcProgress).not.toHaveBeenCalled();
  });
});
