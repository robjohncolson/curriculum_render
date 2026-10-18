// APSTAT_PARK_TRAINER_ABSORB_2_SPEC §3: messy clears do not climb the rung. The rule (clearDelta),
// the per-name deltas in clears.record (floor 0, absolute rows to the store), and the service putting
// rungChange / clearQuality on the completed member state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { missionFor } from './calculator-mission.mjs';
import { DEFAULT_LEVEL, levelById, challengeFor } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { createCalculatorClears, clearDelta, rungFor } from './calculator-clears.mjs';
import { createCalculatorSrs } from './calculator-srs-state.mjs';

const flushed = () => new Promise(resolve => setTimeout(resolve, 0));

// ---- the rule ----

test('clearDelta: quality >= 3 climbs, 2 holds, <= 1 at rung 2 goes back to one clear, <= 1 below rung 2 holds', () => {
  for (const clears of [0, 1, 2, 7]) {
    assert.equal(clearDelta({ quality: 5, clears }), 1, 'quality 5 at ' + clears);
    assert.equal(clearDelta({ quality: 3, clears }), 1, 'quality 3 at ' + clears);
    assert.equal(clearDelta({ quality: 2, clears }), 0, 'messy at ' + clears);
  }
  assert.equal(clearDelta({ quality: 1, clears: 0 }), 0);
  assert.equal(clearDelta({ quality: 0, clears: 1 }), 0);
  assert.equal(clearDelta({ quality: 1, clears: 2 }), -1, 'two clears drop to one');
  assert.equal(clearDelta({ quality: 0, clears: 6 }), -5, 'any count at rung 2 goes back to one clear');
  assert.equal(rungFor(6 + clearDelta({ quality: 0, clears: 6 })), 1, 'goals-only hints next round');
});

// ---- the module ----

test('record applies per-name deltas, floors at 0, and +1 for a name with no delta', () => {
  const clears = createCalculatorClears({ now: () => 0, log: () => {} });
  clears.record('B', ['alice', 'bob'], 'histogram');
  clears.record('B', ['alice', 'bob'], 'histogram');
  clears.record('B', ['alice', 'bob', 'cara'], 'histogram', { alice: -1, bob: 0 });
  assert.equal(clears.clearsOf('B', 'alice', 'histogram'), 1, 'quality-1 at two clears drops to one');
  assert.equal(clears.clearsOf('B', 'bob', 'histogram'), 2, 'a messy clear changes nothing');
  assert.equal(clears.clearsOf('B', 'cara', 'histogram'), 1, 'no delta listed: +1 as before');
  clears.record('B', ['cara'], 'histogram', { cara: -4 });
  assert.equal(clears.clearsOf('B', 'cara', 'histogram'), 0, 'floor 0');
});

test('the store receives absolute counts after a drop; a zero delta writes nothing', async () => {
  const saves = [];
  const store = { load: async () => [{ username: 'alice', skillId: 'histogram', clears: 2 }], save: async (section, rows) => { saves.push(rows); } };
  const clears = createCalculatorClears({ store, now: () => 0, log: () => {} });
  clears.ensure('B');
  await flushed(); await flushed();
  clears.record('B', ['alice'], 'histogram', { alice: 0 });
  clears.flush(); await flushed();
  assert.deepEqual(saves, [], 'a messy clear leaves the row alone');
  clears.record('B', ['alice'], 'histogram', { alice: -1 });
  clears.flush(); await flushed(); await flushed();
  assert.deepEqual(saves, [[{ username: 'alice', skillId: 'histogram', clears: 1 }]]);
});

// ---- the service ----

function setup({ clearsSeed = 0 } = {}) {
  const registry = createClassroomRegistry(), packets = new Map();
  const clears = createCalculatorClears({ now: () => 0, log: () => {} });
  const srs = createCalculatorSrs({ now: () => 0, log: () => {} });
  for (let i = 0; i < clearsSeed; i++) clears.record('B', ['alice'], 'one-var-stats');
  const service = createCalculatorService({ registry, now: () => 0, wallNow: () => Date.parse('2026-10-16T16:00:00Z'),
    available: () => [DEFAULT_LEVEL], varyData: false, clears, srs, log: () => {},
    send: (ws, packet) => { if (packet.type !== 'calculator_lobby_state') packets.set(ws, packet); } });
  const send = (ws, type, extra = {}) => {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  };
  const ws = {};
  registry.join(ws, 'B', 'alice', 'student', 0);
  service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill: 'one-var-stats' });
  send(ws, 'calculator_pick', { skill: levelById(packets.get(ws).missionId).skillId });
  // Wrong keys: MATH from the home screen opens a menu (a wrong key), CLEAR backs out of it.
  const wrong = count => {
    while (packets.get(ws).wrongKeys < count) { send(ws, 'calculator_press', { key: 'MATH' }); send(ws, 'calculator_press', { key: 'CLEAR' }); }
    assert.equal(packets.get(ws).wrongKeys, count);
  };
  const solve = () => {
    const level = missionFor(packets.get(ws));
    for (const key of [...level.route, ...challengeFor(level).answers.map(String)]) send(ws, 'calculator_press', { key });
  };
  return { service, clears, wrong, solve, state: () => packets.get(ws) };
}

const cases = [
  { name: 'a clean clear at rung 0 climbs', seed: 0, wrongKeys: 0, quality: 5, rungChange: 1, clears: 1 },
  { name: 'a clean clear at rung 1 climbs', seed: 1, wrongKeys: 2, quality: 4, rungChange: 1, clears: 2 },
  { name: 'a messy clear (four wrong keys) holds the rung', seed: 1, wrongKeys: 4, quality: 2, rungChange: 0, clears: 1 },
  { name: 'a rough clear (five wrong keys) at rung 2 drops to goals-only', seed: 2, wrongKeys: 5, quality: 1, rungChange: -1, clears: 1 },
  { name: 'a rough clear at rung 1 holds', seed: 1, wrongKeys: 6, quality: 0, rungChange: 0, clears: 1 },
  { name: 'a clean clear already at rung 2 counts but the rung cannot rise', seed: 2, wrongKeys: 0, quality: 5, rungChange: 0, clears: 3 },
];

for (const c of cases) {
  test('service: ' + c.name + ' (rungChange and clearQuality on the completed state)', () => {
    const f = setup({ clearsSeed: c.seed });
    try {
      f.wrong(c.wrongKeys);
      f.solve();
      const done = f.state();
      assert.equal(done.complete, true);
      assert.equal(done.clearQuality, c.quality);
      assert.equal(done.review.quality, c.quality, 'the same quality as the recall review');
      assert.equal(done.rungChange, c.rungChange);
      assert.equal(done.clears, c.clears);
      assert.equal(f.clears.clearsOf('B', 'alice', 'one-var-stats'), c.clears);
    } finally { f.service.close(); }
  });
}
