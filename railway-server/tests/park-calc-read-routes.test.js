// GET /park/calc/due and GET /park/calc/progress (apstat-park/calc-read-routes.mjs).
// Review 2026-10-22: both routes are public and read-only, but a read for an unknown section used
// to allocate that section in the clears / recall modules and start a database load for it, once
// per distinct string, forever. The section is now checked against CLASSROOM_SECTIONS before the
// park service sees it; bad input is a 400, never a 500, and never reaches the stores.

import { describe, it, expect } from 'vitest';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from '../apstat-park/service.mjs';
import { createCalcReadHandlers } from '../apstat-park/calc-read-routes.mjs';
import { CLASSROOM_SECTIONS, SHARED_PARK } from '../apstat-park/shared-classroom.mjs';

function spyStore() {
  const loads = [];
  return { loads, async load(section) { loads.push(section); return []; }, async save() {} };
}

function build() {
  const srsStore = spyStore(), clearsStore = spyStore();
  const park = createParkService({ registry: createClassroomRegistry(), send() {}, srsStore, clearsStore,
    calculatorOptions: { log() {} } });
  return { park, srsStore, clearsStore, handlers: createCalcReadHandlers({ park }) };
}

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  return res;
}

const req = query => ({ query });
const settle = () => new Promise(resolve => setImmediate(resolve));

describe('park calculator read routes', () => {
  it('a known section answers 200 and starts that section\'s store load', async () => {
    const { handlers, srsStore, park } = build();
    const res = fakeRes();
    handlers.due(req({ section: 'PeriodB', username: 'alice', skills: '1.5-dotplot, ,bogus' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.due)).toBe(true);
    await settle();
    expect(srsStore.loads).toEqual([SHARED_PARK]);
    park.close();
  });

  it('progress for the teacher home section answers 200 with every skill row', () => {
    const { handlers, park } = build();
    const res = fakeRes();
    handlers.progress(req({ section: 'PeriodX', username: 'teach' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.skills.length).toBeGreaterThan(0);
    park.close();
  });

  it('an unknown section is a 400 on both routes and never reaches the stores', async () => {
    const { handlers, srsStore, clearsStore, park } = build();
    for (const section of ['PeriodZ', 'garbage-' + Math.random(), '../x', 'park:periods-b-e']) {
      const due = fakeRes(), progress = fakeRes();
      handlers.due(req({ section, username: 'alice' }), due);
      handlers.progress(req({ section, username: 'alice' }), progress);
      expect(due.statusCode).toBe(400);
      expect(progress.statusCode).toBe(400);
      expect(due.body).toEqual({ ok: false, error: 'unknown section' });
    }
    await settle();
    expect(srsStore.loads).toEqual([]);
    expect(clearsStore.loads).toEqual([]);
    park.close();
  });

  it('a missing section or username, or an oversized one, is a 400', () => {
    const { handlers, park } = build();
    for (const query of [{}, { section: 'PeriodB' }, { username: 'alice' }, { section: 'PeriodB', username: 'a'.repeat(65) }]) {
      const res = fakeRes();
      handlers.due(req(query), res);
      expect(res.statusCode).toBe(400);
      expect(res.body.ok).toBe(false);
    }
    park.close();
  });

  it('the 400 says "too long" for an oversized value and "required" for a missing one (review 2026-10-22 evening)', () => {
    const { handlers, park } = build();
    const long = fakeRes(), longSection = fakeRes(), missing = fakeRes(), blank = fakeRes();
    handlers.due(req({ section: 'PeriodB', username: 'a'.repeat(65) }), long);
    handlers.progress(req({ section: 'P'.repeat(65), username: 'alice' }), longSection);
    handlers.due(req({ section: 'PeriodB' }), missing);
    handlers.progress(req({ section: 'PeriodB', username: '   ' }), blank);
    expect(long.body).toEqual({ ok: false, error: 'section or username too long' });
    expect(longSection.body).toEqual({ ok: false, error: 'section or username too long' });
    expect(missing.body).toEqual({ ok: false, error: 'section and username required' });
    expect(blank.body).toEqual({ ok: false, error: 'section and username required' });
    // Exactly 64 characters is still a name, not "too long".
    const edge = fakeRes();
    handlers.due(req({ section: 'PeriodB', username: 'a'.repeat(64) }), edge);
    expect(edge.statusCode).toBe(200);
    park.close();
  });

  it('a park service failure is the only way to a 500', () => {
    const boom = { calcDue() { throw new Error('store exploded'); }, calcProgress() { throw new Error('store exploded'); } };
    const handlers = createCalcReadHandlers({ park: boom });
    const res = fakeRes();
    handlers.progress(req({ section: 'PeriodE', username: 'alice' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ ok: false, error: 'store exploded' });
  });

  it('CLASSROOM_SECTIONS is exactly the shared classes plus the teacher home', () => {
    expect([...CLASSROOM_SECTIONS]).toEqual(['PeriodB', 'PeriodE', 'B', 'E', 'PeriodX', 'X']);
  });
});
