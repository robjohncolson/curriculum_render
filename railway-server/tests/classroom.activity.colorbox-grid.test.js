// classroom.activity.colorbox-grid.test.js
// Unit tests for the v6 Live Classroom Activity colorbox-grid plugin.
// See LIVE_CLASSROOM_V6_BUILD.md sections C2 + C7-Unit-A for the
// contract. All tests use stub ws objects -- no real sockets, no HTTP.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createClassroomRegistry,
  __ACTIVITY_PLUGINS,
  __ACTIVITY_LESSON_MAP,
  __COLORBOX_GRID_HOLD_TARGET_MS,
  __COLORBOX_GRID_DEFAULT_DURATION_MS,
  __validateSecondAxis,
  __emptyTally,
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
// is [{ username, hue }]. Returns { teacherWs, students:[{ws, username, hue}] }.
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

// Helper: set the canonical position for a member by direct mutation.
// y defaults to the center of the row band so callers can focus on x.
function setPos(registry, section, username, x, y) {
  var room = registry._getRoom(section);
  if (!room) throw new Error('setPos: no room ' + section);
  var m = room.members.get(username);
  if (!m) throw new Error('setPos: no member ' + username);
  var yy = (typeof y === 'number') ? y : 100;
  m.pos = { x: x, y: yy, state: 'idle', vx: 0 };
}

// Default prompt-mode secondAxis for tests: 2-column Yes/No prompt.
function defaultPromptOpts() {
  return {
    secondAxis: {
      mode: 'prompt',
      question: 'Are you left-handed?',
      options: ['No', 'Yes']
    }
  };
}

// Default auto-mode secondAxis for tests: 2-column Group A/B random.
function defaultAutoOpts() {
  return {
    secondAxis: {
      mode: 'auto',
      labels: ['Group A', 'Group B']
    }
  };
}

// Helper: drive every student into their correct cell. Each row band
// is BOARD_H/4 = 55 px tall (BOARD_H = 220 hardcoded in onTick); each
// column on a default canvasW=320 is 320/colCount wide. Center of cell:
// x = col * (320/colCount) + (320/colCount)/2, y = row * 55 + 27.
function walkAllToCorrectCell(registry, section) {
  var room = registry._getRoom(section);
  var state = room.activity.state;
  var keys = Object.keys(state.assignments);
  var colW = 320 / state.colCount;
  keys.forEach(function (uname) {
    var row = state.assignments[uname].row;
    var col = state.picks[uname];
    if (col == null) return;  // can't walk into a cell without a pick
    setPos(registry, section, uname, col * colW + colW / 2, row * 55 + 27);
  });
}

describe('v6 colorbox-grid -- plugin registry + constants', () => {
  it('registers colorbox-grid under the activity type string', () => {
    expect(__ACTIVITY_PLUGINS).toBeDefined();
    expect(__ACTIVITY_PLUGINS['colorbox-grid']).toBeDefined();
  });

  it('colorbox-grid plugin exposes every method the engine calls', () => {
    var p = __ACTIVITY_PLUGINS['colorbox-grid'];
    expect(typeof p.minMembers).toBe('number');
    expect(p.minMembers).toBe(2);
    expect(typeof p.initActivity).toBe('function');
    expect(typeof p.onStudentInput).toBe('function');
    expect(typeof p.onTick).toBe('function');
    expect(typeof p.isComplete).toBe('function');
    expect(typeof p.serializeForBoard).toBe('function');
    expect(typeof p.onMemberLeave).toBe('function');
    expect(typeof p.onMemberJoin).toBe('function');
  });

  it('ACTIVITY_LESSON_MAP wires colorbox-grid to lesson 1.4', () => {
    expect(__ACTIVITY_LESSON_MAP['colorbox-grid']).toBe('1.4');
  });

  it('exports COLORBOX_GRID_HOLD_TARGET_MS = 5000 (5 s mastery hold)', () => {
    expect(__COLORBOX_GRID_HOLD_TARGET_MS).toBe(5000);
  });

  it('exports COLORBOX_GRID_DEFAULT_DURATION_MS = 75000 (75 s default)', () => {
    expect(__COLORBOX_GRID_DEFAULT_DURATION_MS).toBe(75000);
  });
});

describe('v6 colorbox-grid -- validateSecondAxis', () => {
  it('accepts a valid prompt-mode shape and trims/slices strings', () => {
    var out = __validateSecondAxis({
      mode: 'prompt',
      question: '  Are you left-handed?  ',
      options: ['  No ', 'Yes']
    });
    expect(out).toEqual({
      mode: 'prompt',
      question: 'Are you left-handed?',
      options: ['No', 'Yes']
    });
  });

  it('accepts a valid auto-mode shape', () => {
    var out = __validateSecondAxis({
      mode: 'auto',
      labels: ['Group A', 'Group B']
    });
    expect(out).toEqual({
      mode: 'auto',
      labels: ['Group A', 'Group B']
    });
  });

  it('accepts 2..4 options/labels at both extremes', () => {
    var two = __validateSecondAxis({ mode: 'prompt', question: 'q', options: ['a', 'b'] });
    expect(two).not.toBeNull();
    var four = __validateSecondAxis({ mode: 'auto', labels: ['a', 'b', 'c', 'd'] });
    expect(four).not.toBeNull();
  });

  it('rejects out-of-range option/label counts and non-array fields', () => {
    expect(__validateSecondAxis({ mode: 'prompt', question: 'q', options: ['only'] })).toBeNull();
    expect(__validateSecondAxis({ mode: 'auto',   labels:  ['a', 'b', 'c', 'd', 'e'] })).toBeNull();
    expect(__validateSecondAxis({ mode: 'prompt', question: 'q', options: 'not-array' })).toBeNull();
    expect(__validateSecondAxis({ mode: 'auto',   labels: null })).toBeNull();
  });

  it('rejects missing/invalid mode + null/undefined + wrong-type fields', () => {
    expect(__validateSecondAxis(null)).toBeNull();
    expect(__validateSecondAxis(undefined)).toBeNull();
    expect(__validateSecondAxis('string')).toBeNull();
    expect(__validateSecondAxis({ mode: 'weird' })).toBeNull();
    expect(__validateSecondAxis({ mode: 'prompt', question: 42, options: ['a', 'b'] })).toBeNull();
    expect(__validateSecondAxis({ mode: 'prompt', question: 'q', options: ['a', 42] })).toBeNull();
  });

  it('clamps question to 280 chars and labels to 40 chars', () => {
    var longQ = 'q'.repeat(500);
    var longLabel = 'L'.repeat(100);
    var prompt = __validateSecondAxis({
      mode: 'prompt',
      question: longQ,
      options: [longLabel, longLabel]
    });
    expect(prompt.question.length).toBe(280);
    expect(prompt.options[0].length).toBe(40);
    var auto = __validateSecondAxis({
      mode: 'auto',
      labels: [longLabel, longLabel]
    });
    expect(auto.labels[0].length).toBe(40);
  });
});

describe('v6 colorbox-grid -- emptyTally helper', () => {
  it('returns a rows x cols matrix of zeros', () => {
    expect(__emptyTally(4, 2)).toEqual([[0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(__emptyTally(4, 3)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  });

  it('produces independent rows (mutating one does not affect another)', () => {
    var t = __emptyTally(4, 2);
    t[0][0] = 99;
    expect(t[1][0]).toBe(0);
    expect(t[2][0]).toBe(0);
    expect(t[3][0]).toBe(0);
  });
});

describe('v6 colorbox-grid -- initActivity in prompt mode', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('assigns each student a row from their hue + leaves picks[u]=null', () => {
    // alice hue=10 -> Red(0); bob hue=120 -> Yellow(1); carol hue=200 -> Green(2)
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 120 },
      { username: 'carol', hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.assignments.alice).toEqual({ row: 0 });
    expect(snap.activity.state.assignments.bob).toEqual({ row: 1 });
    expect(snap.activity.state.assignments.carol).toEqual({ row: 2 });
    expect(snap.activity.state.picks.alice).toBeNull();
    expect(snap.activity.state.picks.bob).toBeNull();
    expect(snap.activity.state.picks.carol).toBeNull();
  });

  it('falls back to username-hash hue when a student has hue=null', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue: null },
      { username: 'bob',   hue:   50 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var expected = __zoneForHue(__fallbackHueForUsername('alice'));
    expect(snap.activity.state.assignments.alice).toEqual({ row: expected });
    expect(snap.activity.state.assignments.bob).toEqual({ row: 0 });  // hue 50 -> Red(0)
  });

  it('initial state has empty currentCell + zeroed 4xC tally + holdMs=0', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.currentCell).toEqual({});
    expect(snap.activity.state.tally).toEqual([[0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(snap.activity.state.holdMs).toBe(0);
    expect(snap.activity.state.holdTargetMs).toBe(5000);
    expect(snap.activity.state.colCount).toBe(2);
  });

  it('falls back to a default Yes/No prompt when opts.secondAxis is missing', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', {}, Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.secondAxis.mode).toBe('prompt');
    expect(snap.activity.state.secondAxis.options).toEqual(['No', 'Yes']);
    expect(snap.activity.state.colCount).toBe(2);
  });

  it('does not assign the teacher a row', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.assignments.teach).toBeUndefined();
    expect(snap.activity.state.picks.teach).toBeUndefined();
  });
});

describe('v6 colorbox-grid -- initActivity in auto mode', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('assigns each student a random column 0..colCount-1', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue:  50 },
      { username: 'carol', hue: 100 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultAutoOpts(), Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    var names = ['alice', 'bob', 'carol'];
    names.forEach(function (n) {
      var c = snap.activity.state.picks[n];
      expect(typeof c).toBe('number');
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(2);
    });
  });

  it('still assigns each student a row from their hue in auto mode', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultAutoOpts(), Date.now());
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.assignments.alice).toEqual({ row: 0 });
    expect(snap.activity.state.assignments.bob).toEqual({ row: 2 });
  });
});

describe('v6 colorbox-grid -- onStudentInput pick recording', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('in prompt mode: { choice: c } sets picks[username]', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    registry.activityValue(bag.students[0].ws, { choice: 1 });
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.picks.alice).toBe(1);
    expect(snap.activity.state.picks.bob).toBeNull();
  });

  it('clamps choice to [0, colCount-1] -- out-of-range payloads dropped', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    var plugin = __ACTIVITY_PLUGINS['colorbox-grid'];
    var state0 = registry._getRoom('P1').activity.state;
    // Out of range high.
    expect(plugin.onStudentInput(state0, 'alice', { choice: 5 })).toBeNull();
    // Out of range low.
    expect(plugin.onStudentInput(state0, 'alice', { choice: -1 })).toBeNull();
    // Bad payloads.
    expect(plugin.onStudentInput(state0, 'alice', null)).toBeNull();
    expect(plugin.onStudentInput(state0, 'alice', {})).toBeNull();
    expect(plugin.onStudentInput(state0, 'alice', { choice: 'a' })).toBeNull();
  });

  it('in auto mode: { choice: c } is ignored (returns null)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultAutoOpts(), Date.now());
    var plugin = __ACTIVITY_PLUGINS['colorbox-grid'];
    var state0 = registry._getRoom('P1').activity.state;
    var alicePickBefore = state0.picks.alice;
    var next = plugin.onStudentInput(state0, 'alice', { choice: 0 });
    expect(next).toBeNull();
    // Confirm pick was not silently mutated.
    expect(registry._getRoom('P1').activity.state.picks.alice).toBe(alicePickBefore);
  });

  it('returns null when sender has no entry in picks (unknown user)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    var plugin = __ACTIVITY_PLUGINS['colorbox-grid'];
    var state0 = registry._getRoom('P1').activity.state;
    expect(plugin.onStudentInput(state0, 'ghost', { choice: 0 })).toBeNull();
  });

  it('returns null when re-asserting the same pick (no churn)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    registry.activityValue(bag.students[0].ws, { choice: 1 });
    var plugin = __ACTIVITY_PLUGINS['colorbox-grid'];
    var state0 = registry._getRoom('P1').activity.state;
    expect(plugin.onStudentInput(state0, 'alice', { choice: 1 })).toBeNull();
  });
});

describe('v6 colorbox-grid -- onTick computes cells from positions', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('computes (row, col) from (y, x) with default canvas (320 wide, 220 tall)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },   // row 0
      { username: 'bob',   hue: 200 }    // row 2
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    // Pick first so cells can compute. Each on 2-col grid, col width = 160.
    registry.activityValue(bag.students[0].ws, { choice: 1 });   // alice picks col 1
    registry.activityValue(bag.students[1].ws, { choice: 0 });   // bob picks col 0
    // alice -> right column (col 1) AND top row (row 0).
    setPos(registry, 'P1', 'alice', 200, 20);   // x=200/160 floor=1, y=20/55 floor=0
    // bob -> left column (col 0) AND third row (row 2).
    setPos(registry, 'P1', 'bob', 40, 120);    // x=40/160 floor=0, y=120/55 floor=2
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.currentCell.alice).toEqual({ row: 0, col: 1 });
    expect(s.currentCell.bob).toEqual({ row: 2, col: 0 });
  });

  it('uses per-member canvasW (V5 fix) when computing col from x', () => {
    // Members on a 640 canvas: col width is 640/2 = 320 (not 160).
    // alice at x=400 should land in col 1 (right half of 640 canvas).
    // With the old hardcoded canvasW=320, x=400 would have been col 2 (clamped to 1).
    var teacherWs = makeWs();
    registry.join(teacherWs, 'P1', 'teach', 'teacher', Date.now());
    var sws1 = makeWs();
    registry.join(sws1, 'P1', 'alice', 'student', Date.now(), 10);   // row 0
    var sws2 = makeWs();
    registry.join(sws2, 'P1', 'bob',   'student', Date.now(), 200);  // row 2
    // Set canvasW=640 via position() (the V5 channel for canvasW).
    registry.position(sws1, 400, 20, 'idle', 0, Date.now(), 640);
    registry.position(sws2, 200, 120, 'idle', 0, Date.now(), 640);
    registry.startActivity(teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    registry.activityValue(sws1, { choice: 0 });
    registry.activityValue(sws2, { choice: 1 });
    var tick = registry.activityTick(Date.now());
    var s = tick.broadcasts[0].payload.state;
    // alice at x=400 on 640 canvas: col = floor(400 / (640/2)) = floor(400/320) = 1.
    expect(s.currentCell.alice.col).toBe(1);
    // bob at x=200 on 640 canvas: col = floor(200 / 320) = 0.
    expect(s.currentCell.bob.col).toBe(0);
  });

  it('clamps row/col into [0,3] / [0,colCount-1] for out-of-range positions', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue: 10 },
      { username: 'bob',   hue: 10 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    registry.activityValue(bag.students[1].ws, { choice: 1 });
    setPos(registry, 'P1', 'alice', -50, -100);      // clamp to (0, 0)
    setPos(registry, 'P1', 'bob',   99999, 99999);   // clamp to (3, colCount-1=1)
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.currentCell.alice).toEqual({ row: 0, col: 0 });
    expect(s.currentCell.bob).toEqual({ row: 3, col: 1 });
  });

  it('marks current cell as { row:-1, col:-1 } when student has not picked', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    // No picks yet -- both should have currentCell -1.
    setPos(registry, 'P1', 'alice', 80, 20);
    setPos(registry, 'P1', 'bob',   80, 120);
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.currentCell.alice).toEqual({ row: -1, col: -1 });
    expect(s.currentCell.bob).toEqual({ row: -1, col: -1 });
  });

  it('computes the per-cell tally + correctly skips unpicked students', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue:  10 },
      { username: 'carol', hue:  10 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    registry.activityValue(bag.students[1].ws, { choice: 0 });
    // carol intentionally has no pick.
    setPos(registry, 'P1', 'alice', 40, 20);    // (0, 0)
    setPos(registry, 'P1', 'bob',   40, 20);    // (0, 0)
    setPos(registry, 'P1', 'carol', 40, 20);    // not counted (no pick)
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.tally[0][0]).toBe(2);
    expect(s.tally[0][1]).toBe(0);
  });
});

describe('v6 colorbox-grid -- holdMs hold-eligible logic', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('holdMs stays 0 in prompt mode until ALL students have picked', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    // Only alice picks; bob still pending. Even if alice walks to her cell, holdMs=0.
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    setPos(registry, 'P1', 'alice', 40, 20);
    setPos(registry, 'P1', 'bob',   40, 120);
    var t1 = registry.activityTick(1200);
    expect(t1.broadcasts[0].payload.state.holdMs).toBe(0);
  });

  it('increments holdMs by 200 ms per tick when all picked + all in correct cell', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    registry.activityValue(bag.students[1].ws, { choice: 1 });
    walkAllToCorrectCell(registry, 'P1');
    var t1 = registry.activityTick(1200);
    expect(t1.broadcasts[0].payload.state.holdMs).toBe(200);
    var t2 = registry.activityTick(1400);
    expect(t2.broadcasts[0].payload.state.holdMs).toBe(400);
  });

  it('resets holdMs to 0 when even one student leaves the correct cell', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    registry.activityValue(bag.students[1].ws, { choice: 1 });
    walkAllToCorrectCell(registry, 'P1');
    var t1 = registry.activityTick(1200);
    expect(t1.broadcasts[0].payload.state.holdMs).toBe(200);
    // Move bob to the WRONG row.
    setPos(registry, 'P1', 'bob', 200, 20);   // row 0 instead of 2
    var t2 = registry.activityTick(1400);
    expect(t2.broadcasts[0].payload.state.holdMs).toBe(0);
  });

  it('resets holdMs to 0 when a student goes offline', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    registry.activityValue(bag.students[1].ws, { choice: 1 });
    walkAllToCorrectCell(registry, 'P1');
    var t1 = registry.activityTick(1200);
    expect(t1.broadcasts[0].payload.state.holdMs).toBe(200);
    // Flip bob offline.
    var room = registry._getRoom('P1');
    room.members.get('bob').online = false;
    var t2 = registry.activityTick(1400);
    expect(t2.broadcasts[0].payload.state.holdMs).toBe(0);
  });

  it('isComplete fires only when holdMs >= 5000', () => {
    var plugin = __ACTIVITY_PLUGINS['colorbox-grid'];
    expect(plugin.isComplete({ holdMs: 0 })).toBe(false);
    expect(plugin.isComplete({ holdMs: 4999 })).toBe(false);
    expect(plugin.isComplete({ holdMs: 5000 })).toBe(true);
    expect(plugin.isComplete({ holdMs: 6000 })).toBe(true);
  });
});

describe('v6 colorbox-grid -- onMemberJoin / onMemberLeave', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('in prompt mode: new joiner gets row assignment with null pick', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    var newWs = makeWs();
    registry.join(newWs, 'P1', 'carol', 'student', Date.now(), 250);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    // Hue 250 -> Green(2).
    expect(snap.activity.state.assignments.carol).toEqual({ row: 2 });
    expect(snap.activity.state.picks.carol).toBeNull();
  });

  it('in auto mode: new joiner gets row + a random col (0..colCount-1)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultAutoOpts(), Date.now());
    var newWs = makeWs();
    registry.join(newWs, 'P1', 'carol', 'student', Date.now(), 95);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.assignments.carol).toEqual({ row: 1 });  // hue 95 -> Yellow(1)
    var c = snap.activity.state.picks.carol;
    expect(typeof c).toBe('number');
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThan(2);
  });

  it('re-join of a known student does NOT reassign (keeps prior pick)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    registry.activityValue(bag.students[0].ws, { choice: 1 });
    var beforePick = registry.stateFor('P1', 'teacher', 'teach').activity.state.picks.alice;
    var beforeRow  = registry.stateFor('P1', 'teacher', 'teach').activity.state.assignments.alice.row;
    // Detach alice + re-join on a new socket with a DIFFERENT hue.
    registry.detach(bag.students[0].ws, Date.now());
    var newWs = makeWs();
    registry.join(newWs, 'P1', 'alice', 'student', Date.now(), 300);  // hue 300 -> Blue(3)
    var afterPick = registry.stateFor('P1', 'teacher', 'teach').activity.state.picks.alice;
    var afterRow  = registry.stateFor('P1', 'teacher', 'teach').activity.state.assignments.alice.row;
    expect(afterPick).toBe(beforePick);
    expect(afterRow).toBe(beforeRow);
  });

  it('onMemberLeave removes assignment + pick + currentCell entry via sweep', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    registry.activityValue(bag.students[1].ws, { choice: 1 });
    setPos(registry, 'P1', 'alice', 40, 20);
    setPos(registry, 'P1', 'bob',   200, 120);
    registry.activityTick(1200);
    registry.detach(bag.students[1].ws, 2000);
    var future = 2000 + 50 * 60 * 1000;  // > IDLE_GC_MS (45 min)
    registry.sweep(future);
    var snap = registry.stateFor('P1', 'teacher', 'teach');
    expect(snap.activity.state.assignments.bob).toBeUndefined();
    expect(snap.activity.state.picks.bob).toBeUndefined();
    expect(snap.activity.state.currentCell.bob).toBeUndefined();
    expect(snap.activity.state.assignments.alice).toBeDefined();
  });

  it('plugin.onMemberLeave returns null when username is not in assignments', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    var plugin = __ACTIVITY_PLUGINS['colorbox-grid'];
    var s = registry._getRoom('P1').activity.state;
    expect(plugin.onMemberLeave(s, 'ghost')).toBeNull();
  });
});

describe('v6 colorbox-grid -- serializeForBoard public shape', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('exposes secondAxis/colCount/assignments/picks/currentCell/tally/holdMs/holdTargetMs', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    registry.activityValue(bag.students[1].ws, { choice: 1 });
    setPos(registry, 'P1', 'alice', 40, 20);
    setPos(registry, 'P1', 'bob',   200, 120);
    var tick = registry.activityTick(1200);
    var s = tick.broadcasts[0].payload.state;
    expect(s.secondAxis).toBeDefined();
    expect(s.secondAxis.mode).toBe('prompt');
    expect(s.colCount).toBe(2);
    expect(s.assignments).toBeDefined();
    expect(s.picks).toBeDefined();
    expect(s.currentCell).toBeDefined();
    expect(s.tally).toBeDefined();
    expect(s.tally.length).toBe(4);
    expect(s.tally[0].length).toBe(2);
    expect(typeof s.holdMs).toBe('number');
    expect(s.holdTargetMs).toBe(5000);
  });

  it('snapshot (buildStatePayload) carries grid state for late-joiners', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    var lateWs = makeWs();
    var joinRes = registry.join(lateWs, 'P1', 'newbie', 'student', Date.now(), 95);
    var snap = joinRes.sends[0].payload;
    expect(snap.activity).toBeDefined();
    expect(snap.activity.type).toBe('colorbox-grid');
    expect(snap.activity.state.holdTargetMs).toBe(5000);
    expect(snap.activity.state.colCount).toBe(2);
    expect(snap.activity.state.secondAxis.mode).toBe('prompt');
    // newbie was assigned at join time via onMemberJoin: hue 95 -> row 1.
    expect(snap.activity.state.assignments.newbie).toEqual({ row: 1 });
    // Prompt mode -> pick stays null until they answer.
    expect(snap.activity.state.picks.newbie).toBeNull();
  });
});

describe('v6 colorbox-grid -- mutex with other modes', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('cannot start colorbox-grid while a bridge-mean activity is live', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    var first = registry.startActivity(bag.teacherWs, 'bridge-mean', {}, Date.now());
    expect(first.broadcasts).toHaveLength(1);
    var second = registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    expect(second.broadcasts).toHaveLength(0);
  });

  it('cannot start colorbox-grid while a colorbox-hue activity is live', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    var first = registry.startActivity(bag.teacherWs, 'colorbox-hue', {}, Date.now());
    expect(first.broadcasts).toHaveLength(1);
    var second = registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    expect(second.broadcasts).toHaveLength(0);
  });

  it('cannot start colorbox-grid while a poll is open or a gate is armed', () => {
    var bag1 = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.openPoll(bag1.teacherWs, 'Q?', ['a', 'b'], false, Date.now());
    var r1 = registry.startActivity(bag1.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    expect(r1.broadcasts).toHaveLength(0);

    var bag2 = seedRoomWithHues(registry, 'P2', [
      { username: 'carol', hue:  10 },
      { username: 'dora',  hue: 200 }
    ]);
    registry.armGate(bag2.teacherWs, 'classic', Date.now());
    var r2 = registry.startActivity(bag2.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    expect(r2.broadcasts).toHaveLength(0);
  });

  it('rejects colorbox-grid when online students < 2 (minMembers gate)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue: 10 }
    ]);
    var result = registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), Date.now());
    expect(result.broadcasts).toHaveLength(1);
    expect(result.broadcasts[0].payload.type).toBe('classroom_activity_error');
    expect(result.broadcasts[0].payload.code).toBe('not-enough-members');
    expect(result.broadcasts[0].payload.minMembers).toBe(2);
  });
});

describe('v6 colorbox-grid -- end-to-end success fires after 5 s hold', () => {
  var registry;
  beforeEach(() => { registry = createClassroomRegistry(); });

  it('fires classroom_activity_success after 25 in-cell ticks (5 s)', () => {
    var bag = seedRoomWithHues(registry, 'P1', [
      { username: 'alice', hue:  10 },
      { username: 'bob',   hue: 200 }
    ]);
    registry.startActivity(bag.teacherWs, 'colorbox-grid', defaultPromptOpts(), 1000);
    registry.activityValue(bag.students[0].ws, { choice: 0 });
    registry.activityValue(bag.students[1].ws, { choice: 1 });
    walkAllToCorrectCell(registry, 'P1');
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
    expect(successPayload.activityType).toBe('colorbox-grid');
    expect(successPayload.finalState).toBeDefined();
    expect(successPayload.finalState.holdTargetMs).toBe(5000);
    expect(successPayload.finalState.colCount).toBe(2);
  });
});
