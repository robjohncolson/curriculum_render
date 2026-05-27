// level-engine-scroll.test.js
// Unit tests for V7.9 side-scroll engine plumbing. The engine change is
// minimal -- the existing map.width / chipSize handling already supports
// wider levels; this file pins (a) the new serialize.levelPxWidth derived
// field, (b) wider-level createLevelState shape, (c) anti-cheat rescale
// continuing to work when the broadcaster sends canvasW = levelPxWidth
// (V7.9 wire convention -- rescale becomes identity).
//
// Contract: LIVE_CLASSROOM_V7_9_BUILD.md sections 1-3.

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

// Build a wider-than-default level (map.width=48). Used for the V7.9
// scroll-engine tests; the actor placement uses chips out to 40 so the
// wider coord space is actually exercised.
function makeWideLevel(mapWidth) {
  mapWidth = mapWidth || 48;
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.WIDE',
    lessonKey: 'TEST.WIDE',
    map: { width: mapWidth, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'Goal',        x: mapWidth - 4, y: 7 },
      { type: 'SipStation',  id: 'sa', x: 4,             y: 2, drink: 'A' },
      { type: 'SipStation',  id: 'sb', x: mapWidth - 8,  y: 2, drink: 'B' },
      { type: 'QuestionDoor', id: 'd1', x: mapWidth / 2, y: 6, text: 'ok', correct: true }
    ]
  };
}

describe('V7.9 engine -- wider map.width', function () {
  beforeEach(function () { _clearCache(); });

  it('createLevelState accepts map.width=48 without truncation', function () {
    var def = makeWideLevel(48);
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.mapWidth).toBe(48);
    expect(state.chipSize).toBe(10);
  });

  it('createLevelState accepts map.width=96 (extreme width)', function () {
    var def = makeWideLevel(96);
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.mapWidth).toBe(96);
  });

  it('createLevelState default map.width=32 when level def omits map.width', function () {
    var def = makeWideLevel(48);
    delete def.map.width;
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.mapWidth).toBe(32);
  });
});

describe('V7.9 engine -- serialize.levelPxWidth', function () {
  beforeEach(function () { _clearCache(); });

  it('emits levelPxWidth = mapWidth * chipSize for wider levels', function () {
    var def = makeWideLevel(48);
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.levelPxWidth).toBe(480);   // 48 * 10
  });

  it('emits levelPxWidth = 320 for legacy single-screen levels', function () {
    var def = makeWideLevel(32);
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.levelPxWidth).toBe(320);   // 32 * 10
  });

  it('emits levelPxWidth = 960 for an extreme-width level', function () {
    var def = makeWideLevel(96);
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.levelPxWidth).toBe(960);   // 96 * 10
  });
});

describe('V7.9 engine -- anti-cheat rescale with canvasW=levelW', function () {
  beforeEach(function () { _clearCache(); });

  it('player at level x=400 in a 48-wide level collects coin at chip 40 when canvasW=levelW', function () {
    // V7.9 wire convention: client broadcasts canvasW = levelPxWidth.
    // Server-side _playerNearActorX rescale becomes identity:
    //   playerLevelX = (player.x / canvasW) * levelW
    //                = (400 / 480)        * 480
    //                = 400
    // which equals the coin's chip 40 * chipSize 10 = 400. Overlap fires.
    var def = makeWideLevel(48);
    var state = createLevelState(def, [{ username: 'alice' }]);
    // Place an extra coin at chip 40 so we have a far-target to collect.
    state.coins.push({ id: 'sc', x: 40, y: 2, drink: 'A', collected: false, hidden: false, revealed: true });
    var room = makeRoom({ alice: chipPos(40, 4, state.chipSize) }, 480);   // canvasW = levelPxWidth
    state.players.alice.x = 400;          // level pixel = chip 40 * 10
    state.players.alice._canvasW = 480;
    tick(state, 200, room);               // refresh _refreshPlayerPositions
    var result = applyInput(state, 'alice', { kind: 'collect', coinId: 'sc' });
    expect(result).not.toBeNull();
    var collectedCoin = state.coins.filter(function (c) { return c.id === 'sc'; })[0];
    expect(collectedCoin.collected).toBe(true);
  });

  it('legacy canvasW=320 broadcast on a 32-wide level still works (backward compat)', function () {
    // Legacy: single-screen level, player broadcasts canvasW=320 (their
    // actual canvas width, which equals levelPxWidth for 32-chip levels).
    // Rescale is identity again, just with smaller numbers.
    var def = makeWideLevel(32);
    // The default 'sa' coin is at chip 4. Player at chip 4 -> level px 40.
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) }, 320);
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'collect', coinId: 'sa' });
    expect(result).not.toBeNull();
    var coin = state.coins.filter(function (c) { return c.id === 'sa'; })[0];
    expect(coin.collected).toBe(true);
  });

  it('player too-far rejection still fires on wider levels (anti-cheat preserved)', function () {
    var def = makeWideLevel(48);
    var state = createLevelState(def, [{ username: 'alice' }]);
    state.coins.push({ id: 'sfar', x: 40, y: 2, drink: 'A', collected: false, hidden: false, revealed: true });
    // Player at chip 4 (level px 40), coin at chip 40 (level px 400).
    // |40 - 400| = 360, well past 2 * OVERLAP_PX = 32. Reject.
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) }, 480);
    state.players.alice.x = 40;
    state.players.alice._canvasW = 480;
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'collect', coinId: 'sfar' });
    expect(result).toBeNull();
    var coin = state.coins.filter(function (c) { return c.id === 'sfar'; })[0];
    expect(coin.collected).toBe(false);
  });
});
