// Protocol 16 (APSTAT_PARK_TRAINER_ABSORB_SPEC §7): the handheld check. After a solo clear the
// relay offers the round's headline result; a pass masters the skill (and pays the bonus on the
// first mastery); a miss gets one retry, then the check closes and nothing is recorded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { missionFor } from './calculator-mission.mjs';
import { DEFAULT_LEVEL, levelById, challengeFor } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { createCalculatorSrs } from './calculator-srs-state.mjs';
import { handheldMatches, handheldFor } from './calculator-handheld.mjs';

test('handheldMatches: the trainer\'s tolerance (any rounding at the typed decimals, whole numbers only for |x| >= 1, backstop 0.5%)', () => {
  assert.equal(handheldMatches('3.6055', 3.6055), true);
  assert.equal(handheldMatches('3.61', 3.6055), true);
  assert.equal(handheldMatches('3.6', 3.6055), true);
  assert.equal(handheldMatches('4', 3.6055), true);
  assert.equal(handheldMatches('3', 3.6055), true);
  assert.equal(handheldMatches('3.7', 3.6055), true, 'rounded up at one decimal is accepted');
  assert.equal(handheldMatches('3.8', 3.6055), false);
  assert.equal(handheldMatches('0', 0.17173), false, 'a bare whole number means nothing for a probability');
  assert.equal(handheldMatches('.17', 0.17173), true);
  assert.equal(handheldMatches('0.172', 0.17173), true);
  assert.equal(handheldMatches('0.1718', 0.17173), true, 'backstop 0.5%');
  assert.equal(handheldMatches('0.18', 0.17173), true, 'rounded up at two decimals');
  assert.equal(handheldMatches('0.19', 0.17173), false);
  assert.equal(handheldMatches('(-)2.16', -2.1602), true, 'the CE\'s (-) sign');
  assert.equal(handheldMatches('−2.16', -2.1602), true, 'a minus sign glyph');
  assert.equal(handheldMatches('abc', 3), false);
  assert.equal(handheldMatches('0.004', 0), true);
  assert.equal(handheldMatches('0.01', 0), false);
  assert.deepEqual(handheldFor(DEFAULT_LEVEL), { label: 'Minimum', expected: 4 });
  assert.deepEqual(handheldFor(levelById('one-propztest')).label, 'z statistic');
});

function setup({ clearsSeed = 0 } = {}) {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map(), mastered = [];
  const lobbyOf = ws => lobbies.get(ws);
  const srs = createCalculatorSrs({ now: () => time, log: () => {} });
  // random: () => 0 pins the catalogue problem (one-var-stats itself, whose first answer is the Minimum);
  // other variants ask for other values, and a variant with no numeric answer offers no check.
  const service = createCalculatorService({ registry, now: () => time, wallNow: () => Date.parse('2026-10-16T16:00:00Z'), random: () => 0,
    available: () => [DEFAULT_LEVEL], varyData: false, srs, onMastery: event => mastered.push(event), log: () => {},
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  function send(ws, type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  }
  function pick(ws) {
    const state = packets.get(ws);
    if (state?.recognition && !state.recognition.picked) send(ws, 'calculator_pick', { skill: levelById(state.missionId).skillId });
  }
  function joinSolo(ws, name) {
    registry.join(ws, 'B', name, 'student', time);
    service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill: 'one-var-stats' });
    pick(ws);
  }
  const solve = ws => { pick(ws); const level = missionFor(packets.get(ws)); for (const key of [...level.route, ...challengeFor(level).answers.map(String)]) send(ws, 'calculator_press', { key }); };
  const typed = (ws, value) => send(ws, 'calculator_handheld', { value });
  const advance = () => { time += 100; service.tick(); };
  return { service, registry, srs, mastered, joinSolo, send, pick, solve, typed, advance, state: ws => packets.get(ws), lobby: lobbyOf };
}

test('after a solo clear the packet offers the check (label, no answer); a right value passes and masters the skill once', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice');
    assert.equal(f.state(ws).handheld, null, 'not before the clear');
    assert.equal(f.typed(ws, '4'), null);
    assert.equal(f.state(ws).handheld, null, 'ignored before the clear');
    f.solve(ws);
    const offered = f.state(ws).handheld;
    assert.deepEqual(offered, { label: 'Minimum', attempts: 0, status: null });
    assert.equal(JSON.stringify(f.state(ws)).includes('"expected"'), false, 'the expected value never leaves the relay');
    assert.equal(f.state(ws).review.mastered, false, 'rung 0: the clear alone does not master');
    const revision = f.state(ws).revision;
    f.typed(ws, '4.0');
    const passed = f.state(ws);
    assert.equal(passed.revision, revision + 1);
    assert.deepEqual(passed.handheld, { label: 'Minimum', attempts: 1, status: 'passed' });
    assert.equal(passed.review.mastered, true);
    assert.equal(passed.review.masteredNow, true, 'the pass is the first mastery');
    assert.deepEqual(f.mastered, [{ section: 'B', username: 'alice', skillId: 'one-var-stats' }]);
    assert.equal(f.srs.recordOf('B', 'alice', 'one-var-stats').mastered, true);
    f.typed(ws, '4');
    assert.equal(f.state(ws).revision, revision + 1, 'a passed check takes no more input');
    // The next round: the skill is mastered, so the check is not offered again.
    f.send(ws, 'calculator_restart'); f.pick(ws); f.solve(ws);
    assert.equal(f.state(ws).handheld, null);
    assert.equal(f.mastered.length, 1, 'the bonus hook fired once');
  } finally { f.service.close(); }
});

test('a miss gets one retry; a second miss closes the check and records nothing', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice');
    f.solve(ws);
    f.typed(ws, '5');
    assert.deepEqual(f.state(ws).handheld, { label: 'Minimum', attempts: 1, status: null });
    assert.equal(f.state(ws).review.mastered, false);
    f.typed(ws, 'nope');
    assert.deepEqual(f.state(ws).handheld, { label: 'Minimum', attempts: 2, status: 'failed' });
    assert.equal(f.state(ws).review.mastered, false);
    assert.equal(f.srs.recordOf('B', 'alice', 'one-var-stats').mastered, false, 'nothing recorded');
    assert.deepEqual(f.mastered, []);
    const revision = f.state(ws).revision;
    f.typed(ws, '4');
    assert.equal(f.state(ws).revision, revision, 'closed: a late right answer changes nothing');
  } finally { f.service.close(); }
});

test('a team round never offers the check', () => {
  const f = setup();
  const a = {}, b = {};
  try {
    for (const [ws, name] of [[a, 'alice'], [b, 'bob']]) f.registry.join(ws, 'B', name, 'student', 0);
    for (const ws of [a, b]) f.service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x: TEAM_BLOCK.start - 20, y: 676 }, pushing: true });
    let guard = 0;
    while (f.lobby(a).phase === 'gathering' && guard++ < 400) {
      const x = f.lobby(a).blockX - 20;
      for (const ws of [a, b]) f.service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, pose: { x, y: 676 }, pushing: true });
      f.advance();
    }
    for (const ws of [a, b]) f.service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL, epoch: f.lobby(ws).epoch, pose: { x: TEAM_BLOCK.dock - 20, y: 676 }, ready: true });
    f.advance();
    for (const ws of [a, b]) f.service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
    for (const ws of [a, b]) f.solve(ws);
    assert.equal(f.state(a).complete, true);
    assert.equal(f.state(a).handheld, null);
    assert.equal(f.typed(a, '4'), null);
    assert.equal(f.state(a).review.mastered, false);
  } finally { f.service.close(); }
});
