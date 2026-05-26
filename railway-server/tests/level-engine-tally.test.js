// level-engine-tally.test.js
// Unit tests for the V7.7 Tally actor: a level-def actor type that
// threshold-gates the SIPPING -> VOTING transition on a per-category
// sip count. Replaces the legacy "all coins collected" precondition
// for levels that opt in by including a Tally actor.
//
// Contract: LIVE_CLASSROOM_V7_7_BUILD.md sections 1-4 (engine surface).
// Backward compat: levels WITHOUT a Tally actor keep the legacy rule
// (regression-pinned here so the 78 non-Tally levels stay green).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLevelState,
  applyInput,
  tick,
  serialize,
  _clearCache,
  PHASE_SIPPING,
  PHASE_VOTING
} from '../level-engine.js';

// Stub room shape: only .members.get(u).pos / .canvasW + .closedDoorways
// is read by the engine. Helpers build the minimal shape.
function makeRoom(playerPositions, canvasW) {
  var members = new Map();
  Object.keys(playerPositions).forEach(function (u) {
    members.set(u, {
      username: u,
      online:   true,
      canvasW:  (typeof canvasW === 'number') ? canvasW : 320,
      pos:      playerPositions[u]
    });
  });
  return { members: members, closedDoorways: null };
}

function chipPos(cx, cy, chipSize) {
  return { x: cx * chipSize, y: cy * chipSize, state: 'idle', vx: 0 };
}

// Build a minimal V7.7 level def with a Tally actor + scattered coins.
// Threshold and coin counts are caller-provided so tests can vary the
// gating shape without rebuilding the fixture each time.
function makeTallyLevel(opts) {
  opts = opts || {};
  var threshold = opts.threshold || { W: 3, N: 3 };
  var coins     = opts.coins     || [
    { id: 'w1', x:  2, y: 2, drink: 'W' },
    { id: 'w2', x:  6, y: 2, drink: 'W' },
    { id: 'w3', x: 10, y: 2, drink: 'W' },
    { id: 'w4', x: 14, y: 2, drink: 'W' },
    { id: 'n1', x: 18, y: 2, drink: 'N' },
    { id: 'n2', x: 22, y: 2, drink: 'N' },
    { id: 'n3', x: 26, y: 2, drink: 'N' },
    { id: 'n4', x: 30, y: 2, drink: 'N' }
  ];
  var actors = [
    { type: 'PlayerSpawn', x: 4, y: 4 },
    { type: 'Goal',        x: 16, y: 7 },
    { type: 'Tally',       x: 16, y: 1, threshold: threshold }
  ];
  for (var i = 0; i < coins.length; i++) {
    actors.push({
      type: 'SipStation',
      id:   coins[i].id,
      x:    coins[i].x,
      y:    coins[i].y,
      drink: coins[i].drink
    });
  }
  // QuestionDoor so backward-compat synthetic single-stage logic has
  // something to vote on after SIPPING completes.
  actors.push({
    type: 'QuestionDoor',
    id:   'd1',
    x:    16, y: 6,
    text: 'correct',
    correct: true
  });
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.T',
    lessonKey: 'TEST.T',
    map: { width: 32, height: 8, chipSize: 10 },
    actors: actors
  };
}

// Build a LEGACY level def (no Tally actor) for the backward-compat
// regression test.
function makeLegacyLevel() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.LEG',
    lessonKey: 'TEST.LEG',
    map: { width: 32, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'Goal',        x: 16, y: 7 },
      { type: 'SipStation',  id: 'a1', x:  4, y: 2, drink: 'A' },
      { type: 'SipStation',  id: 'a2', x: 12, y: 2, drink: 'A' },
      { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: 'ok', correct: true }
    ]
  };
}

// Collect a single coin by id (drives the player to its X first so the
// anti-cheat X-overlap passes, then fires the applyInput).
function collectCoin(state, room, username, coinId) {
  var coin = null;
  for (var i = 0; i < state.coins.length; i++) {
    if (state.coins[i].id === coinId) { coin = state.coins[i]; break; }
  }
  if (!coin) throw new Error('test fixture: missing coin ' + coinId);
  room.members.get(username).pos = chipPos(coin.x, coin.y, state.chipSize);
  tick(state, 200, room);
  applyInput(state, username, { kind: 'collect', coinId: coinId });
}

describe('V7.7 Tally actor -- createLevelState', function () {
  beforeEach(function () { _clearCache(); });

  it('parses a Tally actor into state.tallyConfig', function () {
    var def = makeTallyLevel({ threshold: { W: 2, N: 4 } });
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.tallyConfig).not.toBeNull();
    expect(state.tallyConfig.threshold).toEqual({ W: 2, N: 4 });
    expect(state.tallyConfig.binds).toBe('tally.sips');
  });

  it('accepts an explicit binds field', function () {
    var def = makeTallyLevel();
    // Inject custom binds onto the Tally actor.
    for (var i = 0; i < def.actors.length; i++) {
      if (def.actors[i].type === 'Tally') { def.actors[i].binds = 'tally.foo'; }
    }
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.tallyConfig.binds).toBe('tally.foo');
  });

  it('returns tallyConfig=null for levels without a Tally actor', function () {
    var def = makeLegacyLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.tallyConfig).toBeNull();
  });

  it('does not mutate the caller threshold object', function () {
    var thresh = { W: 3, N: 3 };
    var def = makeTallyLevel({ threshold: thresh });
    var state = createLevelState(def, [{ username: 'alice' }]);
    // Mutating the level def threshold AFTER state creation must NOT
    // leak into state.tallyConfig.threshold (it's a copy).
    thresh.W = 999;
    expect(state.tallyConfig.threshold.W).toBe(3);
  });
});

describe('V7.7 Tally actor -- _isSippingComplete via tick()', function () {
  beforeEach(function () { _clearCache(); });

  it('STAYS in SIPPING when threshold not yet met', function () {
    var def = makeTallyLevel({ threshold: { W: 3, N: 3 } });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // Collect only 2 W and 1 N -- below threshold for both.
    collectCoin(state, room, 'alice', 'w1');
    collectCoin(state, room, 'alice', 'w2');
    collectCoin(state, room, 'alice', 'n1');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);
    expect(state.sideEffects).toBeNull();
  });

  it('ADVANCES to VOTING the tick after the LAST threshold key meets its min', function () {
    var def = makeTallyLevel({ threshold: { W: 3, N: 3 } });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // 3 W + 2 N -- W met, N not yet. Still SIPPING.
    collectCoin(state, room, 'alice', 'w1');
    collectCoin(state, room, 'alice', 'w2');
    collectCoin(state, room, 'alice', 'w3');
    collectCoin(state, room, 'alice', 'n1');
    collectCoin(state, room, 'alice', 'n2');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);
    // Third N flips it.
    collectCoin(state, room, 'alice', 'n3');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
    expect(state.sideEffects).not.toBeNull();
    expect(state.sideEffects.openDoorways).not.toBeNull();
  });

  it('does NOT require remaining coins to be collected once threshold met', function () {
    var def = makeTallyLevel({ threshold: { W: 3, N: 3 } });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // Collect exactly 3 W + 3 N out of 4 each. One W + one N stay
    // uncollected -- engine should still advance.
    collectCoin(state, room, 'alice', 'w1');
    collectCoin(state, room, 'alice', 'w2');
    collectCoin(state, room, 'alice', 'w3');
    collectCoin(state, room, 'alice', 'n1');
    collectCoin(state, room, 'alice', 'n2');
    collectCoin(state, room, 'alice', 'n3');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
    // Verify uncollected coins are still in state.coins (not silently
    // marked collected).
    var w4 = state.coins.filter(function (c) { return c.id === 'w4'; })[0];
    var n4 = state.coins.filter(function (c) { return c.id === 'n4'; })[0];
    expect(w4.collected).toBe(false);
    expect(n4.collected).toBe(false);
  });

  it('handles single-key threshold (only one category required)', function () {
    var def = makeTallyLevel({ threshold: { W: 2 } });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // 2 W collected -- threshold met, ignore N entirely.
    collectCoin(state, room, 'alice', 'w1');
    collectCoin(state, room, 'alice', 'w2');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
  });

  it('CC self-review fold: empty {} threshold falls through to legacy rule (no auto-pass)', function () {
    var def = makeTallyLevel({ threshold: {} });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // 0 coins collected -- with EMPTY threshold the fast-path COULD
    // have returned true; we want it to fall through to legacy and
    // require all coins.
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);
    // Now collect every coin so the legacy "all coins collected" rule
    // is satisfied; level should advance.
    for (var i = 0; i < state.coins.length; i++) {
      collectCoin(state, room, 'alice', state.coins[i].id);
    }
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
  });

  it('CC self-review fold: Tally actor with no threshold field falls through to legacy', function () {
    // Build a level with Tally actor that has NO threshold key at all.
    var def = makeTallyLevel();
    for (var i = 0; i < def.actors.length; i++) {
      if (def.actors[i].type === 'Tally') { delete def.actors[i].threshold; }
    }
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // state.tallyConfig is non-null but state.tallyConfig.threshold is null.
    expect(state.tallyConfig).not.toBeNull();
    expect(state.tallyConfig.threshold).toBeNull();
    // Legacy rule applies: must collect every coin (8 of them).
    // Collect 7 first -- still SIPPING.
    for (var c = 0; c < 7; c++) {
      collectCoin(state, room, 'alice', state.coins[c].id);
    }
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);
    // 8th coin advances.
    collectCoin(state, room, 'alice', state.coins[7].id);
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
  });

  it('LEGACY level (no Tally actor) keeps "all coins collected" rule', function () {
    var def = makeLegacyLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // Collect 1 of 2 coins -- still SIPPING under legacy rule.
    collectCoin(state, room, 'alice', 'a1');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);
    // Second coin advances.
    collectCoin(state, room, 'alice', 'a2');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
  });
});

describe('V7.7 Tally actor -- serialize wire shape', function () {
  beforeEach(function () { _clearCache(); });

  it('emits tallyConfig (populated) for Tally levels', function () {
    var def = makeTallyLevel({ threshold: { W: 3, N: 3 } });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.tallyConfig).not.toBeNull();
    expect(wire.tallyConfig.threshold).toEqual({ W: 3, N: 3 });
    expect(wire.tallyConfig.binds).toBe('tally.sips');
  });

  it('emits tallyConfig=null for legacy levels', function () {
    var def = makeLegacyLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.tallyConfig).toBeNull();
  });

  it('serialized tallyConfig.threshold is a copy (mutation isolated)', function () {
    var def = makeTallyLevel({ threshold: { W: 2, N: 2 } });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    wire.tallyConfig.threshold.W = 999;
    expect(state.tallyConfig.threshold.W).toBe(2);
  });
});
