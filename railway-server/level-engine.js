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

// V7.10 test-only: inject a level def into the cache so loadLevel(key)
// returns it without disk access. Lets registry-level tests use a
// synthetic V7.5-shape Cola fixture even though the actual U1.1.json
// on disk has moved to V7.10 Gate shape. Production never calls this.
function _injectLevelDef(lessonKey, def) {
  _levelCache.set(lessonKey, def);
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
      y: sp.y * chipSize,
      // V7.8 per-player marks. Set on coin collect (sampledA/sampledB)
      // and ChoicePad overlap (choice). _playerRowComplete returns
      // true when all three are populated -- gates the SIPPING ->
      // VOTING transition on ChoicePad levels via _isSippingComplete.
      marks: { sampledA: false, sampledB: false, choice: null }
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

  // V7.7: optional Tally actor. Threshold-gates the SIPPING -> VOTING
  // transition on a per-category sip count (e.g. require >= 3 W-sips
  // AND >= 3 N-sips before voting opens). Levels WITHOUT a Tally
  // actor fall back to the legacy "all coins collected" rule
  // (backward compat with the 78 other levels in the s115 batch).
  // `threshold` is a { categoryKey: minCount } map; `binds` is
  // reserved for future tally sources (only 'tally.sips' is supported
  // in V7.7 -- other values are accepted but ignored).
  var tallyActors = _actorsOfType(levelDef.actors, 'Tally');
  var tallyDef    = tallyActors[0] || null;
  var tallyConfig = tallyDef ? {
    threshold: (tallyDef.threshold && typeof tallyDef.threshold === 'object')
      ? Object.assign({}, tallyDef.threshold)
      : null,
    binds:     (typeof tallyDef.binds === 'string') ? tallyDef.binds : 'tally.sips'
  } : null;

  // V7.8: optional ChoicePad actors. Mechanic-first replacement for
  // V7.7 Tally threshold gating -- each player must overlap a
  // ChoicePad (after sampling both A and B) to record a preference.
  // Engine cascade in _isSippingComplete puts ChoicePad first
  // (every player rowComplete), Tally-threshold second (V7.7), and
  // all-coins-collected third (V7.5 legacy). Levels with no Tally,
  // no ChoicePad fall through to legacy unchanged.
  var choicePadActors = _actorsOfType(levelDef.actors, 'ChoicePad');
  var choicePads      = [];
  for (var cp = 0; cp < choicePadActors.length; cp++) {
    var cpa = choicePadActors[cp];
    choicePads.push({
      id:    cpa.id || ('choicepad-' + cp),
      x:     cpa.x,
      y:     cpa.y,
      value: (typeof cpa.value === 'string') ? cpa.value : 'A'
    });
  }

  // V7.10: optional Gate actors. Physical blockers with per-instance
  // predicates from a hard-coded whitelist (NEVER raw eval). When a
  // gate's predicate evaluates true, gate.opened flips one-way (never
  // re-closes). Levels with Gate actors SHORT-CIRCUIT the V7.5 VOTING
  // phase entry -- progression is driven by walking through the open
  // advance gate (predicate 'tally_nonzero' for V7.10's U1.1 Zone 4
  // Door 3). Backward compat: levels without Gate actors keep the
  // V7.5 voting cascade unchanged (78 legacy levels + U1.2).
  var gateActors = _actorsOfType(levelDef.actors, 'Gate');
  var gates      = [];
  for (var gi = 0; gi < gateActors.length; gi++) {
    var ga = gateActors[gi];
    gates.push({
      id:        ga.id || ('gate-' + gi),
      x:         ga.x,
      y:         ga.y,
      label:     (typeof ga.label === 'string') ? ga.label : '',
      predicate: (typeof ga.predicate === 'string') ? ga.predicate : 'always_false',
      opened:    false,
      attempts:  0    // server-only analytics; not serialized
    });
  }

  // V7.11 Zone 3: optional TallyChute actors. Pure visualization --
  // each chute renders a vertical stack of blocks reading
  // state.tally.sips[label] on the client; no engine state machine
  // change. Empty array for legacy levels (the 78 + U1.2 + U1.1 pre-
  // V7.11 -- all backward-compat).
  var chuteActors = _actorsOfType(levelDef.actors, 'TallyChute');
  var tallyChutes = [];
  for (var tci = 0; tci < chuteActors.length; tci++) {
    var tca = chuteActors[tci];
    tallyChutes.push({
      id:    tca.id || ('chute-' + tci),
      x:     tca.x,
      y:     tca.y,
      label: (typeof tca.label === 'string') ? tca.label : 'A'
    });
  }

  // V7.14 Zone 5: optional ContextSlot actors. Light green when ANY
  // player walks within OVERLAP_PX of x; one-way (never re-darkens).
  // Per-tick eval in tick() during KEY_HUNT or GOAL_AVAILABLE phase
  // (not during SIPPING/VOTING). Pedagogy: 3 slots labeled with claim
  // components (QUESTION / VARIABLE / CONTEXT for Topic 1.1) that
  // students walk past = read = acknowledge.
  var slotActors = _actorsOfType(levelDef.actors, 'ContextSlot');
  var contextSlots = [];
  for (var ksi = 0; ksi < slotActors.length; ksi++) {
    var ksa = slotActors[ksi];
    contextSlots.push({
      id:    ksa.id || ('slot-' + ksi),
      x:     ksa.x,
      y:     ksa.y,
      label: (typeof ksa.label === 'string') ? ksa.label : '',
      lit:   false
    });
  }

  // V7.14 Zone 5: optional GoalPad actor. Replaces V7.5 legacy Goal
  // for mechanic-first levels. Whole-class presence pad: LEVEL_CLEARED
  // fires when ALL online players are within OVERLAP_PX of x for
  // sustained `triggerMs` ms. Resets to 0 if anyone steps off.
  // Requires all ContextSlots (if any) lit before activating.
  // Backward compat: levels with V7.5 Goal actor (no GoalPad) keep
  // single-player touch semantics unchanged.
  var padActors = _actorsOfType(levelDef.actors, 'GoalPad');
  var padDef    = padActors[0] || null;
  var goalPad   = padDef ? {
    id:         padDef.id || 'goal-pad',
    x:          padDef.x,
    y:          padDef.y,
    presenceMs: 0,
    triggerMs:  (typeof padDef.triggerMs === 'number' && padDef.triggerMs > 0) ? padDef.triggerMs : 1500
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
    // V7.7: optional Tally actor -- threshold-gates SIPPING -> VOTING.
    // null if the level def has no Tally actor (backward compat).
    tallyConfig:     tallyConfig,
    // V7.8: optional ChoicePad actors -- per-player preference recorders.
    // Empty array for levels without ChoicePads (backward compat).
    choicePads:      choicePads,
    // V7.10: optional Gate actors -- physical predicate-gated blockers.
    // Empty array for levels without Gates (78 legacy + U1.2 keep V7.5
    // voting cascade unchanged). Levels WITH Gates short-circuit VOTING
    // entry; progression via walk-through-gate input on the advance gate.
    gates:           gates,
    // V7.11 Zone 3: optional TallyChute actors. Pure visualization; the
    // client reads state.tally.sips[label] per chute to render its stack.
    tallyChutes:     tallyChutes,
    // V7.14 Zone 5: optional ContextSlot actors (per-tick lit eval) +
    // GoalPad actor (whole-class presence timer). Together they replace
    // the V7.5 Key + Goal endgame for mechanic-first levels (U1.1 V7.14+).
    // Legacy levels keep V7.5 Key + Goal -- contextSlots = [] + goalPad
    // = null for them (backward compat).
    contextSlots:    contextSlots,
    goalPad:         goalPad,
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
  if (payload.kind === 'collect')           return _handleCoinCollect(state, username, payload);
  if (payload.kind === 'reach-goal')        return _handleReachGoal(state, username);
  if (payload.kind === 'collect-key')       return _handleCollectKey(state, username);
  if (payload.kind === 'record-choice')     return _handleRecordChoice(state, username, payload);
  if (payload.kind === 'walk-through-gate') return _handleWalkThroughGate(state, username, payload);
  if (payload.kind === 'attempt-gate')      return _handleAttemptGate(state, username, payload);
  return null;
}

// V7.10 predicate whitelist. Hard-coded evaluators -- NEVER raw eval
// a level def string. Unknown predicate name falls through to
// always_false (safe default; gate stays closed forever).
//
// Predicate semantics:
//   always_false                  -- perma-locked (Zone 4 wrong-question doors)
//   every_player_row_complete     -- Zone 2 row scanner; every online player needs marks
//   tally_nonzero                 -- Zone 4 advance door; class has recorded any rows
var _PREDICATE_EVALUATORS = {
  'always_false': function (state) { return false; },
  'every_player_row_complete': function (state) {
    var usernames = Object.keys(state.players || {});
    if (usernames.length === 0) return false;
    for (var u = 0; u < usernames.length; u++) {
      if (!_playerRowComplete(state.players[usernames[u]])) return false;
    }
    return true;
  },
  'tally_nonzero': function (state) {
    var sips = (state.tally && state.tally.sips) || {};
    var keys = Object.keys(sips);
    for (var k = 0; k < keys.length; k++) {
      if (typeof sips[keys[k]] === 'number' && sips[keys[k]] > 0) return true;
    }
    return false;
  }
};

// V7.8: derived per-player predicate. A player's row is complete
// when they've sampled BOTH A and B AND recorded a choice on a
// ChoicePad. Used by _isSippingComplete (ChoicePad cascade) to
// gate SIPPING -> VOTING when the level has ChoicePad actors.
function _playerRowComplete(player) {
  if (!player || !player.marks) return false;
  return !!(player.marks.sampledA && player.marks.sampledB && player.marks.choice);
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
  if (!coin) return null;
  // Anti-cheat: 2 * OVERLAP_PX (covers client-side prediction latency).
  if (!_playerNearActorX(state, username, coin.x, OVERLAP_PX * 2)) return null;

  var hasChoicePads = Array.isArray(state.choicePads) && state.choicePads.length > 0;
  var player        = state.players && state.players[username];

  // V7.13 auto-choice helper. When the collecting player has both A and
  // B sampled, the drink they JUST collected becomes their recorded
  // preference. Re-overlapping the OTHER SipStation later updates the
  // choice (kids can change their mind by walking back). This removes
  // the need for separate ChoicePad actors -- the act of sipping IS
  // the recording. Hermes V7.11 feedback called out ChoicePad as the
  // last voting-feel mechanic in U1.1; V7.13 eliminates it.
  //
  // GATED by hasChoicePads: ChoicePad levels (V7.8 mechanic) keep their
  // explicit-pad-overlap behavior -- the record-choice input is the
  // authoritative trigger for choice. Levels WITHOUT ChoicePads (V7.13
  // U1.1, post-ChoicePad-drop) get the auto-choice. The two mechanics
  // are mutually exclusive per level to avoid choice-set races.
  function _maybeSetChoice(p, drink) {
    if (hasChoicePads) return;                       // V7.8 mechanic owns choice
    if (!p || !p.marks) return;
    if (drink !== 'A' && drink !== 'B') return;     // categorical-only
    if (p.marks.sampledA && p.marks.sampledB) {
      p.marks.choice = drink;
    }
  }

  // V7.8 ChoicePad cascade: in multiplayer ChoicePad levels the coin is
  // shared (one SipStation per category) but every player must taste it
  // for their own row to complete. So a player's per-letter mark is set
  // EVEN IF the coin was already collected by someone else. The coin's
  // collected flag remains one-shot for the tally bump + reveal animation
  // (Alice gets the tally credit; Bob just gets the mark for his row).
  //
  // V7.13 extends: per-player marks update even on already-collected
  // coins REGARDLESS of ChoicePad presence (was V7.8-gated). The
  // auto-choice (above) makes re-overlap a way to update preference
  // post-first-sip-pair.
  if (coin.collected) {
    if (player && player.marks) {
      if (coin.drink === 'A') player.marks.sampledA = true;
      if (coin.drink === 'B') player.marks.sampledB = true;
      _maybeSetChoice(player, coin.drink);
      return state;
    }
    return null;  // legacy: already-collected coin is a hard no-op when no marks
  }

  coin.collected = true;
  // V7.4: collect always reveals identity. Even non-hidden coins set
  // revealed=true here (it was already true from createLevelState), so
  // the flag is consistent everywhere. Hidden coins now flip false ->
  // true on this same transition, which the client uses to drive the
  // pre/post reveal swap + floating "+A"/"+B" text.
  coin.revealed = true;
  if (state.tally.sips[coin.drink] == null) state.tally.sips[coin.drink] = 0;
  state.tally.sips[coin.drink]++;
  // V7.8: set the collecting player's per-letter sample mark on first
  // collect too. Additive to the tally bump so V7.7 Tally cascade levels
  // (U1.2 W/N coins) keep working unchanged. Non-A/B drinks (W, N, R,
  // etc.) skip the mark set -- the Tally-threshold cascade still gates
  // those levels via state.tally.sips.
  if (player && player.marks) {
    if (coin.drink === 'A') player.marks.sampledA = true;
    if (coin.drink === 'B') player.marks.sampledB = true;
    _maybeSetChoice(player, coin.drink);   // V7.13 auto-choice
  }
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

// V7.10 mechanic-first -- client-driven walk-through of an OPEN gate.
// On the advance gate (tally_nonzero predicate in V7.10), transitions
// phase to KEY_HUNT (if level has Key actor) or GOAL_AVAILABLE (no
// Key -- backward compat). On non-advance gates (row scanner), the
// walk-through is a no-op -- the gate just lets the player pass.
function _handleWalkThroughGate(state, username, payload) {
  if (state.phase !== PHASE_SIPPING && state.phase !== PHASE_VOTING) return null;
  if (typeof payload.gateId !== 'string') return null;
  var gate = null;
  for (var i = 0; i < (state.gates || []).length; i++) {
    if (state.gates[i].id === payload.gateId) { gate = state.gates[i]; break; }
  }
  if (!gate || !gate.opened) return null;
  if (!_playerNearActorX(state, username, gate.x, OVERLAP_PX * 2)) return null;
  if (gate.predicate === 'tally_nonzero') {
    // V7.14: levels with a GoalPad skip KEY_HUNT entirely -- the whole-
    // class presence pad replaces the legacy Key + Goal endgame. Legacy
    // levels (Key + Goal, no GoalPad) keep the V7.5 KEY_HUNT path.
    if (state.goalPad) {
      state.phase = PHASE_GOAL_AVAILABLE;
    } else {
      state.phase = state.key ? PHASE_KEY_HUNT : PHASE_GOAL_AVAILABLE;
    }
    return state;
  }
  return null;   // non-advance gate: just walking through, no phase change
}

// V7.10 analytics-only -- client-driven attempt to walk through a
// CLOSED gate. Bumps gate.attempts (server-only field, never
// serialized) so we can later tell which wrong-question doors kids
// reached for most. Open gate / unknown gate / no gate => no-op.
function _handleAttemptGate(state, username, payload) {
  if (typeof payload.gateId !== 'string') return null;
  var gate = null;
  for (var i = 0; i < (state.gates || []).length; i++) {
    if (state.gates[i].id === payload.gateId) { gate = state.gates[i]; break; }
  }
  if (!gate) return null;
  if (gate.opened) return null;
  gate.attempts = (gate.attempts || 0) + 1;
  return state;
}

// V7.8 mechanic-first -- client-driven per-player preference record.
// Fires when the local player walks onto a ChoicePad pad with both
// sampledA AND sampledB true. Server validates: SIPPING phase, pad
// exists, player has both samples + no choice yet, near the pad
// (X anti-cheat). On success, sets player.marks.choice = pad.value.
// One-shot per player: a player who's already chosen cannot re-choose
// by stepping on the other pad.
function _handleRecordChoice(state, username, payload) {
  if (state.phase !== PHASE_SIPPING) return null;
  if (typeof payload.choicePadId !== 'string' || !payload.choicePadId) return null;
  var player = state.players && state.players[username];
  if (!player || !player.marks) return null;
  if (!player.marks.sampledA || !player.marks.sampledB) return null;
  if (player.marks.choice) return null;
  var pad = null;
  for (var i = 0; i < (state.choicePads || []).length; i++) {
    if (state.choicePads[i].id === payload.choicePadId) {
      pad = state.choicePads[i];
      break;
    }
  }
  if (!pad) return null;
  if (!_playerNearActorX(state, username, pad.x, OVERLAP_PX * 2)) return null;
  player.marks.choice = pad.value;
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

// Internal: check the SIPPING -> VOTING precondition.
//
// V7.7: if the level has a Tally actor with `threshold`, the rule
// becomes "every threshold key meets its min count" (e.g. >= 3 W-sips
// AND >= 3 N-sips). Levels can scatter more coins than the threshold
// requires; students need only meet the per-category minima, not
// collect everything. This makes the data-collection beat a deliberate
// per-category sampling exercise rather than a sweep.
//
// Default (no Tally actor): the legacy "all coins collected" rule
// stays in force (backward compat with the 78 non-Tally levels).
function _isSippingComplete(state) {
  // V7.8 ChoicePad cascade (mechanic-first). If the level has any
  // ChoicePad actors, EVERY online player must have a complete row
  // (sampledA + sampledB + choice). Empty-room safety: return false
  // for 0 players so the gate doesn't auto-fire before any student
  // joins. This cascade short-circuits before the V7.7 Tally check.
  if (Array.isArray(state.choicePads) && state.choicePads.length > 0) {
    var usernames = Object.keys(state.players || {});
    if (usernames.length === 0) return false;
    for (var p = 0; p < usernames.length; p++) {
      if (!_playerRowComplete(state.players[usernames[p]])) return false;
    }
    return true;
  }
  if (state.tallyConfig && state.tallyConfig.threshold) {
    var sips   = (state.tally && state.tally.sips) || {};
    var thresh = state.tallyConfig.threshold;
    var keys   = Object.keys(thresh);
    // Empty {} threshold = "Tally actor present but no gate keys".
    // Treat as opt-out (fall through to legacy all-coins-collected rule)
    // rather than instant-pass, otherwise SIPPING would auto-complete
    // on first tick with zero sips collected.
    if (keys.length > 0) {
      for (var k = 0; k < keys.length; k++) {
        var need = thresh[keys[k]];
        var have = (typeof sips[keys[k]] === 'number') ? sips[keys[k]] : 0;
        if (have < need) return false;
      }
      return true;
    }
  }
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

  // V7.10: per-tick gate evaluator. Closed gates re-check their
  // predicate; opened gates stay opened (one-way). Runs BEFORE phase
  // logic so the SIPPING -> ... cascade can see fresh gate state.
  // No-op for levels without Gate actors (state.gates is [] then).
  if (Array.isArray(state.gates) && state.gates.length > 0) {
    for (var gi2 = 0; gi2 < state.gates.length; gi2++) {
      var g2 = state.gates[gi2];
      if (g2.opened) continue;
      var ev = _PREDICATE_EVALUATORS[g2.predicate] || _PREDICATE_EVALUATORS.always_false;
      if (ev(state)) g2.opened = true;
    }
  }

  // V7.14 Zone 5: per-tick ContextSlot lit evaluator. Any player within
  // OVERLAP_PX of a slot's x lights it one-way. Runs ONLY in KEY_HUNT
  // or GOAL_AVAILABLE phase -- students shouldn't accidentally light
  // slots while still doing Zone 1 collection.
  if (Array.isArray(state.contextSlots) && state.contextSlots.length > 0
      && (state.phase === PHASE_KEY_HUNT || state.phase === PHASE_GOAL_AVAILABLE)) {
    for (var ksi2 = 0; ksi2 < state.contextSlots.length; ksi2++) {
      var slot2 = state.contextSlots[ksi2];
      if (slot2.lit) continue;
      var usernamesCS = Object.keys(state.players || {});
      for (var ucs = 0; ucs < usernamesCS.length; ucs++) {
        if (_playerNearActorX(state, usernamesCS[ucs], slot2.x, OVERLAP_PX)) {
          slot2.lit = true;
          break;
        }
      }
    }
  }

  // V7.14 Zone 5: per-tick GoalPad presence accumulator. Only fires in
  // GOAL_AVAILABLE phase + when all ContextSlots (if any) are lit. ALL
  // online players must be within OVERLAP_PX * 2 of goalPad.x for the
  // presence timer to accumulate; ANYONE stepping off resets it. When
  // presenceMs >= triggerMs, phase -> LEVEL_CLEARED.
  if (state.goalPad && state.phase === PHASE_GOAL_AVAILABLE) {
    var allSlotsLit = (state.contextSlots || []).every(function (s) { return s.lit; });
    if (allSlotsLit) {
      var usernamesGP = Object.keys(state.players || {});
      var allPresent  = usernamesGP.length > 0;
      for (var ugp = 0; ugp < usernamesGP.length; ugp++) {
        if (!_playerNearActorX(state, usernamesGP[ugp], state.goalPad.x, OVERLAP_PX * 2)) {
          allPresent = false;
          break;
        }
      }
      if (allPresent) {
        state.goalPad.presenceMs += (deltaMs || 0);
        if (state.goalPad.presenceMs >= state.goalPad.triggerMs) {
          state.phase = PHASE_LEVEL_CLEARED;
        }
      } else {
        state.goalPad.presenceMs = 0;
      }
    } else {
      state.goalPad.presenceMs = 0;   // pad dormant until slots lit
    }
  }

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
    // V7.10: Gate levels SHORT-CIRCUIT the SIPPING -> VOTING entry.
    // The cascade is gate-driven: per-tick predicate eval opens gates;
    // walking through the advance gate (tally_nonzero in V7.10) fires
    // walk-through-gate, which jumps phase to KEY_HUNT directly. We
    // stay in SIPPING until that input arrives. Marks still set on
    // coin collect + record-choice the V7.8 way; only the phase
    // exit changes.
    if (Array.isArray(state.gates) && state.gates.length > 0) {
      return state;
    }
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
    // V7.8: serialize per-player marks so the client TallyDisplay /
    // ChoicePadSprite / cockpit can read sampledA / sampledB / choice.
    // marks=null only for legacy state shapes that pre-date V7.8;
    // _refreshPlayerPositions does not touch marks.
    players[u] = {
      x: p.x,
      y: p.y,
      marks: p.marks ? {
        sampledA: !!p.marks.sampledA,
        sampledB: !!p.marks.sampledB,
        choice:   p.marks.choice || null
      } : null
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
  // V7.7: serialize tallyConfig so the client TallyDisplay can render
  // threshold progress (e.g. "Sips - A: 2/3  B: 1/3"). null for levels
  // without a Tally actor; the client falls back to the legacy no-slash
  // render in that case.
  var tallyConfig = state.tallyConfig ? {
    threshold: state.tallyConfig.threshold
      ? Object.assign({}, state.tallyConfig.threshold)
      : null,
    binds:     state.tallyConfig.binds || 'tally.sips'
  } : null;
  return {
    levelKey:        state.levelKey,
    lessonKey:       state.lessonKey,
    chipSize:        state.chipSize,
    mapWidth:        state.mapWidth,
    mapHeight:       state.mapHeight,
    // V7.9: derived field. mapWidth * chipSize = level pixel width.
    // The client uses this for the camera clamp upper bound + as the
    // canvasW value to broadcast in classroom_pos (so server anti-cheat
    // rescale becomes identity for side-scroll levels). Always emitted.
    levelPxWidth:    (typeof state.mapWidth === 'number' && typeof state.chipSize === 'number')
      ? state.mapWidth * state.chipSize
      : 320,
    phase:           state.phase,
    players:         players,
    coins:           coins,
    doorways:        doorways,
    goal:            goal,
    key:             key,
    reflection:      reflection,
    tally:           { sips: Object.assign({}, state.tally.sips) },
    // V7.7: tallyConfig (or null) -- drives the client's threshold
    // progress render. Always emitted so the client doesn't have to
    // distinguish "no tally" from "tally not yet observed".
    tallyConfig:     tallyConfig,
    // V7.8: serialize ChoicePad actors so the client can spawn
    // ChoicePadSprites + know the per-pad value mapping. Always
    // emitted as an array (empty for legacy levels with no ChoicePad).
    choicePads:      (state.choicePads || []).map(function (p) {
      return { id: p.id, x: p.x, y: p.y, value: p.value };
    }),
    // V7.10: serialize Gate actors so the client can spawn GateSprites,
    // know each gate's predicate (for visual variant + walk-through
    // semantics), and track opened state per tick. Always emitted as
    // an array (empty for legacy levels with no Gate). `attempts` is
    // server-only analytics; NOT serialized.
    gates:           (state.gates || []).map(function (g) {
      return { id: g.id, x: g.x, y: g.y, label: g.label, predicate: g.predicate, opened: !!g.opened };
    }),
    // V7.11: serialize TallyChute actors so the client can spawn
    // TallyChuteSprites. The chutes themselves carry no count -- the
    // existing state.tally.sips[label] is the source of truth.
    tallyChutes:     (state.tallyChutes || []).map(function (c) {
      return { id: c.id, x: c.x, y: c.y, label: c.label };
    }),
    // V7.14 Zone 5: serialize ContextSlots + GoalPad. Slots carry
    // lit state (one-way; flipped per-tick on player overlap).
    // GoalPad carries presence accumulator + trigger threshold so
    // the client can render a fill-progress ring.
    contextSlots:    (state.contextSlots || []).map(function (s) {
      return { id: s.id, x: s.x, y: s.y, label: s.label, lit: !!s.lit };
    }),
    goalPad:         state.goalPad ? {
      id:         state.goalPad.id,
      x:          state.goalPad.x,
      y:          state.goalPad.y,
      presenceMs: state.goalPad.presenceMs || 0,
      triggerMs:  state.goalPad.triggerMs || 1500
    } : null,
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
    y: sy * chipSize,
    // V7.8: fresh marks for the new joiner. The ChoicePad cascade
    // in _isSippingComplete will flip back to false the moment this
    // player lands -- the room waits for them to sip + choose like
    // everyone else. Cooperative pedagogy by design.
    marks: { sampledA: false, sampledB: false, choice: null }
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
  _clearCache:      _clearCache,
  _injectLevelDef:  _injectLevelDef
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
  _injectLevelDef,
  PHASE_INIT,
  PHASE_SIPPING,
  PHASE_VOTING,
  PHASE_REFLECTION,
  PHASE_KEY_HUNT,
  PHASE_GOAL_AVAILABLE,
  PHASE_LEVEL_CLEARED,
  REFLECTION_DURATION_MS
};
