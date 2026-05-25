// level-engine.js
// ES module -- V7.1 Live Classroom level engine.
//
// V7.1 rewrites the engine as a PHASE-BASED state machine. The internal
// switch/gate arrays from V7 are gone. The VOTING phase delegates to
// the existing v3 P4 doorways mechanism (open/walk-through/press-Up).
// The engine emits sideEffects.openDoorways at the SIPPING -> VOTING
// transition; classroom.js's activityTick wrapper consumes the
// sideEffect and calls a server-driven openDoorways that mirrors the
// teacher-driven path. The engine watches room.closedDoorways per
// tick to detect the winning option and advance the state machine.
//
// Contract: see LIVE_CLASSROOM_V7_1_BUILD.md sections C1, C2, C7.
//
// Coordinate system:
//   - Actor coords (x, y) are in CHIP units. Multiply by chipSize for CSS px.
//   - Player coords (state.players[u].x/y) are in CSS px in the SENDER's
//     coord space (their classroom-board canvas). Per the V5 BLOCKER fix
//     the engine reads each Player's canvasW from room.members.get(u).canvasW
//     and rescales into level coord space before overlap-testing actors.
//   - Overlap test: |player_level_px - actor_chip * chipSize| <= 16 in both axes.
//
// Wire-safety: serialize() converts internal Sets to JSON-safe arrays.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

var __filename = fileURLToPath(import.meta.url);
var __dirname  = dirname(__filename);

// Overlap radius (CSS pixels) -- per spec C2 "Player overlaps X within 16 px".
var OVERLAP_PX = 16;

// V7 Codex BLOCKER 3 fold (preserved in V7.1): time-based auto-clear
// for the reflection panel. 8 seconds is enough to read the reflection
// text (~1-2 sentences) without dragging the class.
var REFLECTION_DURATION_MS = 8000;

// Phase enum constants. Authoritative across engine + tests + cockpit
// observability. NEVER add a phase here without updating the cockpit.
var PHASE_INIT            = 'INIT';
var PHASE_SIPPING         = 'SIPPING';
var PHASE_VOTING          = 'VOTING';
var PHASE_REFLECTION      = 'REFLECTION';
var PHASE_GOAL_AVAILABLE  = 'GOAL_AVAILABLE';
var PHASE_LEVEL_CLEARED   = 'LEVEL_CLEARED';

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
  var filePath = join(__dirname, 'activities', lessonKey + '.json');
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

// Build a stable doorways id from the levelKey and a phase counter.
// The phase counter ticks every time we open a fresh doorways
// instance (VOTING phase entry OR REFLECTION re-vote) so the id is
// unique across re-votes for the same level.
function _doorwaysIdFor(state, phaseEntry) {
  return 'level-' + state.levelKey + '-vote-' + phaseEntry;
}

// Build the openDoorways sideEffect payload from a state. Pure function
// of state.doorways + state.levelKey + the level's vote question.
function _buildOpenDoorwaysSideEffect(state, phaseEntry) {
  var doors = state.doorways || [];
  var id = _doorwaysIdFor(state, phaseEntry);
  var question = state._voteQuestion || 'Which question is the right one?';
  var options = [];
  for (var i = 0; i < doors.length; i++) {
    options.push({
      label:  doors[i].text || ('Option ' + String.fromCharCode(65 + i)),
      doorId: doors[i].id
    });
  }
  return { id: id, question: question, options: options };
}

// createLevelState(levelDef, onlineStudents) -> LevelState
// Spawns one Player per online student at the FIRST PlayerSpawn coord.
// Initial phase is SIPPING (V7.1 spec C1.1).
function createLevelState(levelDef, onlineStudents) {
  if (!levelDef || !Array.isArray(levelDef.actors)) {
    return null;
  }
  var students = Array.isArray(onlineStudents) ? onlineStudents : [];
  var spawns   = _actorsOfType(levelDef.actors, 'PlayerSpawn');
  if (spawns.length === 0) {
    spawns = [{ type: 'PlayerSpawn', x: 0, y: 0 }];
  }
  var chipSize = (levelDef.map && typeof levelDef.map.chipSize === 'number')
    ? levelDef.map.chipSize
    : 10;

  var players = {};
  for (var i = 0; i < students.length; i++) {
    var u  = students[i].username;
    var sp = spawns[i % spawns.length];
    players[u] = {
      x: sp.x * chipSize,
      y: sp.y * chipSize
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
      collected: false
    });
  }

  // Doorways from QuestionDoor actors. The engine no longer manages
  // switches/gates; it just records the level's question doors and
  // hands them to the v3 P4 mechanism at the VOTING transition.
  var doorways = [];
  var doors    = _actorsOfType(levelDef.actors, 'QuestionDoor');
  for (var d = 0; d < doors.length; d++) {
    var door = doors[d];
    doorways.push({
      id:         door.id || ('door-' + d),
      x:          door.x,
      y:          door.y,
      text:       (typeof door.text === 'string') ? door.text : '',
      correct:    !!door.correct,
      reflection: (typeof door.reflection === 'string') ? door.reflection : ''
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

  // Canonical spawn coord for late-spawn placement.
  var spawnX = spawns[0].x;
  var spawnY = spawns[0].y;

  // Vote question shown above the doorways panel. Pulled from the
  // level def if provided, else a sensible default.
  var voteQuestion = (levelDef.vote_question && typeof levelDef.vote_question === 'string')
    ? levelDef.vote_question
    : 'Which question is the right one?';

  return {
    levelKey:        levelDef.levelKey || '',
    lessonKey:       levelDef.lessonKey || '',
    chipSize:        chipSize,
    mapWidth:        (levelDef.map && typeof levelDef.map.width  === 'number') ? levelDef.map.width  : 32,
    mapHeight:       (levelDef.map && typeof levelDef.map.height === 'number') ? levelDef.map.height :  8,
    phase:           PHASE_SIPPING,
    startedAt:       Date.now(),
    spawnX:          spawnX,
    spawnY:          spawnY,
    players:         players,
    coins:           coins,
    doorways:        doorways,
    // Bumped every time the engine emits a fresh openDoorways
    // sideEffect so the wrapper can synthesize stable, unique ids.
    _phaseEntry:     0,
    // Set by the engine when a doorways round is live; cleared on close.
    liveDoorwaysId:  null,
    reflection: {
      active:         false,
      doorId:         null,
      reflectionText: '',
      autoCloseAt:    0
    },
    goal:            goal,
    tally:           { sips: { A: 0, B: 0 } },
    _voteQuestion:   voteQuestion,
    // sideEffects is cleared each tick by the wrapper after consumption.
    sideEffects:     null
  };
}

// applyInput(state, username, payload) -> nextState | null
//
// V7.2 sprite-collide rev (2026-05-25): the avatar canvas now owns
// coin sprites and detects sprite-vs-coin collision client-side. When
// the local player touches a SipStation sprite the client sends
// `classroom_activity_value` with { kind: 'collect', coinId }. We
// validate (right phase, coin exists, not already collected, player
// actually near the coin in level X space -- anti-cheat) and flip the
// coin.collected flag + bump the tally. onTick still re-checks the
// SIPPING -> VOTING transition; clients only nominate which coin they
// hit, the server stays authoritative.
function applyInput(state, username, payload) {
  if (!state || !payload || typeof payload !== 'object') return null;
  if (payload.kind === 'collect') return _handleCoinCollect(state, username, payload);
  return null;
}

function _handleCoinCollect(state, username, payload) {
  if (state.phase !== PHASE_SIPPING) return null;
  if (typeof payload.coinId !== 'string' || !payload.coinId) return null;
  if (!Array.isArray(state.coins)) return null;
  var coin = null;
  for (var i = 0; i < state.coins.length; i++) {
    if (state.coins[i].id === payload.coinId) { coin = state.coins[i]; break; }
  }
  if (!coin || coin.collected) return null;
  // Anti-cheat: confirm the claiming player is within 2 * OVERLAP_PX of
  // the coin's level X. 2x accounts for client-side prediction latency.
  // Players with no tracked position (just joined, no classroom_pos yet)
  // are allowed -- harmless edge case.
  var player = state.players && state.players[username];
  if (player && typeof player.x === 'number') {
    var levelW   = (state.mapWidth || 32) * (state.chipSize || 10);
    var senderCw = (typeof player._canvasW === 'number' && player._canvasW > 0) ? player._canvasW : 320;
    var playerLevelX = (player.x / senderCw) * levelW;
    var ax = coin.x * (state.chipSize || 10);
    if (Math.abs(playerLevelX - ax) > OVERLAP_PX * 2) return null;
  }
  coin.collected = true;
  if (state.tally.sips[coin.drink] == null) state.tally.sips[coin.drink] = 0;
  state.tally.sips[coin.drink]++;
  return state;
}

// Internal: snap a Player's tracked x/y to the latest broadcast position
// from room.members.get(u).pos. Also stash sender canvasW for overlap
// math so per-canvasW rescaling stays consistent with V5 BLOCKER 2 fix.
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

// Internal: rescale a Player's sender-canvas X into LEVEL coord X so
// the overlap test can compare against actor chip * chipSize. With
// chipSize=10 and mapWidth=32 the level width = 320 px; if the sender
// is also broadcasting on a 320-wide canvas the rescale is identity
// (player_level_x = player_x / 320 * 320 = player_x). The math stays
// in place anyway so any non-320 sender (cockpit @ 640+) still works.
//
// 2026-05-25 V7.1 Y-axis fix: per V7.1 spec ("Players walk on the
// existing LC floor; overlays sit above"), the player Y is fixed at
// the avatar floor (canvas y ~= 146) while every level actor lives in
// the OVERLAY region at chip y * chipSize (e.g. coins at chip y=2 ->
// pixel y=20). The previous Y comparison was |146 - 20| = 126 > 16 and
// could NEVER succeed, so coins never collected, phase never advanced
// to VOTING, and openDoorways was never emitted. Treat the player as
// a vertical column: actors with matching X (regardless of Y) trigger.
function _overlapsActor(player, actor, chipSize, state) {
  var levelW = (state && state.mapWidth) ? state.mapWidth * chipSize : 320;
  var senderCw = (player && typeof player._canvasW === 'number' && player._canvasW > 0) ? player._canvasW : 320;
  var playerLevelX = (player.x / senderCw) * levelW;
  var ax = actor.x * chipSize;
  return Math.abs(playerLevelX - ax) <= OVERLAP_PX;
}

// Internal: check the SIPPING -> VOTING precondition. Default is
// "all coins collected"; if the level overrode `sipping_complete`
// future-shape we can wire it in here (V7.2+, not V7.1).
function _isSippingComplete(state) {
  if (!state.coins || state.coins.length === 0) return true;
  for (var i = 0; i < state.coins.length; i++) {
    if (!state.coins[i].collected) return false;
  }
  return true;
}

// tick(state, deltaMs, room) -> nextState
// Phase-based state machine driver. See LIVE_CLASSROOM_V7_1_BUILD.md
// C1 + C2 for the transition diagram. Mutates and returns state.
function tick(state, deltaMs, room) {
  if (!state) return state;

  // Clear any sideEffect emitted on the previous tick; the wrapper has
  // already consumed it. This is the only place we clear sideEffects.
  state.sideEffects = null;

  // Pull latest positions from the live room before checking overlaps.
  _refreshPlayerPositions(state, room);

  var chipSize = state.chipSize;

  // ----- LEVEL_CLEARED is terminal; nothing to do. -----
  if (state.phase === PHASE_LEVEL_CLEARED) {
    return state;
  }

  // ----- REFLECTION: wait for autoCloseAt, then return to VOTING. -----
  if (state.phase === PHASE_REFLECTION) {
    var nowMs = Date.now();
    if (nowMs >= state.reflection.autoCloseAt) {
      state.reflection.active         = false;
      state.reflection.doorId         = null;
      state.reflection.reflectionText = '';
      state.reflection.autoCloseAt    = 0;
      // Return to VOTING and emit a fresh openDoorways sideEffect with
      // a NEW id (phase counter bumps) so the wrapper opens a clean
      // round. The wrong door already closed via the prior vote; no
      // closeDoorways sideEffect is needed.
      state.phase = PHASE_VOTING;
      state._phaseEntry += 1;
      var voteSideEffect = _buildOpenDoorwaysSideEffect(state, state._phaseEntry);
      state.liveDoorwaysId = voteSideEffect.id;
      state.sideEffects = { openDoorways: voteSideEffect };
    }
    return state;
  }

  // ----- SIPPING: client-driven coin collection (V7.2 sprite-collide). --
  //
  // The server-side auto-collect scan was REMOVED in V7.2: every player
  // spawns at PlayerSpawn (e.g. chip (4, 4)) and the first tick fired
  // before any movement, so the X-only overlap auto-collected whichever
  // coin happened to be near the spawn X. Users perceived this as
  // "collected by proximity" -- correctly, because it was. Collection
  // is now driven by client CoinSprite.update collision events that
  // arrive via classroom_activity_value { kind:'collect', coinId } and
  // are validated by applyInput / _handleCoinCollect (this same engine,
  // with a server-side X-overlap anti-cheat). The tick loop only needs
  // to check the SIPPING -> VOTING transition.
  if (state.phase === PHASE_SIPPING) {
    if (_isSippingComplete(state)) {
      state.phase = PHASE_VOTING;
      state._phaseEntry += 1;
      var openSideEffect = _buildOpenDoorwaysSideEffect(state, state._phaseEntry);
      state.liveDoorwaysId = openSideEffect.id;
      state.sideEffects = { openDoorways: openSideEffect };
    }
    return state;
  }

  // ----- VOTING: watch for room.closedDoorways matching liveDoorwaysId. -----
  if (state.phase === PHASE_VOTING) {
    if (!room || !room.closedDoorways) {
      return state;
    }
    if (room.closedDoorways.id !== state.liveDoorwaysId) {
      return state;
    }
    // Identify the winning option from the tally (highest count; ties
    // resolved by lowest array index). If every count is zero the
    // vote effectively went nowhere; treat as no-winner and stay in
    // VOTING. closedDoorways.tally is [{doorId, count}, ...].
    var tally = room.closedDoorways.tally || [];
    var winnerDoorId = null;
    var winnerCount = -1;
    for (var ti = 0; ti < tally.length; ti++) {
      var entry = tally[ti];
      if (typeof entry.count !== 'number' || entry.count <= 0) continue;
      if (entry.count > winnerCount) {
        winnerDoorId = entry.doorId;
        winnerCount = entry.count;
      }
    }
    // Consume the close event regardless so we don't re-process it.
    state.liveDoorwaysId = null;
    if (winnerDoorId == null) {
      // No votes cast (vote closed empty). Re-open the same question
      // on the next tick: bump phaseEntry + emit a fresh openDoorways.
      state._phaseEntry += 1;
      var reopenSideEffect = _buildOpenDoorwaysSideEffect(state, state._phaseEntry);
      state.liveDoorwaysId = reopenSideEffect.id;
      state.sideEffects = { openDoorways: reopenSideEffect };
      return state;
    }
    // Look up the winning door's metadata.
    var winnerDoor = null;
    for (var di = 0; di < state.doorways.length; di++) {
      if (state.doorways[di].id === winnerDoorId) {
        winnerDoor = state.doorways[di];
        break;
      }
    }
    if (!winnerDoor) {
      // Unknown doorId in tally (shouldn't happen). Re-vote.
      state._phaseEntry += 1;
      var unknownReopenSideEffect = _buildOpenDoorwaysSideEffect(state, state._phaseEntry);
      state.liveDoorwaysId = unknownReopenSideEffect.id;
      state.sideEffects = { openDoorways: unknownReopenSideEffect };
      return state;
    }
    if (winnerDoor.correct) {
      state.phase = PHASE_GOAL_AVAILABLE;
    } else {
      state.phase = PHASE_REFLECTION;
      state.reflection.active         = true;
      state.reflection.doorId         = winnerDoor.id;
      state.reflection.reflectionText = winnerDoor.reflection || '';
      state.reflection.autoCloseAt    = Date.now() + REFLECTION_DURATION_MS;
    }
    return state;
  }

  // ----- GOAL_AVAILABLE: detect Player-Goal overlap. -----
  if (state.phase === PHASE_GOAL_AVAILABLE) {
    if (state.goal.reached) {
      state.phase = PHASE_LEVEL_CLEARED;
      return state;
    }
    var goalKeys = Object.keys(state.players);
    for (var gi = 0; gi < goalKeys.length; gi++) {
      var gu = goalKeys[gi];
      var gp = state.players[gu];
      if (_overlapsActor(gp, state.goal, chipSize, state)) {
        state.goal.reached   = true;
        state.goal.reachedBy = gu;
        state.phase = PHASE_LEVEL_CLEARED;
        break;
      }
    }
    return state;
  }

  return state;
}

// isComplete(state) -> bool
// Level clears when the state machine reaches LEVEL_CLEARED.
function isComplete(state) {
  if (!state) return false;
  return state.phase === PHASE_LEVEL_CLEARED;
}

// serialize(state) -> publicState
// Wire-safe shape. Includes `phase` for cockpit observability. The
// renderer reads `coins`, `doorways`, `goal`, `reflection`, and `phase`
// to draw the overlay (the v3 P4 doorways layer renders QuestionDoors
// natively in VOTING phase).
function serialize(state) {
  if (!state) return null;
  var players = {};
  Object.keys(state.players).forEach(function (u) {
    var p = state.players[u];
    players[u] = {
      x: p.x,
      y: p.y
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
  var doorways = state.doorways.map(function (d) {
    return {
      id:      d.id,
      x:       d.x,
      y:       d.y,
      text:    d.text,
      correct: !!d.correct
    };
  });
  var goal = {
    x:         state.goal.x,
    y:         state.goal.y,
    reached:   !!state.goal.reached,
    reachedBy: state.goal.reachedBy
  };
  var reflection = {
    active:         !!state.reflection.active,
    doorId:         state.reflection.doorId,
    reflectionText: state.reflection.reflectionText || '',
    autoCloseAt:    state.reflection.autoCloseAt || 0
  };
  return {
    levelKey:        state.levelKey,
    lessonKey:       state.lessonKey,
    chipSize:        state.chipSize,
    mapWidth:        state.mapWidth,
    mapHeight:       state.mapHeight,
    phase:           state.phase,
    players:         players,
    coins:           coins,
    doorways:        doorways,
    goal:            goal,
    reflection:      reflection,
    tally:           { sips: Object.assign({}, state.tally.sips) }
  };
}

// onMemberLeave(state, username) -> nextState | null
// Drop the leaver from state.players. Doorway votes live on the v3
// P4 layer (room.doorways), not in level state, so no vote cleanup
// is needed here -- the registry's existing doorway logic handles it.
function onMemberLeave(state, username) {
  if (!state || !state.players) return null;
  if (!(username in state.players)) return null;
  delete state.players[username];
  return state;
}

// onMemberJoin(state, username, room) -> nextState | null
// Spawn a brand-new Player at the canonical spawn coord. Re-join
// (already in players) is a no-op so prior progress is preserved.
function onMemberJoin(state, username, room) {
  if (!state || !state.players) return null;
  if (username in state.players) return null;
  var chipSize = state.chipSize || 10;
  var sx = (state.spawnX != null) ? state.spawnX : 4;
  var sy = (state.spawnY != null) ? state.spawnY : 4;
  state.players[username] = {
    x: sx * chipSize,
    y: sy * chipSize
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
  _clearCache,
  PHASE_INIT,
  PHASE_SIPPING,
  PHASE_VOTING,
  PHASE_REFLECTION,
  PHASE_GOAL_AVAILABLE,
  PHASE_LEVEL_CLEARED,
  REFLECTION_DURATION_MS
};
