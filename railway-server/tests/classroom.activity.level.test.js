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
import { _clearCache, _injectLevelDef } from '../level-engine.js';

// V7.10: synthetic V7.5-shape Cola fixture. The actual U1.1.json has
// moved to V7.10 Gate shape (no stages[], Gates replace voting); this
// fixture preserves the V7.5 voting path the registry-level tests were
// written for. Injected via _injectLevelDef in beforeEach so
// loadLevel('U1.1') in registry.startActivity returns this synthetic def.
function _buildLegacyColaDef() {
  return {
    schema:    'v7-level-1',
    levelKey:  'U1.1',
    lessonKey: '1.1',
    duration:  180,
    map: { width: 32, height: 8, chipSize: 10 },
    actors: [
      { type: 'Text', x: 4, y: 0, text: 'Cola Mystery (synthetic V7.5 fixture)' },
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'SipStation',  id: 's1', x:  4, y: 2, drink: 'A', hidden: true },
      { type: 'SipStation',  id: 's2', x: 12, y: 2, drink: 'A', hidden: true },
      { type: 'SipStation',  id: 's3', x: 20, y: 2, drink: 'B', hidden: true },
      { type: 'SipStation',  id: 's4', x: 28, y: 2, drink: 'B', hidden: true },
      { type: 'TallyDisplay', x: 16, y: 4, binds: 'tally.sips' },
      { type: 'Goal', x: 16, y: 7 },
      { type: 'Key',  id: 'k1', x: 10, y: 4 }
    ],
    stages: [
      {
        questionText: 'Which question can data answer?',
        doorways: [
          { id: 'd1', x:  6, y: 6, text: 'Wrong A',  correct: false, reflection: 'Wrong d1' },
          { id: 'd2', x: 16, y: 6, text: 'Correct',  correct: true },
          { id: 'd3', x: 26, y: 6, text: 'Wrong B',  correct: false, reflection: 'Wrong d3' }
        ]
      },
      {
        questionText: 'Stage 1',
        doorways: [
          { id: 's1d1', x:  6, y: 6, text: 'A', correct: false, reflection: 'Wrong s1d1' },
          { id: 's1d2', x: 16, y: 6, text: 'B', correct: true },
          { id: 's1d3', x: 26, y: 6, text: 'C', correct: false, reflection: 'Wrong s1d3' }
        ]
      },
      {
        questionText: 'Stage 2',
        doorways: [
          { id: 's2d1', x:  6, y: 6, text: 'A', correct: false, reflection: 'Wrong s2d1' },
          { id: 's2d2', x: 16, y: 6, text: 'B', correct: false, reflection: 'Wrong s2d2' },
          { id: 's2d3', x: 26, y: 6, text: 'C', correct: true }
        ]
      },
      {
        questionText: 'Stage 3',
        doorways: [
          { id: 's3d1', x:  6, y: 6, text: 'A', correct: true },
          { id: 's3d2', x: 16, y: 6, text: 'B', correct: false, reflection: 'Wrong s3d2' },
          { id: 's3d3', x: 26, y: 6, text: 'C', correct: false, reflection: 'Wrong s3d3' }
        ]
      }
    ]
  };
}

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
//
// V7.9: default canvasW now derives from the active level's
// levelPxWidth (mapWidth * chipSize) so the server-side anti-cheat
// rescale becomes identity for both single-screen (32) and widened
// (48+) levels. Fall back to 320 if no activity is loaded yet.
// Callers can still pass an explicit canvasW to override.
function setPos(registry, section, username, x, y, canvasW) {
  var room = registry._getRoom(section);
  if (!room) throw new Error('setPos: no room ' + section);
  var m = room.members.get(username);
  if (!m) throw new Error('setPos: no member ' + username);
  m.pos = { x: x, y: y, state: 'idle', vx: 0 };
  if (typeof canvasW === 'number') {
    m.canvasW = canvasW;
  } else {
    var act = room.activity;
    if (act && act.state && act.state.mapWidth && act.state.chipSize) {
      m.canvasW = act.state.mapWidth * act.state.chipSize;
    } else {
      m.canvasW = 320;
    }
  }
}

// Chip-coord helper for U1.1 v7.1 (chipSize=10).
function chipCoord(c) { return c * 10; }

// Helper: drive student1 through all 4 hidden SipStations so the
// V7.5 legacy "all coins collected" cascade in _isSippingComplete
// flips and SIPPING -> VOTING transition fires.
//
// V7.10: the registry-level tests inject a synthetic V7.5-shape Cola
// fixture (4 hidden SipStations s1-s4 A/A/B/B, NO ChoicePads, NO
// Gates) so this helper drives the legacy voting path. The actual
// U1.1.json on disk now has V7.10 Gate shape; the V7.10-specific
// Gate tests live in level-engine-gate.test.js.
//
// V7.2 sprite-collide: tick alone no longer auto-collects -- the
// client must fire classroom_activity_value {kind:'collect',coinId}.
function collectAllCoins(registry, section, bag) {
  var sipsChip = [[4, 2], [12, 2], [20, 2], [28, 2]];   // s1..s4
  var sws = bag.students[0].ws;
  for (var i = 0; i < sipsChip.length; i++) {
    setPos(registry, section, 'student1', chipCoord(sipsChip[i][0]), chipCoord(sipsChip[i][1]));
    registry.activityTick(1000 + i * 200);
    registry.activityValue(sws, { kind: 'collect', coinId: 's' + (i + 1) });
  }
  // One more tick so the SIPPING -> VOTING transition fires.
  registry.activityTick(1000 + sipsChip.length * 200);
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
    _injectLevelDef('U1.1', _buildLegacyColaDef());
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
    _injectLevelDef('U1.1', _buildLegacyColaDef());
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
    _injectLevelDef('U1.1', _buildLegacyColaDef());
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
    _injectLevelDef('U1.1', _buildLegacyColaDef());
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
    _injectLevelDef('U1.1', _buildLegacyColaDef());
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
    _injectLevelDef('U1.1', _buildLegacyColaDef());
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
    _injectLevelDef('U1.1', _buildLegacyColaDef());
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
    _injectLevelDef('U1.1', _buildLegacyColaDef());
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
