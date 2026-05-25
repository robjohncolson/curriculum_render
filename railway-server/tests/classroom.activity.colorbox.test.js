// classroom.activity.colorbox.test.js
// Unit tests for the v5 Live Classroom Activity colorbox-hue plugin.
// See LIVE_CLASSROOM_V5_BUILD.md sections C2 + C7-Unit-A for the
// contract. All tests use stub ws objects -- no real sockets, no HTTP.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createClassroomRegistry,
  __ACTIVITY_PLUGINS,
  __ACTIVITY_LESSON_MAP,
  __ACTIVITY_TICK_MS,
  __COLORBOX_HUE_HOLD_TARGET_MS,
  __COLORBOX_HUE_ZONES,
  __zoneForHue,
  __fallbackHueForUsername
} from '../classroom.js';

// Stub ws object. readyState 1 == WebSocket.OPEN.
function makeWs() {
  return {
    readyState: 1,
    sent: [],
    send(msg) { this.sent.push(JSON.parse(msg)); }
  };
}

// Helper: seed one teacher + N students with explicit hues. studentSpecs
// is [{ username, hue }]; pass hue=null to test the username-hash
// fallback path. Returns { teacherWs, students:[{ws, username, hue}] }.
function seedRoomWithHues(registry, section, studentSpecs) {
  var teacherWs = makeWs();
  registry.join(teacherWs, section, 'teach', 'teacher', Date.now(), null);
  var students = studentSpecs.map(function (spec) {
    var sws = makeWs();
    registry.join(sws, section, spec.username, 'student', Date.now(), spec.hue);
    return { ws: sws, username: spec.username, hue: spec.hue };
  });
  return { teacherWs: teacherWs, students: students };
}

// Helper: set the canonical position for a member by direct mutation
// on the registry's room. The colorbox plugin reads member.pos.x
// inside onTick; this bypasses the position() broadcast path (which
// is exercised in classroom.test.js -- not relevant here).
function setPos(registry, section, username, x) {
  var room = registry._getRoom(section);
  if (!room) throw new Error('setPos: no room ' + section);
  var m = room.members.get(username);
  if (!m) throw new Error('setPos: no member ' + username);
  m.pos = { x: x, y: 100, state: 'idle', vx: 0 };
}

// Helper: walk every assigned student into their correct zone (center
// of the zone column: zoneId * 80 + 40). With canvasW=320 and 4 zones,
// each zone is 80 wide; the center is x = zoneId*80 + 40.
function walkAllToCorrectZone(registry, section) {
  var room = registry._getRoom(section);
  var state = room.activity.state;
  var keys = Object.keys(state.assignments);
  keys.forEach(function (uname) {
    var zoneId = state.assignments[uname];
    setPos(registry, section, uname, zoneId * 80 + 40);
  });
}

describe('v5 colorbox-hue -- plugin registry + constants', () => {
  it('registers colorbox-hue under the activity type string', () => {
    expect(__ACTIVITY_PLUGINS).toBeDefined();
    expect(__ACTIVITY_PLUGINS['colorbox-hue']).toBeDefined();
  });

  it('colorbox-hue plugin exposes every method the engine calls', () => {
    var p = __ACTIVITY_PLUGINS['colorbox-hue'];
    expect(typeof p.minMembers).toBe('number');
    expect(typeof p.initActivity).toBe('function');
    expect(typeof p.onStudentInput).toBe('function');
    expect(typeof p.onTick).toBe('function');
    expect(typeof p.isComplete).toBe('function');
    expect(typeof p.serializeForBoard).toBe('function');
    expect(typeof p.onMemberLeave).toBe('function');
    expect(typeof p.onMemberJoin).toBe('function');
  });

  it('ACTIVITY_LESSON_MAP wires colorbox-hue to lesson 1.3', () => {
    expect(__ACTIVITY_LESSON_MAP['colorbox-hue']).toBe('1.3');
  });

  it('exports the 4-zone Red/Yellow/Green/Blue partition', () => {
    expect(__COLORBOX_HUE_ZONES).toHaveLength(4);
    expect(__COLORBOX_HUE_ZONES[0].label).toBe('Red');
    expect(__COLORBOX_HUE_ZONES[1].label).toBe('Yellow');
    expect(__COLORBOX_HUE_ZONES[2].label).toBe('Green');
    expect(__COLORBOX_HUE_ZONES[3].label).toBe('Blue');
    expect(__COLORBOX_HUE_ZONES[0].hueMin).toBe(0);
    expect(__COLORBOX_HUE_ZONES[3].hueMax).toBe(359);
  });

  it('hold target is 5 seconds (matches spec C2)', () => {
    expect(__COLORBOX_HUE_HOLD_TARGET_MS).toBe(5000);
  });
});

describe('v5 colorbox-hue -- zoneForHue partition', () => {
  it('maps each quadrant boundary correctly', () => {
    expect(__zoneForHue(0)).toBe(0);
    expect(__zoneForHue(89)).toBe(0);
    expect(__zoneForHue(90)).toBe(1);
    expect(__zoneForHue(179)).toBe(1);
    expect(__zoneForHue(180)).toBe(2);
    expect(__zoneForHue(269)).toBe(2);
    expect(__zoneForHue(270)).toBe(3);
    expect(__zoneForHue(359)).toBe(3);
  });

  it('handles wraparound: 360 -> 0, 720 -> 0', () => {
    expect(__zoneForHue(360)).toBe(0);
    expect(__zoneForHue(720)).toBe(0);
  });

  it('handles negative wraparound: -10 -> 3, -90 -> 3', () => {
    // -10 wraps to 350 -> zone 3 (Blue)
    expect(__zoneForHue(-10)).toBe(3);
    // -90 wraps to 270 -> zone 3 (Blue)
    expect(__zoneForHue(-90)).toBe(3);
  });
});

describe('v5 colorbox-hue -- fallbackHueForUsername', () => {
  it('is stable for a given username (same input -> same output)', () => {
    expect(__fallbackHueForUsername('alice')).toBe(__fallbackHueForUsername('alice'));
    expect(__fallbackHueForUsername('bob')).toBe(__fallbackHueForUsername('bob'));
  });

  it('returns an integer in [0, 359]', () => {
    var names = ['alice', 'bob', 'charlie', 'dora', 'student1', 'a'];
    names.forEach(function (n) {
      var h = __fallbackHueForUsername(n);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(359);
    });
  });
});

describe('v5 colorbox-hue -- initActivity assigns zone-by-hue', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('each online student gets a zone matching their hue', () => {
    // alice hue=10 -> Red(0); bob hue=120 -> Yellow(1); carol hue=200 -> Green(2); dora hue=300 -> Blue(3)
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 120 },
      { username: 'carol', hue: 200 },
      { username: 'dora',  hue: 300 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.assignments.alice).toBe(0);
    expect(snap.activity.state.assignments.bob).toBe(1);
    expect(snap.activity.state.assignments.carol).toBe(2);
    expect(snap.activity.state.assignments.dora).toBe(3);
  });

  it('falls back to username-hash hue when a student has hue=null', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue: null },
      { username: 'bob',   hue:   50 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var expected = __zoneForHue(__fallbackHueForUsername('alice'));
    expect(snap.activity.state.assignments.alice).toBe(expected);
    expect(snap.activity.state.assignments.bob).toBe(0);  // hue 50 -> Red
  });

  it('initial state has empty currentZone + zeroed tally + holdMs=0', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.currentZone).toEqual({});
    expect(snap.activity.state.tally).toEqual([0, 0, 0, 0]);
    expect(snap.activity.state.holdMs).toBe(0);
    expect(snap.activity.state.holdTargetMs).toBe(5000);
    expect(snap.activity.state.zones).toHaveLength(4);
  });

  it('does not assign the teacher a category', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue: 10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.assignments.teach).toBeUndefined();
  });
});

describe('v5 colorbox-hue -- onStudentInput is a no-op', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('returns null because ColorBox piggybacks on classroom_pos', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var plugin = __ACTIVITY_PLUGINS['colorbox-hue'];
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var next = plugin.onStudentInput(snap.activity.state, 'alice', { delta: 1 });
    expect(next).toBeNull();
  });
});

describe('v5 colorbox-hue -- onTick reads positions and computes zones', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('computes currentZone from member.pos.x (logical canvas 320 wide)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },   // assignment: 0
      { username: 'bob',   hue: 200 }    // assignment: 2
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    // Place alice at x=20 (column 0) and bob at x=170 (column 2).
    // 170 / 80 = 2.125, floor = 2.
    setPos(registry, 'P1', 'alice', 20);
    setPos(registry, 'P1', 'bob',   170);
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.currentZone.alice).toBe(0);
    expect(s.currentZone.bob).toBe(2);
  });

  it('clamps current zone into [0,3] for out-of-range x', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue: 10 },
      { username: 'bob',   hue: 10 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    setPos(registry, 'P1', 'alice', -50);       // floor(-50/80) = -1, clamp -> 0
    setPos(registry, 'P1', 'bob',   99999);     // way past -> clamp 3
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.currentZone.alice).toBe(0);
    expect(s.currentZone.bob).toBe(3);
  });

  it('computes the per-zone tally', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue:  10 },
      { username: 'carol', hue:  10 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    // Two in zone 0, one in zone 2.
    setPos(registry, 'P1', 'alice', 10);
    setPos(registry, 'P1', 'bob',   30);
    setPos(registry, 'P1', 'carol', 200);
    var tick = registry.activityTick(1200);
    expect(tick.broadcasts[0].payload.state.tally).toEqual([2, 0, 1, 0]);
  });

  it('treats a member with no pos as zone 0 (x defaults to 0)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },   // assignment 0 -- correct if at x=0
      { username: 'bob',   hue: 200 }    // assignment 2 -- wrong if at x=0
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    // No setPos calls -- both members have pos=null.
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.currentZone.alice).toBe(0);
    expect(s.currentZone.bob).toBe(0);
  });
});

describe('v5 colorbox-hue -- holdMs counter behavior', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('increments holdMs by 200 ms per tick when ALL students in correct zone', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    walkAllToCorrectZone(registry, 'P1');
    var t1 = registry.activityTick(1200);
    expect(t1.broadcasts[0].payload.state.holdMs).toBe(200);
    // Re-walk each tick: the engine replaces state via Object.assign
    // but member.pos lives on the member, not state -- positions
    // persist automatically across ticks.
    var t2 = registry.activityTick(1400);
    expect(t2.broadcasts[0].payload.state.holdMs).toBe(400);
  });

  it('resets holdMs to 0 when even one student leaves their correct zone', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },   // assignment 0
      { username: 'bob',   hue: 200 }    // assignment 2
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    walkAllToCorrectZone(registry, 'P1');
    var t1 = registry.activityTick(1200);
    expect(t1.broadcasts[0].payload.state.holdMs).toBe(200);
    // Move bob into the wrong zone (zone 0 instead of 2).
    setPos(registry, 'P1', 'bob', 20);
    var t2 = registry.activityTick(1400);
    expect(t2.broadcasts[0].payload.state.holdMs).toBe(0);
  });

  it('resets holdMs to 0 when a student goes offline', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    walkAllToCorrectZone(registry, 'P1');
    var t1 = registry.activityTick(1200);
    expect(t1.broadcasts[0].payload.state.holdMs).toBe(200);
    // Flip bob offline.
    var room = registry._getRoom('P1');
    room.members.get('bob').online = false;
    var t2 = registry.activityTick(1400);
    expect(t2.broadcasts[0].payload.state.holdMs).toBe(0);
  });
});

describe('v5 colorbox-hue -- isComplete + success fires at 5 s hold', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('isComplete is false until holdMs reaches 5000', () => {
    var plugin = __ACTIVITY_PLUGINS['colorbox-hue'];
    expect(plugin.isComplete({ holdMs: 0 })).toBe(false);
    expect(plugin.isComplete({ holdMs: 4999 })).toBe(false);
    expect(plugin.isComplete({ holdMs: 5000 })).toBe(true);
    expect(plugin.isComplete({ holdMs: 6000 })).toBe(true);
  });

  it('fires classroom_activity_success after 25 in-zone ticks (5 s)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    walkAllToCorrectZone(registry, 'P1');
    var sawSuccess = false;
    var successPayload = null;
    // 25 ticks at 200 ms each -> exactly 5000 ms held.
    for (var i = 1; i <= 26; i++) {
      var tick = registry.activityTick(1000 + i * 200);
      tick.broadcasts.forEach(function (bc) {
        if (bc.payload.type === 'classroom_activity_success') {
          sawSuccess = true;
          successPayload = bc.payload;
        }
      });
      if (sawSuccess) break;
    }
    expect(sawSuccess).toBe(true);
    expect(successPayload.activityType).toBe('colorbox-hue');
    expect(successPayload.finalState).toBeDefined();
    expect(successPayload.finalState.holdTargetMs).toBe(5000);
  });
});

describe('v5 colorbox-hue -- onMemberJoin uses room to look up hue', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('a brand-new student joining mid-activity gets a zone from their hue', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var newWs = makeWs();
    registry.join(newWs, 'P1', 'carol', 'student', Date.now(), 250);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    // Hue 250 -> zone 2 (Green: 180-269).
    expect(snap.activity.state.assignments.carol).toBe(2);
  });

  it('a brand-new student with hue=null falls back to username-hash', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var newWs = makeWs();
    registry.join(newWs, 'P1', 'newbie', 'student', Date.now(), null);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var expected = __zoneForHue(__fallbackHueForUsername('newbie'));
    expect(snap.activity.state.assignments.newbie).toBe(expected);
  });

  it('re-join of a known student keeps the existing assignment', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var before = registry.stateFor('P1', 'teacher', 'teach').activity.state.assignments.alice;
    // Detach + re-join alice on a NEW socket with a DIFFERENT hue.
    // The plugin's onMemberJoin must short-circuit when alice is
    // already in assignments (keeping the prior category).
    registry.detach(bag.students[0].ws, Date.now());
    var newWs = makeWs();
    registry.join(newWs, 'P1', 'alice', 'student', Date.now(), 300);  // hue 300 -> zone 3
    var after = registry.stateFor('P1', 'teacher', 'teach').activity.state.assignments.alice;
    expect(after).toBe(before);
  });
});

describe('v5 colorbox-hue -- onMemberLeave', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('drops the leaver from assignments + currentZone via sweep', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    // Pre-seed currentZone by ticking once with a position.
    setPos(registry, 'P1', 'alice', 20);
    setPos(registry, 'P1', 'bob',   200);
    registry.activityTick(1200);
    // Detach bob's socket -> sweep past idle GC removes the member.
    registry.detach(bag.students[1].ws, 2000);
    var future = 2000 + 50 * 60 * 1000;  // > IDLE_GC_MS (45 min)
    registry.sweep(future);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.assignments.bob).toBeUndefined();
    expect(snap.activity.state.assignments.alice).toBeDefined();
  });

  it('plugin.onMemberLeave returns null when username is not in assignments', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    var plugin = __ACTIVITY_PLUGINS['colorbox-hue'];
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var next = plugin.onMemberLeave(snap.activity.state, 'ghost');
    expect(next).toBeNull();
  });
});

describe('v5 colorbox-hue -- serializeForBoard public shape', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('exposes assignments/currentZone/tally/holdMs/holdTargetMs/zones', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    setPos(registry, 'P1', 'alice', 20);
    setPos(registry, 'P1', 'bob',   200);
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.assignments).toBeDefined();
    expect(s.currentZone).toBeDefined();
    expect(s.tally).toEqual([1, 0, 1, 0]);
    expect(typeof s.holdMs).toBe('number');
    expect(s.holdTargetMs).toBe(5000);
    expect(s.zones).toHaveLength(4);
    expect(s.zones[0]).toEqual({ id: 0, label: 'Red' });
  });

  it('snapshot (buildStatePayload) carries the colorbox state for late-joiners', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, 1000);
    var lateWs = makeWs();
    var joinRes = registry.join(lateWs, 'P1', 'newbie', 'student', Date.now(), 95);
    var snap = joinRes.sends[0].payload;
    expect(snap.activity).toBeDefined();
    expect(snap.activity.type).toBe('colorbox-hue');
    expect(snap.activity.state.holdTargetMs).toBe(5000);
    expect(snap.activity.state.zones).toHaveLength(4);
    // newbie was assigned at join time via onMemberJoin: hue 95 -> zone 1.
    expect(snap.activity.state.assignments.newbie).toBe(1);
  });
});

describe('v5 colorbox-hue -- mutex with other modes', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('cannot start colorbox-hue while a bridge-mean activity is live', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    var first = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(first.broadcasts).toHaveLength(1);
    var second = registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    expect(second.broadcasts).toHaveLength(0);
  });

  it('cannot start colorbox-hue while a poll is open', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.openPoll(bag.teacherWs, 'Q?', ['a', 'b'], false, Date.now());
    var result = registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('cannot start colorbox-hue while a gate is armed', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.armGate(bag.teacherWs, 'classic', Date.now());
    var result = registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('rejects colorbox-hue when online students < 2', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue: 10 }
    ]);
    var result = registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_activity_error');
    expect(result.broadcasts[0].payload.code).toBe('not-enough-members');
    expect(result.broadcasts[0].payload.minMembers).toBe(2);
  });
});

// 2026-05-24 V5 Codex review folds. Each describe pins a finding's fix.

describe('Codex MAJOR fold: fallbackHueForUsername parity with the board hash', () => {
  // The board (follow-alongs/classroom-board.js) uses this exact body:
  //   var hash = 0;
  //   for (var i = 0; i < input.length; i++) {
  //     hash = ((hash << 5) - hash) + input.charCodeAt(i);
  //     hash = hash | 0;
  //   }
  //   return Math.abs(hash) % 360;
  // Replicate it inline (NOT importing from follow-alongs -- the two
  // repos must stay independently testable) and confirm parity for
  // several usernames. Prevents future hash drift.
  function boardHashStringToHue(input) {
    var hash = 0;
    for (var i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash = hash | 0;
    }
    return Math.abs(hash) % 360;
  }

  it('exports fallbackHueForUsername', () => {
    expect(typeof __fallbackHueForUsername).toBe('function');
  });

  it('matches the board hash for stable test usernames', () => {
    var names = ['alice', 'bob', 'student', 'olivia', 'date_tiger', 'olive_whale', 'a', 'ZZZZZZ'];
    for (var i = 0; i < names.length; i++) {
      expect(__fallbackHueForUsername(names[i])).toBe(boardHashStringToHue(names[i]));
    }
  });

  it('returns a value in [0, 359] inclusive', () => {
    for (var i = 0; i < 30; i++) {
      var n = 'random_user_' + i + '_x' + (i * 7 + 13);
      var h = __fallbackHueForUsername(n);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(359);
    }
  });
});

describe('Codex BLOCKER fold: position() stores member.canvasW; colorbox-hue onTick uses it', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('position() stores canvasW on the member when provided', () => {
    var teacherWs = makeWs();
    registry.join(teacherWs, 'P1', 'teach', 'teacher', Date.now());
    var sws = makeWs();
    registry.join(sws, 'P1', 'alice', 'student', Date.now());
    registry.position(sws, 100, 50, 'idle', 0, Date.now(), 640);
    var room = registry._getRoom('P1');
    expect(room.members.get('alice').canvasW).toBe(640);
  });

  it('position() preserves prior canvasW when called without one', () => {
    var teacherWs = makeWs();
    registry.join(teacherWs, 'P1', 'teach', 'teacher', Date.now());
    var sws = makeWs();
    registry.join(sws, 'P1', 'alice', 'student', Date.now());
    registry.position(sws, 100, 50, 'idle', 0, Date.now(), 640);
    // Second call without canvasW -- prior value must persist.
    registry.position(sws, 110, 50, 'idle', 0, Date.now());
    var room = registry._getRoom('P1');
    expect(room.members.get('alice').canvasW).toBe(640);
  });

  it('colorbox-hue onTick computes zone from per-member canvasW (not hardcoded 320)', () => {
    // Two students on a 640-CSS canvas. At x=480 they should land in
    // zone 3 (the right quarter of a 640px canvas), even though
    // x=480 on a 320 canvas would clamp to zone 3 (out of range).
    // Critical case: x=240 on a 640 canvas is zone 1 (Yellow) --
    // with the old hardcoded canvasW=320, x=240 would have been
    // Math.floor(240/80)=3 (Blue). This pins the per-canvasW math.
    var teacherWs = makeWs();
    registry.join(teacherWs, 'P1', 'teach', 'teacher', Date.now());
    // alice's hue=10 -> zone 0 (Red), bob's hue=100 -> zone 1 (Yellow).
    var sws1 = makeWs();
    registry.join(sws1, 'P1', 'alice', 'student', Date.now(), 10);
    var sws2 = makeWs();
    registry.join(sws2, 'P1', 'bob', 'student', Date.now(), 100);
    // Set the canvas width via position() to 640 (wider than the
    // 320 hardcode the old code assumed).
    registry.position(sws1, 80,  50, 'idle', 0, Date.now(), 640);
    registry.position(sws2, 240, 50, 'idle', 0, Date.now(), 640);
    registry.startActivity(teacherWs, 'colorbox-hue', {}, Date.now());
    registry.activityTick(Date.now());
    var room = registry._getRoom('P1');
    var st = room.activity.state;
    // alice at x=80 on 640 canvas: zone = floor(80 / 160) = 0 (Red) -- CORRECT.
    // bob   at x=240 on 640 canvas: zone = floor(240 / 160) = 1 (Yellow) -- CORRECT.
    expect(st.currentZone.alice).toBe(0);
    expect(st.currentZone.bob).toBe(1);
    expect(st.tally[0]).toBe(1);   // 1 in Red
    expect(st.tally[1]).toBe(1);   // 1 in Yellow
  });

  it('classroom_pos broadcast payload includes canvasW field', () => {
    var teacherWs = makeWs();
    registry.join(teacherWs, 'P1', 'teach', 'teacher', Date.now());
    var sws = makeWs();
    registry.join(sws, 'P1', 'alice', 'student', Date.now());
    var result = registry.position(sws, 100, 50, 'idle', 0, Date.now(), 640);
    // Broadcast goes to all OTHER sockets. Teacher is not the sender, so
    // they receive the broadcast.
    expect(result.broadcasts).toHaveLength(1);
    var payload = result.broadcasts[0].payload;
    expect(payload.type).toBe('classroom_pos');
    expect(payload.canvasW).toBe(640);
  });
});
