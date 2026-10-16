// APSTAT_PARK_TRAINER_ABSORB_SPEC §6 (Phase 4): keys for solo clears and the solo door's bonus point.
// The roster-server side is a fake fetch shaped like /class/quarter/current and /class/bonus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createParkService } from './service.mjs';
import { createBonusRail } from './calculator-bonus.mjs';
import { missionFor } from './calculator-mission.mjs';
import { DEFAULT_LEVEL, levelById, challengeFor } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { createCalculatorClears } from './calculator-clears.mjs';

// A roster-server mock: the quarter route and the bonus route, with optional failures.
function rosterMock({ quarter = 'Q1', failFirst = 0, badKey = false, roster = ['alice', 'bob'] } = {}) {
  const calls = [], ledger = [];
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null, key: init.headers?.['x-teacher-secret'] });
    if (badKey || init.headers?.['x-teacher-secret'] !== 'apteacher2627') return reply(401, { ok: false, error: 'forbidden' });
    if (failFirst > 0) { failFirst--; throw new Error('fetch failed'); }
    if (url.endsWith('/class/quarter/current')) return reply(200, { ok: true, quarter, asOf: '2026-10-16', open: true });
    if (url.endsWith('/class/bonus')) {
      const body = JSON.parse(init.body);
      const entry = body.entries[0];
      if (!roster.includes(entry.username)) return reply(200, { ok: true, written: 0, errors: [{ index: 0, error: 'unknown or ambiguous student' }] });
      // item_ledger upserts at (student, source, item, attempt): a repeat overwrites the same row.
      const itemId = 'BONUS-' + body.sheetId;
      const existing = ledger.find(row => row.username === entry.username && row.itemId === itemId);
      if (existing) Object.assign(existing, { grade: entry.grade, quarter: body.quarter, title: body.title });
      else ledger.push({ username: entry.username, itemId, score: { E: 5, P: 3, I: 1 }[entry.grade], grade: entry.grade, quarter: body.quarter, title: body.title });
      return reply(200, { ok: true, sheetId: body.sheetId, quarter: body.quarter, written: 1, errors: [] });
    }
    return reply(404, { ok: false });
  };
  return { fetch, calls, ledger };
}

const rail = (mock, extra = {}) => createBonusRail({ rosterUrl: 'https://roster.test/', teacherKey: 'apteacher2627', fetch: mock.fetch,
  skillTitle: id => levelById(id)?.title || id, log: () => {}, wait: async () => {}, ...extra });

test('a mastery posts one I-grade bonus entry for TI84-<skill> in the open quarter, asked of roster-server', async () => {
  const mock = rosterMock({ quarter: 'Q2' });
  const bonus = rail(mock);
  const result = await bonus.post({ section: 'park:periods-b-e', username: 'alice', skillId: 'one-var-stats' });
  assert.deepEqual(result, { sheetId: 'TI84-one-var-stats', title: 'Calculator: 1-Var Stats', quarter: 'Q2', entries: [{ username: 'alice', grade: 'I' }], written: 1 });
  assert.deepEqual(mock.calls.map(c => c.method + ' ' + c.url), ['GET https://roster.test/class/quarter/current', 'POST https://roster.test/class/bonus']);
  assert.equal(mock.calls[1].key, 'apteacher2627', 'the teacher key in x-teacher-secret');
  assert.deepEqual(mock.ledger, [{ username: 'alice', itemId: 'BONUS-TI84-one-var-stats', score: 1, grade: 'I', quarter: 'Q2', title: 'Calculator: 1-Var Stats' }]);
  // A second post for the same skill lands on the same row: still one point.
  await bonus.post({ section: 'park:periods-b-e', username: 'alice', skillId: 'one-var-stats' });
  assert.equal(mock.ledger.length, 1);
  assert.equal(mock.calls.length, 3, 'the quarter is cached');
  assert.equal(bonus.posted.length, 2);
});

test('one retry after a failure, then a log and no throw; the rail is off without a key', async () => {
  const flaky = rosterMock({ failFirst: 1 });
  const once = rail(flaky);
  assert.ok(await once.post({ username: 'alice', skillId: 'normalcdf' }), 'the retry succeeded');
  assert.equal(flaky.ledger.length, 1);
  const down = rosterMock({ failFirst: 2 });
  const twice = rail(down);
  assert.equal(await twice.post({ username: 'alice', skillId: 'normalcdf' }), null, 'two failures: logged, not thrown');
  assert.deepEqual(twice.failed.map(f => f.skillId), ['normalcdf']);
  const unknown = rosterMock();
  assert.equal(await rail(unknown).post({ username: 'nobody', skillId: 'normalcdf' }), null, 'an unknown student is a failure, not a throw');
  const off = createBonusRail({ rosterUrl: 'https://roster.test', teacherKey: '', fetch: unknown.fetch, log: () => {} });
  assert.equal(off.enabled, false);
  const before = unknown.calls.length;
  assert.equal(before, 3, 'quarter, post, retried post for the unknown student');
  assert.equal(await off.post({ username: 'alice', skillId: 'normalcdf' }), null);
  assert.equal(unknown.calls.length, before, 'nothing fetched when the rail is off');
  const wrongKey = rosterMock({ badKey: true });
  assert.equal(await rail(wrongKey).post({ username: 'alice', skillId: 'normalcdf' }), null);
});

// ---- through the park service: a solo clear pays a key; the first mastery banks the point ----

function park({ clearsSeed = 0 } = {}) {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map();
  const mock = rosterMock();
  const bonus = rail(mock);
  const clears = createCalculatorClears({ now: () => time, log: () => {} });
  for (let i = 0; i < clearsSeed; i++) clears.record('park:periods-b-e', ['alice'], 'one-var-stats');
  const service = createParkService({ registry, now: () => time, onMastery: event => bonus.post(event),
    calculatorOptions: { available: () => [DEFAULT_LEVEL], varyData: false, clears, log: () => {} },
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  const ws = {};
  registry.join(ws, 'PeriodB', 'alice', 'student', 0);
  function send(type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state?.epoch, revision: state?.revision, ...extra });
  }
  function pick() {
    const state = packets.get(ws);
    if (state?.recognition && !state.recognition.picked) send('calculator_pick', { skill: levelById(state.missionId).skillId });
  }
  const join = skill => { service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill }); pick(); };
  const solve = () => { pick(); const level = missionFor(packets.get(ws)); for (const key of [...level.route, ...challengeFor(level).answers.map(String)]) send('calculator_press', { key }); };
  const door = () => { send('calculator_restart'); pick(); };
  return { service, mock, bonus, join, solve, door, state: () => packets.get(ws), lobby: () => lobbies.get(ws) };
}

test('a solo clear pays +1 key once per round through the wallet; the second clear pays again (new epoch)', () => {
  const f = park();
  try {
    f.join('one-var-stats');
    f.solve();
    assert.equal(f.state().complete, true);
    assert.equal(f.lobby().campaignKeys.alice, 1, '+1 key for the solo clear');
    f.service.calculator ? null : null;
    f.door();
    assert.equal(f.lobby().campaignKeys.alice, 1, 'a fresh round pays nothing yet');
    f.solve();
    assert.equal(f.lobby().campaignKeys.alice, 2);
  } finally { f.service.close(); }
});

test('acceptance: mastering one-var-stats banks one BONUS-TI84-one-var-stats row (score 1); clearing it again changes neither', async () => {
  const f = park({ clearsSeed: 2 });
  try {
    f.join('one-var-stats');
    assert.equal(f.state().rung, 2);
    f.solve();
    assert.equal(f.state().review.masteredNow, true);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(f.mock.ledger, [{ username: 'alice', itemId: 'BONUS-TI84-one-var-stats', score: 1, grade: 'I', quarter: 'Q1', title: 'Calculator: 1-Var Stats' }]);
    assert.equal(f.lobby().campaignKeys.alice, 1);
    const posts = f.mock.calls.filter(c => c.method === 'POST').length;
    f.door(); f.solve();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(f.state().review.masteredNow, false);
    assert.equal(f.mock.calls.filter(c => c.method === 'POST').length, posts, 'the second mastery of the same skill posts nothing');
    assert.equal(f.mock.ledger.length, 1);
    assert.equal(f.lobby().campaignKeys.alice, 2, 'keys keep paying per clear');
  } finally { f.service.close(); }
});
