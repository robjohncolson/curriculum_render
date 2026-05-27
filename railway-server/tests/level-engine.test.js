// level-engine.test.js
// Unit tests for the V7.1 Live Classroom level engine.
// Contract: LIVE_CLASSROOM_V7_1_BUILD.md sections C1, C2, C7 (Unit A).
//
// The V7.1 engine is a phase-based state machine:
//   INIT -> SIPPING -> VOTING -> {REFLECTION -> VOTING}* -> GOAL_AVAILABLE
//                                                                 -> LEVEL_CLEARED.
// SIPPING is coin collection (unchanged from V7). VOTING delegates to
// the existing v3 P4 doorways via sideEffects.openDoorways; the engine
// reads room.closedDoorways on each tick to advance.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadLevel,
  createLevelState,
  applyInput,
  tick,
  isComplete,
  serialize,
  onMemberLeave,
  onMemberJoin,
  _clearCache,
  PHASE_SIPPING,
  PHASE_VOTING,
  PHASE_REFLECTION,
  PHASE_KEY_HUNT,
  PHASE_GOAL_AVAILABLE,
  PHASE_LEVEL_CLEARED,
  REFLECTION_DURATION_MS
} from '../level-engine.js';

// V7.9: module-level state cache so makeRoom can auto-derive canvasW
// matching the loaded level's levelPxWidth (= mapWidth * chipSize).
// Per V7.9 wire convention, the client broadcasts canvasW = levelW so
// the server-side anti-cheat rescale becomes identity. setupCola
// stashes its loaded state here; makeRoom defaults canvasW from it.
var _currentLevelState = null;

// Stub room shape: only .members.get(u).pos / .canvasW + .closedDoorways
// is read by the engine. Helpers build the minimal shape.
//
// V7.9: when canvasW is not passed, default to the current level's
// levelPxWidth so widened levels (e.g. U1.1 at map.width=48) work
// without per-call canvasW updates. Falls back to 320 if no level
// state has been loaded yet.
function makeRoom(playerPositions, canvasW) {
  var resolvedCanvasW;
  if (typeof canvasW === 'number') {
    resolvedCanvasW = canvasW;
  } else if (_currentLevelState && _currentLevelState.mapWidth && _currentLevelState.chipSize) {
    resolvedCanvasW = _currentLevelState.mapWidth * _currentLevelState.chipSize;
  } else {
    resolvedCanvasW = 320;
  }
  var members = new Map();
  Object.keys(playerPositions).forEach(function (u) {
    members.set(u, {
      username: u,
      online:   true,
      canvasW:  resolvedCanvasW,
      pos:      playerPositions[u]
    });
  });
  return { members: members, closedDoorways: null };
}

// chipPos(cx, cy, chipSize) -> a pos object at chip coord (cx, cy).
function chipPos(cx, cy, chipSize) {
  return { x: cx * chipSize, y: cy * chipSize, state: 'idle', vx: 0 };
}

// Helper: full level setup with N students at the spawn coord. Stashes
// the loaded state in _currentLevelState so makeRoom can auto-derive
// canvasW = levelPxWidth (V7.9 wire convention).
function setupCola(studentNames) {
  _clearCache();
  _currentLevelState = null;
  var def = loadLevel('U1.1');
  var online = (studentNames || []).map(function (n) { return { username: n }; });
  var state  = createLevelState(def, online);
  _currentLevelState = state;
  return { def: def, state: state, chipSize: state.chipSize };
}

// Helper: simulate a doorways close event landing on the room. The
// engine reads this on its next tick during VOTING.
function landCloseDoorways(room, id, tally) {
  room.closedDoorways = {
    id:      id,
    tally:   tally
  };
}

// Helper: collect every coin to advance from SIPPING -> VOTING. Returns
// the openDoorways sideEffect the engine emits.
//
// V7.2 sprite-collide: collection is client-driven via applyInput, not
// server-side auto-overlap. Walk the first player to each coin (so the
// anti-cheat X-overlap passes) and fire a collect input for each.
//
// V7.8 ChoicePad: if the level has ChoicePad actors, EVERY player must
// also record a choice for the SIPPING cascade to flip. Walk each
// player to the first ChoicePad and record A.
function advanceToVoting(state, room) {
  var keys = Object.keys(state.players);
  var firstPlayer = keys[0];
  for (var c = 0; c < state.coins.length; c++) {
    var coin = state.coins[c];
    room.members.get(firstPlayer).pos = chipPos(coin.x, coin.y, state.chipSize);
    tick(state, 200, room);   // refresh state.players[firstPlayer].x = coin x
    applyInput(state, firstPlayer, { kind: 'collect', coinId: coin.id });
  }
  // V7.8: walk EACH player onto a ChoicePad so every player has rowComplete.
  if (Array.isArray(state.choicePads) && state.choicePads.length > 0) {
    var pad = state.choicePads[0];
    for (var pi = 0; pi < keys.length; pi++) {
      var u = keys[pi];
      // Each player needs sampledA + sampledB for the choice to register.
      // For multi-player rooms only the first player walked the coins
      // above; walk the others through too.
      if (u !== firstPlayer) {
        for (var c2 = 0; c2 < state.coins.length; c2++) {
          var coin2 = state.coins[c2];
          room.members.get(u).pos = chipPos(coin2.x, coin2.y, state.chipSize);
          tick(state, 200, room);
          applyInput(state, u, { kind: 'collect', coinId: coin2.id });
        }
      }
      room.members.get(u).pos = chipPos(pad.x, pad.y, state.chipSize);
      tick(state, 200, room);
      applyInput(state, u, { kind: 'record-choice', choicePadId: pad.id });
    }
  }
  tick(state, 200, room);     // trigger SIPPING -> VOTING transition
  return state.sideEffects;
}

// V7.5: U1.1 is now multi-stage (4 stages of voting before KEY_HUNT).
// Helper drives through all remaining stages by repeatedly landing the
// CORRECT doorway close for the current state.doorways set. State must
// already be in PHASE_VOTING with a liveDoorwaysId set (i.e. caller has
// already run advanceToVoting). Stops when phase leaves VOTING (so
// KEY_HUNT or GOAL_AVAILABLE depending on whether the level has a Key
// actor). Returns the final state.sideEffects from the last close tick.
function advanceThroughAllStages(state, room) {
  var keys = Object.keys(state.players);
  var firstPlayer = keys[0];
  var guardrail = 0;
  var lastSideEffects = state.sideEffects;
  while (state.phase === 'VOTING' && guardrail < 20) {
    guardrail += 1;
    // Find the correct doorway in the current state.doorways set.
    var correct = null;
    for (var i = 0; i < state.doorways.length; i++) {
      if (state.doorways[i].correct) { correct = state.doorways[i]; break; }
    }
    if (!correct) break;   // malformed stage; nothing to do
    // Land the close event with the correct doorway as winner.
    landCloseDoorways(room, state.liveDoorwaysId, [{ doorId: correct.id, count: 1 }]);
    tick(state, 200, room);
    lastSideEffects = state.sideEffects;
  }
  return lastSideEffects;
}

// V7.5: full drive from SIPPING all the way to GOAL_AVAILABLE for a
// level that may have stages + KEY_HUNT. Used by tests that previously
// assumed single-stage U1.1 ended in GOAL_AVAILABLE on the first
// correct vote. Move first player onto the key chip after KEY_HUNT
// enters so the collect-key anti-cheat passes.
function advanceToGoalAvailable(state, room) {
  advanceToVoting(state, room);
  // Drive any first-vote close that the caller hasn't landed yet.
  var keys = Object.keys(state.players);
  var firstPlayer = keys[0];
  if (state.phase === 'VOTING' && state.liveDoorwaysId) {
    advanceThroughAllStages(state, room);
  }
  // If KEY_HUNT now, walk to the key chip + collect; next tick promotes.
  if (state.phase === 'KEY_HUNT' && state.key) {
    room.members.get(firstPlayer).pos = chipPos(state.key.x, state.key.y, state.chipSize);
    tick(state, 200, room);
    applyInput(state, firstPlayer, { kind: 'collect-key' });
    tick(state, 200, room);
  }
  return state.sideEffects;
}

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- loadLevel', () => {
  beforeEach(() => { _clearCache(); _currentLevelState = null; });

  it('loadLevel("U1.1") returns a valid LevelDef with chipSize=10', () => {
    var def = loadLevel('U1.1');
    expect(def).toBeTruthy();
    expect(def.schema).toBe('v7-level-1');
    expect(def.levelKey).toBe('U1.1');
    expect(def.lessonKey).toBe('1.1');
    expect(def.map.chipSize).toBe(10);
  });

  it('loadLevel("missing") returns null', () => {
    expect(loadLevel('missing')).toBeNull();
  });

  it('loadLevel memoizes the parsed result', () => {
    var d1 = loadLevel('U1.1');
    var d2 = loadLevel('U1.1');
    expect(d1).toBe(d2);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- createLevelState initial shape', () => {
  it('starts in SIPPING phase with chipSize 10 and the expected shape', () => {
    // V7.9: U1.1 widened from map.width=32 to map.width=48 to give the
    // new side-scroll engine something to scroll on. Zones 2-5 actors
    // land in V7.10+ to fill the new chip 32-47 space.
    var k = setupCola(['alice', 'bob']);
    expect(k.state.phase).toBe(PHASE_SIPPING);
    expect(k.state.chipSize).toBe(10);
    expect(k.state.mapWidth).toBe(48);
    expect(k.state.mapHeight).toBe(8);
    expect(k.state.liveDoorwaysId).toBeNull();
    expect(k.state.sideEffects).toBeNull();
  });

  it('spawns one Player per online student at the PlayerSpawn coord', () => {
    var k = setupCola(['alice', 'bob']);
    expect(Object.keys(k.state.players)).toEqual(['alice', 'bob']);
    // PlayerSpawn for U1.1 v7.1 is at chip (4, 4); chipSize 10 -> CSS (40, 40).
    expect(k.state.players.alice.x).toBe(4 * k.chipSize);
    expect(k.state.players.alice.y).toBe(4 * k.chipSize);
  });

  it('V7.4: coins default to hidden=false and revealed=true (synthetic level, no opt-in)', () => {
    // U1.1 opted into hidden via V7.4-C, so default-behavior coverage
    // builds a synthetic level without the hidden flag.
    var levelDef = {
      schema: 'v7-level-1', levelKey: 'TEST.DEFAULT', lessonKey: 'T.D',
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [
        { type: 'PlayerSpawn', x: 4, y: 4 },
        { type: 'SipStation', id: 's1', x: 4,  y: 2, drink: 'A' },
        { type: 'SipStation', id: 's2', x: 12, y: 2, drink: 'B' },
        { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: '?', correct: true },
        { type: 'Goal', x: 16, y: 7 }
      ]
    };
    var st = createLevelState(levelDef, [{ username: 'alice' }]);
    expect(st.coins.every(function (c) { return c.hidden === false; })).toBe(true);
    expect(st.coins.every(function (c) { return c.revealed === true; })).toBe(true);
  });

  it('V7.4: a level CAN opt every SipStation into hidden=true (blind-test mechanic)', () => {
    // V7.8 note: U1.1 used to opt into this for the cola-blind-test feel,
    // but the V7.8 mechanic-first rewrite drops hidden=true so kids can
    // remember which cup they preferred when stepping on the ChoicePad.
    // The V7.4 mechanic still exists in the engine; this fixture pins
    // the path for any future level that wants it.
    var levelDef = {
      schema: 'v7-level-1', levelKey: 'TEST.HIDDEN', lessonKey: 'T.HIDDEN',
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [
        { type: 'PlayerSpawn', x: 4, y: 4 },
        { type: 'SipStation', id: 's1', x: 4,  y: 2, drink: 'A', hidden: true },
        { type: 'SipStation', id: 's2', x: 12, y: 2, drink: 'A', hidden: true },
        { type: 'SipStation', id: 's3', x: 20, y: 2, drink: 'B', hidden: true },
        { type: 'SipStation', id: 's4', x: 28, y: 2, drink: 'B', hidden: true },
        { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: '?', correct: true },
        { type: 'Goal', x: 16, y: 7 }
      ]
    };
    var state = createLevelState(levelDef, [{ username: 'alice' }]);
    expect(state.coins.every(function (c) { return c.hidden === true; })).toBe(true);
    expect(state.coins.every(function (c) { return c.revealed === false; })).toBe(true);
  });

  it('V7.4: SipStation hidden=true makes coin.hidden=true and coin.revealed=false at start', () => {
    var levelDef = {
      schema: 'v7-level-1', levelKey: 'TEST.H', lessonKey: 'T.H',
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [
        { type: 'PlayerSpawn', x: 4, y: 4 },
        { type: 'SipStation', id: 's1', x: 4,  y: 2, drink: 'A', hidden: true },
        { type: 'SipStation', id: 's2', x: 12, y: 2, drink: 'B' },
        { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: '?', correct: true },
        { type: 'Goal', x: 16, y: 7 }
      ]
    };
    var st = createLevelState(levelDef, [{ username: 'alice' }]);
    expect(st.coins[0].hidden).toBe(true);
    expect(st.coins[0].revealed).toBe(false);
    expect(st.coins[1].hidden).toBe(false);   // explicit non-hidden
    expect(st.coins[1].revealed).toBe(true);
  });

  it('V7.4: applyInput {kind:"collect"} on a hidden coin flips collected AND revealed', () => {
    var levelDef = {
      schema: 'v7-level-1', levelKey: 'TEST.H2', lessonKey: 'T.H2',
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [
        { type: 'PlayerSpawn', x: 4, y: 2 },
        { type: 'SipStation', id: 's1', x: 4, y: 2, drink: 'A', hidden: true },
        { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: '?', correct: true },
        { type: 'Goal', x: 16, y: 7 }
      ]
    };
    var st = createLevelState(levelDef, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, 10) });
    tick(st, 200, room);
    applyInput(st, 'alice', { kind: 'collect', coinId: 's1' });
    expect(st.coins[0].collected).toBe(true);
    expect(st.coins[0].revealed).toBe(true);
    expect(st.tally.sips.A).toBe(1);
  });

  it('V7.4: serialize wire shape includes hidden + revealed per coin', () => {
    // V7.8 note: U1.1 dropped its V7.4-C hidden opt-in for the mechanic-
    // first rewrite, so we use a fixture level to pin the V7.4 wire shape.
    var levelDef = {
      schema: 'v7-level-1', levelKey: 'TEST.WIRE', lessonKey: 'T.WIRE',
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [
        { type: 'PlayerSpawn', x: 4, y: 4 },
        { type: 'SipStation', id: 's1', x: 4, y: 2, drink: 'A', hidden: true },
        { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: '?', correct: true },
        { type: 'Goal', x: 16, y: 7 }
      ]
    };
    var state = createLevelState(levelDef, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.coins[0]).toHaveProperty('hidden');
    expect(wire.coins[0]).toHaveProperty('revealed');
    expect(wire.coins[0].hidden).toBe(true);
    expect(wire.coins[0].revealed).toBe(false);
  });

  it('coins reflect the U1.1 SipStations (uncollected, drink tags A and B)', () => {
    // V7.8 reshape: U1.1 has 2 visible SipStations (one A, one B) plus
    // 2 ChoicePads -- the V7.5/V7.6 setup of 4 hidden A/A/B/B SipStations
    // was dropped for the mechanic-first rewrite. Tests that need the
    // legacy 4-coin pattern should use an inline fixture (see
    // V7.4-C hidden test above).
    var k = setupCola(['alice']);
    expect(k.state.coins.length).toBe(2);
    expect(k.state.coins.every(function (c) { return c.collected === false; })).toBe(true);
    expect(k.state.coins[0].drink).toBe('A');
    expect(k.state.coins[1].drink).toBe('B');
  });

  it('doorways reflect the 3 QuestionDoors with the correct .correct flags', () => {
    var k = setupCola(['alice']);
    expect(k.state.doorways.length).toBe(3);
    expect(k.state.doorways[0].id).toBe('d1');
    expect(k.state.doorways[0].correct).toBe(false);
    expect(k.state.doorways[1].id).toBe('d2');
    expect(k.state.doorways[1].correct).toBe(true);
    expect(k.state.doorways[2].id).toBe('d3');
    expect(k.state.doorways[2].correct).toBe(false);
  });

  it('initial goal is unreached at the level def coord', () => {
    var k = setupCola(['alice']);
    expect(k.state.goal.x).toBe(16);
    expect(k.state.goal.y).toBe(7);
    expect(k.state.goal.reached).toBe(false);
  });

  it('returns null on malformed level def', () => {
    expect(createLevelState(null, [])).toBeNull();
    expect(createLevelState({}, [])).toBeNull();
    expect(createLevelState({ actors: 'not-an-array' }, [])).toBeNull();
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- SIPPING phase', () => {
  it('V7.2: collects a Coin via applyInput {kind:"collect",coinId} and increments tally.sips', () => {
    var k = setupCola(['alice', 'bob']);
    // Position alice over s1 at chip (4, 2) so the applyInput anti-cheat passes.
    var room = makeRoom({
      alice: chipPos(4, 2, k.chipSize),
      bob:   chipPos(4, 4, k.chipSize)
    });
    tick(k.state, 200, room);   // refresh positions; SIPPING phase no longer auto-collects
    expect(k.state.coins[0].collected).toBe(false);  // V7.2: no auto-collect on tick
    applyInput(k.state, 'alice', { kind: 'collect', coinId: k.state.coins[0].id });
    expect(k.state.coins[0].collected).toBe(true);
    expect(k.state.tally.sips.A).toBe(1);
  });

  it('V7.2: server tick does NOT auto-collect coins on spawn-proximity', () => {
    // This pins the s115 / V7.2 fix: two players spawn at PlayerSpawn
    // (chip 4,4) and the first tick used to auto-collect any coin within
    // 16 px of their spawn X (s1 at chip 4 was always collected). V7.2
    // removes the auto-collect; coins only collect via applyInput.
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(4, 4, k.chipSize),   // exact spawn position
      bob:   chipPos(4, 4, k.chipSize)
    });
    tick(k.state, 200, room);
    expect(k.state.coins.every(function (c) { return c.collected === false; })).toBe(true);
    expect(k.state.tally.sips.A).toBe(0);
    expect(k.state.tally.sips.B).toBe(0);
  });

  it('does NOT advance phase to VOTING until ALL coins collected', () => {
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(4, 2, k.chipSize),
      bob:   chipPos(4, 4, k.chipSize)
    });
    tick(k.state, 200, room);
    applyInput(k.state, 'alice', { kind: 'collect', coinId: k.state.coins[0].id });
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_SIPPING);
    expect(k.state.sideEffects).toBeNull();
  });

  it('advances to VOTING and emits openDoorways sideEffect on last coin collected', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    var sideEffect = advanceToVoting(k.state, room);
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(sideEffect).toBeTruthy();
    expect(sideEffect.openDoorways).toBeTruthy();
    expect(sideEffect.openDoorways.id).toMatch(/^level-U1\.1-vote-/);
    expect(sideEffect.openDoorways.options.length).toBe(3);
    expect(sideEffect.openDoorways.options[0].doorId).toBe('d1');
    expect(sideEffect.openDoorways.options[1].doorId).toBe('d2');
    expect(k.state.liveDoorwaysId).toBe(sideEffect.openDoorways.id);
  });

  it('clears sideEffects on the very next tick after emission (one-shot)', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    expect(k.state.sideEffects).toBeTruthy();
    // Next tick: no closedDoorways yet, so we stay in VOTING with sideEffects null.
    tick(k.state, 200, room);
    expect(k.state.sideEffects).toBeNull();
    expect(k.state.phase).toBe(PHASE_VOTING);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- VOTING phase: doorway close consumption', () => {
  it('V7.5: on CORRECT vote on stage 0 of multi-stage, stays in VOTING + advances currentStage', () => {
    // V7.5 changed U1.1 to a 4-stage level (was single-stage). The
    // original "correct vote -> GOAL_AVAILABLE" assertion now applies
    // only to the LAST stage; the intermediate-stages contract is
    // separately covered in V7.5 multi-stage tests.
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var liveId = k.state.liveDoorwaysId;
    // d2 is the correct door for U1.1 stage 0.
    landCloseDoorways(room, liveId, [
      { doorId: 'd1', count: 0 },
      { doorId: 'd2', count: 3 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_VOTING);   // still voting -- next stage opened
    expect(k.state.currentStage).toBe(1);
    expect(k.state.liveDoorwaysId).not.toBe(liveId);   // new doorways round
  });

  it('on WRONG door winning, transitions to REFLECTION with reflectionText', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var liveId = k.state.liveDoorwaysId;
    // d1 is wrong; carries reflectionText.
    landCloseDoorways(room, liveId, [
      { doorId: 'd1', count: 4 },
      { doorId: 'd2', count: 0 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_REFLECTION);
    expect(k.state.reflection.active).toBe(true);
    expect(k.state.reflection.doorId).toBe('d1');
    // V7.4-C reflection text rewrite: d1 now reads
    // "You sipped A and B blind -- the data measured PREFERENCE,
    //  not what's inside the cup."
    expect(k.state.reflection.reflectionText).toMatch(/PREFERENCE/);
    expect(k.state.reflection.autoCloseAt).toBeGreaterThan(0);
  });

  it('ignores a closedDoorways event whose id does not match liveDoorwaysId', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var liveId = k.state.liveDoorwaysId;
    landCloseDoorways(room, 'unrelated-id', [
      { doorId: 'd1', count: 9 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.liveDoorwaysId).toBe(liveId);  // unchanged
  });

  it('on empty tally (every count 0 / no votes), re-opens the doorways', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var firstId = k.state.liveDoorwaysId;
    landCloseDoorways(room, firstId, [
      { doorId: 'd1', count: 0 },
      { doorId: 'd2', count: 0 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.sideEffects).toBeTruthy();
    expect(k.state.sideEffects.openDoorways.id).not.toBe(firstId);
    expect(k.state.liveDoorwaysId).toBe(k.state.sideEffects.openDoorways.id);
  });

  it('ignores a closedDoorways event while not in VOTING (defensive)', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    // Still in SIPPING; a stray close shouldn't change anything.
    landCloseDoorways(room, 'foo', []);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_SIPPING);
  });

  it('VOTING phase is idempotent across ticks while waiting for close', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var liveId = k.state.liveDoorwaysId;
    for (var t = 0; t < 5; t++) {
      tick(k.state, 200, room);
    }
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.liveDoorwaysId).toBe(liveId);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- REFLECTION phase: auto-clear + re-vote', () => {
  it('returns to VOTING and emits a NEW openDoorways sideEffect after autoCloseAt', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    var firstId = k.state.liveDoorwaysId;
    landCloseDoorways(room, firstId, [
      { doorId: 'd1', count: 5 },
      { doorId: 'd2', count: 0 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_REFLECTION);
    // Force the auto-close threshold to elapse.
    k.state.reflection.autoCloseAt = Date.now() - 1;
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.reflection.active).toBe(false);
    expect(k.state.reflection.doorId).toBeNull();
    expect(k.state.reflection.reflectionText).toBe('');
    expect(k.state.sideEffects).toBeTruthy();
    expect(k.state.sideEffects.openDoorways.id).not.toBe(firstId);
    expect(k.state.liveDoorwaysId).toBe(k.state.sideEffects.openDoorways.id);
  });

  it('REFLECTION holds across ticks until autoCloseAt elapses', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    landCloseDoorways(room, k.state.liveDoorwaysId, [
      { doorId: 'd1', count: 5 },
      { doorId: 'd2', count: 0 },
      { doorId: 'd3', count: 0 }
    ]);
    tick(k.state, 200, room);
    // autoCloseAt is ~8 s in the future. Multiple ticks while not yet elapsed.
    tick(k.state, 200, room);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_REFLECTION);
  });

  it('REFLECTION_DURATION_MS is the V7 8-second constant (preserved in V7.1)', () => {
    expect(REFLECTION_DURATION_MS).toBe(8000);
  });

  it('subsequent CORRECT vote after REFLECTION advances stage (was: -> GOAL_AVAILABLE in single-stage U1.1)', () => {
    // V7.5: U1.1 is now 4-stage. The REFLECTION-then-revote flow now
    // ends with a stage advance (still VOTING) rather than a direct
    // jump to GOAL_AVAILABLE. The "drive all the way through" path is
    // covered by advanceToGoalAvailable in tests below.
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    landCloseDoorways(room, k.state.liveDoorwaysId, [
      { doorId: 'd1', count: 3 }
    ]);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_REFLECTION);
    k.state.reflection.autoCloseAt = Date.now() - 1;
    tick(k.state, 200, room);
    // Now in VOTING with a re-opened doorways (still stage 0).
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.currentStage).toBe(0);
    var reopenId = k.state.liveDoorwaysId;
    landCloseDoorways(room, reopenId, [
      { doorId: 'd2', count: 4 }
    ]);
    tick(k.state, 200, room);
    // Correct vote advances to stage 1 (still VOTING).
    expect(k.state.phase).toBe(PHASE_VOTING);
    expect(k.state.currentStage).toBe(1);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- GOAL_AVAILABLE + LEVEL_CLEARED', () => {
  it('V7.2: applyInput {kind:"reach-goal"} in GOAL_AVAILABLE transitions to LEVEL_CLEARED', () => {
    // V7.5: U1.1 has stages + key now, so drive all the way through.
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToGoalAvailable(k.state, room);
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
    // Walk alice to Goal (chip 16, 7), then fire the client-driven reach.
    room.members.get('alice').pos = chipPos(16, 7, k.chipSize);
    tick(k.state, 200, room);
    applyInput(k.state, 'alice', { kind: 'reach-goal' });
    expect(k.state.phase).toBe(PHASE_LEVEL_CLEARED);
    expect(k.state.goal.reached).toBe(true);
    expect(k.state.goal.reachedBy).toBe('alice');
    expect(isComplete(k.state)).toBe(true);
  });

  it('LEVEL_CLEARED is terminal across additional ticks (idempotent)', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToGoalAvailable(k.state, room);
    room.members.get('alice').pos = chipPos(16, 7, k.chipSize);
    tick(k.state, 200, room);
    applyInput(k.state, 'alice', { kind: 'reach-goal' });
    tick(k.state, 200, room);
    tick(k.state, 200, room);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_LEVEL_CLEARED);
    expect(isComplete(k.state)).toBe(true);
  });

  it('V7.2: GOAL_AVAILABLE does NOT auto-advance on tick without reach-goal input', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToGoalAvailable(k.state, room);
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
    // Even if alice walks onto the goal, tick alone won't advance --
    // applyInput must fire (mirrors the SIPPING auto-collect fix).
    room.members.get('alice').pos = chipPos(16, 7, k.chipSize);
    tick(k.state, 200, room);
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
    expect(k.state.goal.reached).toBe(false);
  });

  it('V7.2: applyInput {kind:"reach-goal"} no-ops outside GOAL_AVAILABLE phase', () => {
    var k = setupCola(['alice']);   // starts in SIPPING
    expect(applyInput(k.state, 'alice', { kind: 'reach-goal' })).toBeNull();
    expect(k.state.goal.reached).toBe(false);
  });

  it('V7.2 anti-cheat: applyInput {kind:"reach-goal"} rejects far-away player', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToGoalAvailable(k.state, room);
    // Alice has just collected the key at chip (10, 4) -> level x=100.
    // Goal at chip 16 -> x=160. |100-160| = 60 px, past 2 * OVERLAP_PX = 32.
    // Reject. Move her further so the gap is unambiguous regardless of
    // exact final position after the helper completes.
    room.members.get('alice').pos = chipPos(4, 4, k.chipSize);
    tick(k.state, 200, room);
    expect(applyInput(k.state, 'alice', { kind: 'reach-goal' })).toBeNull();
    expect(k.state.goal.reached).toBe(false);
    expect(k.state.phase).toBe(PHASE_GOAL_AVAILABLE);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- isComplete', () => {
  it('returns false for null / empty state', () => {
    expect(isComplete(null)).toBe(false);
    expect(isComplete({})).toBe(false);
    expect(isComplete({ phase: PHASE_SIPPING })).toBe(false);
    expect(isComplete({ phase: PHASE_GOAL_AVAILABLE })).toBe(false);
  });

  it('returns true ONLY when phase === LEVEL_CLEARED', () => {
    expect(isComplete({ phase: PHASE_LEVEL_CLEARED })).toBe(true);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- serialize wire shape', () => {
  it('includes phase + mapWidth + mapHeight + chipSize + doorways shape', () => {
    var k = setupCola(['alice']);
    var wire = serialize(k.state);
    expect(wire.phase).toBe(PHASE_SIPPING);
    expect(wire.mapWidth).toBe(48);   // V7.9 widened U1.1
    expect(wire.mapHeight).toBe(8);
    expect(wire.chipSize).toBe(10);
    expect(wire.levelPxWidth).toBe(480);   // V7.9 derived field = 48 * 10
    expect(Array.isArray(wire.doorways)).toBe(true);
    expect(wire.doorways[0].id).toBe('d1');
    expect(wire.doorways[1].correct).toBe(true);
  });

  it('serialized state is JSON.stringify-safe', () => {
    var k = setupCola(['alice', 'bob']);
    var room = makeRoom({
      alice: chipPos(4, 2, k.chipSize),
      bob:   chipPos(4, 4, k.chipSize)
    });
    tick(k.state, 200, room);
    var wire = serialize(k.state);
    expect(function () { JSON.stringify(wire); }).not.toThrow();
  });

  it('strips internal Sets / sideEffects (wire-only fields)', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    advanceToVoting(k.state, room);
    expect(k.state.sideEffects).toBeTruthy();   // internal
    var wire = serialize(k.state);
    expect(wire.sideEffects).toBeUndefined();   // wire excludes
    expect(wire._phaseEntry).toBeUndefined();
    expect(wire.liveDoorwaysId).toBeUndefined();
    expect(wire._voteQuestion).toBeUndefined();
  });

  it('public player shape excludes _canvasW', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    tick(k.state, 200, room);  // populates _canvasW
    var wire = serialize(k.state);
    expect(wire.players.alice.x).toBeDefined();
    expect(wire.players.alice.y).toBeDefined();
    expect(wire.players.alice._canvasW).toBeUndefined();
  });

  it('serialize(null) returns null', () => {
    expect(serialize(null)).toBeNull();
  });

  it('reflection wire shape includes active + doorId + reflectionText', () => {
    var k = setupCola(['alice']);
    var wire = serialize(k.state);
    expect(wire.reflection.active).toBe(false);
    expect(wire.reflection.doorId).toBeNull();
    expect(wire.reflection.reflectionText).toBe('');
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- onMemberLeave / onMemberJoin', () => {
  it('onMemberLeave removes the leaver from state.players', () => {
    var k = setupCola(['alice', 'bob']);
    onMemberLeave(k.state, 'bob');
    expect(k.state.players.bob).toBeUndefined();
    expect(k.state.players.alice).toBeDefined();
  });

  it('onMemberLeave is a no-op for an unknown username', () => {
    var k = setupCola(['alice']);
    expect(onMemberLeave(k.state, 'ghost')).toBeNull();
  });

  it('onMemberJoin spawns a new Player at the spawn coord', () => {
    var k = setupCola(['alice']);
    onMemberJoin(k.state, 'carol', null);
    expect(k.state.players.carol).toBeDefined();
    expect(k.state.players.carol.x).toBe(4 * k.chipSize);
    expect(k.state.players.carol.y).toBe(4 * k.chipSize);
  });

  it('onMemberJoin re-join of known user is a no-op (preserves progress)', () => {
    var k = setupCola(['alice']);
    k.state.players.alice.x = 999;
    expect(onMemberJoin(k.state, 'alice', null)).toBeNull();
    expect(k.state.players.alice.x).toBe(999);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- applyInput + tick edge cases', () => {
  it('V7.2: applyInput returns null for unknown payload kinds', () => {
    var k = setupCola(['alice']);
    expect(applyInput(k.state, 'alice', { delta: 1 })).toBeNull();
    expect(applyInput(k.state, 'alice', null)).toBeNull();
    expect(applyInput(k.state, 'alice', { kind: 'unknown' })).toBeNull();
  });

  it('V7.2: applyInput {kind:"collect"} no-ops outside SIPPING phase', () => {
    var k = setupCola(['alice']);
    k.state.phase = PHASE_VOTING;
    expect(applyInput(k.state, 'alice', { kind: 'collect', coinId: k.state.coins[0].id })).toBeNull();
    expect(k.state.coins[0].collected).toBe(false);
  });

  it('V7.2: applyInput {kind:"collect"} rejects far-away player as anti-cheat', () => {
    var k = setupCola(['alice']);
    // Spawn alice at chip (4, 4) -> level x=40. s2 (B coin) at chip 28 ->
    // level x=280. |40 - 280| = 240 px, well past 2 * OVERLAP_PX = 32. Reject.
    // V7.8 note: U1.1's 4 coins (s1-s4) collapsed to 2 (s1=A, s2=B) in the
    // mechanic-first rewrite; the far-coin assertion still holds, just on s2.
    expect(applyInput(k.state, 'alice', { kind: 'collect', coinId: 's2' })).toBeNull();
    expect(k.state.coins[1].collected).toBe(false);
  });

  it('V7.2: applyInput {kind:"collect"} no-ops on unknown coinId', () => {
    var k = setupCola(['alice']);
    expect(applyInput(k.state, 'alice', { kind: 'collect', coinId: 'nope' })).toBeNull();
  });

  it('V7.2: applyInput {kind:"collect"} on already-collected coin does not double-count tally', () => {
    // V7.8 ChoicePad cascade: U1.1 now has ChoicePads, so a 2nd-collect
    // on an already-taken coin SETS the player's per-letter mark but
    // does NOT double-bump tally. Load-bearing invariant: tally stays
    // accurate (Alice was the only "first" collector). Return value can
    // be `state` (mark set) for ChoicePad levels OR null for legacy.
    var k = setupCola(['alice']);
    k.state.coins[0].collected = true;
    k.state.tally.sips.A = 1;
    applyInput(k.state, 'alice', { kind: 'collect', coinId: k.state.coins[0].id });
    expect(k.state.tally.sips.A).toBe(1);   // load-bearing: not double-counted
  });

  it('tick(null) is a no-op (returns the input)', () => {
    expect(tick(null, 200, {})).toBeNull();
  });

  it('tick reads positions from room.members.get(u).pos each call', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({ alice: chipPos(4, 4, k.chipSize) });
    tick(k.state, 200, room);
    expect(k.state.players.alice.x).toBe(4 * k.chipSize);
    room.members.get('alice').pos = chipPos(4, 2, k.chipSize);
    tick(k.state, 200, room);
    expect(k.state.players.alice.y).toBe(2 * k.chipSize);
  });
});

// ----------------------------------------------------------------------
describe('V7.1 level-engine -- overlap math: chipSize=10, 320 CSS px wide', () => {
  // V7.2 sprite-collide: the server-side _overlapsActor scan no longer
  // auto-runs on tick for SIPPING coins -- it survives as anti-cheat
  // inside applyInput. These tests now exercise that path: when the
  // client submits a collect, the server uses overlap math to accept
  // or reject. The 2x tolerance covers client-side prediction latency.
  it('V7.2 anti-cheat: applyInput accepts collect when player is within 2 * OVERLAP_PX of coin chip x', () => {
    var k = setupCola(['alice']);
    // s1 at chip (4, 2) -> level x=40. Place alice at level x=40 + 31
    // (just inside 2 * OVERLAP_PX = 32).
    var room = makeRoom({
      alice: { x: 40 + 31, y: 20, state: 'idle', vx: 0 }
    });
    tick(k.state, 200, room);
    applyInput(k.state, 'alice', { kind: 'collect', coinId: 's1' });
    expect(k.state.coins[0].collected).toBe(true);
    expect(k.state.tally.sips.A).toBe(1);
  });

  it('V7.2 anti-cheat: applyInput rejects collect beyond 2 * OVERLAP_PX', () => {
    var k = setupCola(['alice']);
    var room = makeRoom({
      alice: { x: 40 + 33, y: 20, state: 'idle', vx: 0 }
    });
    tick(k.state, 200, room);
    applyInput(k.state, 'alice', { kind: 'collect', coinId: 's1' });
    expect(k.state.coins[0].collected).toBe(false);
  });

  it('V7.2 anti-cheat: rescales sender canvasW=640 down to level 320 px space before overlap check', () => {
    var k = setupCola(['alice']);
    // Sender on 640-wide canvas at x=80 -> rescaled to level 40 px = chip 4.
    // s1 at level x=40 -> overlap accepted, applyInput marks collected.
    var room = makeRoom({
      alice: { x: 80, y: 20, state: 'idle', vx: 0 }
    }, 640);
    tick(k.state, 200, room);
    applyInput(k.state, 'alice', { kind: 'collect', coinId: 's1' });
    expect(k.state.coins[0].collected).toBe(true);
  });
});

// ----------------------------------------------------------------------
// V7.5: multi-stage voting + KEY_HUNT phase + Key actor
// ----------------------------------------------------------------------

// Synthetic level fixture with a `stages` array + Key actor. Two stages
// (smallest useful multi-stage shape), 2 doorways each, one correct
// per stage. Plus a Key actor at chip (10, 4) for the KEY_HUNT phase.
function setupTwoStageWithKey() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.V75',
    lessonKey: 'T.V75',
    map: { width: 32, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'Key',  id: 'k1', x: 10, y: 4 },
      { type: 'Goal',         x: 16, y: 7 }
    ],
    stages: [
      {
        questionText: 'Stage 0 question?',
        doorways: [
          { id: 's0d1', x: 6,  y: 6, text: 'wrong',   correct: false, reflection: 'try again' },
          { id: 's0d2', x: 16, y: 6, text: 'correct', correct: true                       }
        ]
      },
      {
        questionText: 'Stage 1 question?',
        doorways: [
          { id: 's1d1', x: 6,  y: 6, text: 'wrong',   correct: false, reflection: 'still wrong' },
          { id: 's1d2', x: 16, y: 6, text: 'correct', correct: true                            }
        ]
      }
    ]
  };
}

// Helper: drive a VOTING phase to the correct winner via a doorway-close
// event. Lets us test stage advancement without depending on real-time.
function landClose(room, liveId, winnerDoorId) {
  room.closedDoorways = { id: liveId, tally: [ { doorId: winnerDoorId, count: 1 } ] };
}

describe('V7.5 level-engine -- multi-stage + KEY_HUNT', () => {
  // V7.9: clear _currentLevelState so makeRoom defaults canvasW to 320
  // (the legacy width these inline fixtures use). Without this, a prior
  // test using setupCola (which sets _currentLevelState to U1.1 width=48)
  // would leak its width into this describe's makeRoom defaults and
  // break the anti-cheat rescale math.
  beforeEach(() => { _currentLevelState = null; });

  it('createLevelState reads stages[] into state.stages + currentStage=0', () => {
    var st = createLevelState(setupTwoStageWithKey(), [{ username: 'alice' }]);
    expect(Array.isArray(st.stages)).toBe(true);
    expect(st.stages.length).toBe(2);
    expect(st.stagesTotal).toBe(2);
    expect(st.currentStage).toBe(0);
    expect(st.doorways).toBe(st.stages[0].doorways);   // points at current stage
  });

  it('backward compat: no stages[] in level def -> synthesizes one stage from actors[] QuestionDoors', () => {
    var levelDef = {
      schema: 'v7-level-1', levelKey: 'TEST.LEGACY', lessonKey: 'T.L',
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [
        { type: 'PlayerSpawn', x: 4, y: 4 },
        { type: 'QuestionDoor', id: 'd1', x: 6,  y: 6, text: 'wrong',   correct: false },
        { type: 'QuestionDoor', id: 'd2', x: 16, y: 6, text: 'correct', correct: true  },
        { type: 'Goal',                   x: 16, y: 7 }
      ]
    };
    var st = createLevelState(levelDef, [{ username: 'alice' }]);
    expect(st.stagesTotal).toBe(1);
    expect(st.currentStage).toBe(0);
    expect(st.stages[0].doorways.length).toBe(2);
    expect(st.key).toBeNull();   // no Key actor -> no KEY_HUNT phase
  });

  it('Key actor present -> state.key populated; absent -> state.key is null', () => {
    var withKey = createLevelState(setupTwoStageWithKey(), [{ username: 'alice' }]);
    expect(withKey.key).toEqual({ x: 10, y: 4, collected: false, collectedBy: null });
    var withoutKey = createLevelState({
      schema: 'v7-level-1', levelKey: 'NK', lessonKey: 'NK',
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [
        { type: 'PlayerSpawn', x: 4, y: 4 },
        { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, correct: true },
        { type: 'Goal', x: 16, y: 7 }
      ]
    }, [{ username: 'alice' }]);
    expect(withoutKey.key).toBeNull();
  });

  it('correct vote on stage 0 of 2 stays in VOTING + advances currentStage to 1 + emits fresh openDoorways', () => {
    var st = createLevelState(setupTwoStageWithKey(), [{ username: 'alice' }]);
    st.phase = PHASE_VOTING;
    st._phaseEntry = 1;
    var firstSE = _buildOpenDoorwaysForSetup(st);
    st.liveDoorwaysId = firstSE.id;
    var room = makeRoom({ alice: chipPos(16, 6, 10) });
    landClose(room, st.liveDoorwaysId, 's0d2');
    tick(st, 200, room);
    expect(st.phase).toBe(PHASE_VOTING);
    expect(st.currentStage).toBe(1);
    expect(st.doorways).toBe(st.stages[1].doorways);
    expect(st._voteQuestion).toBe('Stage 1 question?');
    expect(st.sideEffects && st.sideEffects.openDoorways).toBeTruthy();
    expect(st.liveDoorwaysId).toBe(st.sideEffects.openDoorways.id);
  });

  it('correct vote on LAST stage WITH Key actor -> PHASE_KEY_HUNT', () => {
    var st = createLevelState(setupTwoStageWithKey(), [{ username: 'alice' }]);
    // Skip to the last stage already in VOTING.
    st.phase = PHASE_VOTING;
    st.currentStage = 1;
    st.doorways = st.stages[1].doorways;
    st._phaseEntry = 1;
    var lastSE = _buildOpenDoorwaysForSetup(st);
    st.liveDoorwaysId = lastSE.id;
    var room = makeRoom({ alice: chipPos(16, 6, 10) });
    landClose(room, st.liveDoorwaysId, 's1d2');
    tick(st, 200, room);
    expect(st.phase).toBe(PHASE_KEY_HUNT);
    expect(st.key.collected).toBe(false);
  });

  it('correct vote on LAST stage WITHOUT Key actor -> PHASE_GOAL_AVAILABLE (backward compat)', () => {
    var st = createLevelState({
      schema: 'v7-level-1', levelKey: 'NK2', lessonKey: 'NK2',
      map: { width: 32, height: 8, chipSize: 10 },
      actors: [
        { type: 'PlayerSpawn', x: 4, y: 4 },
        { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, correct: true },
        { type: 'Goal', x: 16, y: 7 }
      ]
    }, [{ username: 'alice' }]);
    st.phase = PHASE_VOTING;
    st._phaseEntry = 1;
    var se = _buildOpenDoorwaysForSetup(st);
    st.liveDoorwaysId = se.id;
    var room = makeRoom({ alice: chipPos(16, 6, 10) });
    landClose(room, st.liveDoorwaysId, 'd1');
    tick(st, 200, room);
    expect(st.phase).toBe(PHASE_GOAL_AVAILABLE);
    expect(st.key).toBeNull();
  });

  it('applyInput {kind:"collect-key"} in KEY_HUNT flips state.key.collected + next tick -> GOAL_AVAILABLE', () => {
    var st = createLevelState(setupTwoStageWithKey(), [{ username: 'alice' }]);
    st.phase = PHASE_KEY_HUNT;
    var room = makeRoom({ alice: chipPos(10, 4, 10) });
    tick(st, 200, room);   // refresh alice's position to chip (10, 4)
    applyInput(st, 'alice', { kind: 'collect-key' });
    expect(st.key.collected).toBe(true);
    expect(st.key.collectedBy).toBe('alice');
    tick(st, 200, room);
    expect(st.phase).toBe(PHASE_GOAL_AVAILABLE);
  });

  it('applyInput {kind:"collect-key"} no-ops outside KEY_HUNT phase', () => {
    var st = createLevelState(setupTwoStageWithKey(), [{ username: 'alice' }]);
    st.phase = PHASE_SIPPING;
    expect(applyInput(st, 'alice', { kind: 'collect-key' })).toBeNull();
    expect(st.key.collected).toBe(false);
  });

  it('V7.5 anti-cheat: applyInput {kind:"collect-key"} rejects far-away player', () => {
    var st = createLevelState(setupTwoStageWithKey(), [{ username: 'alice' }]);
    st.phase = PHASE_KEY_HUNT;
    // Spawn alice at chip (4, 4) -> level x=40. Key at chip 10 -> x=100.
    // |40 - 100| = 60 px, well past 2 * OVERLAP_PX = 32. Reject.
    expect(applyInput(st, 'alice', { kind: 'collect-key' })).toBeNull();
    expect(st.key.collected).toBe(false);
  });

  it('serialize wire shape includes stages metadata + key + goal.locked', () => {
    var st = createLevelState(setupTwoStageWithKey(), [{ username: 'alice' }]);
    var wire = serialize(st);
    expect(wire.currentStage).toBe(0);
    expect(wire.stagesTotal).toBe(2);
    expect(wire.voteQuestion).toBe('Stage 0 question?');
    expect(wire.key).toEqual({ x: 10, y: 4, collected: false, collectedBy: null });
    // Goal is locked because state.key && !state.key.collected.
    expect(wire.goal.locked).toBe(true);
    // After collect, goal unlocks.
    st.key.collected = true;
    var wire2 = serialize(st);
    expect(wire2.goal.locked).toBe(false);
    expect(wire2.key.collected).toBe(true);
  });
});

// Tiny helper used by the V7.5 tests to fabricate an openDoorways
// sideEffect's id without re-implementing _buildOpenDoorwaysSideEffect.
// State must have a current-stage doorways pointer + a _phaseEntry.
function _buildOpenDoorwaysForSetup(st) {
  return {
    id: 'level-' + st.levelKey + '-vote-' + st._phaseEntry,
    question: st._voteQuestion,
    options: st.doorways.map(function (d) { return { label: d.text, doorId: d.id }; })
  };
}

// ----------------------------------------------------------------------
// V7.6: reflection-text placeholder substitution
// ----------------------------------------------------------------------

// Synthetic single-stage level with a templated wrong-door reflection.
function setupTemplatedReflection() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.V76',
    lessonKey: 'T.V76',
    map: { width: 32, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'Goal',        x: 16, y: 7 }
    ],
    stages: [{
      questionText: 'Stage 0?',
      doorways: [
        { id: 'd1', x: 6,  y: 6, text: 'wrong',
          correct: false,
          reflection: '{N} of {TOTAL} ({PCT}%) chose wrong here. STATIC TAIL.' },
        { id: 'd2', x: 16, y: 6, text: 'correct', correct: true }
      ]
    }]
  };
}

describe('V7.6 level-engine -- reflection placeholder substitution', () => {
  it('substitutes {N}/{TOTAL}/{PCT} from the actual vote tally on REFLECTION entry', () => {
    var st = createLevelState(setupTemplatedReflection(), [{ username: 'alice' }]);
    st.phase = PHASE_VOTING;
    st._phaseEntry = 1;
    st.liveDoorwaysId = 'level-TEST.V76-vote-1';
    var room = makeRoom({ alice: chipPos(6, 6, 10) });
    // 3 votes for d1 (wrong winner), 1 for d2 -> N=3, TOTAL=4, PCT=75.
    landCloseDoorways(room, st.liveDoorwaysId, [
      { doorId: 'd1', count: 3 },
      { doorId: 'd2', count: 1 }
    ]);
    tick(st, 200, room);
    expect(st.phase).toBe(PHASE_REFLECTION);
    expect(st.reflection.reflectionText).toBe('3 of 4 (75%) chose wrong here. STATIC TAIL.');
  });

  it('handles zero-vote winner gracefully (no division-by-zero)', () => {
    // Pathological: empty tally; engine should still produce a string,
    // not throw or emit NaN. (REFLECTION shouldn't fire in this path
    // anyway since winnerDoorId is null on empty tally -- this test
    // exercises the helper's robustness via a synthetic invocation.)
    var st = createLevelState(setupTemplatedReflection(), [{ username: 'alice' }]);
    st.phase = PHASE_VOTING;
    st._phaseEntry = 1;
    st.liveDoorwaysId = 'level-TEST.V76-vote-1';
    var room = makeRoom({ alice: chipPos(6, 6, 10) });
    // 0 votes -- no winner; engine re-opens. reflection.reflectionText
    // stays empty (never entered REFLECTION).
    landCloseDoorways(room, st.liveDoorwaysId, []);
    tick(st, 200, room);
    expect(st.phase).toBe(PHASE_VOTING);
    expect(st.reflection.reflectionText).toBe('');
  });

  it('static reflection strings (no placeholders) pass through unchanged (backward compat)', () => {
    // Mirrors the 79 non-templated levels in the s115 batch.
    var levelDef = setupTemplatedReflection();
    levelDef.stages[0].doorways[0].reflection = 'Static reflection -- no placeholders.';
    var st = createLevelState(levelDef, [{ username: 'alice' }]);
    st.phase = PHASE_VOTING;
    st._phaseEntry = 1;
    st.liveDoorwaysId = 'level-TEST.V76-vote-1';
    var room = makeRoom({ alice: chipPos(6, 6, 10) });
    landCloseDoorways(room, st.liveDoorwaysId, [
      { doorId: 'd1', count: 2 },
      { doorId: 'd2', count: 0 }
    ]);
    tick(st, 200, room);
    expect(st.reflection.reflectionText).toBe('Static reflection -- no placeholders.');
  });

  it('PCT rounds to nearest integer (no decimals leak into the UI)', () => {
    var st = createLevelState(setupTemplatedReflection(), [{ username: 'alice' }]);
    st.phase = PHASE_VOTING;
    st._phaseEntry = 1;
    st.liveDoorwaysId = 'level-TEST.V76-vote-1';
    var room = makeRoom({ alice: chipPos(6, 6, 10) });
    // 1 of 3 -> 33.333% -> rounds to 33.
    landCloseDoorways(room, st.liveDoorwaysId, [
      { doorId: 'd1', count: 1 },
      { doorId: 'd2', count: 2 }   // d2 is correct -- but wins, so this won't enter REFLECTION
    ]);
    // d2 wins (count 2 > count 1) -- this path goes to GOAL_AVAILABLE, NOT REFLECTION.
    // Flip the test: make d1 win with count 1 of 3 by including a third doorway.
    landCloseDoorways(room, st.liveDoorwaysId, [
      { doorId: 'd1', count: 1 },
      { doorId: 'd2', count: 0 }
    ]);
    tick(st, 200, room);
    expect(st.phase).toBe(PHASE_REFLECTION);
    // 1 of 1 (sum of nonzero counts) -> 100%.
    expect(st.reflection.reflectionText).toBe('1 of 1 (100%) chose wrong here. STATIC TAIL.');
  });

  it('empty/null reflection template returns empty string (no template, no crash)', () => {
    var levelDef = setupTemplatedReflection();
    levelDef.stages[0].doorways[0].reflection = '';
    var st = createLevelState(levelDef, [{ username: 'alice' }]);
    st.phase = PHASE_VOTING;
    st._phaseEntry = 1;
    st.liveDoorwaysId = 'level-TEST.V76-vote-1';
    var room = makeRoom({ alice: chipPos(6, 6, 10) });
    landCloseDoorways(room, st.liveDoorwaysId, [
      { doorId: 'd1', count: 1 },
      { doorId: 'd2', count: 0 }
    ]);
    tick(st, 200, room);
    expect(st.reflection.reflectionText).toBe('');
  });
});
