import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalculatorRuntime } from './calculator-runtime.mjs';
import { createMission, advanceMission, ROUTE, KEYS, HOLD_MS, ROUND_MS } from './calculator-mission.mjs';

function member(key, state, now) {
  const tile = KEYS.find(tile => tile.key === key);
  return { pose: { x: tile.x + 10, y: tile.y - 24 }, at: now, revision: state.revision };
}
test('running calculator recognizes alternatives and rejects different states', () => {
  const engine = createCalculatorRuntime();
  assert.deepEqual(engine.transitions({ step: 2, keys: ROUTE.slice(0, 2) }), { '1': 3, ENTER: 3 });
  const fields = engine.transitions({ step: 3, keys: ['STAT', 'RIGHT', '1'] });
  assert.equal(fields.ENTER, 4); assert.equal(fields.DOWN, 4); assert.equal(fields.UP, 5);
  assert.equal(fields.RIGHT, undefined, 'RIGHT changes the list; it is not equivalent here');
  assert.equal(fields['2ND'], undefined, 'a modifier alone does not achieve the goal');
});
test('different equivalent keys reach consensus and record the real key', () => {
  const state = { ...createMission(0), step: 3, keys: ['STAT', 'RIGHT', '1'] };
  const engine = createCalculatorRuntime(), transitions = engine.transitions(state);
  const members = [member('ENTER', state, 0), member('DOWN', state, 0)];
  advanceMission(state, members, 0, transitions);
  advanceMission(state, members, HOLD_MS, transitions);
  assert.equal(state.step, 4); assert.deepEqual(state.keys, ['STAT', 'RIGHT', '1', 'ENTER']);
  assert.equal(engine.transitions(state).ENTER, 5);
});
test('forward shortcuts work, but different destination states do not form consensus', () => {
  const state = { ...createMission(0), step: 3, keys: ROUTE.slice(0, 3) };
  const transitions = createCalculatorRuntime().transitions(state);
  advanceMission(state, [member('UP', state, 0), member('DOWN', state, 0)], 0, transitions);
  assert.equal(state.holdAt, null);
  const members = [member('UP', state, 0)];
  advanceMission(state, members, 0, transitions);
  advanceMission(state, members, HOLD_MS, transitions);
  assert.equal(state.step, 5); assert.equal(state.keys.at(-1), 'UP');
});
test('calculator input at the deadline cannot advance or start a fresh timer', () => {
  const state = { ...createMission(0), step: 4, keys: ROUTE.slice(0, 4) };
  const transitions = createCalculatorRuntime().transitions(state);
  advanceMission(state, [member('DOWN', state, ROUND_MS)], ROUND_MS, transitions);
  assert.equal(state.step, 4); assert.equal(state.startedAt, 0);
});

test('wrong keys get a full hold, commit real input, and can be corrected without resetting', () => {
  const state = createMission(0), engine = createCalculatorRuntime();
  const members = [member('MATH', state, 0), member('MATH', state, 0)];
  const valid = engine.transitions(state);
  advanceMission(state, members, 0, valid);
  assert.equal(state.holdAt, 0, 'wrong-key timer starts');
  advanceMission(state, members, HOLD_MS - 1, valid);
  assert.deepEqual(state.keys, []);
  advanceMission(state, members, HOLD_MS, valid);
  assert.deepEqual(state.keys, ['MATH']); assert.equal(state.step, 0);
  assert.deepEqual(state.lastPress, { key: 'MATH', advanced: false });
  assert.equal(state.startedAt, 0); assert.equal(state.bonus, 0);
  advanceMission(state, members, HOLD_MS + 1, engine.transitions(state));
  assert.equal(state.holdAt, null, 'old poses cannot repeat the press');
  // Follow the engine's real exit path: CLEAR back home, then STAT.
  for (const [key, now] of [['CLEAR', 1000], ['STAT', 2000]]) {
    const recovery = engine.transitions(state), next = [member(key, state, now)];
    advanceMission(state, next, now, recovery);
    advanceMission(state, next, now + HOLD_MS, recovery);
  }
  assert.equal(state.step, 1); assert.deepEqual(state.keys, ['MATH', 'CLEAR', 'STAT']);
});

test('changing a wrong key restarts the hold; summary values are accepted without individual judgment', () => {
  const state = createMission(0);
  advanceMission(state, [member('MATH', state, 0)], 0);
  advanceMission(state, [member('CLEAR', state, 500)], 500);
  assert.equal(state.holdAt, 500);
  advanceMission(state, [member('CLEAR', state, 900)], 900);
  assert.equal(state.keys.length, 0);
  const summary = { ...createMission(0), step: 7 };
  const choice = { pose: { x: 120, y: 576 }, at: 0, revision: 0 }; // 14, not minimum 4
  advanceMission(summary, [choice], 0);
  advanceMission(summary, [choice], HOLD_MS);
  assert.deepEqual(summary.lastPress, { key: '14', advanced: true });
  assert.equal(summary.step, 8); assert.equal(summary.bonus, 0);
});
