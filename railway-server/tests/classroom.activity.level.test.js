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

// Helper: drive every student through both SipStations + a ChoicePad
// so the V7.8 ChoicePad cascade in _isSippingComplete flips and the
// SIPPING -> VOTING transition fires.
//
// V7.2 sprite-collide: tick alone no longer auto-collects -- the client
// must fire classroom_activity_value {kind:'collect',coinId}. Helper
// signature takes `bag` for the student WS references.
//
// V7.8 ChoicePad rewrite: U1.1's 4 hidden SipStations (s1-s4) collapsed
// to 2 visible SipStations (s1=A at chip 4, s2=B at chip 28) plus 2
// ChoicePads (cp-A at chip 8, cp-B at chip 24). Every student now needs
// to tease BOTH sips AND record a choice for the cascade to advance.
// The per-player coin-collect fix in V7.8 _handleCoinCollect lets every
// student set sampledA/sampledB even on a coin Alice already collected.
function collectAllCoins(registry, section, bag) {
  var sipsChip   = [[4, 2], [28, 2]];   // s1=A, s2=B
  var sipIds     = ['s1', 's2'];
  var t = 1000;
  for (var st = 0; st < bag.students.length; st++) {
    var u   = bag.students[st].username;
    var sws = bag.students[st].ws;
    for (var i = 0; i < sipsChip.length; i++) {
      setPos(registry, section, u, chipCoord(sipsChip[i][0]), chipCoord(sipsChip[i][1]));
      registry.activityTick(t); t += 200;
      registry.activityValue(sws, { kind: 'collect', coinId: sipIds[i] });
    }
    // V7.8: walk the student onto cp-A (default choice = A) + record-choice.
    setPos(registry, section, u, chipCoord(8), chipCoord(4));
    registry.activityTick(t); t += 200;
    registry.activityValue(sws, { kind: 'record-choice', choicePadId: 'cp-A' });
  }
  // One more tick so the SIPPING -> VOTING transition fires.
  registry.activityTick(t);
}

// V7.5 helper: full-level drive from SIPPING all the way to
// GOAL_AVAILABLE. Walks all 4 stages of U1.1, votes correctly each
// time (auto-close fires when all online students vote), collects
// the key. Caller passes `bag` so we know the student WS handles.
function advanceFullLevel(registry, section, bag) {
  collectAllCoins(registry, section, bag);
  // Drive through every voting stage. Each stage's openDoorways
  // includes the doorways for THAT stage in their original chip order:
  //   stage 0: d1, d2 (correct), d3
  //   stage 1: s1d1, s1d2 (correct), s1d3
  //   stage 2: s2d1, s2d2, s2d3 (correct)
  //   stage 3: s3d1 (correct), s3d2, s3d3
  var correctPerStage = ['d2', 's1d2', 's2d3', 's3d1'];
  for (var s = 0; s < correctPerStage.length; s++) {
    var room = registry._getRoom(section);
    if (!room || !room.doorways) break;   // out of stages
    var doorwaysId = room.doorways.id;
    var winnerDoorId = correctPerStage[s];
    // All online students vote for the winning door. Auto-close fires
    // on the second vote; the loop drains both students per stage.
    for (var st = 0; st < bag.students.length; st++) {
      registry.castDoorwayVote(bag.students[st].ws, doorwaysId, winnerDoorId, 2000 + s * 100 + st);
    }
    // Consume the close on the activity tick (advances to next stage,
    // KEY_HUNT, or GOAL_AVAILABLE depending on stage index).
    registry.activityTick(2050 + s * 100);
  }
  // U1.1 has a Key actor, so after the last stage we're in KEY_HUNT.
  // Walk student1 onto the key + fire collect-key.
  var roomAfter = registry._getRoom(section);
  if (roomAfter && roomAfter.activity && roomAfter.activity.state && roomAfter.activity.state.phase === 'KEY_HUNT') {
    var key = roomAfter.activity.state.key;
    if (key) {
      setPos(registry, section, 'student1', chipCoord(key.x), chipCoord(key.y));
      registry.activityTick(3000);
      registry.activityValue(bag.students[0].ws, { kind: 'collect-key' });
      registry.activityTick(3100);
    }
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
    // V7.5-C migrated 3 QuestionDoors out of actors[] (into stages[])
    // and added 1 Key actor. Net -2 -> floor is now 9.
    expect(startPayload.activity.level.actors.length).toBeGreaterThanOrEqual(9);
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
    // V7.2 sprite-collide: tick alone doesn't auto-collect; the client
    // must fire classroom_activity_value {kind:'collect',coinId}.
    collectAllCoins(registry, 'P1', bag);
    // VOTING transitioned and the server-driven openDoorways fired.
    expect(room.activity.state.phase).toBe('VOTING');
    expect(room.doorways).toBeTruthy();
    expect(room.doorways.id).toMatch(/^level-U1\.1-vote-/);
    expect(room.doorways.options.length).toBe(3);
  });

  it('opens with options matching the level def doorways (d1/d2/d3)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1', bag);
    var room = registry._getRoom('P1');
    var doorIds = room.doorways.options.map(function (o) { return o.doorId; });
    expect(doorIds).toEqual(['d1', 'd2', 'd3']);   // stage 0 doorways
  });

  it('classroom_activity_state from the wrapping tick reflects phase=VOTING', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1', bag);
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

  it('V7.5: correct-vote on stage 0 advances currentStage; full-level drive ends in GOAL_AVAILABLE', () => {
    // V7.5: U1.1 is multi-stage now. Single correct vote advances to
    // stage 1 (still VOTING). Use advanceFullLevel to drive all 4
    // stages + collect the key + reach GOAL_AVAILABLE.
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    advanceFullLevel(registry, 'P1', bag);
    var room = registry._getRoom('P1');
    expect(room.activity.state.phase).toBe('GOAL_AVAILABLE');
    expect(room.activity.state.key.collected).toBe(true);
  });

  it('V7.5 auto-close: 2nd student vote triggers close even without teacher click', () => {
    // V7.5 castDoorwayVote auto-closes when all online students have
    // voted. Verifies closedDoorways is populated WITHOUT calling
    // registry.closeDoorways (teacher path).
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1', bag);
    var room = registry._getRoom('P1');
    var doorwaysId = room.doorways.id;
    registry.castDoorwayVote(bag.students[0].ws, doorwaysId, 'd2', 2000);
    // After 1 of 2 votes: doorways still open, closedDoorways unset
    // (toBeFalsy covers both `null` and `undefined` since the room is
    // initialized without the field; it only gets set on close).
    expect(room.doorways).toBeTruthy();
    expect(room.closedDoorways).toBeFalsy();
    registry.castDoorwayVote(bag.students[1].ws, doorwaysId, 'd2', 2001);
    // After 2 of 2 votes: auto-close fires.
    expect(room.doorways).toBeNull();
    expect(room.closedDoorways).toBeTruthy();
    expect(room.closedDoorways.id).toBe(doorwaysId);
  });

  it('wrong-door vote transitions to REFLECTION on the next tick', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'level', { levelKey: 'U1.1' }, 1000);
    collectAllCoins(registry, 'P1', bag);
    var room = registry._getRoom('P1');
    var doorwaysId = room.doorways.id;
    // d1 is wrong on stage 0. Auto-close fires after vote #2; manual
    // closeDoorways call is no longer needed (kept off to exercise the
    // auto-close path).
    registry.castDoorwayVote(bag.students[0].ws, doorwaysId, 'd1', 2000);
    registry.castDoorwayVote(bag.students[1].ws, doorwaysId, 'd1', 2001);
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
    // V7.5: drive all 4 voting stages + collect the key + reach
    // GOAL_AVAILABLE in one helper call.
    advanceFullLevel(registry, 'P1', bag);
    var room = registry._getRoom('P1');
    expect(room.activity.state.phase).toBe('GOAL_AVAILABLE');
    // Walk student1 to Goal (chip 16, 7) on a 320 canvas + fire
    // client-driven reach-goal.
    setPos(registry, 'P1', 'student1', chipCoord(16), chipCoord(7));
    registry.activityTick(3300);
    registry.activityValue(bag.students[0].ws, { kind: 'reach-goal' });
    var tickRes = registry.activityTick(3400);
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
