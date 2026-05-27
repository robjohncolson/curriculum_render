// level-engine-gate.test.js
// Unit tests for the V7.10 Gate actor: physical predicate-gated
// blockers that replace voting for mechanic-first levels (U1.1 in
// V7.10; future levels via the same pattern). Predicate whitelist
// is hard-coded (never raw eval); per-tick evaluator flips opened
// one-way; SIPPING -> VOTING cascade short-circuits for Gate levels
// (progression via walk-through-gate input on the advance gate).
//
// Contract: LIVE_CLASSROOM_V7_10_BUILD.md sections 1-8.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLevelState,
  applyInput,
  tick,
  serialize,
  _clearCache,
  PHASE_SIPPING,
  PHASE_VOTING,
  PHASE_KEY_HUNT,
  PHASE_GOAL_AVAILABLE
} from '../level-engine.js';

function makeRoom(playerPositions, canvasW) {
  var members = new Map();
  Object.keys(playerPositions).forEach(function (u) {
    members.set(u, {
      username: u,
      online:   true,
      canvasW:  (typeof canvasW === 'number') ? canvasW : 480,
      pos:      playerPositions[u]
    });
  });
  return { members: members, closedDoorways: null };
}

function chipPos(cx, cy, chipSize) {
  return { x: cx * chipSize, y: cy * chipSize, state: 'idle', vx: 0 };
}

// Build a V7.10 Gate level mirroring the U1.1 Zone 2 + Zone 4 shape:
// SipStations + ChoicePads (for marks) + 4 Gates (row scanner +
// 2 always-false + 1 tally-nonzero) + Key + Goal.
function makeGateLevel() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.GATE',
    lessonKey: 'TEST.GATE',
    map: { width: 48, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'SipStation',  id: 's1', x: 4,  y: 2, drink: 'A' },
      { type: 'SipStation',  id: 's2', x: 28, y: 2, drink: 'B' },
      { type: 'ChoicePad',   id: 'cp-A', x: 8,  y: 4, value: 'A' },
      { type: 'ChoicePad',   id: 'cp-B', x: 24, y: 4, value: 'B' },
      { type: 'Gate', id: 'g-scanner', x: 30, y: 3, label: 'scanner',  predicate: 'every_player_row_complete' },
      { type: 'Gate', id: 'g-brand',   x: 36, y: 6, label: 'brand',    predicate: 'always_false' },
      { type: 'Gate', id: 'g-better',  x: 40, y: 6, label: 'better',   predicate: 'always_false' },
      { type: 'Gate', id: 'g-data',    x: 44, y: 6, label: 'data',     predicate: 'tally_nonzero' },
      { type: 'Key',  id: 'k1', x: 46, y: 4 },
      { type: 'Goal', x: 47, y: 7 }
    ]
  };
}

function completeRow(state, room, username, choice) {
  // Collect A coin, B coin, then walk to a choice pad and fire choice.
  var positions = [
    { coinId: 's1', x: 4,  y: 2 },
    { coinId: 's2', x: 28, y: 2 }
  ];
  for (var i = 0; i < positions.length; i++) {
    room.members.get(username).pos = chipPos(positions[i].x, positions[i].y, state.chipSize);
    tick(state, 200, room);
    applyInput(state, username, { kind: 'collect', coinId: positions[i].coinId });
  }
  var padId = (choice === 'A') ? 'cp-A' : 'cp-B';
  var padX  = (choice === 'A') ? 8 : 24;
  room.members.get(username).pos = chipPos(padX, 4, state.chipSize);
  tick(state, 200, room);
  applyInput(state, username, { kind: 'record-choice', choicePadId: padId });
}

describe('V7.10 Gate actor -- createLevelState parsing', function () {
  beforeEach(function () { _clearCache(); });

  it('populates state.gates[] with id/x/y/label/predicate/opened fields', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.gates).toHaveLength(4);
    expect(state.gates[0]).toMatchObject({ id: 'g-scanner', x: 30, y: 3, predicate: 'every_player_row_complete', opened: false });
    expect(state.gates[1]).toMatchObject({ id: 'g-brand',   predicate: 'always_false', opened: false });
    expect(state.gates[2]).toMatchObject({ id: 'g-better',  predicate: 'always_false', opened: false });
    expect(state.gates[3]).toMatchObject({ id: 'g-data',    predicate: 'tally_nonzero', opened: false });
  });

  it('emits state.gates = [] for levels without Gate actors (backward compat)', function () {
    var def = makeGateLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'Gate'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.gates).toEqual([]);
  });

  it('unknown predicate string is preserved on the state (evaluator defaults to always_false)', function () {
    var def = makeGateLevel();
    def.actors.push({ type: 'Gate', id: 'g-unknown', x: 32, y: 6, label: '?', predicate: 'not_a_predicate' });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var unknown = state.gates.filter(function (g) { return g.id === 'g-unknown'; })[0];
    expect(unknown.predicate).toBe('not_a_predicate');
    expect(unknown.opened).toBe(false);
  });
});

describe('V7.10 Gate -- per-tick evaluator', function () {
  beforeEach(function () { _clearCache(); });

  it('always_false predicate never opens', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    for (var i = 0; i < 20; i++) tick(state, 200, room);
    var brand = state.gates.filter(function (g) { return g.id === 'g-brand'; })[0];
    expect(brand.opened).toBe(false);
  });

  it('every_player_row_complete opens only when ALL players done', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }, { username: 'bob' }]);
    var room = makeRoom({
      alice: chipPos(4, 4, state.chipSize),
      bob:   chipPos(4, 4, state.chipSize)
    });
    completeRow(state, room, 'alice', 'A');
    tick(state, 200, room);
    var scanner = state.gates.filter(function (g) { return g.id === 'g-scanner'; })[0];
    expect(scanner.opened).toBe(false);   // only alice done
    completeRow(state, room, 'bob', 'B');
    tick(state, 200, room);
    expect(scanner.opened).toBe(true);    // both done
  });

  it('tally_nonzero opens as soon as ANY sip recorded', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, state.chipSize) });
    tick(state, 200, room);
    var data = state.gates.filter(function (g) { return g.id === 'g-data'; })[0];
    expect(data.opened).toBe(false);
    applyInput(state, 'alice', { kind: 'collect', coinId: 's1' });
    tick(state, 200, room);
    expect(data.opened).toBe(true);
  });

  it('opened is ONE-WAY (never re-closes even if predicate flips false)', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, state.chipSize) });
    tick(state, 200, room);
    applyInput(state, 'alice', { kind: 'collect', coinId: 's1' });
    tick(state, 200, room);
    var data = state.gates.filter(function (g) { return g.id === 'g-data'; })[0];
    expect(data.opened).toBe(true);
    // Force-clear the tally (simulating an impossible state transition).
    state.tally.sips = { A: 0, B: 0 };
    state.coins.forEach(function (c) { c.collected = false; });
    tick(state, 200, room);
    expect(data.opened).toBe(true);   // opened stays true (one-way)
  });
});

describe('V7.10 Gate -- phase cascade short-circuit', function () {
  beforeEach(function () { _clearCache(); });

  it('SIPPING level WITH Gates does NOT auto-advance to VOTING when row complete', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    completeRow(state, room, 'alice', 'A');
    tick(state, 200, room);
    // Gate level: stay in SIPPING; gates evaluate but VOTING doesn't open.
    expect(state.phase).toBe(PHASE_SIPPING);
    expect(state.liveDoorwaysId).toBeNull();
  });

  it('SIPPING level WITHOUT Gates STILL advances to VOTING (backward compat)', function () {
    var def = makeGateLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'Gate'; });
    // Add a QuestionDoor so VOTING entry has something to vote on.
    def.actors.push({ type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: 'ok', correct: true });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    completeRow(state, room, 'alice', 'A');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
  });
});

describe('V7.10 Gate -- walk-through-gate input', function () {
  beforeEach(function () { _clearCache(); });

  it('walking through OPEN tally_nonzero gate transitions to KEY_HUNT', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, state.chipSize) });
    applyInput(state, 'alice', { kind: 'collect', coinId: 's1' });
    tick(state, 200, room);   // opens g-data
    // Now walk to g-data and fire walk-through-gate.
    room.members.get('alice').pos = chipPos(44, 4, state.chipSize);
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'walk-through-gate', gateId: 'g-data' });
    expect(result).not.toBeNull();
    expect(state.phase).toBe(PHASE_KEY_HUNT);
  });

  it('walk-through-gate on CLOSED gate is a no-op', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(44, 4, state.chipSize) });
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'walk-through-gate', gateId: 'g-data' });
    expect(result).toBeNull();
    expect(state.phase).toBe(PHASE_SIPPING);
  });

  it('walk-through-gate on NON-ADVANCE gate (row scanner) does NOT change phase', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    completeRow(state, room, 'alice', 'A');
    tick(state, 200, room);   // opens g-scanner
    room.members.get('alice').pos = chipPos(30, 4, state.chipSize);
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'walk-through-gate', gateId: 'g-scanner' });
    expect(result).toBeNull();
    expect(state.phase).toBe(PHASE_SIPPING);
  });

  it('walk-through-gate on unknown gateId is a no-op', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(44, 4, state.chipSize) });
    var result = applyInput(state, 'alice', { kind: 'walk-through-gate', gateId: 'nonexistent' });
    expect(result).toBeNull();
  });

  it('walk-through-gate with no Key actor goes directly to GOAL_AVAILABLE', function () {
    var def = makeGateLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'Key'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, state.chipSize) });
    applyInput(state, 'alice', { kind: 'collect', coinId: 's1' });
    tick(state, 200, room);
    room.members.get('alice').pos = chipPos(44, 4, state.chipSize);
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'walk-through-gate', gateId: 'g-data' });
    expect(result).not.toBeNull();
    expect(state.phase).toBe(PHASE_GOAL_AVAILABLE);
  });
});

describe('V7.10 Gate -- attempt-gate analytics', function () {
  beforeEach(function () { _clearCache(); });

  it('attempt-gate on CLOSED always_false gate bumps state.gates[i].attempts', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    applyInput(state, 'alice', { kind: 'attempt-gate', gateId: 'g-brand' });
    applyInput(state, 'alice', { kind: 'attempt-gate', gateId: 'g-brand' });
    var brand = state.gates.filter(function (g) { return g.id === 'g-brand'; })[0];
    expect(brand.attempts).toBe(2);
  });

  it('attempt-gate on OPEN gate is a no-op (already open is not a wrong attempt)', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, state.chipSize) });
    applyInput(state, 'alice', { kind: 'collect', coinId: 's1' });
    tick(state, 200, room);
    var data = state.gates.filter(function (g) { return g.id === 'g-data'; })[0];
    expect(data.opened).toBe(true);
    applyInput(state, 'alice', { kind: 'attempt-gate', gateId: 'g-data' });
    expect(data.attempts).toBe(0);
  });
});

describe('V7.10 Gate -- serialize wire shape', function () {
  beforeEach(function () { _clearCache(); });

  it('emits gates[] with id/x/y/label/predicate/opened', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.gates).toHaveLength(4);
    expect(wire.gates[0]).toEqual({ id: 'g-scanner', x: 30, y: 3, label: 'scanner', predicate: 'every_player_row_complete', opened: false });
  });

  it('emits gates = [] for legacy levels (backward compat)', function () {
    var def = makeGateLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'Gate'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.gates).toEqual([]);
  });

  it('does NOT serialize state.gates[i].attempts (server-only analytics)', function () {
    var def = makeGateLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    applyInput(state, 'alice', { kind: 'attempt-gate', gateId: 'g-brand' });
    var wire = serialize(state);
    var wireBrand = wire.gates.filter(function (g) { return g.id === 'g-brand'; })[0];
    expect(wireBrand.attempts).toBeUndefined();
  });
});
