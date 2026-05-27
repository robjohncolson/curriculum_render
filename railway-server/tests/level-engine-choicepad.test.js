// level-engine-choicepad.test.js
// Unit tests for the V7.8 ChoicePad actor: per-player preference
// recorder that replaces the V7.7 Tally threshold as the SIPPING ->
// VOTING gate for mechanic-first levels. ChoicePad presence requires
// EVERY online player to have a complete row (sampledA + sampledB +
// choice) before the phase advances.
//
// Contract: LIVE_CLASSROOM_V7_8_BUILD.md sections 1-8 (engine surface).
// Backward compat: levels with no ChoicePad keep V7.7 Tally cascade;
// levels with neither keep V7.5 all-coins-collected (regression-pinned
// here so U1.2 and the 78 legacy levels stay green).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLevelState,
  applyInput,
  tick,
  serialize,
  onMemberJoin,
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

// Build a V7.8 ChoicePad level. Two SipStations (A, B), two ChoicePads
// (A, B), one QuestionDoor so the backward-compat synthetic single-
// stage logic has something to vote on after SIPPING completes.
function makeChoicePadLevel() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.CP',
    lessonKey: 'TEST.CP',
    map: { width: 32, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'Goal',        x: 16, y: 7 },
      { type: 'SipStation',  id: 'sa', x:  4, y: 2, drink: 'A' },
      { type: 'SipStation',  id: 'sb', x: 28, y: 2, drink: 'B' },
      { type: 'ChoicePad',   id: 'cp-A', x:  8, y: 4, value: 'A' },
      { type: 'ChoicePad',   id: 'cp-B', x: 24, y: 4, value: 'B' },
      { type: 'QuestionDoor', id: 'd1', x: 16, y: 6, text: 'ok', correct: true }
    ]
  };
}

// Drive one player to a coin x, refresh positions, fire collect input.
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

// Drive one player to a choice pad x, refresh positions, fire
// record-choice input.
function recordChoice(state, room, username, padId) {
  var pad = null;
  for (var i = 0; i < state.choicePads.length; i++) {
    if (state.choicePads[i].id === padId) { pad = state.choicePads[i]; break; }
  }
  if (!pad) throw new Error('test fixture: missing pad ' + padId);
  room.members.get(username).pos = chipPos(pad.x, pad.y, state.chipSize);
  tick(state, 200, room);
  applyInput(state, username, { kind: 'record-choice', choicePadId: padId });
}

// Walk a single player end-to-end through Zone 1: both sips + choice.
function completeRow(state, room, username, choice) {
  collectCoin(state, room, username, 'sa');
  collectCoin(state, room, username, 'sb');
  recordChoice(state, room, username, choice === 'A' ? 'cp-A' : 'cp-B');
}

describe('V7.8 ChoicePad actor -- createLevelState', function () {
  beforeEach(function () { _clearCache(); });

  it('populates player.marks = {sampledA:false, sampledB:false, choice:null}', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }, { username: 'bob' }]);
    expect(state.players.alice.marks).toEqual({ sampledA: false, sampledB: false, choice: null });
    expect(state.players.bob.marks).toEqual({ sampledA: false, sampledB: false, choice: null });
  });

  it('parses ChoicePad actors into state.choicePads', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.choicePads).toHaveLength(2);
    expect(state.choicePads[0]).toEqual({ id: 'cp-A', x: 8, y: 4, value: 'A' });
    expect(state.choicePads[1]).toEqual({ id: 'cp-B', x: 24, y: 4, value: 'B' });
  });

  it('emits state.choicePads = [] for levels without ChoicePads (backward compat)', function () {
    var def = makeChoicePadLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'ChoicePad'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.choicePads).toEqual([]);
  });
});

describe('V7.13 _handleCoinCollect -- auto-choice on second sip', function () {
  beforeEach(function () { _clearCache(); });

  it('sets marks.choice to the SECOND drink sipped (no ChoicePad needed)', function () {
    var def = makeChoicePadLevel();
    // Remove ChoicePads -- V7.13 doesn't need them; SipStations auto-record.
    def.actors = def.actors.filter(function (a) { return a.type !== 'ChoicePad'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    expect(state.players.alice.marks.choice).toBeNull();   // only A so far
    collectCoin(state, room, 'alice', 'sb');
    expect(state.players.alice.marks.choice).toBe('B');     // second sip wins
  });

  it('updates marks.choice when player re-overlaps the OTHER SipStation', function () {
    var def = makeChoicePadLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'ChoicePad'; });
    // V7.13 needs a Gate in the level so SIPPING doesn't auto-advance
    // to VOTING after both sips (which would block subsequent re-overlap
    // record-choice updates -- _handleCoinCollect returns null outside
    // SIPPING phase). Real U1.1 V7.10+ has Gates; the test mirrors that.
    def.actors.push({ type: 'Gate', id: 'g-scanner', x: 16, y: 3, label: 'scanner', predicate: 'every_player_row_complete' });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    collectCoin(state, room, 'alice', 'sb');
    expect(state.players.alice.marks.choice).toBe('B');
    // Walk back to A -- re-overlap "collect" updates choice to A.
    // V7.13 path: coin.collected = true (one-shot global) but per-player
    // marks update on every overlap.
    collectCoin(state, room, 'alice', 'sa');
    expect(state.players.alice.marks.choice).toBe('A');
  });

  it('does NOT set choice until BOTH samples are done', function () {
    var def = makeChoicePadLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'ChoicePad'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    // Re-overlap sa: still only A sampled, choice stays null.
    collectCoin(state, room, 'alice', 'sa');
    expect(state.players.alice.marks.choice).toBeNull();
  });

  it('non-A/B drinks (e.g. W in U1.2 Tally levels) do NOT set choice', function () {
    var def = makeChoicePadLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'ChoicePad' && a.type !== 'SipStation'; });
    def.actors.push({ type: 'SipStation', id: 'sw', x: 4, y: 2, drink: 'W' });
    def.actors.push({ type: 'SipStation', id: 'sn', x: 8, y: 2, drink: 'N' });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sw');
    collectCoin(state, room, 'alice', 'sn');
    // sampledA/sampledB stay false (only triggered by A/B drinks); choice
    // therefore never gets set. Tally-cascade levels (U1.2) keep V7.7
    // threshold semantics; ChoicePad-style auto-choice is A/B-only.
    expect(state.players.alice.marks.sampledA).toBe(false);
    expect(state.players.alice.marks.sampledB).toBe(false);
    expect(state.players.alice.marks.choice).toBeNull();
  });
});

describe('V7.8 _handleCoinCollect -- per-player mark side effect', function () {
  beforeEach(function () { _clearCache(); });

  it('sets player.marks.sampledA when an A-drink coin is collected', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    expect(state.players.alice.marks.sampledA).toBe(true);
    expect(state.players.alice.marks.sampledB).toBe(false);
  });

  it('sets player.marks.sampledB when a B-drink coin is collected', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sb');
    expect(state.players.alice.marks.sampledB).toBe(true);
    expect(state.players.alice.marks.sampledA).toBe(false);
  });

  it('keeps the V7.4 tally bump alongside the new mark set', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    expect(state.tally.sips.A).toBe(1);
    expect(state.players.alice.marks.sampledA).toBe(true);
  });

  it('does NOT set sampledA/sampledB for non-A/B drinks (U1.2 W/N levels)', function () {
    var def = makeChoicePadLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'SipStation' && a.type !== 'ChoicePad'; });
    def.actors.push({ type: 'SipStation', id: 'sw', x: 4, y: 2, drink: 'W' });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sw');
    expect(state.players.alice.marks.sampledA).toBe(false);
    expect(state.players.alice.marks.sampledB).toBe(false);
    expect(state.tally.sips.W).toBe(1);
  });
});

describe('V7.8 _handleRecordChoice -- ChoicePad input', function () {
  beforeEach(function () { _clearCache(); });

  it('records choice=A when player has both samples + overlaps cp-A', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    collectCoin(state, room, 'alice', 'sb');
    recordChoice(state, room, 'alice', 'cp-A');
    expect(state.players.alice.marks.choice).toBe('A');
  });

  it('rejects choice when player has only one sample', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');   // only A sampled
    recordChoice(state, room, 'alice', 'cp-A'); // try to choose
    expect(state.players.alice.marks.choice).toBeNull();
  });

  it('rejects choice when player is far from the pad (anti-cheat)', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    collectCoin(state, room, 'alice', 'sb');
    // Move player to the far edge of the canvas BEFORE firing choice.
    room.members.get('alice').pos = chipPos(30, 4, state.chipSize);
    tick(state, 200, room);   // refresh
    applyInput(state, 'alice', { kind: 'record-choice', choicePadId: 'cp-A' });
    expect(state.players.alice.marks.choice).toBeNull();
  });

  it('is one-shot: cannot re-choose by stepping on the other pad', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    collectCoin(state, room, 'alice', 'sb');
    recordChoice(state, room, 'alice', 'cp-A');
    expect(state.players.alice.marks.choice).toBe('A');
    // Try to override with cp-B.
    recordChoice(state, room, 'alice', 'cp-B');
    expect(state.players.alice.marks.choice).toBe('A');
  });

  it('rejects record-choice payload outside SIPPING phase', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    state.phase = PHASE_VOTING;
    var result = applyInput(state, 'alice', { kind: 'record-choice', choicePadId: 'cp-A' });
    expect(result).toBeNull();
  });

  it('rejects record-choice payload with unknown choicePadId', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    collectCoin(state, room, 'alice', 'sb');
    var result = applyInput(state, 'alice', { kind: 'record-choice', choicePadId: 'nonexistent' });
    expect(result).toBeNull();
    expect(state.players.alice.marks.choice).toBeNull();
  });
});

describe('V7.8 _isSippingComplete cascade -- ChoicePad > Tally > all-coins', function () {
  beforeEach(function () { _clearCache(); });

  it('ChoicePad level STAYS in SIPPING when 1 of 2 players incomplete', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }, { username: 'bob' }]);
    var room = makeRoom({
      alice: chipPos(4, 4, state.chipSize),
      bob:   chipPos(4, 4, state.chipSize)
    });
    // Alice completes; Bob does nothing.
    completeRow(state, room, 'alice', 'A');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);
  });

  it('ChoicePad level ADVANCES to VOTING when ALL players rowComplete', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }, { username: 'bob' }]);
    var room = makeRoom({
      alice: chipPos(4, 4, state.chipSize),
      bob:   chipPos(4, 4, state.chipSize)
    });
    completeRow(state, room, 'alice', 'A');
    completeRow(state, room, 'bob',   'B');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
  });

  it('ChoicePad cascade returns false for 0 online players (empty-room safety)', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, []);  // no students
    var room = makeRoom({});
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);  // must NOT auto-advance
  });

  it('LEGACY level (no ChoicePad, no Tally) keeps all-coins-collected cascade', function () {
    var def = makeChoicePadLevel();
    // Strip ChoicePad actors.
    def.actors = def.actors.filter(function (a) { return a.type !== 'ChoicePad'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // Collect just 1 of 2 coins -- still SIPPING under legacy rule.
    collectCoin(state, room, 'alice', 'sa');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);
    collectCoin(state, room, 'alice', 'sb');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
  });

  it('TALLY-ONLY level (V7.7 Tally, no ChoicePad) keeps Tally threshold cascade', function () {
    var def = makeChoicePadLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'ChoicePad'; });
    def.actors.push({ type: 'Tally', x: 16, y: 1, threshold: { A: 1, B: 1 } });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    tick(state, 200, room);
    // A:1 met, B:0 still pending -- V7.7 Tally cascade keeps SIPPING.
    expect(state.phase).toBe(PHASE_SIPPING);
    collectCoin(state, room, 'alice', 'sb');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
  });
});

describe('V7.8 serialize wire shape', function () {
  beforeEach(function () { _clearCache(); });

  it('emits choicePads array (populated for ChoicePad levels)', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.choicePads).toHaveLength(2);
    expect(wire.choicePads[0]).toEqual({ id: 'cp-A', x: 8, y: 4, value: 'A' });
  });

  it('emits choicePads = [] for legacy levels (backward compat)', function () {
    var def = makeChoicePadLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'ChoicePad'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.choicePads).toEqual([]);
  });

  it('emits per-player marks object', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    collectCoin(state, room, 'alice', 'sa');
    var wire = serialize(state);
    expect(wire.players.alice.marks).toEqual({ sampledA: true, sampledB: false, choice: null });
  });
});

describe('V7.8 onMemberJoin -- new joiner gets fresh marks', function () {
  beforeEach(function () { _clearCache(); });

  it('initializes marks for a mid-level joiner so rowComplete check does not crash', function () {
    var def = makeChoicePadLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 4, state.chipSize) });
    // Alice completes her row alone (1-player room satisfies cascade).
    completeRow(state, room, 'alice', 'A');
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_VOTING);
    // Bob joins mid-level. Reset to SIPPING since the cascade re-checks.
    // (In real life onMemberJoin fires while still in SIPPING; this test
    // exercises the joiner-initialization path.)
    state.phase = PHASE_SIPPING;
    onMemberJoin(state, 'bob', room);
    expect(state.players.bob).toBeDefined();
    expect(state.players.bob.marks).toEqual({ sampledA: false, sampledB: false, choice: null });
    // The cascade now requires bob's row too -- room is back to SIPPING.
    room.members.set('bob', { username: 'bob', online: true, canvasW: 320, pos: chipPos(4, 4, state.chipSize) });
    tick(state, 200, room);
    expect(state.phase).toBe(PHASE_SIPPING);
  });
});
