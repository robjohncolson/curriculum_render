// level-engine.js
// ES module -- V7 Live Classroom level engine.
//
// Stateless module: parses level JSON files (cached), spawns level state
// per activity instance, applies positional ticks against actors. The
// 'level' activity plugin in classroom.js delegates to these functions.
//
// Contract: see LIVE_CLASSROOM_V7_BUILD.md sections C2, C3, C8.
//
// Coordinate system:
//   - Actor coords (x, y) are in CHIP units. Multiply by chipSize for CSS px.
//   - Player coords (state.players[u].x/y) are in CSS px in the SENDER's
//     coord space (the Desk's canvas). Per the V5 BLOCKER fix the engine
//     reads each Player's canvasW from room.members.get(u).canvasW.
//   - Overlap test: |player_css - actor_chip * chipSize| <= 16 in both axes.
//
// Wire-safety: serialize() converts any Set instances into arrays so the
// returned shape is JSON-safe (member.voters is a Set internally).

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

var __filename = fileURLToPath(import.meta.url);
var __dirname  = dirname(__filename);

// Overlap radius (CSS pixels) -- per spec C2 "Player overlaps X within 16 px".
var OVERLAP_PX = 16;
// 2026-05-25 Codex V7 BLOCKER 3 fold: time-based auto-clear duration
// for the reflection panel. 8 seconds is enough to read the reflection
// text (~1-2 sentences) without dragging the class.
var REFLECTION_DURATION_MS = 8000;

// Module-scope cache: lessonKey -> parsed LevelDef OR null (loadLevel
// memoizes both success and failure so a missing file isn't re-statted
// on every startActivity).
var _levelCache = new Map();

// loadLevel(lessonKey) -> LevelDef | null
// Reads activities/<lessonKey>.json relative to this module. Returns null
// if the file is missing or the JSON is malformed. Memoized.
function loadLevel(lessonKey) {
  if (typeof lessonKey !== 'string' || lessonKey.length === 0) {
    return null;
  }
  if (_levelCache.has(lessonKey)) {
    return _levelCache.get(lessonKey);
  }
  var filePath = join(__dirname, '..', 'activities', lessonKey + '.json');
  var def = null;
  try {
    var raw = readFileSync(filePath, 'utf8');
    def = JSON.parse(raw);
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[level-engine] loadLevel failed for', lessonKey, e && e.message);
    }
    def = null;
  }
  _levelCache.set(lessonKey, def);
  return def;
}

// Test-only: clear the cache (used in unit tests so a level def update
// is picked up; production never invalidates).
function _clearCache() {
  _levelCache.clear();
}

// Internal: extract actors of a given type from a level's actors array.
function _actorsOfType(actors, type) {
  if (!Array.isArray(actors)) return [];
  var out = [];
  for (var i = 0; i < actors.length; i++) {
    if (actors[i] && actors[i].type === type) out.push(actors[i]);
  }
  return out;
}

// Internal: number of online students currently in the level.
function _onlineCount(state) {
  if (!state || !state.players) return 0;
  return Object.keys(state.players).length;
}

// createLevelState(levelDef, onlineStudents) -> LevelState
// Spawns one Player per online student at the FIRST PlayerSpawn coord
// (or the matching PlayerSpawn coord if multiple are declared; for v7
// U1.1 has a single spawn, but we support per-player spawn assignment
// for future levels with multi-spawn layouts).
function createLevelState(levelDef, onlineStudents) {
  if (!levelDef || !Array.isArray(levelDef.actors)) {
    return null;
  }
  var students = Array.isArray(onlineStudents) ? onlineStudents : [];
  var spawns   = _actorsOfType(levelDef.actors, 'PlayerSpawn');
  if (spawns.length === 0) {
    // No spawn -- fall back to (0,0) so the engine still produces a state.
    spawns = [{ type: 'PlayerSpawn', x: 0, y: 0 }];
  }
  var chipSize = (levelDef.map && typeof levelDef.map.chipSize === 'number')
    ? levelDef.map.chipSize
    : 24;

  var players = {};
  for (var i = 0; i < students.length; i++) {
    var u  = students[i].username;
    var sp = spawns[i % spawns.length];
    players[u] = {
      x:             sp.x * chipSize,
      y:             sp.y * chipSize,
      vx:            0,
      vy:            0,
      inReflection:  false,
      lastInteracted: 0
    };
  }

  // Coins from SipStation actors.
  var coins = [];
  var sipActors = _actorsOfType(levelDef.actors, 'SipStation');
  for (var c = 0; c < sipActors.length; c++) {
    var sa = sipActors[c];
    coins.push({
      id:        sa.id || ('sip-' + c),
      x:         sa.x,
      y:         sa.y,
      drink:     sa.drink || 'A',
      collected: false,
      payload:   null
    });
  }

  // Switches + gates derived from QuestionDoor actors. Each door owns
  // both a switch zone (vote trigger) and a gate (pass trigger). We
  // represent them as parallel arrays keyed by doorId so onTick can
  // walk them in O(N).
  var switches = [];
  var gates    = [];
  var doors    = _actorsOfType(levelDef.actors, 'QuestionDoor');
  for (var d = 0; d < doors.length; d++) {
    var door = doors[d];
    var did  = door.id || ('door-' + d);
    switches.push({
      id:         did + '-switch',
      doorId:     did,
      x:          door.x,
      y:          door.y,
      pressed:    false,
      voteCount:  0,
      voters:     new Set()
    });
    gates.push({
      id:      did + '-gate',
      doorId:  did,
      x:       door.x,
      y:       door.y,
      correct: !!door.correct,
      opened:  false,
      passed:  false,
      // 2026-05-25 V7 Codex BLOCKER 3 fold: stash the door's
      // reflection text on the gate so onTick can copy it onto
      // state.reflection.reflectionText when this wrong door is
      // walked through.
      reflectionText: (typeof door.reflection === 'string') ? door.reflection : ''
    });
  }

  // Goal: single Goal actor; fall back to first if multiple declared.
  var goalActors = _actorsOfType(levelDef.actors, 'Goal');
  var goalDef    = goalActors[0] || { x: 0, y: 0 };
  var goal = {
    x:         goalDef.x,
    y:         goalDef.y,
    reached:   false,
    reachedBy: null
  };

  // Stash the canonical spawn coord (first PlayerSpawn) for warp-back
  // logic and onMemberJoin late-spawn placement.
  var spawnX = spawns[0].x;
  var spawnY = spawns[0].y;

  // Reflection-room return warp coord (chip-space). Engine reads this
  // when checking "Player walked to ReturnWarp" inside reflection mode.
  var reflectionMap     = (levelDef.reflection_room && levelDef.reflection_room.map) || null;
  var reflectionWarp    = { x: 8, y: 6 };
  var reflectionSpawn   = { x: 8, y: 2 };
  if (levelDef.reflection_room && Array.isArray(levelDef.reflection_room.actors)) {
    var rActors = levelDef.reflection_room.actors;
    for (var ri = 0; ri < rActors.length; ri++) {
      if (rActors[ri] && rActors[ri].type === 'ReturnWarp') {
        reflectionWarp = { x: rActors[ri].x, y: rActors[ri].y };
        break;
      }
    }
  }

  return {
    levelKey:    levelDef.levelKey || '',
    lessonKey:   levelDef.lessonKey || '',
    chipSize:    chipSize,
    // 2026-05-25 Codex V7 BLOCKER 2 fold: stash mapWidth so onTick can
    // rescale player positions from the SENDER's canvas-space into the
    // LEVEL's coord space before overlap-testing actors.
    mapWidth:    (levelDef.map && typeof levelDef.map.width  === 'number') ? levelDef.map.width  : 32,
    mapHeight:   (levelDef.map && typeof levelDef.map.height === 'number') ? levelDef.map.height : 16,
    startedAt:   Date.now(),
    spawnX:      spawnX,
    spawnY:      spawnY,
    players:     players,
    coins:       coins,
    switches:    switches,
    gates:       gates,
    goal:        goal,
    reflection:  {
      active:         false,
      doorId:         null,
      returnedCount:  0,
      returnedSet:    new Set(),
      returnWarp:     reflectionWarp,
      reflectionSpawn: reflectionSpawn,
      // 2026-05-25 Codex V7 BLOCKER 3 fold: physical walk-back to a
      // ReturnWarp is not durable (the hidden classroom-board keeps
      // broadcasting positions that overwrite the warp). V7 SIMPLIFIES
      // to time-based auto-clear: reflection.active becomes false after
      // REFLECTION_DURATION_MS, the wrong switch resets, class re-votes.
      // V7.1 will revisit movement authority for a true walk-back.
      autoCloseAt:    0,
      // Cache the chosen door's reflection text for the level renderer.
      reflectionText: ''
    },
    tally:       {
      sips:  { A: 0, B: 0 },
      votes: {}
    }
  };
}

// applyInput(state, username, payload) -> nextState | null
// V7 has no student-input message channel -- movement piggybacks on
// classroom_pos, which onTick consumes. Returns null unconditionally.
function applyInput(state, username, payload) {
  return null;
}

// Internal: snap a Player's tracked x/y to the latest broadcast position
// from room.members.get(u).pos. Per the V5 BLOCKER fix the engine reads
// each Player's coords in their own canvas; for v7 we trust the absolute
// CSS pixels the Desk sent.
// 2026-05-25 Codex V7 BLOCKER 2 fold: rescale player positions from
// the SENDER's canvas space into the LEVEL's coord space. The level's
// full pixel width is mapWidth * chipSize (e.g., 32 * 24 = 768 px for
// U1.1), but the student broadcasts CSS-pixel positions in their own
// canvas width (commonly 320, sometimes 640+). Without rescaling, a
// 320-canvas student walking to "x=160" (their canvas center) maps to
// chip 6.66 in the LEVEL space (160/24 = 6.66), missing every actor
// placed past chip 13. With rescaling, x=160 of a 320-wide canvas
// becomes x=384 in level space = chip 16 = center.
//
// Also stashes m.canvasW on state.players[u]._canvasW so _overlapsActor
// can read it without re-fetching from room each call.
function _refreshPlayerPositions(state, room) {
  if (!room || !room.members) return;
  var keys = Object.keys(state.players);
  for (var i = 0; i < keys.length; i++) {
    var u = keys[i];
    var m = room.members.get(u);
    if (!m || !m.pos) continue;
    var cw = (typeof m.canvasW === 'number' && m.canvasW > 0) ? m.canvasW : 320;
    state.players[u]._canvasW = cw;
    if (typeof m.pos.x === 'number') state.players[u].x = m.pos.x;
    if (typeof m.pos.y === 'number') state.players[u].y = m.pos.y;
  }
}

// Internal: is a Player within OVERLAP_PX of an actor whose coord is in
// chip units? Multiplies actor coord by chipSize first, AND rescales
// the Player's CSS-pixel position into level-pixel space using the
// player's stashed sender canvas width.
function _overlapsActor(player, actor, chipSize, state) {
  var levelW = (state && state.mapWidth) ? state.mapWidth * chipSize : 320;
  var senderCw = (player && typeof player._canvasW === 'number' && player._canvasW > 0) ? player._canvasW : 320;
  // X axis: rescale player from sender canvas-space into level coord
  // space (fixes Codex V7 BLOCKER 2 for the canvas width axis).
  var playerLevelX = (player.x / senderCw) * levelW;
  // Y axis: pass-through. classroom_pos does not carry canvasH yet; the
  // assumption is sender and level share the same Y coord space. Level
  // authors should keep map.height * chipSize <= sender BOARD_H (220 px)
  // until V7.1 adds canvasH to the wire + scaling here.
  var playerLevelY = player.y;
  var ax = actor.x * chipSize;
  var ay = actor.y * chipSize;
  return Math.abs(playerLevelX - ax) <= OVERLAP_PX &&
         Math.abs(playerLevelY - ay) <= OVERLAP_PX;
}

// Internal: warp every Player to a coord (chip-space x/y -> CSS px).
function _warpAllPlayersTo(state, chipX, chipY, inReflection) {
  var chipSize = state.chipSize;
  var keys = Object.keys(state.players);
  for (var i = 0; i < keys.length; i++) {
    var u = keys[i];
    state.players[u].x = chipX * chipSize;
    state.players[u].y = chipY * chipSize;
    state.players[u].inReflection = !!inReflection;
  }
}

// tick(state, deltaMs, room) -> nextState
// The state-machine driver. See LIVE_CLASSROOM_V7_BUILD.md C2 for the
// transition diagram. Returns the mutated state (mutation is OK -- the
// engine owns the state object and the test suite asserts identity is
// preserved across ticks).
function tick(state, deltaMs, room) {
  if (!state) return state;

  // Pull latest positions from the live room before checking overlaps.
  _refreshPlayerPositions(state, room);

  var chipSize    = state.chipSize;
  var onlineN     = _onlineCount(state);
  var playerKeys  = Object.keys(state.players);

  // 2026-05-25 Codex V7 BLOCKER 3 fold: replace walk-to-ReturnWarp
  // with TIME-BASED auto-clear. The physical walk-back was not
  // durable because the hidden classroom-board kept broadcasting
  // positions that overwrote the server's warp. Movement authority
  // is a v7.1 problem; v7 ships the simpler model:
  //   * On wrong-door pass, set reflection.active = true +
  //     autoCloseAt = now + REFLECTION_DURATION_MS.
  //   * Every tick, if now >= autoCloseAt, clear reflection +
  //     reset the wrong-door switch + return to main scene.
  //   * Players don't physically walk anywhere; the renderer shows
  //     the reflection text as a panel + a countdown.
  if (state.reflection.active) {
    var nowMs = Date.now();
    if (nowMs >= state.reflection.autoCloseAt) {
      var wrongDoorId = state.reflection.doorId;
      for (var s = 0; s < state.switches.length; s++) {
        if (state.switches[s].doorId === wrongDoorId) {
          state.switches[s].pressed   = false;
          state.switches[s].voteCount = 0;
          state.switches[s].voters    = new Set();
          if (state.tally.votes[wrongDoorId] != null) {
            state.tally.votes[wrongDoorId] = 0;
          }
        }
      }
      for (var g = 0; g < state.gates.length; g++) {
        if (state.gates[g].doorId === wrongDoorId) {
          state.gates[g].opened = false;
          state.gates[g].passed = false;
        }
      }
      state.reflection.active        = false;
      state.reflection.doorId        = null;
      state.reflection.returnedCount = 0;
      state.reflection.returnedSet   = new Set();
      state.reflection.autoCloseAt   = 0;
      state.reflection.reflectionText = '';
      for (var pi2 = 0; pi2 < playerKeys.length; pi2++) {
        state.players[playerKeys[pi2]].inReflection = false;
      }
    }
    return state;
  }

  // ---------- MAIN SCENE ----------

  // 1. Coin collection.
  for (var c = 0; c < state.coins.length; c++) {
    var coin = state.coins[c];
    if (coin.collected) continue;
    for (var pi = 0; pi < playerKeys.length; pi++) {
      var pl = state.players[playerKeys[pi]];
      if (_overlapsActor(pl, coin, chipSize, state)) {
        coin.collected = true;
        if (state.tally.sips[coin.drink] == null) state.tally.sips[coin.drink] = 0;
        state.tally.sips[coin.drink]++;
        break;
      }
    }
  }

  // 2. Switch press + recompute pressed threshold.
  // pressed = (voteCount >= ceil(onlineN * 1/3)). We use Math.ceil so a
  // 2-student class needs 1 voter, a 3-student class needs 1, a 4-student
  // class needs 2, etc. (matches spec wording ">= 1/3 of online players").
  var threshold = Math.max(1, Math.ceil(onlineN / 3));
  for (var sw = 0; sw < state.switches.length; sw++) {
    var swo = state.switches[sw];
    for (var spi = 0; spi < playerKeys.length; spi++) {
      var spu = playerKeys[spi];
      var spp = state.players[spu];
      if (swo.voters.has(spu)) continue;
      if (_overlapsActor(spp, swo, chipSize, state)) {
        swo.voters.add(spu);
        swo.voteCount = swo.voters.size;
      }
    }
    swo.pressed = swo.voteCount >= threshold;
    state.tally.votes[swo.doorId] = swo.voteCount;
  }

  // 3. Gate opening + Gate-pass detection.
  // A gate opens when its matching switch is pressed (sticky).
  // A Player "passes" a gate by overlapping the door coords AFTER the
  // gate is opened. The first wrong-door pass triggers reflection.
  for (var gi = 0; gi < state.gates.length; gi++) {
    var gate = state.gates[gi];
    var matchSwitch = null;
    for (var ms = 0; ms < state.switches.length; ms++) {
      if (state.switches[ms].doorId === gate.doorId) {
        matchSwitch = state.switches[ms];
        break;
      }
    }
    if (matchSwitch && matchSwitch.pressed) gate.opened = true;
    if (!gate.opened || gate.passed) continue;
    for (var gpi = 0; gpi < playerKeys.length; gpi++) {
      var gpu = playerKeys[gpi];
      var gpp = state.players[gpu];
      if (_overlapsActor(gpp, gate, chipSize, state)) {
        gate.passed = true;
        if (!gate.correct) {
          // 2026-05-25 V7 fold: time-based reflection. Stash the
          // doorId + the door's reflection text so the renderer can
          // display it. autoCloseAt determines when tick() auto-
          // clears reflection + resets the wrong switch. We DO mark
          // players as inReflection so the renderer can show the
          // reflection panel over them, but we do NOT physically warp
          // (the hidden classroom-board would just overwrite it).
          state.reflection.active        = true;
          state.reflection.doorId        = gate.doorId;
          state.reflection.reflectionText = (gate.reflectionText || gate.reflection || '');
          state.reflection.autoCloseAt   = Date.now() + REFLECTION_DURATION_MS;
          state.reflection.returnedCount = 0;
          state.reflection.returnedSet   = new Set();
          for (var rfi = 0; rfi < playerKeys.length; rfi++) {
            state.players[playerKeys[rfi]].inReflection = true;
          }
          // Stop further per-tick processing -- subsequent gate/goal
          // checks should run only outside reflection.
          return state;
        }
        break;
      }
    }
  }

  // 4. Goal reach -- only if at least one correct gate is opened.
  var anyCorrectOpened = false;
  for (var gci = 0; gci < state.gates.length; gci++) {
    if (state.gates[gci].opened && state.gates[gci].correct) {
      anyCorrectOpened = true;
      break;
    }
  }
  if (anyCorrectOpened && !state.goal.reached) {
    for (var goi = 0; goi < playerKeys.length; goi++) {
      var gou = playerKeys[goi];
      var gop = state.players[gou];
      if (_overlapsActor(gop, state.goal, chipSize, state)) {
        state.goal.reached   = true;
        state.goal.reachedBy = gou;
        break;
      }
    }
  }

  return state;
}

// isComplete(state) -> bool
// Level clears when Goal is reached AND we're not stuck in reflection.
function isComplete(state) {
  if (!state) return false;
  if (state.reflection && state.reflection.active) return false;
  return !!(state.goal && state.goal.reached);
}

// serialize(state) -> publicState
// Wire-safe shape per LIVE_CLASSROOM_V7_BUILD.md C4. Sets become arrays
// (raw username lists for voters / returned). Internal-only fields
// (vx, vy, lastInteracted, voters Set instances) are stripped.
function serialize(state) {
  if (!state) return null;
  var players = {};
  Object.keys(state.players).forEach(function (u) {
    var p = state.players[u];
    players[u] = {
      x:            p.x,
      y:            p.y,
      inReflection: !!p.inReflection
    };
  });
  var coins = state.coins.map(function (c) {
    return {
      id:        c.id,
      x:         c.x,
      y:         c.y,
      drink:     c.drink,
      collected: !!c.collected
    };
  });
  var switches = state.switches.map(function (s) {
    return {
      id:             s.id,
      doorId:         s.doorId,
      x:              s.x,
      y:              s.y,
      voteCount:      s.voteCount,
      pressed:        !!s.pressed,
      voterUsernames: Array.from(s.voters)
    };
  });
  var gates = state.gates.map(function (g) {
    return {
      id:      g.id,
      doorId:  g.doorId,
      x:       g.x,
      y:       g.y,
      correct: !!g.correct,
      opened:  !!g.opened,
      passed:  !!g.passed
    };
  });
  var goal = {
    x:         state.goal.x,
    y:         state.goal.y,
    reached:   !!state.goal.reached,
    reachedBy: state.goal.reachedBy
  };
  var reflection = {
    active:        !!state.reflection.active,
    doorId:        state.reflection.doorId,
    returnedCount: state.reflection.returnedCount || 0,
    totalCount:    Object.keys(state.players).length
  };
  return {
    levelKey:   state.levelKey,
    lessonKey:  state.lessonKey,
    chipSize:   state.chipSize,
    players:    players,
    coins:      coins,
    switches:   switches,
    gates:      gates,
    goal:       goal,
    reflection: reflection,
    tally:      {
      sips:  Object.assign({}, state.tally.sips),
      votes: Object.assign({}, state.tally.votes)
    }
  };
}

// onMemberLeave(state, username) -> nextState | null
// Drop the leaver from state.players and from any switch's voters set;
// recompute that switch's voteCount + pressed.
function onMemberLeave(state, username) {
  if (!state || !state.players) return null;
  if (!(username in state.players)) return null;
  delete state.players[username];
  // Per the spec, leaver is also removed from any switch they voted on.
  var onlineN = _onlineCount(state);
  var threshold = Math.max(1, Math.ceil(onlineN / 3));
  for (var i = 0; i < state.switches.length; i++) {
    var swo = state.switches[i];
    if (swo.voters.has(username)) {
      swo.voters.delete(username);
      swo.voteCount = swo.voters.size;
    }
    swo.pressed = swo.voteCount >= threshold;
    state.tally.votes[swo.doorId] = swo.voteCount;
  }
  // Also remove from the reflection returnedSet if they were stuck.
  if (state.reflection && state.reflection.returnedSet &&
      state.reflection.returnedSet.has(username)) {
    state.reflection.returnedSet.delete(username);
    state.reflection.returnedCount = state.reflection.returnedSet.size;
  }
  return state;
}

// onMemberJoin(state, username, room) -> nextState | null
// Spawn a brand-new Player at the FIRST PlayerSpawn coord. Re-join (the
// same username already in state.players) is a no-op so their progress
// is preserved.
function onMemberJoin(state, username, room) {
  if (!state || !state.players) return null;
  if (username in state.players) return null;
  // The spawn coord is the engine's seed default: (4, 12) for U1.1.
  // We can't read the level def here, but createLevelState stamped the
  // initial player coords, and onMemberJoin reuses an EXISTING player
  // coord if one is available (otherwise fall back to (4, 12) chips).
  var chipSize = state.chipSize || 24;
  var sx = (state.spawnX != null) ? state.spawnX : 4;
  var sy = (state.spawnY != null) ? state.spawnY : 12;
  state.players[username] = {
    x:             sx * chipSize,
    y:             sy * chipSize,
    vx:            0,
    vy:            0,
    inReflection:  !!state.reflection.active,
    lastInteracted: 0
  };
  return state;
}

export default {
  loadLevel:        loadLevel,
  createLevelState: createLevelState,
  applyInput:       applyInput,
  tick:             tick,
  isComplete:       isComplete,
  serialize:        serialize,
  onMemberLeave:    onMemberLeave,
  onMemberJoin:     onMemberJoin,
  _clearCache:      _clearCache
};

export {
  loadLevel,
  createLevelState,
  applyInput,
  tick,
  isComplete,
  serialize,
  onMemberLeave,
  onMemberJoin,
  _clearCache
};
