// classroom.activity.level.test.js
// Unit tests for the V7.1 'level' activity plugin + classroom registry.
// Contract: LIVE_CLASSROOM_V7_1_BUILD.md sections C1, C2, C7 (Unit A).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createClassroomRegistry,
  __ACTIVITY_PLUGINS,
  __ACTIVITY_LESSON_MAP,
  __ACTIVITY_TICK_MS
} from '../classroom.js';
import { _clearCache } from '../level-engine.js';

// Stub ws object. readyState 1 == WebSocket.OPEN.
function makeWs() {
  return {
    readyState: 1,
    sent: [],
    send(msg) { this.sent.push(JSON.parse(msg)); }
  };
}

// Helper: seed one teacher + N students in a section. Returns the bag.
function seedRoom(registry, section, studentCount) {
  var teacherWs = makeWs();
  registry.join(teacherWs, section, 'teach', 'teacher', Date.now(), null);
  var students = [];
  for (var i = 0; i < studentCount; i++) {
    var sws = makeWs();
    var sname = 'student' + (i + 1);
    registry.join(sws, section, sname, 'student', Date.now(), null);
    students.push({ ws: sws, username: sname });
  }
  return { teacherWs: teacherWs, students: students };
}

// Helper: directly mutate a member's pos for an activity tick. V7.1
// chipSize is 10 so the U1.1 level pixel space is 320 px wide. Default
// canvasW=320 means rescaling is identity.
function setPos(registry, section, username, x, y, canvasW) {
  var room = registry._getRoom(section);
  if (!room) throw new Error('setPos: no room ' + section);
  var m = room.members.get(username);
  if (!m) throw new Error('setPos: no member ' + username);
  m.pos = { x: x, y: y, state: 'idle', vx: 0 };
  m.canvasW = (typeof canvasW === 'number') ? canvasW : 320;
}

// Chip-coord helper for U1.1 v7.1 (chipSize=10).
function chipCoord(c) { return c * 10; }

// Helper: collect all coins by warping students through each sip station.
function collectAllCoins(registry, section) {
  var room = registry._getRoom(section);
  // 4 sip stations at chip x = 4,12,20,28 at chip y = 2.
  var sipsChip = [[4, 2], [12, 2], [20, 2], [28, 2]];
  for (var i = 0; i < sipsChip.length; i++) {
    setPos(registry, section, 'student1', chipCoord(sipsChip[i][0]), chipCoord(sipsChip[i][1]));
    registry.activityTick(1000 + i * 200);
  }
}

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- registry resolution', () => {
  it('exposes the level plugin under activityPlugins["level"]', () => {
    expect(__ACTIVITY_PLUGINS).toBeDefined();
    expect(__ACTIVITY_PLUGINS['level']).toBeDefined();
  });

  it('level plugin exposes every method the engine calls', () => {
    var p = __ACTIVITY_PLUGINS['level'];
    expect(typeof p.minMembers).toBe('number');
    expect(typeof p.initActivity).toBe('function');
    expect(typeof p.onStudentInput).toBe('function');
    expect(typeof p.onTick).toBe('function');
    expect(typeof p.isComplete).toBe('function');
    expect(typeof p.serializeForBoard).toBe('function');
    expect(typeof p.onMemberLeave).toBe('function');
    expect(typeof p.onMemberJoin).toBe('function');
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- startActivity', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('startActivity("level", {levelKey:"U1.1"}) loads + starts in SIPPING phase', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    expect(result.broadcasts.length).toBeGreaterThanOrEqual(1);
    var startPayload = result.broadcasts[0].payload;
    expect(startPayload.type).toBe('classroom_activity_start');
    expect(startPayload.activity.type).toBe('level');
    expect(startPayload.activity.state.lessonKey).toBe('1.1');
    expect(startPayload.activity.state.levelKey).toBe('U1.1');
    expect(startPayload.activity.state.phase).toBe('SIPPING');
    expect(startPayload.activity.state.chipSize).toBe(10);
  });

  it('startActivity("level", {levelKey:"missing"}) -> level-missing error', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'missing' }, Date.now());
    expect(result.broadcasts.length).toBe(1);
    var err = result.broadcasts[0].payload;
    expect(err.type).toBe('classroom_activity_error');
    expect(err.code).toBe('level-missing');
    expect(err.activityType).toBe('level');
    var room = registry._getRoom('P1');
    expect(room.activity).toBeNull();
  });

  it('startActivity("level") without levelKey -> level-missing error', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', {}, Date.now());
    expect(result.broadcasts[0].payload.code).toBe('level-missing');
  });

  it('classroom_activity_start payload includes the full LevelDef under activity.level', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    var startPayload = result.broadcasts[0].payload;
    expect(startPayload.activity.level).toBeDefined();
    expect(startPayload.activity.level.schema).toBe('v7-level-1');
    expect(Array.isArray(startPayload.activity.level.actors)).toBe(true);
    expect(startPayload.activity.level.actors.length).toBeGreaterThanOrEqual(10);
  });

  it('classroom_activity_state from a tick excludes the LevelDef (state only)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    var tickRes = registry.activityTick(1200);
    var stateBc = tickRes.broadcasts.find(function (b) {
      return b.payload.type === 'classroom_activity_state';
    });
    expect(stateBc).toBeDefined();
    expect(stateBc.payload.state).toBeDefined();
    expect(stateBc.payload.level).toBeUndefined();
    expect(stateBc.payload.state.level).toBeUndefined();
    expect(stateBc.payload.state.lessonKey).toBe('1.1');
    expect(stateBc.payload.state.players).toBeDefined();
    expect(stateBc.payload.state.phase).toBe('SIPPING');
  });

  it('per-level duration from level.duration (180 s) overrides the engine default', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    expect(result.broadcasts[0].payload.activity.durationMs).toBe(180 * 1000);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- mutex with other modes', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('cannot start level while a bridge-mean activity is live', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var first  = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(first.broadcasts).toHaveLength(1);
    expect(first.broadcasts[0].payload.type).toBe('classroom_activity_start');
    var second = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    expect(second.broadcasts).toHaveLength(0);
  });

  it('cannot start level while a poll is open', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.openPoll(bag.teacherWs, 'Q?', ['a', 'b'], false, Date.now());
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('cannot start level while a gate is armed', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.armGate(bag.teacherWs, 'classic', Date.now());
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('rejects level when online students < 2 (minMembers)', () => {
    var bag = seedRoom(registry, 'P1', 1);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_activity_error');
    expect(result.broadcasts[0].payload.code).toBe('not-enough-members');
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- SIPPING -> VOTING wraps openDoorways', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('collecting all coins emits openDoorways via the activityTick wrapper', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    var room = registry._getRoom('P1');
    expect(room.doorways).toBeNull();
    // Walk student1 through all 4 sip stations, ticking each time.
    var sipsChip = [[4, 2], [12, 2], [20, 2], [28, 2]];
    for (var i = 0; i < sipsChip.length; i++) {
      setPos(registry, 'P1', 'student1', chipCoord(sipsChip[i][0]), chipCoord(sipsChip[i][1]));
      registry.activityTick(1100 + i * 200);
    }
    // VOTING transitioned and the server-driven openDoorways fired.
    expect(room.activity.state.phase).toBe('VOTING');
    expect(room.doorways).toBeTruthy();
    expect(room.doorways.id).toMatch(/^level-U1\.1-vote-/);
    expect(room.doorways.options.length).toBe(3);
  });

  it('opens with options matching the level def doorways (d1/d2/d3)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1');
    var room = registry._getRoom('P1');
    var doorIds = room.doorways.options.map(function (o) { return o.doorId; });
    expect(doorIds).toEqual(['d1', 'd2', 'd3']);
  });

  it('classroom_activity_state from the wrapping tick reflects phase=VOTING', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1');
    var lateTick = registry.activityTick(3000);
    var stateBc = lateTick.broadcasts.find(function (b) {
      return b.payload.type === 'classroom_activity_state';
    });
    expect(stateBc.payload.state.phase).toBe('VOTING');
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- closeDoorways feeds back to the engine', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('correct-door vote advances to GOAL_AVAILABLE on the next tick', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1');
    // Students vote: d2 is the correct door.
    var room = registry._getRoom('P1');
    var doorwaysId = room.doorways.id;
    registry.castDoorwayVote(bag.students[0].ws, doorwaysId, 'd2', 2000);
    registry.castDoorwayVote(bag.students[1].ws, doorwaysId, 'd2', 2001);
    registry.closeDoorways(bag.teacherWs, doorwaysId, 2010);
    // closedDoorways is stashed on the room; the next activityTick consumes it.
    expect(room.closedDoorways).toBeTruthy();
    registry.activityTick(2100);
    expect(room.activity.state.phase).toBe('GOAL_AVAILABLE');
    // The wrapper cleared room.closedDoorways after consumption.
    expect(room.closedDoorways).toBeNull();
  });

  it('wrong-door vote transitions to REFLECTION on the next tick', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1');
    var room = registry._getRoom('P1');
    var doorwaysId = room.doorways.id;
    // d1 is wrong.
    registry.castDoorwayVote(bag.students[0].ws, doorwaysId, 'd1', 2000);
    registry.castDoorwayVote(bag.students[1].ws, doorwaysId, 'd1', 2001);
    registry.closeDoorways(bag.teacherWs, doorwaysId, 2010);
    registry.activityTick(2100);
    expect(room.activity.state.phase).toBe('REFLECTION');
    expect(room.activity.state.reflection.active).toBe(true);
    expect(room.activity.state.reflection.doorId).toBe('d1');
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- override-gate routing', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('on level success, override-gate fires with lessonKey from the level def', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1');
    var room = registry._getRoom('P1');
    var doorwaysId = room.doorways.id;
    // Vote correct door.
    registry.castDoorwayVote(bag.students[0].ws, doorwaysId, 'd2', 2000);
    registry.closeDoorways(bag.teacherWs, doorwaysId, 2010);
    registry.activityTick(2100);
    // Now in GOAL_AVAILABLE. Walk student1 to Goal (chip 16, 7) on a 320 canvas.
    setPos(registry, 'P1', 'student1', chipCoord(16), chipCoord(7));
    var tickRes = registry.activityTick(2300);
    var successBc = tickRes.broadcasts.find(function (b) {
      return b.payload.type === 'classroom_activity_success';
    });
    expect(successBc).toBeDefined();
    expect(successBc.payload.activityType).toBe('level');
    expect(successBc.payload.finalState.lessonKey).toBe('1.1');
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- member lifecycle during live level', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('member leave during level removes player from level state', () => {
    var bag = seedRoom(registry, 'P1', 3);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    registry.activityTick(1200);
    var room = registry._getRoom('P1');
    expect(room.activity.state.players.student1).toBeDefined();
    registry.detach(bag.students[0].ws, 2000);
    registry.sweep(2000 + 50 * 60 * 1000);
    expect(room.activity.state.players.student1).toBeUndefined();
  });

  it('snapshot (buildStatePayload) carries the level state for late-joiners', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    var lateWs = makeWs();
    var joinRes = registry.join(lateWs, 'P1', 'newbie', 'student', Date.now(), null);
    var snap = joinRes.sends[0].payload;
    expect(snap.activity).toBeDefined();
    expect(snap.activity.type).toBe('level');
    expect(snap.activity.state.lessonKey).toBe('1.1');
    expect(snap.activity.state.phase).toBe('SIPPING');
    expect(snap.activity.state.players.newbie).toBeDefined();
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- serializeForBoard public shape', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('public state contains players/coins/doorways/goal/reflection/tally/phase', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var s = snap.activity.state;
    expect(s.players).toBeDefined();
    expect(s.coins).toBeDefined();
    expect(s.doorways).toBeDefined();
    expect(s.goal).toBeDefined();
    expect(s.reflection).toBeDefined();
    expect(s.tally).toBeDefined();
    expect(s.tally.sips).toBeDefined();
    expect(s.phase).toBe('SIPPING');
  });

  it('serialized state is JSON.stringify-safe (no Set instances leaked)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    setPos(registry, 'P1', 'student1', chipCoord(4), chipCoord(2));
    registry.activityTick(1200);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(function () { JSON.stringify(snap); }).not.toThrow();
  });

  it('public state has no internal sideEffects / liveDoorwaysId fields', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var s = snap.activity.state;
    expect(s.sideEffects).toBeUndefined();
    expect(s.liveDoorwaysId).toBeUndefined();
    expect(s._phaseEntry).toBeUndefined();
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level plugin -- monitor fanout', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('classroom_activity_start fans out to monitor sockets', () => {
    var monWs = makeWs();
    registry.subscribeMonitor(monWs);
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    expect(result.broadcasts[0].sockets.indexOf(monWs)).toBeGreaterThanOrEqual(0);
  });

  it('classroom_activity_state from a tick fans out to monitor sockets', () => {
    var monWs = makeWs();
    registry.subscribeMonitor(monWs);
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    var tickRes = registry.activityTick(1200);
    var stateBc = tickRes.broadcasts.find(function (b) {
      return b.payload.type === 'classroom_activity_state';
    });
    expect(stateBc.sockets.indexOf(monWs)).toBeGreaterThanOrEqual(0);
  });
});
