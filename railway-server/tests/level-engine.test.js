// level-engine.test.js
// Unit tests for the V7.1 Live Classroom level engine.
// Contract: LIVE_CLASSROOM_V7_1_BUILD.md sections C1, C2, C7 (Unit A).
//
// The V7.1 engine is a phase-based state machine:
//   INIT -> SIPPING -> VOTING -> {REFLECTION -> VOTING}* -> GOAL_AVAILABLE
//                                                                 -> LEVEL_CLEARED.
// SIPPING is coin collection (unchanged from V7). VOTING delegates to
// the existing v3 P4 doorways via sideEffects.openDoorways; the engine
// reads room.closedDoorways on each tick to advance.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLevel,
  createLevelState,
  applyInput,
  tick,
  isComplete,
  serialize,
  onMemberLeave,
  onMemberJoin,
  _clearCache,
  PHASE_SIPPING,
  PHASE_VOTING,
  PHASE_REFLECTION,
  PHASE_GOAL_AVAILABLE,
  PHASE_LEVEL_CLEARED,
  REFLECTION_DURATION_MS
} from '../level-engine.js';

// Stub room shape: only .members.get(u).pos / .canvasW + .closedDoorways
// is read by the engine. Helpers build the minimal shape.
function makeRoom(playerPositions, canvasW) {
  var members = new Map();
  Object.keys(playerPositions).forEach(function (u) {
    members.set(u, {
      username: u,
      online:   true,
      canvasW:  (typeof canvasW === 'number') ? canvasW : 320,
      pos:      playerPositions[u]
    });
  });
  return { members: members, closedDoorways: null };
}

// chipPos(cx, cy, chipSize) -> a pos object at chip coord (cx, cy).
function chipPos(cx, cy, chipSize) {
  return { x: cx * chipSize, y: cy * chipSize, state: 'idle', vx: 0 };
}

// Helper: full level setup with N students at the spawn coord.
function setupCola(studentNames) {
  _clearCache();
  var def = loadLevel('U1.1');
  var online = (studentNames || []).map(function (n) { return { username: n }; });
  var state  = createLevelState(def, online);
  return { def: def, state: state, chipSize: state.chipSize };
}

// Helper: simulate a doorways close event landing on the room. The
// engine reads this on its next tick during VOTING.
function landCloseDoorways(room, id, tally) {
  room.closedDoorways = {
    id:      id,
    tally:   tally
  };
}

// Helper: collect every coin to advance from SIPPING -> VOTING. Returns
// the openDoorways sideEffect the engine emits.
function advanceToVoting(state, room) {
  // Walk through every coin systematically. With U1.1 chipSize=10, the
  // 4 sip stations are at chip x=4,12,20,28 at chip y=2.
  var keys = Object.keys(state.players);
  for (var c = 0; c < state.coins.length; c++) {
    var coin = state.coins[c];
    var pos = chipPos(coin.x, coin.y, state.chipSize);
    room.members.get(keys[0]).pos = pos;
    tick(state, 200, room);
  }
  return state.sideEffects;
}

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- loadLevel', () => {
  beforeEach(() => { _clearCache(); });

  it('loadLevel("U1.1") returns a valid LevelDef with chipSize=10', () => {
    var def = loadLevel('U1.1');
    expect(def).toBeTruthy();
    expect(def.schema).toBe('v7-level-1');
    expect(def.levelKey).toBe('U1.1');
    expect(def.lessonKey).toBe('1.1');
    expect(def.map.chipSize).toBe(10);
  });

  it('loadLevel("missing") returns null', () => {
    expect(loadLevel('missing')).toBeNull();
  });

  it('loadLevel memoizes the parsed result', () => {
    var d1 = loadLevel('U1.1');
    var d2 = loadLevel('U1.1');
    expect(d1).toBe(d2);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- createLevelState initial shape', () => {
  it('starts in SIPPING phase with chipSize 10 and the expected shape', () => {
    var k = setupCola(['alice', 'bob']);
    expect(k.state.phase).toBe(PHASE_SIPPING);
    expect(k.state.chipSize).toBe(10);
    expect(k.state.mapWidth).toBe(32);
    expect(k.state.mapHeight).toBe(8);
    expect(k.state.liveDoorwaysId).toBeNull();
    expect(k.state.sideEffects).toBeNull();
  });

  it('spawns one Player per online student at the PlayerSpawn coord', () => {
    var k = setupCola(['alice', 'bob']);
    expect(Object.keys(k.state.players)).toEqual(['alice', 'bob']);
    // PlayerSpawn for U1.1 v7.1 is at chip (4, 4); chipSize 10 -> CSS (40, 40).
    expect(k.state.players.alice.x).toBe(4 * k.chipSize);
    expect(k.state.players.alice.y).toBe(4 * k.chipSize);
  });

  it('coins reflect the 4 SipStations (uncollected, drink tags A/A/B/B)', () => {
    var k = setupCola(['alice']);
    expect(k.state.coins.length).toBe(4);
    expect(k.state.coins.every(function (c) { return c.collected === false; })).toBe(true);
    expect(k.state.coins[0].drink).toBe('A');
    expect(k.state.coins[2].drink).toBe('B');
  });

  it('doorways reflect the 3 QuestionDoors with the correct .correct flags', () => {
    var k = setupCola(['alice']);
    expect(k.state.doorways.length).toBe(3);
    expect(k.state.doorways[0].id).toBe('d1');
    expect(k.state.doorways[0].correct).toBe(false);
    expect(k.state.doorways[1].id).toBe('d2');
    expect(k.state.doorways[1].correct).toBe(true);
    expect(k.state.doorways[2].id).toBe('d3');
    expect(k.state.doorways[2].correct).toBe(false);
  });

  it('initial goal is unreached at the level def coord', () => {
    var k = setupCola(['alice']);
    expect(k.state.goal.x).toBe(16);
    expect(k.state.goal.y).toBe(7);
    expect(k.state.goal.reached).toBe(false);
  });

  it('returns null on malformed level def', () => {
    expect(createLevelState(null, [])).toBeNull();
    expect(createLevelState({}, [])).toBeNull();
    expect(createLevelState({ actors: 'not-an-array' }, [])).toBeNull();
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- SIPPING phase', () => {
  it('collects a Coin via Player-actor overlap and increments tally.sips', () => {
    var k = setupCola(['alice', 'bob']);
    // s1 at chip (4, 2). chipSize=10 -> CSS (40, 20).
    var room = makeRoom({
      alice: chipPos(4, 2, k.chipSize),
      bob:   chipPos(4, 4, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.coins[0].collected).toBe(true);
    expect(k.state.tally.sips.A).toBe(1);
  });

  it('does NOT advance phase to VOTING until ALL coins collected', () => {
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(4, 2, k.chipSize),
      bob:   chipPos(4, 4, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_SIPPING);
    expect(k.state.sideEffects).toBeNull();
  });

  it('advances to VOTING and emits openDoorways sideEffect on last coin collected', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    var sideEffect = advanceToVoting(k.state, room);
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(sideEffect).toBeTruthy();
    expect(sideEffect.openDoorways).toBeTruthy();
    expect(sideEffect.openDoorways.id).toMatch(/^level-U1\.1-vote-/);
    expect(sideEffect.openDoorways.options.length).toBe(3);
    expect(sideEffect.openDoorways.options[0].doorId).toBe('d1');
    expect(sideEffect.openDoorways.options[1].doorId).toBe('d2');
    expect(k.state.liveDoorwaysId).toBe(sideEffect.openDoorways.id);
  });

  it('clears sideEffects on the very next tick after emission (one-shot)', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    expect(k.state.sideEffects).toBeTruthy();
    // Next tick: no closedDoorways yet, so we stay in VOTING with sideEffects null.
    tick(k.state, 200, room);
    expect(k.state.sideEffects).toBeNull();
    expect(k.state.phase).toBe(PHASE_VOTING);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- VOTING phase: doorway close consumption', () => {
  it('on CORRECT door winning, transitions to GOAL_AVAILABLE', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var liveId = k.state.liveDoorwaysId;
    // The class voted; the close lands on the room. d2 is the correct door.
    landCloseDoorways(room, liveId, [
      { doorId: 'd1', count: 0 },
      { doorId: 'd2', count: 3 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
    expect(k.state.liveDoorwaysId).toBeNull();
  });

  it('on WRONG door winning, transitions to REFLECTION with reflectionText', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var liveId = k.state.liveDoorwaysId;
    // d1 is wrong; carries reflectionText.
    landCloseDoorways(room, liveId, [
      { doorId: 'd1', count: 4 },
      { doorId: 'd2', count: 0 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_REFLECTION);
    expect(k.state.reflection.active).toBe(true);
    expect(k.state.reflection.doorId).toBe('d1');
    expect(k.state.reflection.reflectionText).toMatch(/Notice the data/);
    expect(k.state.reflection.autoCloseAt).toBeGreaterThan(0);
  });

  it('ignores a closedDoorways event whose id does not match liveDoorwaysId', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var liveId = k.state.liveDoorwaysId;
    landCloseDoorways(room, 'unrelated-id', [
      { doorId: 'd1', count: 9 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.liveDoorwaysId).toBe(liveId);  // unchanged
  });

  it('on empty tally (every count 0 / no votes), re-opens the doorways', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var firstId = k.state.liveDoorwaysId;
    landCloseDoorways(room, firstId, [
      { doorId: 'd1', count: 0 },
      { doorId: 'd2', count: 0 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.sideEffects).toBeTruthy();
    expect(k.state.sideEffects.openDoorways.id).not.toBe(firstId);
    expect(k.state.liveDoorwaysId).toBe(k.state.sideEffects.openDoorways.id);
  });

  it('ignores a closedDoorways event while not in VOTING (defensive)', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    // Still in SIPPING; a stray close shouldn't change anything.
    landCloseDoorways(room, 'foo', []);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_SIPPING);
  });

  it('VOTING phase is idempotent across ticks while waiting for close', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var liveId = k.state.liveDoorwaysId;
    for (var t = 0; t < 5; t++) {
      tick(k.state, 200, room);
    }
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.liveDoorwaysId).toBe(liveId);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- REFLECTION phase: auto-clear + re-vote', () => {
  it('returns to VOTING and emits a NEW openDoorways sideEffect after autoCloseAt', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var firstId = k.state.liveDoorwaysId;
    landCloseDoorways(room, firstId, [
      { doorId: 'd1', count: 5 },
      { doorId: 'd2', count: 0 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_REFLECTION);
    // Force the auto-close threshold to elapse.
    k.state.reflection.autoCloseAt = Date.now() - 1;
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.reflection.active).toBe(false);
    expect(k.state.reflection.doorId).toBeNull();
    expect(k.state.reflection.reflectionText).toBe('');
    expect(k.state.sideEffects).toBeTruthy();
    expect(k.state.sideEffects.openDoorways.id).not.toBe(firstId);
    expect(k.state.liveDoorwaysId).toBe(k.state.sideEffects.openDoorways.id);
  });

  it('REFLECTION holds across ticks until autoCloseAt elapses', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    landCloseDoorways(room, k.state.liveDoorwaysId, [
      { doorId: 'd1', count: 5 },
      { doorId: 'd2', count: 0 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    // autoCloseAt is ~8 s in the future. Multiple ticks while not yet elapsed.
    tick(k.state, 200, room);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_REFLECTION);
  });

  it('REFLECTION_DURATION_MS is the V7 8-second constant (preserved in V7.1)', () => {
    expect(REFLECTION_DURATION_MS).toBe(8000);
  });

  it('subsequent CORRECT vote after REFLECTION advances to GOAL_AVAILABLE', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    landCloseDoorways(room, k.state.liveDoorwaysId, [
      { doorId: 'd1', count: 3 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_REFLECTION);
    k.state.reflection.autoCloseAt = Date.now() - 1;
    tick(k.state, 200, room);
    // Now in VOTING with a re-opened doorways.
    expect(k.state.phase).toBe(PHASE_VOTING);
    var reopenId = k.state.liveDoorwaysId;
    landCloseDoorways(room, reopenId, [
      { doorId: 'd2', count: 4 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- GOAL_AVAILABLE + LEVEL_CLEARED', () => {
  it('Player overlapping Goal in GOAL_AVAILABLE transitions to LEVEL_CLEARED', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    landCloseDoorways(room, k.state.liveDoorwaysId, [
      { doorId: 'd2', count: 3 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
    // Walk alice to Goal (chip 16, 7) on a 320-wide canvas: x=160, y=70.
    room.members.get('alice').pos = chipPos(16, 7, k.chipSize);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_LEVEL_CLEARED);
    expect(k.state.goal.reached).toBe(true);
    expect(k.state.goal.reachedBy).toBe('alice');
    expect(isComplete(k.state)).toBe(true);
  });

  it('LEVEL_CLEARED is terminal across additional ticks (idempotent)', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    landCloseDoorways(room, k.state.liveDoorwaysId, [{ doorId: 'd2', count: 1 }]);
    tick(k.state, 200, room);
    room.members.get('alice').pos = chipPos(16, 7, k.chipSize);
    tick(k.state, 200, room);
    tick(k.state, 200, room);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_LEVEL_CLEARED);
    expect(isComplete(k.state)).toBe(true);
  });

  it('GOAL_AVAILABLE does NOT advance without Player-Goal overlap', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    landCloseDoorways(room, k.state.liveDoorwaysId, [{ doorId: 'd2', count: 1 }]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
    tick(k.state, 200, room);  // alice still at spawn
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
    expect(k.state.goal.reached).toBe(false);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- isComplete', () => {
  it('returns false for null / empty state', () => {
    expect(isComplete(null)).toBe(false);
    expect(isComplete({})).toBe(false);
    expect(isComplete({ phase: PHASE_SIPPING })).toBe(false);
    expect(isComplete({ phase: PHASE_GOAL_AVAILABLE })).toBe(false);
  });

  it('returns true ONLY when phase === LEVEL_CLEARED', () => {
    expect(isComplete({ phase: PHASE_LEVEL_CLEARED })).toBe(true);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- serialize wire shape', () => {
  it('includes phase + mapWidth + mapHeight + chipSize + doorways shape', () => {
    var k = setupCola(['alice']);
    var wire = serialize(k.state);
    expect(wire.phase).toBe(PHASE_SIPPING);
    expect(wire.mapWidth).toBe(32);
    expect(wire.mapHeight).toBe(8);
    expect(wire.chipSize).toBe(10);
    expect(Array.isArray(wire.doorways)).toBe(true);
    expect(wire.doorways[0].id).toBe('d1');
    expect(wire.doorways[1].correct).toBe(true);
  });

  it('serialized state is JSON.stringify-safe', () => {
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(4, 2, k.chipSize),
      bob:   chipPos(4, 4, k.chipSize)
    });
    tick(k.state, 200, room);
    var wire = serialize(k.state);
    expect(function () { JSON.stringify(wire); }).not.toThrow();
  });

  it('strips internal Sets / sideEffects (wire-only fields)', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    expect(k.state.sideEffects).toBeTruthy();   // internal
    var wire = serialize(k.state);
    expect(wire.sideEffects).toBeUndefined();   // wire excludes
    expect(wire._phaseEntry).toBeUndefined();
    expect(wire.liveDoorwaysId).toBeUndefined();
    expect(wire._voteQuestion).toBeUndefined();
  });

  it('public player shape excludes _canvasW', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    tick(k.state, 200, room);  // populates _canvasW
    var wire = serialize(k.state);
    expect(wire.players.alice.x).toBeDefined();
    expect(wire.players.alice.y).toBeDefined();
    expect(wire.players.alice._canvasW).toBeUndefined();
  });

  it('serialize(null) returns null', () => {
    expect(serialize(null)).toBeNull();
  });

  it('reflection wire shape includes active + doorId + reflectionText', () => {
    var k = setupCola(['alice']);
    var wire = serialize(k.state);
    expect(wire.reflection.active).toBe(false);
    expect(wire.reflection.doorId).toBeNull();
    expect(wire.reflection.reflectionText).toBe('');
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- onMemberLeave / onMemberJoin', () => {
  it('onMemberLeave removes the leaver from state.players', () => {
    var k = setupCola(['alice', 'bob']);
    onMemberLeave(k.state, 'bob');
    expect(k.state.players.bob).toBeUndefined();
    expect(k.state.players.alice).toBeDefined();
  });

  it('onMemberLeave is a no-op for an unknown username', () => {
    var k = setupCola(['alice']);
    expect(onMemberLeave(k.state, 'ghost')).toBeNull();
  });

  it('onMemberJoin spawns a new Player at the spawn coord', () => {
    var k = setupCola(['alice']);
    onMemberJoin(k.state, 'carol', null);
    expect(k.state.players.carol).toBeDefined();
    expect(k.state.players.carol.x).toBe(4 * k.chipSize);
    expect(k.state.players.carol.y).toBe(4 * k.chipSize);
  });

  it('onMemberJoin re-join of known user is a no-op (preserves progress)', () => {
    var k = setupCola(['alice']);
    k.state.players.alice.x = 999;
    expect(onMemberJoin(k.state, 'alice', null)).toBeNull();
    expect(k.state.players.alice.x).toBe(999);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- applyInput + tick edge cases', () => {
  it('applyInput always returns null (no per-input channel in V7.1)', () => {
    var k = setupCola(['alice']);
    expect(applyInput(k.state, 'alice', { delta: 1 })).toBeNull();
    expect(applyInput(k.state, 'alice', null)).toBeNull();
  });

  it('tick(null) is a no-op (returns the input)', () => {
    expect(tick(null, 200, {})).toBeNull();
  });

  it('tick reads positions from room.members.get(u).pos each call', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    tick(k.state, 200, room);
    expect(k.state.players.alice.x).toBe(4 * k.chipSize);
    room.members.get('alice').pos = chipPos(4, 2, k.chipSize);
    tick(k.state, 200, room);
    expect(k.state.players.alice.y).toBe(2 * k.chipSize);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- overlap math: chipSize=10, 320 CSS px wide', () => {
  it('overlap is detected within 16 px of actor chip coord * chipSize', () => {
    var k = setupCola(['alice']);
    // s1 at chip (4, 2) -> CSS (40, 20). 15 px offset -> still overlaps.
    var room = makeRoom({
      alice: { x: 40 + 15, y: 20 + 15, state: 'idle', vx: 0 }
    });
    tick(k.state, 200, room);
    expect(k.state.tally.sips.A).toBe(1);
  });

  it('overlap does NOT trigger beyond 16 px', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({
      alice: { x: 40 + 17, y: 20 + 17, state: 'idle', vx: 0 }
    });
    tick(k.state, 200, room);
    expect(k.state.coins[0].collected).toBe(false);
  });

  it('rescales sender canvasW=640 down to level 320 px space correctly', () => {
    var k = setupCola(['alice']);
    // Sender on 640-wide canvas at x=80 -> rescaled to level 40 px = chip 4.
    var room = makeRoom({
      alice: { x: 80, y: 20, state: 'idle', vx: 0 }
    }, 640);
    tick(k.state, 200, room);
    expect(k.state.coins[0].collected).toBe(true);
  });
});
