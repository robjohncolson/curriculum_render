// level-engine.test.js
// Unit tests for the V7 Live Classroom level engine.
// Contract: LIVE_CLASSROOM_V7_BUILD.md sections C2, C3, C8, C9 (Unit A).
// All tests stub the room.members Map so the engine reads positions
// directly without the registry layer.

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
  _clearCache
} from '../level-engine.js';

// Stub room shape: only the .members.get(username).pos / .canvasW path
// is read by the engine. Helper builds a Map keyed by username.
function makeRoom(playerPositions) {
  var members = new Map();
  Object.keys(playerPositions).forEach(function (u) {
    members.set(u, {
      username: u,
      online:   true,
      canvasW:  768,
      pos:      playerPositions[u]
    });
  });
  return { members: members };
}

// Helper: place player u at chip-grid coord (cx, cy) using the level's
// chipSize. Returns a pos shape suitable for makeRoom.
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

describe('V7 level-engine -- loadLevel', () => {
  beforeEach(() => { _clearCache(); });

  it('loadLevel("U1.1") returns a valid LevelDef', () => {
    var def = loadLevel('U1.1');
    expect(def).toBeTruthy();
    expect(def.schema).toBe('v7-level-1');
    expect(def.levelKey).toBe('U1.1');
    expect(def.lessonKey).toBe('1.1');
    expect(Array.isArray(def.actors)).toBe(true);
    expect(def.actors.length).toBeGreaterThan(0);
  });

  it('loadLevel("missing") returns null', () => {
    expect(loadLevel('missing')).toBeNull();
  });

  it('loadLevel memoizes the parsed result (same reference on repeat)', () => {
    var d1 = loadLevel('U1.1');
    var d2 = loadLevel('U1.1');
    expect(d1).toBe(d2);  // identity equality -- memoized
  });

  it('loadLevel returns null for non-string keys', () => {
    expect(loadLevel(null)).toBeNull();
    expect(loadLevel(undefined)).toBeNull();
    expect(loadLevel('')).toBeNull();
    expect(loadLevel(42)).toBeNull();
  });
});

describe('V7 level-engine -- createLevelState spawn placement', () => {
  it('spawns one Player per online student at the first PlayerSpawn coord', () => {
    var k = setupCola(['alice', 'bob']);
    expect(Object.keys(k.state.players)).toEqual(['alice', 'bob']);
    // U1.1 PlayerSpawn is at chip (4, 12); chipSize 24 => CSS (96, 288).
    expect(k.state.players.alice.x).toBe(4 * k.chipSize);
    expect(k.state.players.alice.y).toBe(12 * k.chipSize);
    expect(k.state.players.bob.x).toBe(4 * k.chipSize);
    expect(k.state.players.bob.y).toBe(12 * k.chipSize);
    // Default flags.
    expect(k.state.players.alice.inReflection).toBe(false);
    expect(k.state.players.alice.vx).toBe(0);
    expect(k.state.players.alice.vy).toBe(0);
  });

  it('initial coins / switches / gates / goal reflect the level def', () => {
    var k = setupCola(['alice', 'bob']);
    // 4 SipStations in U1.1.
    expect(k.state.coins.length).toBe(4);
    expect(k.state.coins.every(function (c) { return c.collected === false; })).toBe(true);
    // 3 QuestionDoors -> 3 switches + 3 gates.
    expect(k.state.switches.length).toBe(3);
    expect(k.state.gates.length).toBe(3);
    expect(k.state.gates[1].correct).toBe(true);   // d2 is the correct door
    expect(k.state.gates[0].correct).toBe(false);
    expect(k.state.gates[2].correct).toBe(false);
    // 1 Goal.
    expect(k.state.goal.x).toBe(16);
    expect(k.state.goal.reached).toBe(false);
  });

  it('initial tally has zero sips for A and B, no votes', () => {
    var k = setupCola(['alice', 'bob']);
    expect(k.state.tally.sips.A).toBe(0);
    expect(k.state.tally.sips.B).toBe(0);
    expect(Object.keys(k.state.tally.votes).length).toBe(0);
  });

  it('returns null on malformed level def', () => {
    expect(createLevelState(null, [])).toBeNull();
    expect(createLevelState({}, [])).toBeNull();
    expect(createLevelState({ actors: 'not-an-array' }, [])).toBeNull();
  });
});

describe('V7 level-engine -- tick: coin (SipStation) collection', () => {
  it('detects Player-Coin overlap and increments tally.sips', () => {
    var k = setupCola(['alice', 'bob']);
    // U1.1 s1 at chip (6,6) with drink A.
    var room = makeRoom({
      alice: chipPos(6, 6, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.coins[0].collected).toBe(true);
    expect(k.state.tally.sips.A).toBe(1);
    expect(k.state.tally.sips.B).toBe(0);
  });

  it('does NOT double-count a Coin already collected', () => {
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(6, 6, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    tick(k.state, 200, room);
    tick(k.state, 200, room);
    expect(k.state.tally.sips.A).toBe(1);
  });

  it('tallies multiple coins of the same drink correctly', () => {
    var k = setupCola(['alice', 'bob']);
    // s1 = A at (6,6), s2 = A at (12,6), s3 = B at (18,6).
    var room = makeRoom({
      alice: chipPos(6, 6, k.chipSize),
      bob:   chipPos(18, 6, k.chipSize)
    });
    tick(k.state, 200, room);
    // Move alice to s2.
    room.members.get('alice').pos = chipPos(12, 6, k.chipSize);
    tick(k.state, 200, room);
    expect(k.state.tally.sips.A).toBe(2);
    expect(k.state.tally.sips.B).toBe(1);
  });
});

describe('V7 level-engine -- tick: switch press', () => {
  it('records a Switch press only for usernames not in voters set', () => {
    var k = setupCola(['alice', 'bob']);
    // d1 is at chip (6, 14). Walk alice onto it.
    var room = makeRoom({
      alice: chipPos(6, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.switches[0].voteCount).toBe(1);
    expect(k.state.switches[0].voters.has('alice')).toBe(true);
    // Re-tick with alice still on the switch -- voteCount must NOT
    // increment (her vote was already recorded).
    tick(k.state, 200, room);
    expect(k.state.switches[0].voteCount).toBe(1);
  });

  it('opens a Gate when voteCount >= ceil(onlineN / 3)', () => {
    // 3 students -- threshold ceil(3/3) = 1.
    var k = setupCola(['alice', 'bob', 'carol']);
    // alice walks onto d2 (the correct door at chip (16,14)).
    var room = makeRoom({
      alice: chipPos(16, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize),
      carol: chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.switches[1].pressed).toBe(true);
    expect(k.state.gates[1].opened).toBe(true);
  });

  it('does NOT open a Gate below threshold', () => {
    // 6 students -- threshold ceil(6/3) = 2.
    var students = ['a', 'b', 'c', 'd', 'e', 'f'];
    var k = setupCola(students);
    // Only one student walks to d2.
    var posMap = {};
    students.forEach(function (s) { posMap[s] = chipPos(4, 12, k.chipSize); });
    posMap.a = chipPos(16, 14, k.chipSize);
    var room = makeRoom(posMap);
    tick(k.state, 200, room);
    expect(k.state.switches[1].voteCount).toBe(1);
    expect(k.state.switches[1].pressed).toBe(false);
    expect(k.state.gates[1].opened).toBe(false);
  });
});

describe('V7 level-engine -- tick: wrong-door reflection room', () => {
  it('triggers Reflection room when a Player passes a wrong-door opened Gate', () => {
    var k = setupCola(['alice', 'bob']);
    // d1 is wrong; walking onto it both presses the switch AND triggers
    // gate-pass detection (same tick).
    var room = makeRoom({
      alice: chipPos(6, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.reflection.active).toBe(true);
    expect(k.state.reflection.doorId).toBe('d1');
    // All players warped to reflection.
    expect(k.state.players.alice.inReflection).toBe(true);
    expect(k.state.players.bob.inReflection).toBe(true);
  });

  it('clears Reflection after autoCloseAt elapses + resets wrong-door switch (V7 BLOCKER 3 fold)', () => {
    // V7 Codex BLOCKER 3 fold: reflection clears on TIME (not on walk-back).
    // Physical walk-back to a ReturnWarp wasn't durable -- hidden classroom-
    // board kept broadcasting positions that overwrote the warp. v7 ships
    // a time-based auto-clear (REFLECTION_DURATION_MS = 8000); v7.1 may
    // revisit movement authority for a true walk-back.
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(6, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);  // triggers reflection on d1
    expect(k.state.reflection.active).toBe(true);
    expect(k.state.reflection.autoCloseAt).toBeGreaterThan(0);
    // Force the auto-close threshold to elapse by rewinding the timestamp.
    k.state.reflection.autoCloseAt = Date.now() - 1;
    tick(k.state, 200, room);
    expect(k.state.reflection.active).toBe(false);
    expect(k.state.reflection.doorId).toBeNull();
    // d1 switch reset.
    expect(k.state.switches[0].voteCount).toBe(0);
    expect(k.state.switches[0].pressed).toBe(false);
    expect(k.state.switches[0].voters.has('alice')).toBe(false);
    // d1 gate is closed again.
    expect(k.state.gates[0].opened).toBe(false);
    // Players inReflection flag cleared (positions stay where the live
    // classroom-board has them -- no physical warp in v7).
    expect(k.state.players.alice.inReflection).toBe(false);
  });

  it('isComplete is false while reflection is active', () => {
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(6, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(isComplete(k.state)).toBe(false);
  });
});

describe('V7 level-engine -- tick: goal reach + completion', () => {
  it('does NOT mark goal.reached until at least one correct gate is opened', () => {
    var k = setupCola(['alice', 'bob']);
    // Walk alice onto Goal (chip 16, 15) WITHOUT opening any door.
    var room = makeRoom({
      alice: chipPos(16, 15, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.goal.reached).toBe(false);
  });

  it('triggers Goal reach + isComplete when correct gate is opened AND Player overlaps Goal', () => {
    var k = setupCola(['alice', 'bob']);
    // alice presses d2 (correct door at 16,14). Gate opens.
    var room = makeRoom({
      alice: chipPos(16, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.gates[1].opened).toBe(true);
    // alice walks past gate to Goal.
    room.members.get('alice').pos = chipPos(16, 15, k.chipSize);
    tick(k.state, 200, room);
    expect(k.state.goal.reached).toBe(true);
    expect(k.state.goal.reachedBy).toBe('alice');
    expect(isComplete(k.state)).toBe(true);
  });
});

describe('V7 level-engine -- isComplete', () => {
  it('returns false when state is null / no goal', () => {
    expect(isComplete(null)).toBe(false);
    expect(isComplete({})).toBe(false);
    expect(isComplete({ goal: { reached: false } })).toBe(false);
  });

  it('returns true only when goal.reached === true', () => {
    expect(isComplete({ goal: { reached: true }, reflection: { active: false } })).toBe(true);
    expect(isComplete({ goal: { reached: false }, reflection: { active: false } })).toBe(false);
  });

  it('returns false if reflection is active even with goal.reached', () => {
    expect(isComplete({ goal: { reached: true }, reflection: { active: true } })).toBe(false);
  });
});

describe('V7 level-engine -- serialize wire shape', () => {
  it('strips internal Sets from voters (returns voterUsernames array)', () => {
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(16, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    var wire = serialize(k.state);
    expect(wire.switches[1].voterUsernames).toEqual(['alice']);
    // The wire shape MUST be JSON.stringify-safe (Sets cannot be).
    expect(function () { JSON.stringify(wire); }).not.toThrow();
  });

  it('returns null on null input', () => {
    expect(serialize(null)).toBeNull();
  });

  it('public-safe player shape excludes vx/vy/lastInteracted', () => {
    var k = setupCola(['alice']);
    var wire = serialize(k.state);
    var alice = wire.players.alice;
    expect(alice.x).toBeDefined();
    expect(alice.y).toBeDefined();
    expect(alice.inReflection).toBe(false);
    expect(alice.vx).toBeUndefined();
    expect(alice.vy).toBeUndefined();
    expect(alice.lastInteracted).toBeUndefined();
  });

  it('reflection wire shape includes returnedCount + totalCount', () => {
    var k = setupCola(['alice', 'bob', 'carol']);
    var wire = serialize(k.state);
    expect(wire.reflection.active).toBe(false);
    expect(wire.reflection.returnedCount).toBe(0);
    expect(wire.reflection.totalCount).toBe(3);
  });
});

describe('V7 level-engine -- onMemberLeave', () => {
  it('removes leaver from state.players', () => {
    var k = setupCola(['alice', 'bob']);
    onMemberLeave(k.state, 'bob');
    expect(k.state.players.bob).toBeUndefined();
    expect(k.state.players.alice).toBeDefined();
  });

  it('removes leaver from any switch.voters and recomputes voteCount', () => {
    var k = setupCola(['alice', 'bob', 'carol']);
    // alice presses d2. voteCount becomes 1 / threshold ceil(3/3)=1 -> opened.
    var room = makeRoom({
      alice: chipPos(16, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize),
      carol: chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.switches[1].voters.has('alice')).toBe(true);
    onMemberLeave(k.state, 'alice');
    expect(k.state.switches[1].voters.has('alice')).toBe(false);
    expect(k.state.switches[1].voteCount).toBe(0);
  });

  it('returns null when username is not in players (no-op)', () => {
    var k = setupCola(['alice']);
    expect(onMemberLeave(k.state, 'ghost')).toBeNull();
  });
});

describe('V7 level-engine -- onMemberJoin', () => {
  it('adds a new Player at the PlayerSpawn coord', () => {
    var k = setupCola(['alice']);
    onMemberJoin(k.state, 'carol', null);
    expect(k.state.players.carol).toBeDefined();
    expect(k.state.players.carol.x).toBe(4 * k.chipSize);
    expect(k.state.players.carol.y).toBe(12 * k.chipSize);
    expect(k.state.players.carol.inReflection).toBe(false);
  });

  it('re-join of a known username is a no-op (preserves prior progress)', () => {
    var k = setupCola(['alice']);
    // Move alice somewhere.
    k.state.players.alice.x = 999;
    expect(onMemberJoin(k.state, 'alice', null)).toBeNull();
    expect(k.state.players.alice.x).toBe(999);
  });

  it('a joiner during reflection inherits the inReflection flag', () => {
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(6, 14, k.chipSize),
      bob:   chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.reflection.active).toBe(true);
    onMemberJoin(k.state, 'carol', null);
    expect(k.state.players.carol.inReflection).toBe(true);
  });
});

describe('V7 level-engine -- applyInput', () => {
  it('returns null (V7 has no per-input message channel)', () => {
    var k = setupCola(['alice']);
    expect(applyInput(k.state, 'alice', { delta: 1 })).toBeNull();
    expect(applyInput(k.state, 'alice', null)).toBeNull();
  });
});

describe('V7 level-engine -- tick reads positions from room.members', () => {
  it('player coords stay current as room.members.get(u).pos is updated', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({
      alice: chipPos(4, 12, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.players.alice.x).toBe(4 * k.chipSize);
    // Walk alice to s1.
    room.members.get('alice').pos = chipPos(6, 6, k.chipSize);
    tick(k.state, 200, room);
    expect(k.state.players.alice.x).toBe(6 * k.chipSize);
    expect(k.state.players.alice.y).toBe(6 * k.chipSize);
  });

  it('tick is a no-op when state is null', () => {
    expect(tick(null, 200, {})).toBeNull();
  });
});

describe('V7 level-engine -- overlap math uses CSS pixels + 16 px radius', () => {
  it('overlap is detected within 16 px of actor chip coord * chipSize', () => {
    var k = setupCola(['alice']);
    // s1 is at chip (6,6); chipSize 24 -> CSS (144, 144). 16 px in either
    // direction should still count.
    var room = makeRoom({
      alice: { x: 144 + 15, y: 144 + 15, state: 'idle', vx: 0 }
    });
    tick(k.state, 200, room);
    expect(k.state.tally.sips.A).toBe(1);
  });

  it('overlap does NOT trigger beyond 16 px', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({
      alice: { x: 144 + 17, y: 144 + 17, state: 'idle', vx: 0 }
    });
    tick(k.state, 200, room);
    expect(k.state.tally.sips.A).toBe(0);
    expect(k.state.coins[0].collected).toBe(false);
  });
});
