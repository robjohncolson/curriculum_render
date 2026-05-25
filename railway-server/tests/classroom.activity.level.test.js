// classroom.activity.level.test.js
// Unit tests for the V7 'level' activity plugin integration with the
// classroom registry. Contract: LIVE_CLASSROOM_V7_BUILD.md C1, C9 (Unit A2).

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

// Helper: directly mutate a member's pos for an activity tick.
// 2026-05-25 V7 Codex BLOCKER 2 fold: also set m.canvasW so the level
// engine's per-canvasW rescaling makes the test's chip-pixel positions
// land at the right level coords. Defaults to 768 (U1.1's level width =
// mapWidth 32 * chipSize 24); pass an override for non-768 cases.
function setPos(registry, section, username, x, y, canvasW) {
  var room = registry._getRoom(section);
  if (!room) throw new Error('setPos: no room ' + section);
  var m = room.members.get(username);
  if (!m) throw new Error('setPos: no member ' + username);
  m.pos = { x: x, y: y, state: 'idle', vx: 0 };
  m.canvasW = (typeof canvasW === 'number') ? canvasW : 768;
}

// Chip-coord helper: returns CSS pixel coord for chip (cx, cy). U1.1's
// chipSize is 24.
function chipCoord(c) { return c * 24; }

describe('V7 level plugin -- registry resolution', () => {
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

describe('V7 level plugin -- startActivity', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('startActivity("level", {levelKey:"U1.1"}) loads the level and starts', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    expect(result.broadcasts.length).toBeGreaterThanOrEqual(1);
    var startPayload = result.broadcasts[0].payload;
    expect(startPayload.type).toBe('classroom_activity_start');
    expect(startPayload.activity.type).toBe('level');
    expect(startPayload.activity.state.lessonKey).toBe('1.1');
    expect(startPayload.activity.state.levelKey).toBe('U1.1');
  });

  it('startActivity("level", {levelKey:"missing"}) returns classroom_activity_error{code:"level-missing"}', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'missing' }, Date.now());
    expect(result.broadcasts.length).toBe(1);
    var err = result.broadcasts[0].payload;
    expect(err.type).toBe('classroom_activity_error');
    expect(err.code).toBe('level-missing');
    expect(err.activityType).toBe('level');
    // The room should NOT have any activity stamped (init failed).
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
    // 4 SipStations + 3 QuestionDoors + 1 PlayerSpawn + 1 Goal + 1 Text + 1 TallyDisplay = 11.
    expect(startPayload.activity.level.actors.length).toBeGreaterThanOrEqual(10);
  });

  it('classroom_activity_state payload (tick broadcast) excludes the LevelDef (state only)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    var tickRes = registry.activityTick(1200);
    expect(tickRes.broadcasts.length).toBeGreaterThanOrEqual(1);
    // Find the classroom_activity_state broadcast (not start).
    var stateBc = tickRes.broadcasts.find(function (b) {
      return b.payload.type === 'classroom_activity_state';
    });
    expect(stateBc).toBeDefined();
    expect(stateBc.payload.state).toBeDefined();
    expect(stateBc.payload.level).toBeUndefined();         // top-level
    expect(stateBc.payload.state.level).toBeUndefined();   // not nested either
    // The serialized state still carries the core fields.
    expect(stateBc.payload.state.lessonKey).toBe('1.1');
    expect(stateBc.payload.state.players).toBeDefined();
  });

  it('per-level duration from level.duration (180 s) overrides the engine default', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, Date.now());
    expect(result.broadcasts[0].payload.activity.durationMs).toBe(180 * 1000);
  });
});

describe('V7 level plugin -- mutex with other modes', () => {
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
    // Mutex rejection -> empty broadcasts.
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

describe('V7 level plugin -- override-gate routing', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('on level success, the override-gate fires with lessonKey from the level def', () => {
    var bag = seedRoom(registry, 'P1', 3);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    // alice walks onto d2 (correct door at chip (16,14)) -> opens gate.
    setPos(registry, 'P1', 'student1', chipCoord(16), chipCoord(14));
    setPos(registry, 'P1', 'student2', chipCoord(4),  chipCoord(12));
    setPos(registry, 'P1', 'student3', chipCoord(4),  chipCoord(12));
    registry.activityTick(1200);
    // alice walks onto Goal.
    setPos(registry, 'P1', 'student1', chipCoord(16), chipCoord(15));
    var tickRes = registry.activityTick(1400);
    var successBc = tickRes.broadcasts.find(function (b) {
      return b.payload.type === 'classroom_activity_success';
    });
    expect(successBc).toBeDefined();
    expect(successBc.payload.activityType).toBe('level');
    expect(successBc.payload.finalState.lessonKey).toBe('1.1');
  });
});

describe('V7 level plugin -- member lifecycle during live level', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('member leave during level removes player + cleans switch voters set', () => {
    var bag = seedRoom(registry, 'P1', 3);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    // alice presses d1 (wrong door).
    setPos(registry, 'P1', 'student1', chipCoord(6), chipCoord(14));
    registry.activityTick(1200);
    var room = registry._getRoom('P1');
    expect(room.activity.state.switches[0].voters.has('student1')).toBe(true);
    // Detach + GC alice.
    registry.detach(bag.students[0].ws, 2000);
    registry.sweep(2000 + 50 * 60 * 1000);  // > 45 min IDLE_GC_MS
    // Plugin's onMemberLeave should have cleaned the voters set.
    expect(room.activity.state.players.student1).toBeUndefined();
    expect(room.activity.state.switches[0].voters.has('student1')).toBe(false);
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
    // The plugin's onMemberJoin spawned newbie.
    expect(snap.activity.state.players.newbie).toBeDefined();
  });
});

describe('V7 level plugin -- serializeForBoard public shape', () => {
  var registry;
  beforeEach(() => {
    _clearCache();
    registry = createClassroomRegistry();
  });

  it('public state contains players/coins/switches/gates/goal/reflection/tally', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var s = snap.activity.state;
    expect(s.players).toBeDefined();
    expect(s.coins).toBeDefined();
    expect(s.switches).toBeDefined();
    expect(s.gates).toBeDefined();
    expect(s.goal).toBeDefined();
    expect(s.reflection).toBeDefined();
    expect(s.tally).toBeDefined();
    expect(s.tally.sips).toBeDefined();
  });

  it('serialized state is JSON.stringify-safe (no Set instances leaked)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    // Trigger a switch press to populate the voters set.
    setPos(registry, 'P1', 'student1', chipCoord(6), chipCoord(14));
    registry.activityTick(1200);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(function () { JSON.stringify(snap); }).not.toThrow();
  });
});

describe('V7 level plugin -- monitor fanout', () => {
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
