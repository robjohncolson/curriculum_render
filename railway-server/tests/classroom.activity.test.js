// classroom.activity.test.js
// Unit tests for the v4 Live Classroom Activity engine + bridge-mean plugin.
// See LIVE_CLASSROOM_V4_BUILD.md sections C1, C2, C7-Unit-A for the contract.
//
// All tests use stub ws objects. No real sockets, no HTTP. The override-gate
// auto-fire is exercised by inspecting that the success broadcast still goes
// out (the POST itself is fire-and-forget; absence of ROSTER_SERVICE_URL is a
// warn-and-skip, not a failure).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createClassroomRegistry,
  __ACTIVITY_PLUGINS,
  __ACTIVITY_LESSON_MAP,
  __ACTIVITY_TICK_MS,
  __BRIDGE_MEAN_HOLD_TARGET_MS,
  __BRIDGE_MEAN_TOLERANCE,
  __DEFAULT_ACTIVITY_DURATION_MS
} from '../classroom.js';

// Stub ws object. readyState 1 == WebSocket.OPEN.
function makeWs() {
  return {
    readyState: 1,
    sent: [],
    send(msg) { this.sent.push(JSON.parse(msg)); }
  };
}

// Helper: join one teacher + N students to a section. Returns the bag.
function seedRoom(registry, section, studentCount) {
  var teacherWs = makeWs();
  registry.join(teacherWs, section, 'teach', 'teacher', Date.now());
  var students = [];
  for (var i = 0; i < studentCount; i++) {
    var sws = makeWs();
    var sname = 'student' + (i + 1);
    registry.join(sws, section, sname, 'student', Date.now());
    students.push({ ws: sws, username: sname });
  }
  return { teacherWs: teacherWs, students: students };
}

// Helper: flatten broadcasts into the list of sent payload types.
function payloadTypes(broadcasts) {
  var types = [];
  broadcasts.forEach(function (bc) {
    if (bc && bc.payload && bc.payload.type) types.push(bc.payload.type);
  });
  return types;
}

// Helper: pin the live activity state for a section. Uses the registry's
// test-only _getRoom backdoor to mutate target + values on the actual
// room.activity reference. The engine's onTick path replaces the state
// object via Object.assign, but `target` and `values` are copied across
// each tick, so the values map identity stays consistent (the plugin
// rewrites the values map only on student input / member leave).
function pinActivity(registry, section, target, valueMap) {
  var room = registry._getRoom(section);
  if (!room || !room.activity) {
    throw new Error('pinActivity: no activity live in section ' + section);
  }
  room.activity.state.target = target;
  Object.keys(valueMap).forEach(function (k) {
    room.activity.state.values[k] = valueMap[k];
  });
}

// Helper: pin target only, keeping current values intact.
function pinTarget(registry, section, target) {
  var room = registry._getRoom(section);
  if (!room || !room.activity) {
    throw new Error('pinTarget: no activity live in section ' + section);
  }
  room.activity.state.target = target;
}

// Helper: overwrite each value to a uniform number.
function setUniformValues(registry, section, value) {
  var room = registry._getRoom(section);
  if (!room || !room.activity) {
    throw new Error('setUniformValues: no activity live in section ' + section);
  }
  var keys = Object.keys(room.activity.state.values);
  keys.forEach(function (k) {
    room.activity.state.values[k] = value;
  });
}

describe('v4 Activity engine -- plugin registry', () => {
  it('registers the bridge-mean plugin under the activity type string', () => {
    expect(__ACTIVITY_PLUGINS).toBeDefined();
    expect(__ACTIVITY_PLUGINS['bridge-mean']).toBeDefined();
  });

  it('bridge-mean plugin exposes every method the engine calls', () => {
    var p = __ACTIVITY_PLUGINS['bridge-mean'];
    expect(typeof p.minMembers).toBe('number');
    expect(typeof p.initActivity).toBe('function');
    expect(typeof p.onStudentInput).toBe('function');
    expect(typeof p.onTick).toBe('function');
    expect(typeof p.isComplete).toBe('function');
    expect(typeof p.serializeForBoard).toBe('function');
    expect(typeof p.onMemberLeave).toBe('function');
    expect(typeof p.onMemberJoin).toBe('function');
  });

  it('ACTIVITY_LESSON_MAP wires bridge-mean to lesson 1.1', () => {
    expect(__ACTIVITY_LESSON_MAP['bridge-mean']).toBe('1.1');
  });

  it('constants match the spec (5 Hz tick, 3 s hold, +/- 0.3 tolerance, 90 s default)', () => {
    expect(__ACTIVITY_TICK_MS).toBe(200);
    expect(__BRIDGE_MEAN_HOLD_TARGET_MS).toBe(3000);
    expect(__BRIDGE_MEAN_TOLERANCE).toBe(0.3);
    expect(__DEFAULT_ACTIVITY_DURATION_MS).toBe(90000);
  });
});

describe('startActivity -- mutex / role / member gates', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('rejects when called by a non-teacher', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.students[0].ws, 'bridge-mean', {}, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('rejects when the activity type is unknown', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'no-such-plugin', {}, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('rejects when a gate is already armed (mutex)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.armGate(bag.teacherWs, 'theme1', Date.now());
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('rejects when a poll is already open (mutex)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.openPoll(bag.teacherWs, 'Q?', ['a', 'b'], false, Date.now());
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('rejects when doorways are already open (mutex)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.openDoorways(bag.teacherWs, 'd1', 'Q?',
      [{ label: 'A', doorId: 'da' }, { label: 'B', doorId: 'db' }], Date.now());
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(result.broadcasts).toHaveLength(0);
  });

  it('rejects when another activity is already live (mutex)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var first = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(first.broadcasts).toHaveLength(1);
    var second = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(second.broadcasts).toHaveLength(0);
  });

  it('returns not-enough-members error when online students < minMembers', () => {
    var bag = seedRoom(registry, 'P1', 1);
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_activity_error');
    expect(bc.payload.code).toBe('not-enough-members');
    expect(bc.payload.minMembers).toBe(2);
    expect(bc.payload.online).toBe(1);
    // Error goes only to the caller (the teacher), not the room.
    expect(bc.sockets).toHaveLength(1);
    expect(bc.sockets[0]).toBe(bag.teacherWs);
  });

  it('does not set room.activity when start fails for not-enough-members', () => {
    var bag = seedRoom(registry, 'P1', 1);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity).toBeNull();
  });
});

describe('startActivity -- successful launch + initial state', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('broadcasts classroom_activity_start to every room socket', () => {
    var bag = seedRoom(registry, 'P1', 3);
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    expect(result.broadcasts).toHaveLength(1);
    var bc = result.broadcasts[0];
    expect(bc.payload.type).toBe('classroom_activity_start');
    expect(bc.payload.section).toBe('P1');
    expect(bc.payload.activity.type).toBe('bridge-mean');
    expect(bc.payload.activity.startedAt).toBe(1000);
    // 1 teacher + 3 students = 4 sockets in the broadcast.
    expect(bc.sockets).toHaveLength(4);
  });

  it('uses default 90 s durationMs when opts.durationMs is missing', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(result.broadcasts[0].payload.activity.durationMs).toBe(90000);
  });

  it('honours a custom durationMs from opts', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', { durationMs: 45000 }, Date.now());
    expect(result.broadcasts[0].payload.activity.durationMs).toBe(45000);
  });

  it('assigns an integer value in [1,10] to every online student', () => {
    var bag = seedRoom(registry, 'P1', 4);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var values = snap.activity.state.values;
    expect(Object.keys(values)).toHaveLength(4);
    for (var i = 0; i < bag.students.length; i++) {
      var v = values[bag.students[i].username];
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it('picks a target in [3,8]', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var t = result.broadcasts[0].payload.activity.state.target;
    expect(t).toBeGreaterThanOrEqual(3);
    expect(t).toBeLessThanOrEqual(8);
  });

  it('target excludes round(initialMean) when that rounded value lies in [3,8]', () => {
    // Force mean=5 by giving both students value=5. With round(5)=5,
    // candidates becomes [3,4,6,7,8] (5 excluded). Any random pick must
    // not equal 5.
    var calls = 0;
    var seq = [0.4, 0.4, 0.0]; // floor(0.4*10)+1 = 5 (twice), then target index 0
    var spy = vi.spyOn(Math, 'random').mockImplementation(function () {
      var v = seq[calls % seq.length];
      calls++;
      return v;
    });
    try {
      var bag = seedRoom(registry, 'P1', 2);
      var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
      var t = result.broadcasts[0].payload.activity.state.target;
      expect(t).not.toBe(5);
      // candidates was [3,4,6,7,8], index 0 = 3.
      expect(t).toBe(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('serialized initial state includes target, tolerance, currentMean, holdMs, holdTargetMs', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var s = result.broadcasts[0].payload.activity.state;
    expect(typeof s.target).toBe('number');
    expect(s.tolerance).toBe(0.3);
    expect(typeof s.currentMean).toBe('number');
    expect(s.holdMs).toBe(0);
    expect(s.holdTargetMs).toBe(3000);
  });

  it('resets every member status to "present" on a fresh start', () => {
    var bag = seedRoom(registry, 'P1', 2);
    // First give one student a non-"present" status via the poll path.
    registry.openPoll(bag.teacherWs, 'Q?', ['a', 'b'], false, Date.now());
    registry.castVote(bag.students[0].ws, 0, Date.now());
    registry.closePoll(bag.teacherWs, Date.now());
    // Now start the activity and check.
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    snap.members.forEach(function (m) {
      expect(m.status).toBe('present');
    });
  });
});

describe('activityValue -- student input handling', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('returns empty broadcasts on every input (state flows out via tick)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var result = registry.activityValue(bag.students[0].ws, { delta: 1 });
    expect(result.broadcasts).toHaveLength(0);
  });

  it('clamps any positive delta to +1 (value moves by 1, not the input magnitude)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    // Pin the student's value to 5 so we can test the bounded step.
    pinActivity(registry, 'P1', 5, { 'student1': 5 });
    registry.activityValue(bag.students[0].ws, { delta: 5 });
    var v = registry.stateFor('P1', 'teacher', 'teach').activity.state.values['student1'];
    expect(v).toBe(6);
  });

  it('clamps any negative delta to -1 (value moves by 1, not the input magnitude)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    pinActivity(registry, 'P1', 5, { 'student1': 5 });
    registry.activityValue(bag.students[0].ws, { delta: -42 });
    var v = registry.stateFor('P1', 'teacher', 'teach').activity.state.values['student1'];
    expect(v).toBe(4);
  });

  it('clamps the resulting value into [1, 10] at the upper bound', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    pinActivity(registry, 'P1', 5, { 'student1': 9 });
    registry.activityValue(bag.students[0].ws, { delta: 1 });
    var v = registry.stateFor('P1', 'teacher', 'teach').activity.state.values['student1'];
    expect(v).toBe(10);
    // Pushing past the top should clamp at 10.
    registry.activityValue(bag.students[0].ws, { delta: 1 });
    var v2 = registry.stateFor('P1', 'teacher', 'teach').activity.state.values['student1'];
    expect(v2).toBe(10);
  });

  it('clamps the resulting value into [1, 10] at the lower bound', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    pinActivity(registry, 'P1', 5, { 'student1': 2 });
    registry.activityValue(bag.students[0].ws, { delta: -1 });
    var v = registry.stateFor('P1', 'teacher', 'teach').activity.state.values['student1'];
    expect(v).toBe(1);
    registry.activityValue(bag.students[0].ws, { delta: -1 });
    var v2 = registry.stateFor('P1', 'teacher', 'teach').activity.state.values['student1'];
    expect(v2).toBe(1);
  });

  it('drops a zero delta with no state change', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    pinActivity(registry, 'P1', 5, { 'student1': 5 });
    registry.activityValue(bag.students[0].ws, { delta: 0 });
    var v = registry.stateFor('P1', 'teacher', 'teach').activity.state.values['student1'];
    expect(v).toBe(5);
  });

  it('ignores a teacher trying to send a value', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var keysBefore = Object.keys(snap.activity.state.values).slice();
    registry.activityValue(bag.teacherWs, { delta: 1 });
    var keysAfter = Object.keys(registry.stateFor('P1', 'teacher', 'teach').activity.state.values);
    expect(keysAfter).toEqual(keysBefore);
    // Teacher should never have entered the values map.
    expect(keysAfter.indexOf('teach')).toBe(-1);
  });

  it('ignores input when no activity is live', () => {
    var bag = seedRoom(registry, 'P1', 2);
    // No startActivity call.
    var result = registry.activityValue(bag.students[0].ws, { delta: 1 });
    expect(result.broadcasts).toHaveLength(0);
  });

  it('the plugin returns null when the username is not in the values map', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var plugin = __ACTIVITY_PLUGINS['bridge-mean'];
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var next = plugin.onStudentInput(snap.activity.state, 'ghost', { delta: 1 });
    expect(next).toBeNull();
  });
});

describe('activityTick -- hold counter + completion + timeout', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('emits classroom_activity_state on a normal tick', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var startNow = 1000;
    registry.startActivity(bag.teacherWs, 'bridge-mean', { durationMs: 90000 }, startNow);
    var tick = registry.activityTick(startNow + 200);
    expect(tick.broadcasts).toHaveLength(1);
    expect(tick.broadcasts[0].payload.type).toBe('classroom_activity_state');
    expect(tick.broadcasts[0].payload.section).toBe('P1');
    expect(tick.broadcasts[0].payload.elapsedMs).toBe(200);
  });

  it('increments holdMs by 200 ms per tick when mean is inside the band', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    pinTarget(registry, 'P1', 5);
    setUniformValues(registry, 'P1', 5);
    var tick1 = registry.activityTick(1200);
    expect(tick1.broadcasts[0].payload.state.holdMs).toBe(200);
    // Re-pin (the tick rebuilds state via Object.assign).
    pinTarget(registry, 'P1', 5);
    setUniformValues(registry, 'P1', 5);
    var tick2 = registry.activityTick(1400);
    expect(tick2.broadcasts[0].payload.state.holdMs).toBe(400);
  });

  it('resets holdMs to 0 when mean leaves the band', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    pinTarget(registry, 'P1', 5);
    setUniformValues(registry, 'P1', 5);
    var tick1 = registry.activityTick(1200);
    expect(tick1.broadcasts[0].payload.state.holdMs).toBe(200);
    // Move one student far away so mean exits the band.
    pinTarget(registry, 'P1', 5);
    var room = registry._getRoom('P1');
    room.activity.state.values['student1'] = 10;
    room.activity.state.values['student2'] = 10;
    var tick2 = registry.activityTick(1400);
    expect(tick2.broadcasts[0].payload.state.holdMs).toBe(0);
  });

  it('fires classroom_activity_success when holdMs reaches 3000 ms', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    // Pin target + values, then re-pin each loop iteration since onTick
    // rebuilds the state object (target and values stay because we set
    // them on the new state object).
    var lastTypes = [];
    for (var i = 1; i <= 16; i++) {
      pinTarget(registry, 'P1', 5);
      setUniformValues(registry, 'P1', 5);
      var tick = registry.activityTick(1000 + i * 200);
      lastTypes = payloadTypes(tick.broadcasts);
      if (lastTypes.indexOf('classroom_activity_success') >= 0) break;
    }
    expect(lastTypes).toContain('classroom_activity_success');
  });

  it('success broadcast carries the activityType + finalState', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    var successBc = null;
    for (var i = 1; i <= 20; i++) {
      pinTarget(registry, 'P1', 5);
      setUniformValues(registry, 'P1', 5);
      var tick = registry.activityTick(1000 + i * 200);
      tick.broadcasts.forEach(function (bc) {
        if (bc.payload.type === 'classroom_activity_success') successBc = bc;
      });
      if (successBc) break;
    }
    expect(successBc).not.toBeNull();
    expect(successBc.payload.activityType).toBe('bridge-mean');
    expect(successBc.payload.finalState).toBeDefined();
    expect(successBc.payload.finalState.target).toBe(5);
  });

  it('fires classroom_activity_timeout when elapsed reaches durationMs', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', { durationMs: 1000 }, 1000);
    // Pin mean OUT of band so success cannot fire.
    var sawTimeout = false;
    var timeoutBc = null;
    for (var i = 1; i <= 10; i++) {
      pinTarget(registry, 'P1', 5);
      setUniformValues(registry, 'P1', 10);
      var tick = registry.activityTick(1000 + i * 200);
      tick.broadcasts.forEach(function (bc) {
        if (bc.payload.type === 'classroom_activity_timeout') { sawTimeout = true; timeoutBc = bc; }
      });
      if (sawTimeout) break;
    }
    expect(sawTimeout).toBe(true);
    expect(timeoutBc.payload.activityType).toBe('bridge-mean');
    expect(timeoutBc.payload.finalState).toBeDefined();
  });

  it('drops finished activities on the subsequent tick (room.activity becomes null)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', { durationMs: 500 }, 1000);
    // Push out of band -> timeout fires.
    pinTarget(registry, 'P1', 5);
    setUniformValues(registry, 'P1', 10);
    registry.activityTick(1600);  // timeout fires here
    registry.activityTick(1800);  // slot cleared on this tick
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity).toBeNull();
  });

  it('idle rooms produce no broadcasts on a tick', () => {
    seedRoom(registry, 'P1', 2);
    var tick = registry.activityTick(Date.now());
    expect(tick.broadcasts).toHaveLength(0);
  });

  it('emits the per-tick state broadcast to every room socket', () => {
    var bag = seedRoom(registry, 'P1', 3);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    var tick = registry.activityTick(1200);
    expect(tick.broadcasts).toHaveLength(1);
    // teacher + 3 students = 4 sockets.
    expect(tick.broadcasts[0].sockets).toHaveLength(4);
  });
});

describe('cancelActivity', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('rejects when called by a non-teacher', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var result = registry.cancelActivity(bag.students[0].ws);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('returns empty broadcasts when no activity is live', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var result = registry.cancelActivity(bag.teacherWs);
    expect(result.broadcasts).toHaveLength(0);
  });

  it('broadcasts classroom_activity_cancel and marks the activity finished', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var result = registry.cancelActivity(bag.teacherWs);
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_activity_cancel');
    expect(result.broadcasts[0].payload.section).toBe('P1');
    expect(result.broadcasts[0].payload.activityType).toBe('bridge-mean');
    // After cancel the next tick clears the slot.
    registry.activityTick(Date.now() + 1000);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity).toBeNull();
  });
});

describe('member presence -- onMemberLeave / onMemberJoin', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('a brand-new student joining mid-activity gets a [1,10] value', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var lateWs = makeWs();
    registry.join(lateWs, 'P1', 'newbie', 'student', Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.values.newbie).toBeDefined();
    var v = snap.activity.state.values.newbie;
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(10);
  });

  it('sweep removes a member from values once they pass the idle GC threshold', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    // Detach one student (loses last socket -> offline).
    registry.detach(bag.students[0].ws, 2000);
    // Now sweep with a "now" far past IDLE_GC_MS (45 min).
    var future = 2000 + 50 * 60 * 1000;
    registry.sweep(future);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    // The leaver's value should have been dropped.
    expect(snap.activity.state.values[bag.students[0].username]).toBeUndefined();
    // The other student stays.
    expect(snap.activity.state.values[bag.students[1].username]).toBeDefined();
  });

  it('teacher join during a live activity does NOT enter the values map', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var tWs2 = makeWs();
    registry.join(tWs2, 'P1', 'co-teach', 'teacher', Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'co-teach');
    expect(snap.activity.state.values['co-teach']).toBeUndefined();
  });

  it('re-join of a known student keeps their existing value (no re-randomize)', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var before = registry.stateFor('P1', 'teacher', 'teach').activity.state.values[bag.students[0].username];
    // Detach + re-join the SAME student on a new socket (re-attach path).
    registry.detach(bag.students[0].ws, Date.now());
    var newWs = makeWs();
    registry.join(newWs, 'P1', bag.students[0].username, 'student', Date.now());
    var after = registry.stateFor('P1', 'teacher', 'teach').activity.state.values[bag.students[0].username];
    expect(after).toBe(before);
  });

  it('plugin.onMemberLeave is a no-op when the username is not in values', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var plugin = __ACTIVITY_PLUGINS['bridge-mean'];
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var next = plugin.onMemberLeave(snap.activity.state, 'ghost');
    expect(next).toBeNull();
  });
});

describe('buildStatePayload snapshot includes activity', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('activity is null when no activity is live', () => {
    seedRoom(registry, 'P1', 2);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity).toBeNull();
  });

  it('a late-joiner snapshot carries the serialized activity', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    var lateWs = makeWs();
    var joinRes = registry.join(lateWs, 'P1', 'newbie', 'student', Date.now());
    var snap = joinRes.sends[0].payload;
    expect(snap.activity).toBeDefined();
    expect(snap.activity.type).toBe('bridge-mean');
    expect(snap.activity.startedAt).toBe(1000);
    expect(snap.activity.durationMs).toBe(90000);
    expect(snap.activity.finished).toBe(false);
    expect(snap.activity.state).toBeDefined();
    expect(snap.activity.state.target).toBeDefined();
    expect(snap.activity.state.tolerance).toBe(0.3);
  });

  it('monitor snapshot (getAllSectionsState) carries the serialized activity', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    var all = registry.getAllSectionsState();
    expect(all.type).toBe('classroom_state_all');
    var section = all.sections.find(function (s) { return s.section === 'P1'; });
    expect(section).toBeDefined();
    expect(section.activity).toBeDefined();
    expect(section.activity.type).toBe('bridge-mean');
    expect(section.activity.state.holdTargetMs).toBe(3000);
  });

  it('serializeForBoard rounds currentMean to 2 decimal places', () => {
    var bag = seedRoom(registry, 'P1', 3);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    var room = registry._getRoom('P1');
    // 3 students at 1, 2, 4 -> mean = 7/3 = 2.333...
    var keys = Object.keys(room.activity.state.values);
    room.activity.state.values[keys[0]] = 1;
    room.activity.state.values[keys[1]] = 2;
    room.activity.state.values[keys[2]] = 4;
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    // Rounded to 2 dp == 2.33.
    expect(s.currentMean).toBe(2.33);
  });
});

describe('monitor fanout', () => {
  let registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('classroom_activity_start fans out to subscribed monitor sockets', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var monitorWs = makeWs();
    registry.subscribeMonitor(monitorWs);
    var result = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(result.broadcasts[0].sockets).toContain(monitorWs);
  });

  it('classroom_activity_state from a tick fans out to monitor sockets', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var monitorWs = makeWs();
    registry.subscribeMonitor(monitorWs);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, 1000);
    var tick = registry.activityTick(1200);
    expect(tick.broadcasts[0].sockets).toContain(monitorWs);
  });

  it('classroom_activity_cancel fans out to monitor sockets', () => {
    var bag = seedRoom(registry, 'P1', 2);
    var monitorWs = makeWs();
    registry.subscribeMonitor(monitorWs);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var result = registry.cancelActivity(bag.teacherWs);
    expect(result.broadcasts[0].sockets).toContain(monitorWs);
  });
});

// 2026-05-24 V4 Codex review folds. Each describe pins a finding's fix.

describe('Codex BLOCKER fold: override-gate POST body uses studentUsername (not username)', () => {
  it('source for _postOverrideGate references studentUsername in the body', () => {
    // The bug: the previous body was { username, lessonKey, reason }, but
    // the lesson-unlock route validates `studentUsername` -- 400 every time.
    // Pin the source so a regression cannot silently re-introduce the wrong
    // field name. (Behavioral test would need a live HTTP server; structural
    // pin catches the regression cheaply.)
    var src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../classroom.js'),
      'utf8'
    );
    var fnStart = src.indexOf('function _postOverrideGate(');
    var fnEnd = src.indexOf('\n}\n', fnStart);
    var body = src.slice(fnStart, fnEnd);
    expect(body).toMatch(/studentUsername:\s*username/);
    // The old field name must NOT appear anywhere in the body shape.
    expect(body).not.toMatch(/JSON\.stringify\(\s*\{\s*username:/);
  });
});

describe('Codex BLOCKER fold: reverse mutex -- gate/poll/doorways reject when activity is live', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('armGate is rejected when an unfinished activity is live', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var room = registry._getRoom('P1');
    expect(room.activity).not.toBeNull();
    expect(room.activity.finished).toBe(false);
    var result = registry.armGate(bag.teacherWs, 'classic', Date.now());
    expect(result.broadcasts).toEqual([]);
    expect(room.gate && room.gate.armed).toBeFalsy();
  });

  it('openPoll is rejected when an unfinished activity is live', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var result = registry.openPoll(bag.teacherWs, 'Q?', ['A', 'B'], false, Date.now());
    expect(result.broadcasts).toEqual([]);
    var room = registry._getRoom('P1');
    expect(room.poll).toBeNull();
  });

  it('openDoorways is rejected when an unfinished activity is live', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var result = registry.openDoorways(bag.teacherWs, 'dw1', 'Q?',
      [{ label: 'A', doorId: 'd0' }, { label: 'B', doorId: 'd1' }],
      Date.now());
    expect(result.broadcasts).toEqual([]);
    var room = registry._getRoom('P1');
    expect(room.doorways).toBeFalsy();
  });

  it('armGate / openPoll / openDoorways succeed after the activity finishes', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    registry.cancelActivity(bag.teacherWs);
    // One tick to drop the finished activity from room.activity.
    registry.activityTick(Date.now());
    var room = registry._getRoom('P1');
    expect(room.activity).toBeNull();
    var gateResult = registry.armGate(bag.teacherWs, 'classic', Date.now());
    expect(gateResult.broadcasts.length).toBeGreaterThan(0);
  });
});

describe('Codex MAJOR fold: activityTick cancels the activity when room drops to zero online students', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('fires a classroom_activity_timeout with reason=room-empty when no students are online', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    // Flip both students offline by direct mutation -- detach() also works
    // but this isolates the activityTick behavior from the detach pipeline.
    var room = registry._getRoom('P1');
    room.members.forEach(function (m) { if (m.role === 'student') m.online = false; });
    var result = registry.activityTick(Date.now());
    var types = payloadTypes(result.broadcasts);
    expect(types).toContain('classroom_activity_timeout');
    var to = result.broadcasts.find(function (bc) {
      return bc.payload && bc.payload.type === 'classroom_activity_timeout';
    });
    expect(to.payload.reason).toBe('room-empty');
    expect(room.activity.finished).toBe(true);
  });

  it('does NOT fire room-empty timeout when at least one student is still online', () => {
    var bag = seedRoom(registry, 'P1', 2);
    registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    var room = registry._getRoom('P1');
    // Flip only ONE student offline -- the other stays.
    var first = null;
    room.members.forEach(function (m) {
      if (m.role === 'student' && !first) { m.online = false; first = m; }
    });
    var result = registry.activityTick(Date.now());
    var types = payloadTypes(result.broadcasts);
    // Should still broadcast normal state, not timeout.
    expect(types).toContain('classroom_activity_state');
    expect(types).not.toContain('classroom_activity_timeout');
    expect(room.activity.finished).toBe(false);
  });
});
