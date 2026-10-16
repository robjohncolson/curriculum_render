// Protocol 14 (APSTAT_PARK_TRAINER_ABSORB_SPEC §4): the recognition step. The relay picks the
// canonical problem and the tiles, judges the pick, names the discriminating signal, and only then
// starts the route and its clock. Solo rounds always; team rounds behind the teacher's toggle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { ROUND_MS, missionFor } from './calculator-mission.mjs';
import { DEFAULT_LEVEL, levelById, challengeFor } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { recognitionFor, distractorsFor, discriminatorFor, hasRecognition } from './calculator-recognition.mjs';
import { CANONICAL_PROBLEMS, PATTERN_SIGNATURES } from './calculator-patterns.mjs';

function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function setup({ available = () => [DEFAULT_LEVEL], random = seeded(7), varyData = false } = {}) {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map();
  const service = createCalculatorService({ registry, now: () => time, available, random, varyData, log: () => {},
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  function joinSolo(ws, name, skill) {
    registry.join(ws, 'B', name, 'student', time);
    return service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill });
  }
  function send(ws, type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  }
  const press = (ws, keys) => { for (const key of keys) send(ws, 'calculator_press', { key }); };
  const pick = (ws, skill) => send(ws, 'calculator_pick', { skill });
  // Moves the clock in 1 s steps with a pose each step (the relay drops a member unseen for 5 s).
  function advance(ws, ms) {
    const end = time + ms;
    while (time < end) {
      time = Math.min(end, time + 1000);
      send(ws, 'calculator_pose', { pose: { x: 70, y: 676 }, ready: false });
      service.tick();
    }
  }
  // A two-student team round (the fluency fixture's dance), with an optional teacher socket.
  function startTeam(sockets, teacher = null) {
    for (const [ws, name] of sockets) registry.join(ws, 'B', name, 'student', time);
    if (teacher) registry.join(teacher, 'B', 'mr_c', 'teacher', time);
    for (const [ws] of sockets) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      pose: { x: TEAM_BLOCK.start - 20, y: 676 }, pushing: true });
    while (lobbies.get(sockets[0][0]).phase === 'gathering') {
      for (const [ws] of sockets) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
        pose: { x: lobbies.get(sockets[0][0]).blockX - 20, y: 676 }, pushing: true });
      time += 100; service.tick();
    }
    for (const [ws] of sockets) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      epoch: lobbies.get(ws).epoch, pose: { x: TEAM_BLOCK.dock - 20, y: 676 }, ready: true });
    service.tick();
    for (const [ws] of sockets) service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
  }
  return { service, registry, joinSolo, send, press, pick, startTeam, advance, state: ws => packets.get(ws), lobby: ws => lobbies.get(ws),
    clock: value => { time = value; }, time: () => time };
}

test('acceptance: a solo one-propztest round opens with a proportion word problem and the four tiles', () => {
  const f = setup();
  const ws = {};
  try {
    assert.equal(f.joinSolo(ws, 'alice', 'one-propztest'), null);
    const state = f.state(ws);
    assert.equal(state.missionId.startsWith('one-propztest'), true);
    assert.ok(state.recognition, 'the round carries the recognition step');
    assert.equal(state.recognition.picked, null);
    assert.equal(state.recognition.skill, null, 'the right procedure is not in the packet until the pick');
    assert.ok(CANONICAL_PROBLEMS['one-propztest'].some(problem => problem.stem === state.recognition.stem), 'a canonical proportion problem');
    assert.deepEqual([...state.recognition.options].sort(), ['one-propzint', 'one-propztest', 't-test-stats', 'two-propztest']);
    assert.equal(f.lobby(ws).recognition, true, 'solo rooms always recognise');
  } finally { f.service.close(); }
});

test('no keypad and no clock while the word problem is open; the pick starts the route and the clock', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-propztest');
    const level = missionFor(f.state(ws));
    f.press(ws, [level.route[0]]);
    assert.equal(f.state(ws).step, 0, 'a key before the pick does nothing');
    assert.equal(f.state(ws).keys.length, 0);
    f.advance(ws, ROUND_MS * 3);
    assert.equal(f.state(ws).failure, null, 'no deadline while recognising');
    assert.equal(f.state(ws).recognition.picked, null);
    const revision = f.state(ws).revision;
    assert.equal(f.pick(ws, 'not-an-option'), null);
    assert.equal(f.state(ws).revision, revision, 'a tile that is not offered is ignored');
    f.pick(ws, 'one-propztest');
    const picked = f.state(ws);
    assert.equal(picked.revision, revision + 1);
    assert.equal(picked.recognition.picked, 'one-propztest');
    assert.equal(picked.recognition.correct, true);
    assert.equal(picked.recognition.message, null);
    assert.equal(picked.recognition.skill, 'one-propztest', 'revealed once picked');
    assert.equal(picked.startedAt, ROUND_MS * 3, 'the step clock starts at the pick');
    f.pick(ws, 'one-propzint');
    assert.equal(f.state(ws).recognition.picked, 'one-propztest', 'one pick per round');
    f.press(ws, [level.route[0]]);
    assert.equal(f.state(ws).step, 1, 'the route plays after the pick');
    f.advance(ws, ROUND_MS + 1);
    assert.ok(f.state(ws).failure, 'the clock runs after the pick');
  } finally { f.service.close(); }
});

test('a wrong pick is told the discriminating signal in one sentence; the route still starts on the right skill', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-propztest');
    f.pick(ws, 't-test-stats');
    const state = f.state(ws);
    assert.equal(state.recognition.correct, false);
    assert.equal(state.recognition.picked, 't-test-stats');
    assert.equal(state.recognition.message, 'This asks about a proportion, not a mean.');
    assert.equal(levelById(state.missionId).skillId, 'one-propztest', 'the round stays on its own skill');
    const level = missionFor(state);
    f.press(ws, [...level.route, ...challengeFor(level).answers.map(String)]);
    assert.equal(f.state(ws).complete, true, 'clearable after a wrong pick');
    assert.equal(f.state(ws).recognition.correct, false, 'the wrong pick is remembered on the round (SRS quality, Phase 3)');
  } finally { f.service.close(); }
});

test('the door starts a new recognition round; a timeout keeps the answered one', () => {
  const f = setup({ random: seeded(11) });
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-propztest');
    const first = f.state(ws).recognition;
    f.pick(ws, 'one-propztest');
    // A timeout after the pick: the step restarts, the recognition step does not come back.
    f.advance(ws, ROUND_MS + 1);
    assert.ok(f.state(ws).failure);
    f.advance(ws, 1000);
    assert.equal(f.state(ws).failure, null);
    assert.equal(f.state(ws).recognition.picked, 'one-propztest', 'still answered');
    const level = missionFor(f.state(ws));
    f.press(ws, [...level.route, ...challengeFor(level).answers.map(String)]);
    assert.equal(f.state(ws).complete, true);
    f.send(ws, 'calculator_restart');
    const next = f.state(ws);
    assert.equal(next.complete, false);
    assert.ok(next.recognition, 'the next round opens with the step again');
    assert.equal(next.recognition.picked, null);
    assert.notEqual(next.epoch, first.epoch);
  } finally { f.service.close(); }
});

test('a skill with no canonical problem skips the step (dotplot)', () => {
  const f = setup({ available: () => [levelById('dotplot')] });
  const ws = {};
  try {
    assert.equal(hasRecognition('dotplot'), false);
    f.joinSolo(ws, 'alice', 'dotplot');
    assert.equal(f.state(ws).recognition, null);
    f.press(ws, [missionFor(f.state(ws)).route[0]]);
    assert.equal(f.state(ws).step, 1, 'the keypad works at once');
  } finally { f.service.close(); }
});

test('team rounds: off by default; the teacher toggles it on for the next round; students cannot', () => {
  const f = setup();
  const a = {}, b = {}, teacher = {};
  try {
    f.startTeam([[a, 'alice'], [b, 'bob']], teacher);
    assert.equal(f.state(a).recognition, null, 'teacher decision 2: off by default');
    assert.equal(f.lobby(a).recognition, false);
    const refused = f.service.handle(a, { type: 'calculator_recognition', on: true });
    assert.equal(refused.type, 'calculator_error');
    assert.equal(f.service.handle(teacher, { type: 'calculator_recognition', on: true }), null);
    assert.equal(f.lobby(a).recognition, true, 'the room now recognises');
    assert.equal(f.state(a).recognition, null, 'the round in progress is unchanged');
    // Finish this round, go through the door: the next one opens with the step for everyone.
    for (const ws of [a, b]) {
      const level = missionFor(f.state(ws));
      f.press(ws, [...level.route, ...challengeFor(level).answers.map(String)]);
    }
    assert.equal(f.state(a).complete, true);
    f.send(a, 'calculator_restart');
    f.startTeam([[a, 'alice'], [b, 'bob']]);
    assert.ok(f.state(a).recognition, 'team round with the step');
    assert.deepEqual(f.state(b).recognition.options, f.state(a).recognition.options, 'one tile order for the whole team');
    assert.equal(f.state(b).recognition.stem, f.state(a).recognition.stem);
    f.pick(a, 'one-var-stats');
    assert.equal(f.state(a).recognition.correct, true);
    assert.equal(f.state(b).recognition.picked, null, 'each member picks for themselves');
    assert.equal(f.service.handle(teacher, { type: 'calculator_recognition', on: false }), null);
    assert.equal(f.lobby(a).recognition, false);
  } finally { f.service.close(); }
});

test('every skill with canonical problems gets three distinct distractors; discriminators name a signal', () => {
  for (const skillId of Object.keys(CANONICAL_PROBLEMS)) {
    const distractors = distractorsFor(skillId);
    assert.equal(distractors.length, 3, skillId);
    assert.equal(new Set(distractors).size, 3, skillId + ' distinct');
    assert.ok(!distractors.includes(skillId), skillId + ' never itself');
    for (const other of distractors) {
      assert.ok(PATTERN_SIGNATURES[other], skillId + ' -> ' + other + ' is a signature');
      const sentence = discriminatorFor(skillId, other);
      assert.match(sentence, /^[A-Za-z].+\.$/, skillId + ' vs ' + other + ': ' + sentence);
    }
    const round = recognitionFor(skillId, seeded(3));
    assert.ok(round.options.includes(skillId));
    assert.equal(round.options.length, 4);
  }
});
