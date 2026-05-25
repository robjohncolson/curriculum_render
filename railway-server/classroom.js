// classroom.js
// ES module -- exports createClassroomRegistry()
//
// V7 (2026-05-25): adds the 'level' activity plugin -- delegates to
// level-engine.js so the engine layer stays separable.
import * as levelEngine from './level-engine.js';

//
// Owns the in-memory classroom state for the Live Classroom feature.
// Holds socket references but performs NO socket I/O.
// Methods return { sends: [{ ws, payload }], broadcasts: [{ sockets, payload }] }
// so server.js can call .send() and the module stays unit-testable.
//
// Protocol: see LIVE_CLASSROOM_V1B_BUILD.md Section 2.
// Knobs: heartbeat 30s, liveness window 45s, idle GC 45 min.

const LIVENESS_MS = 45 * 1000;          // 45 seconds
const IDLE_GC_MS  = 45 * 60 * 1000;     // 45 minutes
const NUDGE_TTL_MS = 10 * 60 * 1000;    // 10 minutes: recentNudges retention (P3 Codex BLOCKER fold)

// v4 Activity engine -- bridge-mean plugin constants.
const BRIDGE_MEAN_HOLD_TARGET_MS = 3000;
const BRIDGE_MEAN_TOLERANCE      = 0.3;
const ACTIVITY_TICK_MS           = 200;
const DEFAULT_ACTIVITY_DURATION_MS = 90000;

// v5 Activity engine -- colorbox-hue plugin constants + helpers.
// Logical board width matches the Desk renderer's coordinate system
// (DEFAULT_BOARD_W = 320). Four zones partition the horizontal axis
// at 0-89, 90-179, 180-269, 270-359 hue degrees.
var COLORBOX_HUE_HOLD_TARGET_MS = 5000;
var COLORBOX_HUE_ZONES = [
  { id: 0, label: 'Red',    hueMin:   0, hueMax:  89 },
  { id: 1, label: 'Yellow', hueMin:  90, hueMax: 179 },
  { id: 2, label: 'Green',  hueMin: 180, hueMax: 269 },
  { id: 3, label: 'Blue',   hueMin: 270, hueMax: 359 }
];

// v6 Activity engine -- colorbox-grid plugin constants.
// Same 5-second hold target as V5, but a separate constant so the two
// plugins can drift independently if V6 ever needs a different mastery
// threshold (chi-square variants etc.). Default duration is 75 s --
// halfway between V4's 90 s coordination and V5's 60 s walking, since
// V6 adds a per-student pick step before the walk.
var COLORBOX_GRID_HOLD_TARGET_MS = 5000;
var COLORBOX_GRID_DEFAULT_DURATION_MS = 75000;

// Stable per-username hue fallback. Mirrors the LC render layer's
// fallback so a hue-less student gets the same "category" across
// sessions. Result is in [0, 359].
// 2026-05-24 V5 Codex MAJOR fold: this function MUST exactly match
// classroom-board.js `hashStringToHue` so a hue-less student's avatar
// tint and their colorbox-hue zone assignment use the same hue. The
// previous implementation used `(h * 31 + char) & 0x7fffffff` -- a
// different hash that gave different hues (e.g. "student" -> server 203
// vs board 285, drifting them into different zones).
function fallbackHueForUsername(username) {
  // Verbatim from follow-alongs classroom-board.js hashStringToHue
  // (which itself is a verbatim copy from curriculum_render's
  // sprite_manager.js). Do not modify -- parity matters.
  var hash = 0;
  for (var i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash) + username.charCodeAt(i);
    hash = hash | 0;  // keep 32-bit signed
  }
  return Math.abs(hash) % 360;
}

// Quadrant index for a hue in degrees. Wraparound-safe: 360 -> 0,
// -10 -> 350 -> 3. Returns one of {0, 1, 2, 3}.
function zoneForHue(hue) {
  var h = ((hue % 360) + 360) % 360;
  return Math.floor(h / 90);
}

// v4 Activity engine -- per-activity lesson key map for override-gate auto-fire.
// v5: colorbox-hue maps to U1.3 (Displaying Categorical Data) per spec.
// v6: colorbox-grid maps to U1.4 (Two-Way Tables) per spec.
var ACTIVITY_LESSON_MAP = {
  'bridge-mean':   '1.1',
  'colorbox-hue':  '1.3',
  'colorbox-grid': '1.4'
};

// v4 Activity engine -- plugin registry. Keyed by activity type string.
// Populated below with the bridge-mean plugin (v4) + colorbox-hue (v5).
// Module-scope so server.js and tests can interrogate it.
var activityPlugins = {};

// v4 Activity engine -- fire-and-forget override-gate unlock POST.
// Used on activity success to unlock the lesson for every present student.
// Failures are logged via console.warn and do NOT block the success broadcast.
function _postOverrideGate(username, lessonKey, reason) {
  var base = (typeof process !== 'undefined' && process.env && process.env.ROSTER_SERVICE_URL) || null;
  if (!base) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[activity] ROSTER_SERVICE_URL not set; override-gate skipped for', username, lessonKey);
    }
    return;
  }
  var secret = (typeof process !== 'undefined' && process.env && process.env.TEACHER_SECRET) || null;
  var url = base.replace(/\/+$/, '') + '/teacher/lesson-unlock';
  // 2026-05-24 Codex BLOCKER fold: the lesson-unlock route validates
  // `studentUsername` (NOT `username`). With the wrong field, every
  // success-path POST returned 400 and the lesson never unlocked,
  // breaking the frozen mastery action. The route's spec is in
  // `follow-alongs/roster-server/lesson-unlock.js`.
  var body = JSON.stringify({
    studentUsername: username,
    lessonKey:       lessonKey,
    reason:          reason || 'activity-success'
  });
  // Best-effort: use globalThis.fetch when available; ignore promise.
  if (typeof globalThis === 'undefined' || typeof globalThis.fetch !== 'function') {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[activity] global fetch unavailable; override-gate skipped for', username, lessonKey);
    }
    return;
  }
  try {
    var headers = { 'content-type': 'application/json' };
    if (secret) { headers['x-teacher-secret'] = secret; }
    globalThis.fetch(url, { method: 'POST', headers: headers, body: body }).then(function (res) {
      if (!res || !res.ok) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[activity] override-gate POST returned non-ok for', username, lessonKey, res && res.status);
        }
      }
    }).catch(function (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[activity] override-gate POST failed for', username, lessonKey, err && err.message);
      }
    });
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[activity] override-gate POST threw for', username, lessonKey, e && e.message);
    }
  }
}

// v4 Activity engine -- bridge-mean plugin.
// Initial state: each online student gets a random int [1,10] value.
// Target: random int [3,8] but NEVER equal to round(mean(initialValues)).
// Tolerance: fixed +/- 0.3.
// onStudentInput accepts payload.delta in {-1, +1}; clamps values to [1,10].
// onTick recomputes currentMean + holdMs; holdMs resets on exit from band.
// isComplete: holdMs >= 3000.
// serializeForBoard exposes values/target/tolerance/currentMean(2dp)/holdMs/holdTargetMs.
activityPlugins['bridge-mean'] = {
  minMembers: 2,

  initActivity: function (room, onlineStudents, opts) {
    var values = {};
    var sum = 0;
    onlineStudents.forEach(function (m) {
      var v = 1 + Math.floor(Math.random() * 10);
      values[m.username] = v;
      sum += v;
    });
    var initialMean = onlineStudents.length > 0 ? (sum / onlineStudents.length) : 0;
    var rounded = Math.round(initialMean);
    var candidates = [];
    for (var t = 3; t <= 8; t++) {
      if (t !== rounded) { candidates.push(t); }
    }
    // candidates is never empty: rounded eliminates at most one of six values.
    var target = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      values:     values,
      target:     target,
      tolerance:  BRIDGE_MEAN_TOLERANCE,
      currentMean: initialMean,
      holdMs:     0,
      lastTickAt: Date.now()
    };
  },

  onStudentInput: function (state, username, payload) {
    if (!payload || typeof payload.delta !== 'number') { return null; }
    // Only -1 or +1 deltas accepted; everything else is dropped.
    var d = (payload.delta > 0) ? 1 : (payload.delta < 0) ? -1 : 0;
    if (d === 0) { return null; }
    if (!(username in state.values)) { return null; }
    var next = Object.assign({}, state);
    next.values = Object.assign({}, state.values);
    next.values[username] = Math.max(1, Math.min(10, state.values[username] + d));
    return next;
  },

  onTick: function (state, deltaMs) {
    var keys = Object.keys(state.values);
    if (keys.length === 0) {
      return Object.assign({}, state, { currentMean: 0, holdMs: 0 });
    }
    var sum = 0;
    for (var i = 0; i < keys.length; i++) { sum += state.values[keys[i]]; }
    var mean = sum / keys.length;
    var inBand = Math.abs(mean - state.target) <= state.tolerance;
    var nextHoldMs = inBand ? (state.holdMs + deltaMs) : 0;
    return Object.assign({}, state, {
      currentMean: mean,
      holdMs:      nextHoldMs
    });
  },

  isComplete: function (state) {
    return state.holdMs >= BRIDGE_MEAN_HOLD_TARGET_MS;
  },

  serializeForBoard: function (state) {
    return {
      values:       state.values,
      target:       state.target,
      tolerance:    state.tolerance,
      currentMean:  Math.round(state.currentMean * 100) / 100,
      holdMs:       state.holdMs,
      holdTargetMs: BRIDGE_MEAN_HOLD_TARGET_MS
    };
  },

  onMemberLeave: function (state, username) {
    if (!(username in state.values)) { return null; }
    var next = Object.assign({}, state, { values: Object.assign({}, state.values) });
    delete next.values[username];
    return next;
  },

  onMemberJoin: function (state, username) {
    if (username in state.values) { return null; }  // re-join: keep prior value
    var v = 1 + Math.floor(Math.random() * 10);
    var next = Object.assign({}, state, { values: Object.assign({}, state.values) });
    next.values[username] = v;
    return next;
  }
};

// v5 Activity engine -- colorbox-hue plugin.
// Pedagogy: U1 Topic 1.3 (Displaying Categorical Data). Each present
// student's pre-existing sprite hue IS their category (Red 0-89,
// Yellow 90-179, Green 180-269, Blue 270-359). Mastery = every
// assigned student walking their avatar into the matching zone for
// 5 sustained seconds. The plugin reads avatar x-positions from
// room.members.get(username).pos -- the v5 engine extension passes
// room as a 3rd arg to onTick and onMemberJoin so plugins can do
// this without coupling to a separate state slot.
//
// Logical board width is DEFAULT_BOARD_W (320); the Desk renderer
// partitions the same width into 4 columns of (320 / 4) = 80 each.
// Vertical y is ignored.
activityPlugins['colorbox-hue'] = {
  minMembers: 2,

  initActivity: function (room, onlineStudents, opts) {
    // Each online student's category is pinned once at start from
    // their hue (null -> stable username-hash fallback).
    var assignments = {};
    onlineStudents.forEach(function (m) {
      var hue = (m.hue != null) ? m.hue : fallbackHueForUsername(m.username);
      assignments[m.username] = zoneForHue(hue);
    });
    return {
      assignments: assignments,
      currentZone: {},                              // username -> 0..3 or -1
      tally:       [0, 0, 0, 0],
      holdMs:      0,
      zones:       COLORBOX_HUE_ZONES.map(function (z) {
                     return { id: z.id, label: z.label };
                   })
    };
  },

  // No input channel: ColorBox piggybacks on classroom_pos broadcasts.
  // The plugin reads positions via room in onTick (v5 signature).
  onStudentInput: function (state, username, payload) { return null; },

  onTick: function (state, deltaMs, room) {
    // 2026-05-24 V5 Codex BLOCKER fold: read PER-MEMBER canvasW from the
    // last classroom_pos broadcast. The old hardcoded canvasW=320
    // misclassified zones whenever the sender's responsive board canvas
    // was wider (e.g., a Desk sidebar at 480 CSS or a cockpit at 640+).
    // Members without a recorded canvasW fall back to DEFAULT_BOARD_W=320.
    // Zone i = [i * (cw/4), (i+1) * (cw/4)] in the sender's coord space.
    // Offline / missing members contribute -1 (never equals their
    // assignment) so the hold timer resets while they're away.
    var nextCurrent = {};
    var nextTally   = [0, 0, 0, 0];
    var allCorrect  = true;
    var anyAssigned = false;

    var keys = Object.keys(state.assignments);
    for (var k = 0; k < keys.length; k++) {
      anyAssigned = true;
      var uname = keys[k];
      var m = room.members.get(uname);
      if (!m || m.online === false) {
        nextCurrent[uname] = -1;
        if (state.assignments[uname] !== -1) { allCorrect = false; }
        continue;
      }
      var cw = (typeof m.canvasW === 'number' && m.canvasW > 0) ? m.canvasW : 320;
      var x = (m.pos && typeof m.pos.x === 'number') ? m.pos.x : 0;
      var zone = Math.max(0, Math.min(3, Math.floor(x / (cw / 4))));
      nextCurrent[uname] = zone;
      nextTally[zone]++;
      if (zone !== state.assignments[uname]) { allCorrect = false; }
    }

    if (!anyAssigned) { allCorrect = false; }

    var nextHoldMs = allCorrect ? (state.holdMs + deltaMs) : 0;
    return Object.assign({}, state, {
      currentZone: nextCurrent,
      tally:       nextTally,
      holdMs:      nextHoldMs
    });
  },

  isComplete: function (state) {
    return state.holdMs >= COLORBOX_HUE_HOLD_TARGET_MS;
  },

  onMemberLeave: function (state, username) {
    if (!(username in state.assignments)) return null;
    var next = Object.assign({}, state, {
      assignments: Object.assign({}, state.assignments),
      currentZone: Object.assign({}, state.currentZone)
    });
    delete next.assignments[username];
    delete next.currentZone[username];
    return next;
  },

  onMemberJoin: function (state, username, room) {
    // v5 signature: room is passed so we can look up the joining
    // member's hue without coupling to a separate state slot. A
    // re-join (already in assignments) keeps the prior category.
    if (username in state.assignments) return null;
    if (!room) return null;
    var m = room.members.get(username);
    if (!m) return null;
    var hue = (m.hue != null) ? m.hue : fallbackHueForUsername(username);
    var next = Object.assign({}, state, {
      assignments: Object.assign({}, state.assignments)
    });
    next.assignments[username] = zoneForHue(hue);
    return next;
  },

  serializeForBoard: function (state) {
    return {
      assignments:  state.assignments,
      currentZone:  state.currentZone,
      tally:        state.tally,
      holdMs:       state.holdMs,
      holdTargetMs: COLORBOX_HUE_HOLD_TARGET_MS,
      zones:        state.zones
    };
  }
};

// v6 Activity engine -- colorbox-grid plugin.
// Pedagogy: U1 Topic 1.4 (Two-Way Tables). Generalizes V5's 1-D hue
// sort to a 2-D contingency-table grid: row = student's hue (4
// values, identical to V5), column = a second categorical attribute
// supplied at launch via opts.secondAxis.
//
// secondAxis modes:
//   mode='prompt'  -- each student answers a 1-key prompt at launch
//                     (e.g., "Are you left-handed? [No] [Yes]"); pick
//                     is recorded via classroom_activity_value.
//   mode='auto'    -- server randomly assigns each student a column at
//                     launch (e.g., "Group A" / "Group B"); no prompt.
//
// Mastery: every student has picked (in prompt mode) AND is standing
// in their CORRECT (hue x pick) cell for 5 sustained seconds.

function validateSecondAxis(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.mode === 'prompt') {
    if (typeof s.question !== 'string' || !Array.isArray(s.options)) return null;
    if (s.options.length < 2 || s.options.length > 4) return null;
    if (!s.options.every(function (o) { return typeof o === 'string'; })) return null;
    return {
      mode:     'prompt',
      question: s.question.trim().slice(0, 280),
      options:  s.options.map(function (o) { return String(o).trim().slice(0, 40); })
    };
  }
  if (s.mode === 'auto') {
    if (!Array.isArray(s.labels)) return null;
    if (s.labels.length < 2 || s.labels.length > 4) return null;
    if (!s.labels.every(function (o) { return typeof o === 'string'; })) return null;
    return {
      mode:   'auto',
      labels: s.labels.map(function (o) { return String(o).trim().slice(0, 40); })
    };
  }
  return null;
}

function emptyTally(rows, cols) {
  var out = [];
  for (var r = 0; r < rows; r++) {
    var row = [];
    for (var c = 0; c < cols; c++) { row.push(0); }
    out.push(row);
  }
  return out;
}

activityPlugins['colorbox-grid'] = {
  minMembers: 2,

  initActivity: function (room, onlineStudents, opts) {
    var safeOpts = opts || {};
    var secondAxis = validateSecondAxis(safeOpts.secondAxis);
    if (!secondAxis) {
      // Default fallback: prompt for a Yes/No (spec C2 default).
      secondAxis = { mode: 'prompt', question: 'Yes or No?', options: ['No', 'Yes'] };
    }
    var colCount = (secondAxis.mode === 'prompt')
      ? secondAxis.options.length
      : secondAxis.labels.length;
    var assignments = {};   // username -> { row }
    var picks       = {};   // username -> 0..colCount-1 OR null (still picking)
    onlineStudents.forEach(function (m) {
      var hue = (m.hue != null) ? m.hue : fallbackHueForUsername(m.username);
      var row = zoneForHue(hue);
      var col = null;
      if (secondAxis.mode === 'auto') {
        col = Math.floor(Math.random() * colCount);
      }
      assignments[m.username] = { row: row };
      picks[m.username] = col;
    });
    return {
      secondAxis:  secondAxis,
      colCount:    colCount,
      assignments: assignments,
      picks:       picks,
      currentCell: {},
      tally:       emptyTally(4, colCount),
      holdMs:      0
    };
  },

  onStudentInput: function (state, username, payload) {
    // Prompt mode: { choice: <int> } sets the student's pick. Ignored
    // in auto mode (server already assigned the column).
    if (!payload || typeof payload.choice !== 'number') return null;
    if (state.secondAxis.mode === 'auto') return null;
    if (!(username in state.picks)) return null;
    var c = Math.floor(payload.choice);
    if (c < 0 || c >= state.colCount) return null;
    if (state.picks[username] === c) return null;
    var next = Object.assign({}, state, { picks: Object.assign({}, state.picks) });
    next.picks[username] = c;
    return next;
  },

  onTick: function (state, deltaMs, room) {
    // V5 Codex BLOCKER fold parity: read PER-MEMBER canvasW from the
    // last classroom_pos broadcast. A hardcoded canvasW=320 would
    // misclassify columns whenever the sender's responsive board canvas
    // was wider (e.g., Desk sidebar at 480 CSS, cockpit at 640+). Row
    // math also uses BOARD_H = 220 (matches classroom-board.js).
    // Members without a recorded canvasW fall back to DEFAULT_BOARD_W=320.
    var BOARD_H = 220;
    var colCount = state.colCount;
    var nextCurrent = {};
    var nextTally   = emptyTally(4, colCount);
    var allCorrect  = true;
    var allPicked   = true;
    var anyAssigned = false;

    var keys = Object.keys(state.assignments);
    for (var k = 0; k < keys.length; k++) {
      anyAssigned = true;
      var uname = keys[k];
      var pick  = state.picks[uname];
      if (pick == null) {
        allPicked  = false;
        allCorrect = false;
        nextCurrent[uname] = { row: -1, col: -1 };
        continue;
      }
      var m = room.members.get(uname);
      if (!m || m.online === false) {
        nextCurrent[uname] = { row: -1, col: -1 };
        allCorrect = false;
        continue;
      }
      var cw = (typeof m.canvasW === 'number' && m.canvasW > 0) ? m.canvasW : 320;
      var x = (m.pos && typeof m.pos.x === 'number') ? m.pos.x : 0;
      var y = (m.pos && typeof m.pos.y === 'number') ? m.pos.y : 0;
      var col = Math.max(0, Math.min(colCount - 1, Math.floor(x / (cw / colCount))));
      var row = Math.max(0, Math.min(3, Math.floor(y / (BOARD_H / 4))));
      nextCurrent[uname] = { row: row, col: col };
      nextTally[row][col]++;
      var expectedRow = state.assignments[uname].row;
      var expectedCol = state.picks[uname];
      if (row !== expectedRow || col !== expectedCol) {
        allCorrect = false;
      }
    }
    if (!anyAssigned) { allCorrect = false; }
    var holdEligible = allPicked && allCorrect;
    var nextHoldMs = holdEligible ? (state.holdMs + deltaMs) : 0;
    return Object.assign({}, state, {
      currentCell: nextCurrent,
      tally:       nextTally,
      holdMs:      nextHoldMs
    });
  },

  isComplete: function (state) {
    return state.holdMs >= COLORBOX_GRID_HOLD_TARGET_MS;
  },

  onMemberLeave: function (state, username) {
    if (!(username in state.assignments)) return null;
    var next = Object.assign({}, state, {
      assignments: Object.assign({}, state.assignments),
      picks:       Object.assign({}, state.picks),
      currentCell: Object.assign({}, state.currentCell)
    });
    delete next.assignments[username];
    delete next.picks[username];
    delete next.currentCell[username];
    return next;
  },

  onMemberJoin: function (state, username, room) {
    // V5 signature: room is passed so we can look up the joining
    // member's hue without coupling to a separate state slot. A
    // re-join (already in assignments) keeps the prior row + pick.
    if (username in state.assignments) return null;
    if (!room) return null;
    var m = room.members.get(username);
    if (!m) return null;
    var hue = (m.hue != null) ? m.hue : fallbackHueForUsername(username);
    var col = null;
    if (state.secondAxis.mode === 'auto') {
      col = Math.floor(Math.random() * state.colCount);
    }
    var next = Object.assign({}, state, {
      assignments: Object.assign({}, state.assignments),
      picks:       Object.assign({}, state.picks)
    });
    next.assignments[username] = { row: zoneForHue(hue) };
    next.picks[username] = col;
    return next;
  },

  serializeForBoard: function (state) {
    return {
      secondAxis:   state.secondAxis,
      colCount:     state.colCount,
      assignments:  state.assignments,
      picks:        state.picks,
      currentCell:  state.currentCell,
      tally:        state.tally,
      holdMs:       state.holdMs,
      holdTargetMs: COLORBOX_GRID_HOLD_TARGET_MS
    };
  }
};

// v7 Activity engine -- level plugin (LIVE_CLASSROOM_V7_BUILD.md C1).
// Thin wrapper around level-engine.js. The level loader keys off
// opts.levelKey (e.g. 'U1.1'); on missing file initActivity returns
// null and startActivity surfaces classroom_activity_error{code:'level-missing'}.
activityPlugins['level'] = {
  minMembers: 2,

  initActivity: function (room, online, opts) {
    var levelKey = (opts && typeof opts.levelKey === 'string') ? opts.levelKey : null;
    if (!levelKey) { return null; }
    var levelDef = levelEngine.loadLevel(levelKey);
    if (!levelDef) { return null; }
    var state = levelEngine.createLevelState(levelDef, online);
    if (!state) { return null; }
    // Stash the full level def on the state so startActivity can
    // include it in the classroom_activity_start broadcast (clients
    // need the actor layout to render the scene).
    state._levelDef = levelDef;
    return state;
  },

  onStudentInput: function (state, username, payload) {
    return levelEngine.applyInput(state, username, payload);
  },

  onTick: function (state, deltaMs, room) {
    return levelEngine.tick(state, deltaMs, room);
  },

  isComplete: function (state) {
    return levelEngine.isComplete(state);
  },

  serializeForBoard: function (state) {
    return levelEngine.serialize(state);
  },

  onMemberLeave: function (state, username) {
    return levelEngine.onMemberLeave(state, username);
  },

  onMemberJoin: function (state, username, room) {
    return levelEngine.onMemberJoin(state, username, room);
  }
};

// WireMember -- the shape sent on the wire (v1b).
// status reflects the member's real status ("present", "checkedIn", or "voted").
// hue is an integer 0-359 or null (r3 addition -- see Section 2.7).
// vote is an option index or null (v2 poll addition).
// pos is the last-known position broadcast by the member, or null
// (KEYBOARD_AVATAR Phase 2 addition; shape: { x, y, state, vx }).
function toWireMember(member) {
  return {
    username: member.username,
    role:     member.role,
    status:   member.status,
    online:   member.online,
    hue:      member.hue,
    vote:     member.vote,
    pos:      member.pos || null
  };
}

// toWireMemberForRole -- role-aware wire shape for a single member.
// In a blind poll (room.poll && room.poll.blind === true):
//   - for a teacher: always include real vote.
//   - for a student: include vote only for themselves (viewerUsername);
//     for other students mask vote as null.
// When no blind poll is open, vote is always included (toWireMember is sufficient).
function toWireMemberForRole(member, viewerRole, viewerUsername, blindPollOpen) {
  if (!blindPollOpen || viewerRole === 'teacher') {
    return toWireMember(member);
  }
  // blind poll, student viewer
  return {
    username: member.username,
    role:     member.role,
    status:   member.status,
    online:   member.online,
    hue:      member.hue,
    vote:     (member.username === viewerUsername) ? member.vote : null,
    pos:      member.pos || null
  };
}

// s111 P4 HOTFIX: normalize doorways for the wire. Internal server
// shape stores counts inline on options[i].count; the WIRE shape
// separates them into a tally:[{doorId,count}] array (matching the
// classroom_open_doorways + classroom_doorway_tally + classroom_close_doorways
// payloads). Without this normalization the snapshot path delivered
// options-with-counts but no tally array, so on cockpit refresh the
// client's renderDoorwaysTally fell back to (d.tally || []) = [] and
// the bar chart showed all zeros even though the server had the
// real votes.
function _wireDoorways(roomDoorways) {
  if (!roomDoorways) { return null; }
  return {
    id:       roomDoorways.id,
    question: roomDoorways.question || '',
    options:  (roomDoorways.options || []).map(function (o) {
                return { label: o.label, doorId: o.doorId };
              }),
    tally:    (roomDoorways.options || []).map(function (o) {
                return { doorId: o.doorId, count: o.count || 0 };
              }),
    openedAt: roomDoorways.openedAt
  };
}

// Build the full classroom_state payload for a section.
// forRole: 'teacher' or 'student'. forUsername: the viewer's username.
// gate reflects the room's real gate state (null or an armed gate object).
// poll carries the live poll descriptor (null when idle).
// Member votes are role-gated per Section 1.4.
function buildStatePayload(room, forRole, forUsername) {
  var blindPollOpen = !!(room.poll && room.poll.blind);
  var members = [];
  room.members.forEach(function(member) {
    members.push(toWireMemberForRole(member, forRole, forUsername, blindPollOpen));
  });
  // v4: serialize current activity (if any) for late-joiner / cockpit hydration.
  var activityWire = null;
  if (room.activity) {
    var plugin = activityPlugins[room.activity.type];
    if (plugin) {
      activityWire = {
        type:       room.activity.type,
        startedAt:  room.activity.startedAt,
        durationMs: room.activity.durationMs,
        finished:   room.activity.finished,
        state:      plugin.serializeForBoard(room.activity.state)
      };
      // 2026-05-25 V7 Codex MAJOR 4 fold: include the LevelDef in
      // late-joiner / cockpit-refresh snapshots so reconnecting
      // clients can reconstruct the actor layout. The 5 Hz state
      // payload still omits this (size optimization); only the
      // snapshot path carries it.
      if (room.activity.type === 'level' && room.activity.level) {
        activityWire.level = room.activity.level;
      }
    }
  }
  return {
    type:    'classroom_state',
    section: room.section,
    gate:    room.gate,
    poll:    room.poll || null,
    live:    !!room.live,
    // v3 P4 Codex BLOCKER fold: include doorways in the snapshot so
    // late-joiners + cockpit refreshes see the active data mode.
    // s111 hotfix: normalize via _wireDoorways so the snapshot shape
    // matches the open/tally/close broadcasts (separate tally array).
    doorways: _wireDoorways(room.doorways),
    activity: activityWire,
    members: members
  };
}

// buildRoleAwareMemberUpdateBroadcasts(room, section, member)
//
// Shared helper for classroom_member_update broadcasts (Finding 2).
// When a blind poll is open, we must split recipients so students never
// see another student's real vote -- this applies to join, detach,
// heartbeat, and sweep, not just castVote.
//
// Returns [] or a 1-2 element broadcasts array ready to dispatch.
function buildRoleAwareMemberUpdateBroadcasts(room, section, member, excludeWs) {
  var blindPollOpen = !!(room.poll && room.poll.blind);

  if (!blindPollOpen) {
    // No blind poll -- send full member to everyone (existing behaviour).
    var sockets = roomSockets(room, excludeWs);
    if (sockets.length === 0) return [];
    return [{
      sockets: sockets,
      payload: {
        type:    'classroom_member_update',
        section: section,
        member:  toWireMember(member)
      }
    }];
  }

  // Blind poll open -- split into student and teacher buckets.
  var studentSockets = [];
  var teacherSockets = [];
  room.members.forEach(function(m) {
    m.sockets.forEach(function(sock) {
      if (sock === excludeWs) return;
      if (m.role === 'teacher') {
        teacherSockets.push(sock);
      } else {
        studentSockets.push(sock);
      }
    });
  });

  var broadcasts = [];

  if (studentSockets.length > 0) {
    // Students: mask vote for ALL members (no student can infer another's vote).
    var studentShape = {
      username: member.username,
      role:     member.role,
      status:   member.status,
      online:   member.online,
      hue:      member.hue,
      vote:     null,
      pos:      member.pos || null
    };
    broadcasts.push({
      sockets: studentSockets,
      payload: {
        type:    'classroom_member_update',
        section: section,
        member:  studentShape
      }
    });
  }

  if (teacherSockets.length > 0) {
    // Teacher: full vote always visible.
    broadcasts.push({
      sockets: teacherSockets,
      payload: {
        type:    'classroom_member_update',
        section: section,
        member:  toWireMember(member)
      }
    });
  }

  return broadcasts;
}

// Collect all open sockets for a room (excluding a specific ws if given).
function roomSockets(room, excludeWs) {
  var sockets = [];
  room.members.forEach(function(member) {
    member.sockets.forEach(function(ws) {
      if (ws !== excludeWs) {
        sockets.push(ws);
      }
    });
  });
  return sockets;
}

// All open sockets in the room including the joiner.
function allRoomSockets(room) {
  return roomSockets(room, null);
}

// createClassroomRegistry -- factory for the registry singleton.
// Returns an object with: join, detach, heartbeat, sweep, stateFor.
export function createClassroomRegistry() {
  // section -> ClassroomRoom
  var classrooms = new Map();

  // ws -> { section, username }
  var wsIndex = new Map();

  // Ensure a room exists for section and return it.
  function getOrCreateRoom(section) {
    if (!classrooms.has(section)) {
      classrooms.set(section, {
        section: section,
        gate:    null,       // { armed, theme, openedAt } | null
        poll:    null,       // { id, question, options, blind, openedAt } | null
        live:    false,      // v3 P1+P2: durable Live flag (NOT cleared by armGate/greenLight/reset)
        doorways: null,   // v3 P4: { id, question, options: [{label, doorId, count}], openedAt } | null
        activity: null,   // v4: { type, startedAt, durationMs, state, finished } | null
        members: new Map(), // username -> Member
        // P3 nudges (Codex BLOCKER fold): nudgeId -> { recipients: Set<username>, ts }.
        // Populated by teacherNudge; consumed by studentNudgeReply to verify the
        // sender was an actual recipient. Aged out in sweep (NUDGE_TTL_MS).
        recentNudges: new Map()
      });
    }
    return classrooms.get(section);
  }

  // Set of teacher sockets in "monitor" mode -- they receive every
  // broadcast from every room without joining any specific room.
  var monitorSockets = new Set();

  // subscribeMonitor(ws) -> { sends }
  // Add ws to monitorSockets and send back a classroom_state_all snapshot.
  // No room state mutation; idempotent.
  function subscribeMonitor(ws) {
    monitorSockets.add(ws);
    return { sends: [{ ws: ws, payload: buildAllSectionsStatePayload() }] };
  }

  // unsubscribeMonitor(ws) -> void
  // Remove ws from monitorSockets. Idempotent.
  function unsubscribeMonitor(ws) {
    monitorSockets.delete(ws);
  }

  // buildAllSectionsStatePayload() -> { type, sections: [...] }
  // Returns a snapshot of every room's state, role-aware for teachers
  // (monitor is teacher-only -- buildStatePayload's blind-poll mask
  // does not apply since the viewer is always a teacher).
  function buildAllSectionsStatePayload() {
    var sections = [];
    classrooms.forEach(function(room, section) {
      var members = [];
      room.members.forEach(function(member) {
        // Monitor viewer is always teacher -- no blind-poll mask needed.
        members.push(toWireMember(member));
      });
      // v4: include serialized activity for monitor snapshot.
      var activityWire = null;
      if (room.activity) {
        var monPlugin = activityPlugins[room.activity.type];
        if (monPlugin) {
          activityWire = {
            type:       room.activity.type,
            startedAt:  room.activity.startedAt,
            durationMs: room.activity.durationMs,
            finished:   room.activity.finished,
            state:      monPlugin.serializeForBoard(room.activity.state)
          };
        }
      }
      sections.push({
        section:  section,
        gate:     room.gate,
        poll:     room.poll || null,
        live:     !!room.live,
        // v3 P4 Codex BLOCKER fold: include doorways so the cockpit's
        // global presence view can hydrate the active data mode.
        // s111 hotfix: normalize via _wireDoorways for wire-shape
        // consistency with open/tally/close broadcasts.
        doorways: _wireDoorways(room.doorways),
        activity: activityWire,
        members:  members
      });
    });
    return { type: 'classroom_state_all', sections: sections };
  }

  // setLive(section, live, now) -> { broadcasts }
  // Set the room's live state. Returns a classroom_live_state broadcast
  // that fans out to the room's sockets AND every monitor socket via the
  // shared _fanoutToMonitors helper (avoids the duplicate-broadcast bug
  // where a ws that is BOTH a room socket and a monitor socket would
  // otherwise receive the message twice).
  // If the section's room does not exist, returns empty broadcasts (no-op).
  function setLive(section, live, now) {
    if (!classrooms.has(section)) {
      return { broadcasts: [] };
    }
    var room = classrooms.get(section);
    var liveBool = !!live;
    if (room.live === liveBool) {
      return { broadcasts: [] };  // no-op on identity transition
    }
    room.live = liveBool;
    var payload = { type: 'classroom_live_state', section: section, live: liveBool };
    var sockets = roomSockets(room, null);
    if (sockets.length === 0 && monitorSockets.size === 0) {
      return { broadcasts: [] };
    }
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // Inject monitor sockets into every broadcast target list. Call AFTER
  // building the room-scoped broadcasts; mutates each broadcast's
  // sockets list in place.
  function _fanoutToMonitors(broadcasts) {
    if (monitorSockets.size === 0 || !broadcasts || broadcasts.length === 0) {
      return broadcasts;
    }
    broadcasts.forEach(function(bc) {
      monitorSockets.forEach(function(mws) {
        if (!bc.sockets.includes(mws)) {
          bc.sockets.push(mws);
        }
      });
    });
    return broadcasts;
  }

  // join(ws, section, username, role, now, hue)
  //
  // Add the socket to the room. Create the member if first join; re-attach
  // if the member already exists (reconnect after drop).
  //
  // hue -- integer 0-359 or null. Durable: not cleared by armGate or reset.
  //        A re-join overwrites hue (last value wins).
  //
  // Returns:
  //   { sends, broadcasts }
  //   sends      -- [{ ws, payload }]  -- reply classroom_state to this socket
  //   broadcasts -- [{ sockets, payload }]  -- classroom_member_update to rest
  function join(ws, section, username, role, now, hue) {
    var currentNow = now == null ? Date.now() : now;
    // Normalise hue: must be an integer in 0-359 or null.
    var safeHue = (typeof hue === 'number' && Number.isInteger(hue) && hue >= 0 && hue <= 359)
      ? hue
      : null;

    // If this socket is already bound to a member (a re-join on the same
    // connection, possibly to a different section/username), unbind it
    // from the prior member first so no stale socket reference leaks.
    var priorEntry = wsIndex.get(ws);
    if (priorEntry) {
      var priorRoom = classrooms.get(priorEntry.section);
      if (priorRoom) {
        var priorMember = priorRoom.members.get(priorEntry.username);
        if (priorMember) {
          priorMember.sockets.delete(ws);
          if (priorMember.sockets.size === 0) {
            priorMember.online = false;
            priorMember.lastSeen = currentNow;
          }
        }
      }
      wsIndex.delete(ws);
    }

    var room = getOrCreateRoom(section);

    var isNewMember = !room.members.has(username);
    var isFirstTimeMember = isNewMember;  // track whether this is a true first join (not just online-flip)
    var member;

    if (isNewMember) {
      member = {
        username: username,
        role:     role,
        status:   'present',  // durable decision; cleared only by armGate or reset
        hue:      safeHue,    // durable; NOT cleared by armGate or reset
        vote:     null,       // option index or null; reset by openPoll and reset
        pos:      null,       // last-known {x,y,state,vx} from classroom_pos (Phase 2)
        online:   true,
        lastSeen: currentNow,
        sockets:  new Set([ws])
      };
      room.members.set(username, member);
      // v4: if a new student joins mid-activity, the plugin assigns them a value.
      if (role === 'student') {
        activityOnMemberJoin(room, username);
      }
    } else {
      member = room.members.get(username);
      member.sockets.add(ws);
      var wasOnline = member.online;
      member.online  = true;
      member.lastSeen = currentNow;
      // Re-join always overwrites hue (last value wins).
      member.hue = safeHue;
      // s111 HOTFIX: re-join also overwrites role (last value wins),
      // same pattern as hue. Without this, a user who joined first as
      // a student (e.g. from the Desk) then as a teacher (the cockpit)
      // would stay registered as 'student' -- armGate / openDoorways
      // / closeDoorways all fail the teacher check silently. The user
      // explicitly indicates their role on each classroom_join.
      member.role = role;

      // If the member was offline and is now back, we need to broadcast the
      // online-flip below (treated the same as a new member broadcast).
      if (!wasOnline) {
        isNewMember = true; // reuse the broadcast path
      }
    }

    wsIndex.set(ws, { section: section, username: username });

    // Reply to this socket with the full state (role-aware for blind polls).
    var statePayload = buildStatePayload(room, role, username);
    var sends = [{ ws: ws, payload: statePayload }];

    // Broadcast the member update to everyone else in the room.
    // Use the role-aware helper so blind-poll secrecy is preserved on
    // join / reconnect (Finding 2 fix).
    var broadcasts = [];
    if (isNewMember) {
      var joinBroadcasts = buildRoleAwareMemberUpdateBroadcasts(room, section, member, ws);
      broadcasts = joinBroadcasts;
    }

    _fanoutToMonitors(broadcasts);
    return { sends: sends, broadcasts: broadcasts };
  }

  // detach(ws, now)
  //
  // Remove this socket from its member's socket set.
  // If the member loses its last socket, flip online:false.
  //
  // Returns:
  //   { lostLastSocket: bool, section, username, broadcasts }
  //   broadcasts -- [{ sockets, payload }] -- classroom_member_update if
  //                 the member just went offline.
  function detach(ws, now) {
    // v3 P1+P2: remove from monitorSockets BEFORE building broadcasts so a
    // detached monitor ws does not receive the broadcast it just generated.
    monitorSockets.delete(ws);
    var currentNow = now == null ? Date.now() : now;
    var entry = wsIndex.get(ws);
    if (!entry) {
      return { lostLastSocket: false, section: null, username: null, broadcasts: [] };
    }

    var section  = entry.section;
    var username = entry.username;
    wsIndex.delete(ws);

    var room = classrooms.get(section);
    if (!room) {
      return { lostLastSocket: false, section: section, username: username, broadcasts: [] };
    }

    var member = room.members.get(username);
    if (!member) {
      return { lostLastSocket: false, section: section, username: username, broadcasts: [] };
    }

    member.sockets.delete(ws);

    if (member.sockets.size > 0) {
      // Still has open sockets -- stays online.
      return { lostLastSocket: false, section: section, username: username, broadcasts: [] };
    }

    // No sockets left -- flip offline but do NOT remove.
    member.online   = false;
    member.lastSeen = currentNow;

    // Use the role-aware helper so blind-poll secrecy is preserved on
    // detach / offline-flip (Finding 2 fix).
    var detachBroadcasts = buildRoleAwareMemberUpdateBroadcasts(room, section, member, null);

    _fanoutToMonitors(detachBroadcasts);
    return {
      lostLastSocket: true,
      section:  section,
      username: username,
      broadcasts: detachBroadcasts
    };
  }

  // heartbeat(ws, now)
  //
  // Refresh the member's lastSeen. If the member had been flipped
  // offline (by a sweep, while this socket stayed open), a fresh
  // heartbeat revives it: flip online:true and broadcast the update.
  //
  // Returns:
  //   { section, broadcasts }
  //   broadcasts -- [{ sockets, payload }] -- classroom_member_update if revived
  function heartbeat(ws, now) {
    var currentNow = now == null ? Date.now() : now;
    var entry = wsIndex.get(ws);
    if (!entry) return { section: null, broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { section: null, broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { section: null, broadcasts: [] };

    member.lastSeen = currentNow;

    var broadcasts = [];
    if (!member.online) {
      member.online = true;
      // Use the role-aware helper so blind-poll secrecy is preserved on
      // heartbeat-driven online revival (Finding 2 fix).
      broadcasts = buildRoleAwareMemberUpdateBroadcasts(room, entry.section, member, null);
    }

    _fanoutToMonitors(broadcasts);
    return { section: entry.section, broadcasts: broadcasts };
  }

  // sweep(now)
  //
  // Time-driven scan. Two things happen:
  //   1. Members that are online but whose heartbeat has lapsed past
  //      LIVENESS_MS get flipped offline.
  //   2. Members that have been offline for more than IDLE_GC_MS are
  //      removed.
  // Empty rooms are deleted.
  //
  // Returns:
  //   { onlineFlips, removals }
  //   onlineFlips -- [{ sockets, payload }]  -- classroom_member_update (online:false)
  //   removals    -- [{ sockets, payload }]  -- classroom_member_left
  function sweep(now) {
    var currentNow = now == null ? Date.now() : now;
    var onlineFlips = [];
    var removals    = [];

    classrooms.forEach(function(room, section) {
      var toRemove = [];

      // P3 nudges (Codex BLOCKER fold): age out recentNudges so the per-room
      // Map doesn't grow unbounded. 10-minute TTL is generous (covers a
      // student replying to a nudge after a 5-min delay) but bounded.
      if (room.recentNudges) {
        var nudgesToRemove = [];
        room.recentNudges.forEach(function(rec, nudgeId) {
          if (currentNow - rec.ts > NUDGE_TTL_MS) nudgesToRemove.push(nudgeId);
        });
        nudgesToRemove.forEach(function(id) { room.recentNudges.delete(id); });
      }

      room.members.forEach(function(member, username) {
        var age = currentNow - member.lastSeen;

        // Flip online:false if heartbeat lapsed but no sockets closed it
        // (i.e. the socket is still open but no heartbeat arrived).
        if (member.online && age > LIVENESS_MS) {
          member.online = false;
          // Use the role-aware helper so blind-poll secrecy is preserved on
          // sweep-driven offline-flip (Finding 2 fix).
          var sweepBroadcasts = buildRoleAwareMemberUpdateBroadcasts(room, section, member, null);
          sweepBroadcasts.forEach(function(bc) { onlineFlips.push(bc); });
        }

        // GC: remove members that have been offline for longer than
        // IDLE_GC_MS. Do NOT also require zero sockets -- a member whose
        // heartbeat lapsed but whose (zombie) socket never closed is
        // still offline and must be reclaimed, or rooms leak forever.
        if (!member.online && age > IDLE_GC_MS) {
          toRemove.push(username);
        }
      });

      // Process removals for this room.
      toRemove.forEach(function(username) {
        var goneMember = room.members.get(username);
        if (goneMember) {
          // Drop any lingering socket->member index entries so a later
          // close/heartbeat on a zombie socket is a clean no-op.
          goneMember.sockets.forEach(function(sock) { wsIndex.delete(sock); });
        }
        // v4: if an activity is live, let the plugin drop the leaver's
        // domain state (e.g. their bridge-mean value).
        activityOnMemberLeave(room, username);
        room.members.delete(username);
        // Always record the removal. The recipient socket list may be
        // empty (the room is now empty, or had no other members) -- the
        // server's broadcast is then a harmless no-op -- but the
        // removal itself still happened and callers must see it.
        removals.push({
          sockets: allRoomSockets(room),
          payload: {
            type:     'classroom_member_left',
            section:  section,
            username: username
          }
        });
      });

      // Delete empty rooms.
      if (room.members.size === 0) {
        classrooms.delete(section);
      }
    });

    _fanoutToMonitors(onlineFlips);
    _fanoutToMonitors(removals);
    return { onlineFlips: onlineFlips, removals: removals };
  }

  // stateFor(section, forRole, forUsername)
  //
  // Return the snapshot payload for a section, or null if the room
  // does not exist. forRole and forUsername are used for role-aware masking
  // when a blind poll is open; both are optional (default: teacher view).
  function stateFor(section, forRole, forUsername) {
    var room = classrooms.get(section);
    if (!room) return null;
    return buildStatePayload(room, forRole || 'teacher', forUsername || null);
  }

  // -------------------------------------------------------------------------
  // v1b Gate methods
  // -------------------------------------------------------------------------

  // armGate(ws, theme, now)
  //
  // TEACHER only. Arms the gate for the sender's room:
  //   - Sets room.gate = { armed:true, theme, openedAt: now }.
  //   - Resets every member's status back to "present" (fresh ritual).
  //   - Returns a classroom_gate broadcast to all room sockets.
  //
  // Returns { broadcasts } -- empty if role check fails or room not found.
  function armGate(ws, theme, now) {
    var currentNow = now == null ? Date.now() : now;
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // Mode-exclusivity guard: reject if a poll is open (Section 1.5).
    if (room.poll !== null) return { broadcasts: [] };
    // v3 P4 Codex MAJOR 3 fold: armGate is mutually exclusive with
    // an active doorways data mode.
    if (room.doorways) return { broadcasts: [] };
    // 2026-05-24 V4 Codex BLOCKER fold: reverse mutex -- a live activity
    // (bridge-mean etc.) also blocks armGate. startActivity already
    // rejects when {gate, poll, doorways} are live; the reverse must
    // hold so the room cannot get into a mixed-mode state clients
    // can't reconcile.
    if (room.activity && !room.activity.finished) return { broadcasts: [] };

    // Arm the gate and reset all member statuses.
    room.gate = { armed: true, theme: theme || '', openedAt: currentNow };
    room.members.forEach(function(m) { m.status = 'present'; });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_gate',
          section: entry.section,
          gate:    { armed: room.gate.armed, theme: room.gate.theme }
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // checkin(ws, now)
  //
  // STUDENT. If an armed gate is present, set the sender's status to
  // "checkedIn" and broadcast a classroom_member_update.
  // Ignored (no broadcast) if there is no armed gate.
  //
  // Returns { broadcasts }.
  function checkin(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    // Ignore if no gate is armed.
    if (!room.gate || !room.gate.armed) return { broadcasts: [] };
    // v3 P4 Codex MAJOR 3 fold: silently drop checkins while doorways
    // are open -- the gate ritual is suspended during a data mode.
    if (room.doorways) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    member.status = 'checkedIn';

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_member_update',
          section: entry.section,
          member:  toWireMember(member)
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // greenLight(ws, now, startVideo, videoRef)
  //
  // TEACHER only. Broadcasts classroom_greenlight to the whole room.
  //
  // startVideo -- coerced to strict boolean (startVideo === true).
  // videoRef   -- coerced to string-or-null (typeof videoRef === 'string' ? videoRef : null).
  // Both fields ride only on the live broadcast; NOT stored in room state.
  //
  // Returns { broadcasts }.
  function greenLight(ws, now, startVideo, videoRef) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // Coerce types.
    var safeStartVideo = startVideo === true;
    var safeVideoRef   = typeof videoRef === 'string' ? videoRef : null;

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:       'classroom_greenlight',
          section:    entry.section,
          startVideo: safeStartVideo,
          videoRef:   safeVideoRef
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // reset(ws, now)
  //
  // TEACHER only. Clears the gate and resets every member status to "present".
  // Broadcasts a full classroom_state.
  //
  // Returns { broadcasts }.
  function reset(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    room.gate     = null;
    room.poll     = null;
    // v3 P4 Codex BLOCKER fold: reset also clears doorways + each
    // member's doorVote. Otherwise the server stayed in the doorway
    // session while clients saw "idle".
    room.doorways = null;
    // V7.1 BUILD Unit A: also clear the closed-doorways one-shot so a
    // stale event doesn't fire on the next activity tick.
    room.closedDoorways = null;
    room.members.forEach(function(m) {
      m.status   = 'present';
      m.vote     = null;
      m.doorVote = null;
    });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: buildStatePayload(room)
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // -------------------------------------------------------------------------
  // v2 Poll methods
  // -------------------------------------------------------------------------

  // openPoll(ws, question, options, blind, now)
  //
  // TEACHER only. Opens a poll:
  //   - options must have length 2-8.
  //   - Rejected if a gate is armed (mode exclusivity, Section 1.5).
  //   - Resets every member vote=null, status="present".
  //   - Broadcasts classroom_poll to all room sockets.
  //
  // Returns { broadcasts }.
  function openPoll(ws, question, options, blind, now) {
    var currentNow = now == null ? Date.now() : now;
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    if (room.doorways) return { broadcasts: [] };  // mutual exclusion vs P4
    // 2026-05-24 V4 Codex BLOCKER fold: reverse mutex -- a live
    // activity blocks openPoll.
    if (room.activity && !room.activity.finished) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // options must be an array with 2-8 entries.
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) {
      return { broadcasts: [] };
    }

    // Mode-exclusivity guard: reject if a gate is armed.
    if (room.gate !== null) return { broadcasts: [] };

    // Assign a poll id.
    var pollId = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
      ? globalThis.crypto.randomUUID()
      : String(currentNow) + '-' + Math.random().toString(36).slice(2);

    room.poll = {
      id:       pollId,
      question: String(question || ''),
      options:  options.map(String),
      blind:    blind === true,
      openedAt: currentNow
    };

    // Reset every member vote and status.
    room.members.forEach(function(m) {
      m.vote   = null;
      m.status = 'present';
    });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:     'classroom_poll',
          section:  entry.section,
          id:       room.poll.id,
          question: room.poll.question,
          options:  room.poll.options,
          blind:    room.poll.blind
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // castVote(ws, choice, now)
  //
  // STUDENT. Records the sender's vote:
  //   - Ignored if no poll is open.
  //   - Ignored if choice is not an integer in [0, options.length).
  //   - Sets sender vote=choice, status="voted".
  //   - Broadcasts a role-aware classroom_member_update per Section 1.4.
  //
  // Returns { broadcasts }.
  function castVote(ws, choice, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    // Ignore if no poll is open.
    if (!room.poll) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Validate choice: must be an integer in [0, options.length).
    if (typeof choice !== 'number' || !Number.isInteger(choice) ||
        choice < 0 || choice >= room.poll.options.length) {
      return { broadcasts: [] };
    }

    member.vote   = choice;
    member.status = 'voted';

    // Build role-aware broadcasts per Section 1.4.
    var blindPollOpen = room.poll.blind;
    var broadcasts    = [];

    if (blindPollOpen) {
      // Split sockets into student and teacher buckets.
      var studentSockets = [];
      var teacherSockets = [];
      room.members.forEach(function(m) {
        m.sockets.forEach(function(sock) {
          if (m.role === 'teacher') {
            teacherSockets.push(sock);
          } else {
            studentSockets.push(sock);
          }
        });
      });

      // Student payload: vote is always masked (null) in a blind poll.
      // A student can only see their OWN vote in classroom_state, not in
      // member_update payloads where another student's socket is the viewer.
      // The voter's client already knows their own choice (they sent it).
      if (studentSockets.length > 0) {
        var studentMemberShape = {
          username: member.username,
          role:     member.role,
          status:   member.status,
          online:   member.online,
          hue:      member.hue,
          vote:     null,
          pos:      member.pos || null
        };
        broadcasts.push({
          sockets: studentSockets,
          payload: {
            type:    'classroom_member_update',
            section: entry.section,
            member:  studentMemberShape
          }
        });
      }

      // Teacher payload: full vote visible.
      if (teacherSockets.length > 0) {
        broadcasts.push({
          sockets: teacherSockets,
          payload: {
            type:    'classroom_member_update',
            section: entry.section,
            member:  toWireMember(member)
          }
        });
      }
    } else {
      // Non-blind poll: vote visible to all.
      var sockets = allRoomSockets(room);
      if (sockets.length > 0) {
        broadcasts.push({
          sockets: sockets,
          payload: {
            type:    'classroom_member_update',
            section: entry.section,
            member:  toWireMember(member)
          }
        });
      }
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // closePoll(ws, now)
  //
  // TEACHER only. Closes the active poll:
  //   - Computes the final tally (count per option index).
  //   - Clears room.poll.
  //   - Broadcasts classroom_poll_closed to all room sockets.
  //
  // Returns { broadcasts }.
  function closePoll(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // Nothing to close.
    if (!room.poll) return { broadcasts: [] };

    var pollId      = room.poll.id;
    var optionCount = room.poll.options.length;

    // Tally votes.
    var tally = [];
    var i;
    for (i = 0; i < optionCount; i++) { tally.push(0); }
    room.members.forEach(function(m) {
      if (typeof m.vote === 'number' && m.vote >= 0 && m.vote < optionCount) {
        tally[m.vote]++;
      }
    });

    // Clear the poll.
    room.poll = null;

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_poll_closed',
          section: entry.section,
          id:      pollId,
          tally:   tally
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // revealPoll(ws, now)
  //
  // TEACHER only. Reveals blind poll results to ALL sockets:
  //   - Broadcasts classroom_poll_reveal with full tally + per-member votes.
  //   - Does NOT clear room.poll (poll remains open for closePoll).
  //   - If no poll is open, returns empty broadcasts.
  //
  // Returns { broadcasts }.
  function revealPoll(ws, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    // Teacher-only guard.
    if (member.role !== 'teacher') return { broadcasts: [] };

    // Nothing to reveal.
    if (!room.poll) return { broadcasts: [] };

    // Reveal is blind-only (Section 1.4 / Finding 4).
    if (!room.poll.blind) return { broadcasts: [] };

    var pollId      = room.poll.id;
    var optionCount = room.poll.options.length;

    // Tally votes.
    var tally = [];
    var i;
    for (i = 0; i < optionCount; i++) { tally.push(0); }
    room.members.forEach(function(m) {
      if (typeof m.vote === 'number' && m.vote >= 0 && m.vote < optionCount) {
        tally[m.vote]++;
      }
    });

    // Build per-member list (username + vote), unmasked.
    var memberList = [];
    room.members.forEach(function(m) {
      memberList.push({ username: m.username, vote: m.vote });
    });

    var sockets = allRoomSockets(room);
    var broadcasts = [];
    if (sockets.length > 0) {
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:    'classroom_poll_reveal',
          section: entry.section,
          id:      pollId,
          tally:   tally,
          members: memberList
        }
      });
    }

    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // openDoorways(ws, id, question, options, now) -> { broadcasts }
  // Teacher-only. Rejects if a poll is open (mutual exclusion).
  // Initializes per-option count to 0; broadcasts to the room.
  function openDoorways(ws, id, question, options, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'teacher') return { broadcasts: [] };
    if (room.poll) return { broadcasts: [] };  // mutual exclusion vs v2 poll
    // 2026-05-24 V4 Codex BLOCKER fold: reverse mutex -- a live
    // activity blocks openDoorways.
    if (room.activity && !room.activity.finished) return { broadcasts: [] };
    // v3 P4 Codex MAJOR 2 fold: reject if doorways are ALREADY open
    // (a second open would overwrite without clearing prior doorVotes).
    if (room.doorways) return { broadcasts: [] };
    // v3 P4 Codex MAJOR 3 fold: mutual exclusion with the v1b gate.
    if (room.gate && room.gate.armed) return { broadcasts: [] };
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) return { broadcasts: [] };
    var safeId       = (typeof id === 'string' && id.trim()) ? id.trim() : ('doorways-' + (now || Date.now()));
    var safeQuestion = (typeof question === 'string') ? question.trim() : '';
    var optionsState = [];
    for (var i = 0; i < options.length; i++) {
      var o = options[i] || {};
      optionsState.push({
        label:  (typeof o.label === 'string') ? o.label.trim() : ('Option ' + String.fromCharCode(65 + i)),
        doorId: (typeof o.doorId === 'string' && o.doorId.trim()) ? o.doorId.trim() : ('d' + i),
        count:  0
      });
    }
    room.doorways = {
      id:       safeId,
      question: safeQuestion,
      options:  optionsState,
      openedAt: now == null ? Date.now() : now
    };
    // Reset each member's status to "present" + clear stale doorVote
    // (Codex MAJOR 2 defense-in-depth -- even if a future code path
    // reuses room.doorways, votes start from a clean slate).
    room.members.forEach(function(m) { m.status = 'present'; m.doorVote = null; });
    var payload = {
      type:     'classroom_open_doorways',
      section:  entry.section,
      id:       safeId,
      question: safeQuestion,
      options:  optionsState.map(function(o) { return { label: o.label, doorId: o.doorId }; }),
      openedAt: room.doorways.openedAt
    };
    var sockets = roomSockets(room, null);
    if (sockets.length === 0 && monitorSockets.size === 0) {
      return { broadcasts: [] };
    }
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // castDoorwayVote(ws, id, doorId, now) -> { broadcasts }
  // Student-only. Idempotent on a re-vote (the same student switching
  // doors moves their vote; one vote per student). Broadcasts the live
  // tally to the room + monitors.
  function castDoorwayVote(ws, id, doorId, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.doorways) return { broadcasts: [] };
    if (room.doorways.id !== id) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'student') return { broadcasts: [] };
    var safeDoorId = (typeof doorId === 'string') ? doorId.trim() : '';
    // Find the option for the new vote. Bail if doorId unknown.
    var found = null;
    for (var i = 0; i < room.doorways.options.length; i++) {
      if (room.doorways.options[i].doorId === safeDoorId) { found = room.doorways.options[i]; break; }
    }
    if (!found) return { broadcasts: [] };
    // If switching, decrement the prior doorId's count.
    var priorDoorId = member.doorVote || null;
    if (priorDoorId && priorDoorId !== safeDoorId) {
      for (var j = 0; j < room.doorways.options.length; j++) {
        if (room.doorways.options[j].doorId === priorDoorId) {
          room.doorways.options[j].count = Math.max(0, room.doorways.options[j].count - 1);
        }
      }
    }
    // No-op if voting for the same door again.
    if (priorDoorId !== safeDoorId) {
      found.count += 1;
      member.doorVote = safeDoorId;
      member.status   = 'voted';
    }
    var payload = {
      type:    'classroom_doorway_tally',
      section: entry.section,
      id:      room.doorways.id,
      tally:   room.doorways.options.map(function(o) { return { doorId: o.doorId, count: o.count }; })
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // retractDoorwayVote(ws, id, now) -> { broadcasts }
  // Student-only. Clears the sender's prior doorVote + decrements the
  // count for that doorId, then broadcasts the new tally. No-op if
  // the sender has no prior vote, or if the id doesn't match. Used
  // when a student cancels a doorway absorb (presses Up to walk back
  // out) -- without this, the vote stays attached to the door even
  // though the avatar has left the hole.
  function retractDoorwayVote(ws, id, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.doorways) return { broadcasts: [] };
    if (room.doorways.id !== id) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'student') return { broadcasts: [] };
    var priorDoorId = member.doorVote || null;
    if (!priorDoorId) return { broadcasts: [] };
    // Decrement the prior doorId's count.
    for (var j = 0; j < room.doorways.options.length; j++) {
      if (room.doorways.options[j].doorId === priorDoorId) {
        room.doorways.options[j].count = Math.max(0, room.doorways.options[j].count - 1);
      }
    }
    member.doorVote = null;
    member.status   = 'present';
    var payload = {
      type:    'classroom_doorway_tally',
      section: entry.section,
      id:      room.doorways.id,
      tally:   room.doorways.options.map(function(o) { return { doorId: o.doorId, count: o.count }; })
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // _openDoorwaysServerSide(room, section, id, question, options, now)
  //   -> { broadcasts, closedDoorways }
  //
  // 2026-05-25 V7.1 BUILD Unit A: server-driven openDoorways for the
  // level-engine. Mirrors openDoorways(...) verbatim except:
  //   - No ws / no wsIndex.get(ws) -- the caller is the activityTick
  //     loop, not a teacher socket.
  //   - No teacher-role check (no socket to attribute it to).
  //   - No poll/gate/activity mutex check (the level engine has already
  //     reserved the room via room.activity; the engine sequences its
  //     own doorway calls).
  //   - Returns the broadcasts array AND a closedDoorways shape so the
  //     wrapper can synthesize the close-event the engine listens for
  //     when needed (currently only the OPEN path is server-driven;
  //     CLOSE still arrives via the existing v3 P4 close flow when the
  //     teacher closes the vote OR when the engine emits a sideEffects
  //     close in future versions).
  //
  // Note: this MUST NOT throw if room.doorways is already set -- the
  // wrapper guards against double-open by checking liveDoorwaysId before
  // emitting the sideEffect, but defense-in-depth is cheap.
  function _openDoorwaysServerSide(room, section, id, question, options, now) {
    if (room.doorways) {
      // Already open; engine emitted a second open by accident. No-op.
      return { broadcasts: [] };
    }
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) {
      return { broadcasts: [] };
    }
    var safeId       = (typeof id === 'string' && id.trim()) ? id.trim() : ('doorways-' + (now || Date.now()));
    var safeQuestion = (typeof question === 'string') ? question.trim() : '';
    var optionsState = [];
    for (var i = 0; i < options.length; i++) {
      var o = options[i] || {};
      optionsState.push({
        label:  (typeof o.label === 'string') ? o.label.trim() : ('Option ' + String.fromCharCode(65 + i)),
        doorId: (typeof o.doorId === 'string' && o.doorId.trim()) ? o.doorId.trim() : ('d' + i),
        count:  0
      });
    }
    room.doorways = {
      id:       safeId,
      question: safeQuestion,
      options:  optionsState,
      openedAt: now == null ? Date.now() : now
    };
    // Reset each member's status + clear stale doorVote (parity with
    // the teacher-driven openDoorways path).
    room.members.forEach(function (m) { m.status = 'present'; m.doorVote = null; });
    var payload = {
      type:     'classroom_open_doorways',
      section:  section,
      id:       safeId,
      question: safeQuestion,
      options:  optionsState.map(function (o) { return { label: o.label, doorId: o.doorId }; }),
      openedAt: room.doorways.openedAt
    };
    var sockets = roomSockets(room, null);
    if (sockets.length === 0 && monitorSockets.size === 0) {
      return { broadcasts: [] };
    }
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // closeDoorways(ws, id, now) -> { broadcasts }
  // Teacher-only. Emits the final tally then clears room.doorways.
  // Each member's doorVote is cleared.
  function closeDoorways(ws, id, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.doorways) return { broadcasts: [] };
    if (room.doorways.id !== id) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'teacher') return { broadcasts: [] };
    var finalTally = room.doorways.options.map(function(o) { return { doorId: o.doorId, count: o.count }; });
    var closedId = room.doorways.id;
    var closedQuestion = room.doorways.question;
    var closedOptions = room.doorways.options.map(function(o) { return { label: o.label, doorId: o.doorId }; });
    room.doorways = null;
    // 2026-05-25 V7.1 BUILD Unit A: stash the closed event on the room
    // so the level-engine's VOTING-phase tick can detect it + transition
    // to GOAL_AVAILABLE or REFLECTION. Cleared by activityTick after the
    // engine consumes it (one-shot). Pre-V7.1 code paths ignore this
    // field; it's only read by the level plugin's onTick.
    room.closedDoorways = {
      id:       closedId,
      question: closedQuestion,
      options:  closedOptions,
      tally:    finalTally
    };
    room.members.forEach(function(m) {
      if (m.doorVote != null) { m.doorVote = null; }
      m.status = 'present';
    });
    var payload = {
      type:     'classroom_close_doorways',
      section:  entry.section,
      id:       closedId,
      question: closedQuestion,
      options:  closedOptions,
      tally:    finalTally
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // -------------------------------------------------------------------------
  // v4 Activity engine (LIVE_CLASSROOM_V4_BUILD.md sections C1, C2)
  // -------------------------------------------------------------------------
  //
  // One activity per room. The plugin (keyed by activity.type) provides
  // the domain behaviour; the engine wires lifecycle, ticks, mutex, and
  // monitor fanout.
  //
  // Mutex (startActivity): rejects when room.gate.armed || room.poll
  //                        || room.doorways || room.activity.
  //
  // Lifecycle:
  //   startActivity -> classroom_activity_start (room + monitors)
  //   activityValue -> no immediate broadcast; next tick covers it
  //   activityTick (5 Hz) -> classroom_activity_state (room + monitors)
  //   isComplete -> classroom_activity_success (+ override-gate auto-fire)
  //   timeout    -> classroom_activity_timeout
  //   cancelActivity -> classroom_activity_cancel

  // startActivity(ws, type, opts, now) -> { broadcasts }
  // Teacher-only. opts: { durationMs?, target?, tolerance? } -- plugin may use or ignore.
  function startActivity(ws, type, opts, now) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'teacher') return { broadcasts: [] };
    // Mutex: gate armed, poll open, doorways open, or activity live all reject.
    if (room.gate && room.gate.armed) return { broadcasts: [] };
    if (room.poll || room.doorways || room.activity) return { broadcasts: [] };
    var plugin = activityPlugins[type];
    if (!plugin) return { broadcasts: [] };
    // Count online students.
    var online = [];
    room.members.forEach(function (m) {
      if (m.role === 'student' && m.online !== false) { online.push(m); }
    });
    if (online.length < plugin.minMembers) {
      return { broadcasts: [{ sockets: [ws], payload: {
        type:       'classroom_activity_error',
        section:    entry.section,
        code:       'not-enough-members',
        minMembers: plugin.minMembers,
        online:     online.length
      }}] };
    }
    var safeOpts = opts || {};
    var initialState = plugin.initActivity(room, online, safeOpts);
    // V7: a null initialState signals the plugin couldn't construct
    // (e.g. 'level' couldn't find activities/<levelKey>.json). Surface
    // a structured error rather than crashing on serializeForBoard.
    if (initialState == null) {
      var errCode = (type === 'level') ? 'level-missing' : 'init-failed';
      return { broadcasts: [{ sockets: [ws], payload: {
        type:    'classroom_activity_error',
        section: entry.section,
        code:    errCode,
        activityType: type
      }}] };
    }
    // V7: per-level duration override -- if the plugin returned a state
    // with an attached level def carrying a duration (seconds), respect
    // it. Falls back to opts.durationMs, then the engine default.
    var durationMs;
    if (typeof safeOpts.durationMs === 'number' && safeOpts.durationMs > 0) {
      durationMs = safeOpts.durationMs;
    } else if (initialState && initialState._levelDef &&
               typeof initialState._levelDef.duration === 'number' &&
               initialState._levelDef.duration > 0) {
      durationMs = initialState._levelDef.duration * 1000;
    } else {
      durationMs = DEFAULT_ACTIVITY_DURATION_MS;
    }
    room.activity = {
      type:       type,
      startedAt:  now == null ? Date.now() : now,
      durationMs: durationMs,
      state:      initialState,
      finished:   false
    };
    // Fresh ritual: reset every member status (parity with armGate / openPoll).
    room.members.forEach(function (m) { m.status = 'present'; });
    var activityBlock = {
      type:       type,
      startedAt:  room.activity.startedAt,
      durationMs: room.activity.durationMs,
      state:      plugin.serializeForBoard(initialState)
    };
    // V7: for 'level' activities, include the full LevelDef in the
    // START broadcast (clients need the actor layout to draw the scene).
    // Subsequent classroom_activity_state broadcasts don't carry the
    // def -- only the mutating state block.
    if (type === 'level' && initialState._levelDef) {
      activityBlock.level = initialState._levelDef;
    }
    var payload = {
      type:    'classroom_activity_start',
      section: entry.section,
      activity: activityBlock
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // activityValue(ws, payload) -> { broadcasts }
  // Student-only. Forwards to plugin.onStudentInput. The next tick carries
  // the updated state out -- no separate broadcast on input.
  function activityValue(ws, payload) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.activity || room.activity.finished) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'student') return { broadcasts: [] };
    var plugin = activityPlugins[room.activity.type];
    if (!plugin) return { broadcasts: [] };
    var next = plugin.onStudentInput(room.activity.state, entry.username, payload);
    if (next) { room.activity.state = next; }
    return { broadcasts: [] };
  }

  // cancelActivity(ws) -> { broadcasts }
  // Teacher-only. Sets finished=true and broadcasts classroom_activity_cancel.
  // The tick loop drops finished activities on the next tick.
  function cancelActivity(ws) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room || !room.activity) return { broadcasts: [] };
    var member = room.members.get(entry.username);
    if (!member || member.role !== 'teacher') return { broadcasts: [] };
    room.activity.finished = true;
    var payload = {
      type:         'classroom_activity_cancel',
      section:      entry.section,
      activityType: room.activity.type
    };
    var sockets = roomSockets(room, null);
    var broadcasts = [{ sockets: sockets, payload: payload }];
    _fanoutToMonitors(broadcasts);
    return { broadcasts: broadcasts };
  }

  // activityTick(now) -> { broadcasts }
  // Called by the module-scope setInterval(ACTIVITY_TICK_MS). Per room:
  //   1. plugin.onTick(state, ACTIVITY_TICK_MS) -> derive next state.
  //   2. plugin.isComplete -> broadcast success + override-gate auto-fire.
  //   3. elapsed >= durationMs -> broadcast timeout.
  //   4. otherwise -> broadcast state (5 Hz fanout).
  // Finished activities are dropped on the NEXT tick (room.activity = null).
  function activityTick(now) {
    var currentNow = now == null ? Date.now() : now;
    var broadcasts = [];
    classrooms.forEach(function (room, section) {
      if (!room.activity) return;
      // Drop fully-finished activities. We keep the activity for one extra
      // tick after finished is set so the cancel/success/timeout broadcasts
      // (which set finished=true) have already gone out. Once finished is
      // already true on entry, clear the slot.
      if (room.activity.finished) {
        room.activity = null;
        return;
      }
      var plugin = activityPlugins[room.activity.type];
      if (!plugin) {
        room.activity = null;
        return;
      }
      // 2026-05-24 V4 Codex MAJOR fold: when the room drops to zero
      // online students, cancel the activity instead of letting tick
      // accumulate hold time on a stale state.values map (which the
      // GC sweep wouldn't clear for 45 minutes). Treated as a
      // timeout outcome so cockpit's result panel surfaces it.
      var onlineCount = 0;
      room.members.forEach(function (mm) {
        if (mm.role === 'student' && mm.online !== false) onlineCount++;
      });
      if (onlineCount === 0) {
        room.activity.finished = true;
        var emptyPayload = {
          type:         'classroom_activity_timeout',
          section:      section,
          activityType: room.activity.type,
          finalState:   plugin.serializeForBoard(room.activity.state),
          reason:       'room-empty'
        };
        var emptySockets = roomSockets(room, null);
        var emptyBc = [{ sockets: emptySockets, payload: emptyPayload }];
        _fanoutToMonitors(emptyBc);
        broadcasts.push.apply(broadcasts, emptyBc);
        return;
      }
      var elapsed = currentNow - room.activity.startedAt;
      // v5 signature extension: room is passed as the 3rd arg so
      // position-driven plugins (colorbox-hue) can read avatar
      // positions from room.members. V4's bridge-mean onTick ignores
      // the 3rd arg (JavaScript permits extra args silently).
      var nextState = plugin.onTick(room.activity.state, ACTIVITY_TICK_MS, room);
      if (nextState) { room.activity.state = nextState; }
      // 2026-05-25 V7.1 BUILD Unit A: consume any sideEffects the
      // plugin emitted (V7.1 level engine emits openDoorways at the
      // SIPPING -> VOTING transition and on REFLECTION -> VOTING
      // re-vote). The wrapper calls _openDoorwaysServerSide (a
      // teacher-less variant of openDoorways) and appends its
      // broadcasts to this tick. The plugin already nulled sideEffects
      // for itself on entry; we still null it here defensively so a
      // single sideEffect can't fire twice on a re-tick.
      // Older plugins (V4/V5/V6) never set sideEffects, so this is a
      // pure additive code path.
      if (nextState && nextState.sideEffects) {
        var se = nextState.sideEffects;
        if (se.openDoorways) {
          var openRes = _openDoorwaysServerSide(
            room,
            section,
            se.openDoorways.id,
            se.openDoorways.question,
            se.openDoorways.options,
            currentNow
          );
          if (openRes.broadcasts && openRes.broadcasts.length > 0) {
            broadcasts.push.apply(broadcasts, openRes.broadcasts);
          }
        }
        nextState.sideEffects = null;
      }
      // 2026-05-25 V7.1 BUILD Unit A: clear room.closedDoorways AFTER
      // the engine had a chance to read it during onTick. The engine
      // already consumed the matching id (or ignored if mismatched);
      // any future close events will re-stamp room.closedDoorways via
      // the closeDoorways() path.
      if (room.closedDoorways) {
        room.closedDoorways = null;
      }
      // Success check.
      if (plugin.isComplete(room.activity.state)) {
        room.activity.finished = true;
        var successPayload = {
          type:         'classroom_activity_success',
          section:      section,
          activityType: room.activity.type,
          finalState:   plugin.serializeForBoard(room.activity.state)
        };
        var successSockets = roomSockets(room, null);
        var successBc = [{ sockets: successSockets, payload: successPayload }];
        _fanoutToMonitors(successBc);
        broadcasts.push.apply(broadcasts, successBc);
        _fireOverrideGateForRoom(room, room.activity.type);
        return;
      }
      // Timeout check.
      if (elapsed >= room.activity.durationMs) {
        room.activity.finished = true;
        var timeoutPayload = {
          type:         'classroom_activity_timeout',
          section:      section,
          activityType: room.activity.type,
          finalState:   plugin.serializeForBoard(room.activity.state)
        };
        var timeoutSockets = roomSockets(room, null);
        var timeoutBc = [{ sockets: timeoutSockets, payload: timeoutPayload }];
        _fanoutToMonitors(timeoutBc);
        broadcasts.push.apply(broadcasts, timeoutBc);
        return;
      }
      // Normal tick: broadcast current state.
      var statePayload = {
        type:         'classroom_activity_state',
        section:      section,
        activityType: room.activity.type,
        state:        plugin.serializeForBoard(room.activity.state),
        elapsedMs:    elapsed
      };
      var stateSockets = roomSockets(room, null);
      var stateBc = [{ sockets: stateSockets, payload: statePayload }];
      _fanoutToMonitors(stateBc);
      broadcasts.push.apply(broadcasts, stateBc);
    });
    return { broadcasts: broadcasts };
  }

  // _fireOverrideGateForRoom(room, activityType, lessonKeyOverride)
  // Posts /teacher/lesson-unlock for each online student in the room for
  // the lesson key associated with the activity type. Fire-and-forget;
  // failures are logged but do NOT block the success broadcast.
  //
  // V7 extension: a 3rd-arg lessonKeyOverride takes priority over the
  // static ACTIVITY_LESSON_MAP. Used by the 'level' activity type whose
  // lesson key is stamped on room.activity.state.lessonKey by the level
  // JSON (a level for U1.7 is the same 'level' activity type but routes
  // to a different lesson unlock).
  function _fireOverrideGateForRoom(room, activityType, lessonKeyOverride) {
    var lessonKey = lessonKeyOverride || ACTIVITY_LESSON_MAP[activityType];
    // V7: when 'level' activity finishes, the lessonKey rides on the
    // level state. Fall back to that if no override was passed in.
    if (!lessonKey && activityType === 'level' &&
        room.activity && room.activity.state && room.activity.state.lessonKey) {
      lessonKey = room.activity.state.lessonKey;
    }
    if (!lessonKey) return;
    room.members.forEach(function (m) {
      if (m.role !== 'student' || m.online === false) return;
      _postOverrideGate(m.username, lessonKey, 'activity-' + activityType);
    });
  }

  // activityOnMemberLeave(room, username) -> void
  // Called from the existing detach/sweep paths when a member is removed
  // entirely (not just offline-flipped). Drops their value from the
  // activity state via the plugin's onMemberLeave hook.
  function activityOnMemberLeave(room, username) {
    if (!room || !room.activity || room.activity.finished) return;
    var plugin = activityPlugins[room.activity.type];
    if (!plugin || typeof plugin.onMemberLeave !== 'function') return;
    var next = plugin.onMemberLeave(room.activity.state, username);
    if (next) { room.activity.state = next; }
  }

  // activityOnMemberJoin(room, username) -> void
  // Called from the existing join handler when a NEW member joins a room
  // mid-activity. Assigns them a value via the plugin's onMemberJoin hook.
  function activityOnMemberJoin(room, username) {
    if (!room || !room.activity || room.activity.finished) return;
    var plugin = activityPlugins[room.activity.type];
    if (!plugin || typeof plugin.onMemberJoin !== 'function') return;
    // v5 signature extension: room is passed as the 3rd arg so
    // plugins can look up the joining member's properties (hue,
    // pos, etc.) without coupling to a separate state slot. V4's
    // bridge-mean onMemberJoin ignores the 3rd arg.
    var next = plugin.onMemberJoin(room.activity.state, username, room);
    if (next) { room.activity.state = next; }
  }

  // -------------------------------------------------------------------------
  // KEYBOARD_AVATAR Phase 2 -- position broadcast
  // -------------------------------------------------------------------------

  // position(ws, x, y, state, vx, now)
  //
  // Cross-client position sync (KEYBOARD_AVATAR_SPEC.md Phase 2).
  // Records last-known {x, y, state, vx} on the member (for late-joiner
  // classroom_state snapshots) and forwards the position broadcast to all
  // OTHER sockets in the room. The sender does not receive an echo --
  // their PlayerSprite already owns the local position.
  //
  // Ignored (empty broadcasts) if the socket is not bound to a member,
  // the room is missing, or the values are not finite numbers.
  //
  // Returns { broadcasts }.
  function position(ws, x, y, state, vx, now, canvasW) {
    var entry = wsIndex.get(ws);
    if (!entry) return { broadcasts: [] };

    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };

    var member = room.members.get(entry.username);
    if (!member) return { broadcasts: [] };

    var safeX = (typeof x === 'number' && isFinite(x)) ? x : null;
    var safeY = (typeof y === 'number' && isFinite(y)) ? y : null;
    if (safeX === null || safeY === null) return { broadcasts: [] };

    var safeVx    = (typeof vx === 'number' && isFinite(vx)) ? vx : 0;
    var safeState = (typeof state === 'string') ? state : 'idle';
    // 2026-05-24 V5 Codex BLOCKER fold: stash sender canvas width so a
    // position-driven plugin (colorbox-hue, future colorbox-grid) can
    // bin x correctly into zones regardless of the sender's responsive
    // canvas size. Backwards compatible: missing/invalid -> last value
    // preserved; never below 1.
    if (typeof canvasW === 'number' && isFinite(canvasW) && canvasW > 0) {
      member.canvasW = canvasW;
    }

    // Update last-known position for late-joiner snapshots.
    member.pos = { x: safeX, y: safeY, state: safeState, vx: safeVx };

    // Forward to all OTHER sockets in the room (sender excluded -- they
    // already own the authoritative local position).
    var sockets = roomSockets(room, ws);
    if (sockets.length === 0) return { broadcasts: [] };

    var posBroadcasts = [{
      sockets: sockets,
      payload: {
        type:     'classroom_pos',
        section:  entry.section,
        username: entry.username,
        x:        safeX,
        y:        safeY,
        state:    safeState,
        vx:       safeVx,
        canvasW:  member.canvasW || null
      }
    }];
    _fanoutToMonitors(posBroadcasts);
    return { broadcasts: posBroadcasts };
  }

  // -------------------------------------------------------------------------
  // v3 P3 (Teacher-Student Console) -- teacherNudge + studentNudgeReply
  // -------------------------------------------------------------------------

  // teacherNudge(ws, nudgeId, recipientUsernames, text, now) -> { broadcasts, sends }
  //
  // TEACHER only. Sends a free-text nudge to one or more students in the
  // sender's section. Only online recipients receive the nudge broadcast;
  // offline recipients are silently dropped. An ack is sent back to the
  // teacher with delivered[] and offline[] lists.
  //
  // Returns:
  //   { broadcasts, sends }
  //   broadcasts -- [{ sockets, payload }] -- classroom_teacher_nudge to each online recipient
  //   sends      -- [{ ws, payload }]       -- classroom_teacher_nudge_ack back to the teacher
  function teacherNudge(ws, nudgeId, recipientUsernames, text, now) {
    // Resolve sender's section + role from socket.
    var entry = _wsEntry(ws);
    if (!entry) return { broadcasts: [], sends: [] };
    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [], sends: [] };
    var sender = room.members.get(entry.username);
    if (!sender || sender.role !== 'teacher') return { broadcasts: [], sends: [] };
    if (!Array.isArray(recipientUsernames) || recipientUsernames.length === 0) return { broadcasts: [], sends: [] };
    if (typeof text !== 'string' || text.trim().length === 0) return { broadcasts: [], sends: [] };
    if (text.length > 280) text = text.slice(0, 280);

    // For each requested recipient, look up online socket(s) in the same section.
    var deliveredUsernames = [];
    var broadcasts = [];
    for (var i = 0; i < recipientUsernames.length; i++) {
      var ru = recipientUsernames[i];
      var sockets = findSocketByUsername(entry.section, ru);
      if (!sockets || sockets.length === 0) continue;  // offline -> dropped
      deliveredUsernames.push(ru);
      broadcasts.push({
        sockets: sockets,
        payload: {
          type:         'classroom_teacher_nudge',
          nudgeId:      nudgeId,
          text:         text,
          fromUsername: entry.username,
          ts:           now
        }
      });
    }

    // Send ack back to teacher with the delivery breakdown.
    var sends = [{
      ws: ws,
      payload: {
        type:      'classroom_teacher_nudge_ack',
        nudgeId:   nudgeId,
        delivered: deliveredUsernames,
        offline:   recipientUsernames.filter(function(u) { return deliveredUsernames.indexOf(u) < 0; }),
        ts:        now
      }
    }];

    // Codex BLOCKER fold P3: do NOT fanout nudge broadcasts to monitor
    // sockets. Nudges are per-recipient private DMs; broadcasting them to
    // every cockpit monitor would leak cross-section private content.
    // Track the nudge so studentNudgeReply can verify the sender was an
    // actual recipient (defense against unsolicited DM-to-teacher spam).
    if (!room.recentNudges) room.recentNudges = new Map();
    room.recentNudges.set(nudgeId, {
      recipients: new Set(deliveredUsernames),
      ts: now
    });
    return { broadcasts: broadcasts, sends: sends };
  }

  // studentNudgeReply(ws, nudgeId, text, now) -> { broadcasts }
  //
  // STUDENT only. Sends a reply to all teachers in the sender's section.
  // Both teachers (if two co-monitor) receive the reply.
  //
  // Returns:
  //   { broadcasts }
  //   broadcasts -- [{ sockets, payload }] -- classroom_student_nudge_reply to all teacher sockets
  function studentNudgeReply(ws, nudgeId, text, now) {
    var entry = _wsEntry(ws);
    if (!entry) return { broadcasts: [] };
    var room = classrooms.get(entry.section);
    if (!room) return { broadcasts: [] };
    var sender = room.members.get(entry.username);
    if (!sender || sender.role !== 'student') return { broadcasts: [] };
    if (typeof text !== 'string' || text.trim().length === 0) return { broadcasts: [] };
    if (text.length > 280) text = text.slice(0, 280);

    // Codex BLOCKER fold P3: verify sender was an actual recipient of the
    // original nudge. Without this, any student can DM all teachers in the
    // section with arbitrary text by inventing a nudgeId.
    var nudgeRec = room.recentNudges ? room.recentNudges.get(nudgeId) : null;
    if (!nudgeRec || !nudgeRec.recipients || !nudgeRec.recipients.has(entry.username)) {
      return { broadcasts: [] };
    }

    // Find all teacher sockets in the same section.
    var teacherSockets = [];
    room.members.forEach(function(m) {
      if (m.role === 'teacher') {
        m.sockets.forEach(function(sock) {
          if (sock.readyState === 1) teacherSockets.push(sock);
        });
      }
    });
    if (teacherSockets.length === 0) return { broadcasts: [] };

    var broadcasts = [{
      sockets: teacherSockets,
      payload: {
        type:         'classroom_student_nudge_reply',
        nudgeId:      nudgeId,
        fromUsername: entry.username,
        text:         text,
        ts:           now
      }
    }];
    // Codex BLOCKER fold P3: do NOT fanout reply broadcasts to monitor
    // sockets. Replies are addressed to teachers only and contain private
    // student-authored text.
    return { broadcasts: broadcasts };
  }

  // findSocketByUsername(section, username) -> [ws, ws, ...]
  // Returns the open WS sockets bound to (section, username), or an
  // empty array if the user is not in the section or has no sockets.
  // Used by the rtc_* relay to target a specific peer in the same room.
  function findSocketByUsername(section, username) {
    if (!classrooms.has(section)) { return []; }
    var room = classrooms.get(section);
    var member = room.members.get(username);
    if (!member) { return []; }
    var sockets = [];
    member.sockets.forEach(function(s) {
      if (s.readyState === 1) { sockets.push(s); }
    });
    return sockets;
  }

  // _wsEntry(ws) -> { section, username } | null
  // Internal-but-exported lookup for the section/username bound to a ws.
  // Used by server.js to route the rtc_* signaling without re-parsing
  // any classroom_join payload.
  function _wsEntry(ws) {
    return wsIndex.get(ws) || null;
  }

  // _getRoom(section) -> room | null
  // Test-only backdoor. Returns the live in-memory room reference so
  // unit tests can pin activity state (target, values) deterministically.
  // Production code should NOT mutate the room via this method -- use
  // the public lifecycle methods instead.
  function _getRoom(section) {
    return classrooms.get(section) || null;
  }

  return {
    join:       join,
    detach:     detach,
    heartbeat:  heartbeat,
    sweep:      sweep,
    stateFor:   stateFor,
    armGate:    armGate,
    checkin:    checkin,
    greenLight: greenLight,
    reset:      reset,
    openPoll:   openPoll,
    castVote:   castVote,
    closePoll:  closePoll,
    revealPoll: revealPoll,
    openDoorways:       openDoorways,
    castDoorwayVote:    castDoorwayVote,
    retractDoorwayVote: retractDoorwayVote,
    closeDoorways:      closeDoorways,
    position:   position,
    // v3 P1+P2 additions:
    subscribeMonitor:    subscribeMonitor,
    unsubscribeMonitor:  unsubscribeMonitor,
    setLive:             setLive,
    getAllSectionsState: buildAllSectionsStatePayload,
    // v3 P3 additions:
    findSocketByUsername: findSocketByUsername,
    _wsEntry:             _wsEntry,
    // v3 P3 Teacher-Student Console nudge methods:
    teacherNudge:        teacherNudge,
    studentNudgeReply:   studentNudgeReply,
    // v4 Activity engine methods:
    startActivity:            startActivity,
    activityValue:            activityValue,
    cancelActivity:           cancelActivity,
    activityTick:             activityTick,
    activityOnMemberLeave:    activityOnMemberLeave,
    activityOnMemberJoin:     activityOnMemberJoin,
    // Test-only backdoor:
    _getRoom:                 _getRoom
  };
}

// v4 Activity engine -- exported registry + lesson map for tests/introspection.
// Module-scope so test files and server.js can inspect / extend without
// reaching into a registry instance.
export var __ACTIVITY_PLUGINS = activityPlugins;
export var __ACTIVITY_LESSON_MAP = ACTIVITY_LESSON_MAP;
export var __ACTIVITY_TICK_MS = ACTIVITY_TICK_MS;
export var __BRIDGE_MEAN_HOLD_TARGET_MS = BRIDGE_MEAN_HOLD_TARGET_MS;
export var __BRIDGE_MEAN_TOLERANCE = BRIDGE_MEAN_TOLERANCE;
export var __DEFAULT_ACTIVITY_DURATION_MS = DEFAULT_ACTIVITY_DURATION_MS;
// v5 colorbox-hue plugin -- exported helpers + constants for tests.
export var __COLORBOX_HUE_HOLD_TARGET_MS = COLORBOX_HUE_HOLD_TARGET_MS;
export var __COLORBOX_HUE_ZONES = COLORBOX_HUE_ZONES;
export var __zoneForHue = zoneForHue;
export var __fallbackHueForUsername = fallbackHueForUsername;
// v6 colorbox-grid plugin -- exported helpers + constants for tests.
export var __COLORBOX_GRID_HOLD_TARGET_MS = COLORBOX_GRID_HOLD_TARGET_MS;
export var __COLORBOX_GRID_DEFAULT_DURATION_MS = COLORBOX_GRID_DEFAULT_DURATION_MS;
export var __validateSecondAxis = validateSecondAxis;
export var __emptyTally = emptyTally;
