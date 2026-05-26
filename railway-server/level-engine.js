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
var PHASE_KEY_HUNT        = 'KEY_HUNT';        // V7.5: post-vote, pre-goal -- a single shared key is up for grabs
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
  //
  // V7.4: optional `hidden: true` on a SipStation marks it as a
  // blind-test coin -- the drink identity is concealed pre-collect
  // ('?' on the client) and revealed only on contact. State carries
  // a separate `revealed` flag so the wire shape can transmit the
  // pre/post identity distinction independently of `collected`.
  // Default behavior (no hidden field) keeps the V7.2/3 contract:
  // identity always visible, revealed===true from t=0.
  var coins = [];
  var sipActors = _actorsOfType(levelDef.actors, 'SipStation');
  for (var c = 0; c < sipActors.length; c++) {
    var sa = sipActors[c];
    var hidden = sa.hidden === true;
    coins.push({
      id:        sa.id || ('sip-' + c),
      x:         sa.x,
      y:         sa.y,
      drink:     sa.drink || 'A',
      collected: false,
      hidden:    hidden,
      revealed:  !hidden
    });
  }

  // Doorways from QuestionDoor actors -- legacy single-stage source.
  // V7.5 multi-stage extension: if levelDef has a top-level `stages`
  // array, each entry contributes its own doorways array + question
  // text and the player must clear all stages in order to advance.
  // Levels without a `stages` array (the other 79 in the s115 batch)
  // are auto-wrapped into a synthetic single-stage from their actors[].
  var actorDoorways = [];
  var doors         = _actorsOfType(levelDef.actors, 'QuestionDoor');
  for (var d = 0; d < doors.length; d++) {
    var door = doors[d];
    actorDoorways.push({
      id:         door.id || ('door-' + d),
      x:          door.x,
      y:          door.y,
      text:       (typeof door.text === 'string') ? door.text : '',
      correct:    !!door.correct,
      reflection: (typeof door.reflection === 'string') ? door.reflection : ''
    });
  }
  var stages = [];
  if (Array.isArray(levelDef.stages) && levelDef.stages.length > 0) {
    for (var si = 0; si < levelDef.stages.length; si++) {
      var rawStage = levelDef.stages[si];
      var stageDoors = Array.isArray(rawStage.doorways) ? rawStage.doorways : [];
      var normalized = [];
      for (var sd = 0; sd < stageDoors.length; sd++) {
        var rd = stageDoors[sd] || {};
        normalized.push({
          id:         rd.id || ('s' + si + 'd' + sd),
          x:          (typeof rd.x === 'number') ? rd.x : 0,
          y:          (typeof rd.y === 'number') ? rd.y : 0,
          text:       (typeof rd.text === 'string') ? rd.text : '',
          correct:    !!rd.correct,
          reflection: (typeof rd.reflection === 'string') ? rd.reflection : ''
        });
      }
      stages.push({
        questionText: (typeof rawStage.questionText === 'string') ? rawStage.questionText : '',
        doorways:     normalized
      });
    }
  } else {
    // Backward compat: synthesize a single stage from the actors-based
    // QuestionDoors. No behavior change for the 79 non-staged levels.
    stages.push({
      questionText: (typeof levelDef.vote_question === 'string') ? levelDef.vote_question : '',
      doorways:     actorDoorways
    });
  }
  var currentStage = 0;
  // state.doorways always points to the current stage's doorways so
  // existing _buildOpenDoorwaysSideEffect / winnerDoor lookup logic
  // continues to read the right set without per-call indexing.
  var doorways = stages[0].doorways;

  // Goal: single Goal actor; fall back to first if multiple declared.
  var goalActors = _actorsOfType(levelDef.actors, 'Goal');
  var goalDef    = goalActors[0] || { x: 0, y: 0 };
  var goal = {
    x:         goalDef.x,
    y:         goalDef.y,
    reached:   false,
    reachedBy: null
  };

  // V7.5: optional single Key actor. If present, the engine inserts
  // a KEY_HUNT phase between the last-stage correct vote and
  // GOAL_AVAILABLE -- any player can collect the key, then the goal
  // door unlocks. No Key actor in the level def -> phase machine
  // skips KEY_HUNT entirely (backward compat with the other 79 levels).
  var keyActors = _actorsOfType(levelDef.actors, 'Key');
  var keyDef    = keyActors[0] || null;
  var key       = keyDef ? {
    x:         keyDef.x,
    y:         keyDef.y,
    collected: false,
    collectedBy: null
  } : null;

  // Canonical spawn coord for late-spawn placement.
  var spawnX = spawns[0].x;
  var spawnY = spawns[0].y;

  // V7.5: vote question reflects the CURRENT stage's questionText, with
  // a fallback chain to legacy levelDef.vote_question, then a default.
  // Updated on each stage transition (see tick() VOTING branch).
  var voteQuestion = (stages[0].questionText)
    || ((typeof levelDef.vote_question === 'string') ? levelDef.vote_question : '')
    || 'Which question is the right one?';

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
    // V7.5: multi-stage voting -- engine cycles through stages[] in
    // order, advancing on correct vote, looping in REFLECTION-then-revote
    // on wrong vote (existing mechanic per-stage). currentStage indexes
    // the active stage; state.doorways always points to its doorways
    // array so existing _buildOpenDoorwaysSideEffect / winner-lookup
    // logic continues working unchanged.
    stages:          stages,
    currentStage:    0,
    stagesTotal:     stages.length,
    // V7.5: optional single Key actor -- KEY_HUNT phase fires between
    // the last-stage correct vote and GOAL_AVAILABLE. null if the
    // level def has no Key actor (backward compat).
    key:             key,
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
  if (payload.kind === 'collect')     return _handleCoinCollect(state, username, payload);
  if (payload.kind === 'reach-goal')  return _handleReachGoal(state, username);
  if (payload.kind === 'collect-key') return _handleCollectKey(state, username);
  return null;
}

// Shared anti-cheat: is the claiming player within tolerance px of the
// actor's level X? Players with no tracked position (just joined) are
// allowed through -- harmless edge case.
function _playerNearActorX(state, username, actorChipX, tolerancePx) {
  var player = state.players && state.players[username];
  if (!player || typeof player.x !== 'number') return true;
  var chipSize    = state.chipSize || 10;
  var levelW      = (state.mapWidth || 32) * chipSize;
  var senderCw    = (typeof player._canvasW === 'number' && player._canvasW > 0) ? player._canvasW : 320;
  var playerLevelX = (player.x / senderCw) * levelW;
  var actorLevelX  = actorChipX * chipSize;
  return Math.abs(playerLevelX - actorLevelX) <= tolerancePx;
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
  // Anti-cheat: 2 * OVERLAP_PX (covers client-side prediction latency).
  if (!_playerNearActorX(state, username, coin.x, OVERLAP_PX * 2)) return null;
  coin.collected = true;
  // V7.4: collect always reveals identity. Even non-hidden coins set
  // revealed=true here (it was already true from createLevelState), so
  // the flag is consistent everywhere. Hidden coins now flip false ->
  // true on this same transition, which the client uses to drive the
  // pre/post reveal swap + floating "+A"/"+B" text.
  coin.revealed = true;
  if (state.tally.sips[coin.drink] == null) state.tally.sips[coin.drink] = 0;
  state.tally.sips[coin.drink]++;
  return state;
}

// V7.2 sprite-collide -- client-driven Goal completion. Mirrors the
// coin-collect path: GoalSprite on the avatar canvas fires onReach when
// the local player walks under the goal flag; that emits
// classroom_activity_value { kind:'reach-goal' }, and we mark
// state.goal.reached + transition to PHASE_LEVEL_CLEARED.
function _handleReachGoal(state, username) {
  if (state.phase !== PHASE_GOAL_AVAILABLE) return null;
  if (!state.goal || state.goal.reached) return null;
  if (!_playerNearActorX(state, username, state.goal.x, OVERLAP_PX * 2)) return null;
  state.goal.reached   = true;
  state.goal.reachedBy = username;
  state.phase          = PHASE_LEVEL_CLEARED;
  return state;
}

// V7.5 sprite-collide -- client-driven shared-key collect. Any player
// in KEY_HUNT phase can grab the key by walking into it (X+Y jump
// collision on the client; X anti-cheat here on the server). On
// collect, state.key.collected flips true; the next tick promotes
// phase to PHASE_GOAL_AVAILABLE and the client swaps the door visual
// from locked to unlocked.
function _handleCollectKey(state, username) {
  if (state.phase !== PHASE_KEY_HUNT) return null;
  if (!state.key || state.key.collected) return null;
  if (!_playerNearActorX(state, username, state.key.x, OVERLAP_PX * 2)) return null;
  state.key.collected   = true;
  state.key.collectedBy = username;
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

// V7.6: substitute {N}/{TOTAL}/{PCT} placeholders in a reflection
// string using the actual vote tally at REFLECTION-phase entry. Lets
// the wrong-door pedagogy reference the class's lived data ("3 of 4
// of you chose this -- but blind sips only measure preference..."),
// not just static prose. Strings without placeholders pass through
// unchanged so the 79 other levels keep their static reflections.
function _substituteReflectionPlaceholders(template, winnerCount, tally) {
  if (typeof template !== 'string' || template.length === 0) return '';
  var total = 0;
  if (Array.isArray(tally)) {
    for (var i = 0; i < tally.length; i++) {
      var c = tally[i] && tally[i].count;
      if (typeof c === 'number' && c > 0) total += c;
    }
  }
  var n   = (typeof winnerCount === 'number' && winnerCount > 0) ? winnerCount : 0;
  var pct = total > 0 ? Math.round(100 * n / total) : 0;
  return template
    .replace(/\{N\}/g,     String(n))
    .replace(/\{TOTAL\}/g, String(total))
    .replace(/\{PCT\}/g,   String(pct));
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
      // V7.5: correct vote -- either advance to next stage, OR (last
      // stage cleared) transition to KEY_HUNT if the level has a Key
      // actor, else GOAL_AVAILABLE directly (backward compat with the
      // other 79 levels that have no Key actor).
      var nextStage = state.currentStage + 1;
      if (nextStage < state.stagesTotal) {
        // Advance to next stage: point doorways at the new stage's set,
        // update vote question, emit a fresh openDoorways sideEffect.
        state.currentStage   = nextStage;
        state.doorways       = state.stages[nextStage].doorways;
        state._voteQuestion  = state.stages[nextStage].questionText
                            || state._voteQuestion
                            || 'Which question is the right one?';
        state._phaseEntry   += 1;
        var nextStageSideEffect = _buildOpenDoorwaysSideEffect(state, state._phaseEntry);
        state.liveDoorwaysId = nextStageSideEffect.id;
        state.sideEffects    = { openDoorways: nextStageSideEffect };
        // Stay in PHASE_VOTING for the new stage.
      } else if (state.key) {
        state.phase = PHASE_KEY_HUNT;
      } else {
        state.phase = PHASE_GOAL_AVAILABLE;
      }
    } else {
      state.phase = PHASE_REFLECTION;
      state.reflection.active         = true;
      state.reflection.doorId         = winnerDoor.id;
      state.reflection.reflectionText = _substituteReflectionPlaceholders(
        winnerDoor.reflection || '', winnerCount, tally
      );
      state.reflection.autoCloseAt    = Date.now() + REFLECTION_DURATION_MS;
    }
    return state;
  }

  // ----- KEY_HUNT: wait for client-driven {kind:'collect-key'}. -----
  // V7.5: shared single key, any player can collect via applyInput.
  // _handleCollectKey flips state.key.collected true; we transition
  // to GOAL_AVAILABLE here on the next tick after that flip.
  if (state.phase === PHASE_KEY_HUNT) {
    if (state.key && state.key.collected) {
      state.phase = PHASE_GOAL_AVAILABLE;
    }
    return state;
  }

  // ----- GOAL_AVAILABLE: client-driven goal-reach (V7.2 sprite-collide). --
  //
  // The server-side auto-overlap scan was REMOVED in V7.2 alongside the
  // SIPPING auto-collect, for the same reason: players spawn at chip
  // (4, 4) and any goal authored near that X (or any auto-tick before
  // a classroom_pos lands) would auto-fire on phase entry. GoalSprite
  // on the avatar canvas now fires onReach when the local player walks
  // under the goal flag, which sends classroom_activity_value
  // { kind:'reach-goal' } -- _handleReachGoal validates + transitions
  // to LEVEL_CLEARED. The tick loop only acknowledges the transition.
  if (state.phase === PHASE_GOAL_AVAILABLE) {
    if (state.goal.reached) {
      state.phase = PHASE_LEVEL_CLEARED;
      return state;
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
      collected: !!c.collected,
      // V7.4 blind-test wire fields. hidden = level-author opted into
      // identity concealment; revealed = current per-coin truth flag.
      // Always sent so the client doesn't have to default-guess.
      hidden:    !!c.hidden,
      revealed:  c.revealed !== false
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
  // V7.5: goal.locked tracks the key-gate state for the client. If the
  // level has a Key actor, the door is LOCKED until state.key.collected
  // flips true (which only happens in KEY_HUNT phase). If there's no
  // Key actor, locked is false from t=0 (backward compat: the 79 other
  // levels render the door as unlocked the moment GOAL_AVAILABLE hits).
  var goal = {
    x:         state.goal.x,
    y:         state.goal.y,
    reached:   !!state.goal.reached,
    reachedBy: state.goal.reachedBy,
    locked:    !!(state.key && !state.key.collected)
  };
  var reflection = {
    active:         !!state.reflection.active,
    doorId:         state.reflection.doorId,
    reflectionText: state.reflection.reflectionText || '',
    autoCloseAt:    state.reflection.autoCloseAt || 0
  };
  // V7.5: serialize key for the client's KeySprite to spawn on KEY_HUNT.
  // null means the level has no Key actor (the KEY_HUNT phase will never
  // fire for that level).
  var key = state.key ? {
    x:           state.key.x,
    y:           state.key.y,
    collected:   !!state.key.collected,
    collectedBy: state.key.collectedBy
  } : null;
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
    key:             key,
    reflection:      reflection,
    tally:           { sips: Object.assign({}, state.tally.sips) },
    // V7.5: multi-stage observability for the client (e.g. "Stage 2 of 4"
    // indicator). currentStage indexes which stage's doorways are live;
    // voteQuestion echoes the current stage's prompt.
    currentStage:    typeof state.currentStage === 'number' ? state.currentStage : 0,
    stagesTotal:     typeof state.stagesTotal  === 'number' ? state.stagesTotal  : 1,
    voteQuestion:    state._voteQuestion || ''
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
  PHASE_KEY_HUNT,
  PHASE_GOAL_AVAILABLE,
  PHASE_LEVEL_CLEARED,
  REFLECTION_DURATION_MS
};
