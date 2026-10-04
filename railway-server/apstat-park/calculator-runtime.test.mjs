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
test('timeout restores the current checkpoint and repeats every 30 seconds', () => {
  const state = { ...createMission(0), step: 4, keys: ['STAT', 'RIGHT', '1', 'ENTER'] };
  const transitions = createCalculatorRuntime().transitions(state);
  const members = [member('RIGHT', state, ROUND_MS)];
  advanceMission(state, members, ROUND_MS, transitions);
  assert.equal(state.step, 4); assert.deepEqual(state.keys, ['STAT', 'RIGHT', '1', 'ENTER']);
  assert.deepEqual(state.hintKeys.sort(), ['DOWN', 'ENTER']);
  assert.equal(state.revision, 1); assert.equal(state.timeoutCount, 1);
  advanceMission(state, members, ROUND_MS * 2, transitions);
  assert.equal(state.timeoutCount, 2); assert.equal(state.revision, 2);
});
