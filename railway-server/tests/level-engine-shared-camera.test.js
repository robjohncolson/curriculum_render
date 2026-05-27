// level-engine-shared-camera.test.js
// V7.15 unit tests: (1) shared camera state -- server tracks
// leftmost-student x, forward-only ratchet. (2) Teacher/spectator
// input gates -- 4 applyInput handlers reject non-state.players
// users (teachers + unknowns) cleanly.
//
// Contract: LIVE_CLASSROOM_V7_15_BUILD.md (revised in-flight: role
// denormalization dropped because state.players already filters
// to students-only via classroom.js startActivity).

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

function makeRoom(playerPositions, canvasW, roles) {
  var members = new Map();
  Object.keys(playerPositions).forEach(function (u) {
    members.set(u, {
      username: u,
      online:   true,
      role:     (roles && roles[u]) || 'student',
      canvasW:  (typeof canvasW === 'number') ? canvasW : 960,
      pos:      playerPositions[u]
    });
  });
  return { members: members, closedDoorways: null };
}

function chipPos(cx, cy, chipSize) {
  return { x: cx * chipSize, y: cy * chipSize, state: 'idle', vx: 0 };
}

function makeWideLevel() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.SC',
    lessonKey: 'TEST.SC',
    map: { width: 96, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'SipStation',  id: 's1', x: 4,  y: 2, drink: 'A' },
      { type: 'SipStation',  id: 's2', x: 24, y: 2, drink: 'B' },
      { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: 'ok', correct: true },
      { type: 'Goal', x: 47, y: 7 }
    ]
  };
}

describe('V7.15 shared camera -- createLevelState', function () {
  beforeEach(function () { _clearCache(); });

  it('populates state.camera with x=0 + viewportFloor=640', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.camera).toEqual({ x: 0, viewportFloor: 640 });
  });
});

describe('V7.15 shared camera -- per-tick leftmost-student tracking', function () {
  beforeEach(function () { _clearCache(); });

  it('camera.x follows leftmost student (forward-advance)', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }, { username: 'bob' }]);
    var room = makeRoom({
      alice: chipPos(20, 4, state.chipSize),
      bob:   chipPos(40, 4, state.chipSize)
    });
    tick(state, 200, room);
    // leftmost = alice at level x = 200. camTarget = max(0, 200 - 100) = 100.
    expect(state.camera.x).toBe(100);
  });

  it('FORWARD-only ratchet: camera does NOT retreat when leader steps back', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(40, 4, state.chipSize) });
    tick(state, 200, room);
    expect(state.camera.x).toBe(300);   // 400 - 100
    // Alice walks back.
    room.members.get('alice').pos = chipPos(10, 4, state.chipSize);
    tick(state, 200, room);
    expect(state.camera.x).toBe(300);   // unchanged (forward-only)
  });

  it('camera clamps to [0, levelW - viewportFloor]', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(95, 4, state.chipSize) });
    tick(state, 200, room);
    // levelW = 96 * 10 = 960. viewportFloor = 640. max = 320.
    // Target = max(0, min(320, 950 - 100)) = 320 (clamped).
    expect(state.camera.x).toBe(320);
  });

  it('TEACHER avatars do NOT pull camera (not in state.players)', function () {
    // V7.15: classroom.js filters online students only into createLevelState.
    // Teachers naturally absent from state.players -> camera ignores them.
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);   // student only
    var room = makeRoom({
      alice: chipPos(25, 4, state.chipSize),    // alice mid-level
      teach: chipPos(10, 4, state.chipSize)     // teacher far left
    }, 960, { teach: 'teacher' });
    tick(state, 200, room);
    // Camera follows alice (leftmost student), NOT teacher. If the camera
    // were tracking the teacher (level x=100), target would be 0. Tracking
    // alice (level x=250), target = max(0, 250 - 100) = 150 (under clamp 320).
    expect(state.camera.x).toBe(150);
  });

  it('OFFLINE student excluded from leftmost calc', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }, { username: 'bob' }]);
    var room = makeRoom({
      alice: chipPos(40, 4, state.chipSize),
      bob:   chipPos(10, 4, state.chipSize)
    });
    room.members.get('bob').online = false;
    tick(state, 200, room);
    // bob is offline -> ignored. Leftmost = alice at 400. cam = 300.
    expect(state.camera.x).toBe(300);
  });

  it('empty-student room -> camera stays at 0', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, []);   // no students
    var room = makeRoom({});
    tick(state, 200, room);
    expect(state.camera.x).toBe(0);
  });
});

describe('V7.15 serialize wire shape', function () {
  beforeEach(function () { _clearCache(); });

  it('emits state.camera with x + viewportFloor', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.camera).toEqual({ x: 0, viewportFloor: 640 });
  });
});

describe('V7.15 spectator gates -- 4 applyInput handlers reject non-players', function () {
  beforeEach(function () { _clearCache(); });

  it('_handleCoinCollect returns null for teacher (not in state.players)', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    // 'teach' is not in state.players.
    var result = applyInput(state, 'teach', { kind: 'collect', coinId: 's1' });
    expect(result).toBeNull();
    expect(state.coins[0].collected).toBe(false);
    expect(state.tally.sips.A).toBe(0);
  });

  it('_handleRecordChoice returns null for teacher', function () {
    var def = makeWideLevel();
    def.actors.push({ type: 'ChoicePad', id: 'cp-A', x: 8, y: 4, value: 'A' });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var result = applyInput(state, 'teach', { kind: 'record-choice', choicePadId: 'cp-A' });
    expect(result).toBeNull();
  });

  it('_handleWalkThroughGate returns null for teacher', function () {
    var def = makeWideLevel();
    def.actors.push({ type: 'Gate', id: 'g-data', x: 30, y: 6, label: 'data', predicate: 'tally_nonzero' });
    var state = createLevelState(def, [{ username: 'alice' }]);
    // Open the gate by faking a tally entry.
    state.tally.sips.A = 1;
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    tick(state, 200, room);   // gate opens via per-tick eval
    var result = applyInput(state, 'teach', { kind: 'walk-through-gate', gateId: 'g-data' });
    expect(result).toBeNull();
  });

  it('_handleAttemptGate returns null for teacher', function () {
    var def = makeWideLevel();
    def.actors.push({ type: 'Gate', id: 'g-brand', x: 30, y: 6, label: 'brand', predicate: 'always_false' });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var result = applyInput(state, 'teach', { kind: 'attempt-gate', gateId: 'g-brand' });
    expect(result).toBeNull();
    var gate = state.gates.filter(function (g) { return g.id === 'g-brand'; })[0];
    expect(gate.attempts || 0).toBe(0);
  });

  it('student (in state.players) still gates through normally', function () {
    var def = makeWideLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, state.chipSize) });
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'collect', coinId: 's1' });
    expect(result).not.toBeNull();
    expect(state.coins[0].collected).toBe(true);
  });
});
