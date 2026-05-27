// level-engine-zone5.test.js
// Unit tests for V7.14 Zone 5: ContextSlot + GoalPad. Replaces the
// legacy V7.5 Key + Goal endgame with a whole-class assembly +
// presence mechanic per the U1.1 mechanic-first design canon.
//
// Contract: LIVE_CLASSROOM_V7_14_BUILD.md sections 1-8.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLevelState,
  applyInput,
  tick,
  serialize,
  _clearCache,
  PHASE_SIPPING,
  PHASE_VOTING,
  PHASE_KEY_HUNT,
  PHASE_GOAL_AVAILABLE,
  PHASE_LEVEL_CLEARED
} from '../level-engine.js';

function makeRoom(playerPositions, canvasW) {
  var members = new Map();
  Object.keys(playerPositions).forEach(function (u) {
    members.set(u, {
      username: u,
      online:   true,
      canvasW:  (typeof canvasW === 'number') ? canvasW : 960,
      pos:      playerPositions[u]
    });
  });
  return { members: members, closedDoorways: null };
}

function chipPos(cx, cy, chipSize) {
  return { x: cx * chipSize, y: cy * chipSize, state: 'idle', vx: 0 };
}

// Build a V7.14 Zone-5 fixture: SipStations + Gate + 3 ContextSlots
// + GoalPad. Mirrors U1.1's V7.14 layout in miniature.
function makeZone5Level() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.Z5',
    lessonKey: 'TEST.Z5',
    map: { width: 96, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'SipStation',  id: 's1', x: 4,  y: 2, drink: 'A' },
      { type: 'SipStation',  id: 's2', x: 24, y: 2, drink: 'B' },
      { type: 'Gate', id: 'g-scanner', x: 40, y: 3, label: 'scanner', predicate: 'every_player_row_complete' },
      { type: 'Gate', id: 'g-data',    x: 88, y: 6, label: 'data',    predicate: 'tally_nonzero' },
      { type: 'ContextSlot', id: 'cs-q', x: 89, y: 5, label: 'QUESTION' },
      { type: 'ContextSlot', id: 'cs-v', x: 91, y: 5, label: 'VARIABLE' },
      { type: 'ContextSlot', id: 'cs-c', x: 93, y: 5, label: 'CONTEXT' },
      { type: 'GoalPad', x: 95, y: 7, triggerMs: 1500 }
    ]
  };
}

// Legacy fixture (V7.5 Key + Goal, no GoalPad).
function makeLegacyEndgameLevel() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.LEG',
    lessonKey: 'TEST.LEG',
    map: { width: 48, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'SipStation',  id: 's1', x: 4,  y: 2, drink: 'A' },
      { type: 'Gate', id: 'g-data', x: 30, y: 6, label: 'data', predicate: 'tally_nonzero' },
      { type: 'Key',  id: 'k1', x: 40, y: 4 },
      { type: 'Goal', x: 44, y: 7 }
    ]
  };
}

function setSlotsAllLit(state) {
  for (var i = 0; i < state.contextSlots.length; i++) state.contextSlots[i].lit = true;
}

describe('V7.14 ContextSlot + GoalPad -- createLevelState parsing', function () {
  beforeEach(function () { _clearCache(); });

  it('populates state.contextSlots[] with id/x/y/label/lit=false', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.contextSlots).toHaveLength(3);
    expect(state.contextSlots[0]).toEqual({ id: 'cs-q', x: 89, y: 5, label: 'QUESTION', lit: false });
    expect(state.contextSlots[2].label).toBe('CONTEXT');
  });

  it('populates state.goalPad with x/y/presenceMs=0/triggerMs', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.goalPad).toEqual({ id: 'goal-pad', x: 95, y: 7, presenceMs: 0, triggerMs: 1500 });
  });

  it('emits state.contextSlots = [] + goalPad = null for legacy levels', function () {
    var def = makeLegacyEndgameLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.contextSlots).toEqual([]);
    expect(state.goalPad).toBeNull();
  });

  it('GoalPad triggerMs defaults to 1500 when not specified', function () {
    var def = makeZone5Level();
    for (var i = 0; i < def.actors.length; i++) {
      if (def.actors[i].type === 'GoalPad') { delete def.actors[i].triggerMs; }
    }
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.goalPad.triggerMs).toBe(1500);
  });
});

describe('V7.14 ContextSlot -- per-tick lit evaluator', function () {
  beforeEach(function () { _clearCache(); });

  it('lights slot when ANY player overlaps in KEY_HUNT or GOAL_AVAILABLE', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    state.phase = PHASE_GOAL_AVAILABLE;
    var room = makeRoom({ alice: chipPos(89, 5, state.chipSize) });
    tick(state, 200, room);
    var slot = state.contextSlots.filter(function (s) { return s.id === 'cs-q'; })[0];
    expect(slot.lit).toBe(true);
  });

  it('does NOT light slot during SIPPING (premature lighting prevented)', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(89, 5, state.chipSize) });
    tick(state, 200, room);
    var slot = state.contextSlots.filter(function (s) { return s.id === 'cs-q'; })[0];
    expect(slot.lit).toBe(false);
  });

  it('lit is ONE-WAY (never re-darkens even when player walks off)', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    state.phase = PHASE_GOAL_AVAILABLE;
    var room = makeRoom({ alice: chipPos(89, 5, state.chipSize) });
    tick(state, 200, room);
    expect(state.contextSlots[0].lit).toBe(true);
    // Walk alice far away.
    room.members.get('alice').pos = chipPos(4, 4, state.chipSize);
    tick(state, 200, room);
    expect(state.contextSlots[0].lit).toBe(true);
  });
});

describe('V7.14 GoalPad -- presence + LEVEL_CLEARED', function () {
  beforeEach(function () { _clearCache(); });

  it('does NOT accumulate presence until ALL ContextSlots lit', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    state.phase = PHASE_GOAL_AVAILABLE;
    // Only 2 of 3 slots lit.
    state.contextSlots[0].lit = true;
    state.contextSlots[1].lit = true;
    var room = makeRoom({ alice: chipPos(95, 7, state.chipSize) });
    tick(state, 500, room);
    expect(state.goalPad.presenceMs).toBe(0);
  });

  it('accumulates presence when all slots lit + player on pad', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    state.phase = PHASE_GOAL_AVAILABLE;
    setSlotsAllLit(state);
    var room = makeRoom({ alice: chipPos(95, 7, state.chipSize) });
    tick(state, 500, room);
    expect(state.goalPad.presenceMs).toBe(500);
  });

  it('RESETS to 0 if any player steps off', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }, { username: 'bob' }]);
    state.phase = PHASE_GOAL_AVAILABLE;
    setSlotsAllLit(state);
    var room = makeRoom({
      alice: chipPos(95, 7, state.chipSize),
      bob:   chipPos(95, 7, state.chipSize)
    });
    tick(state, 500, room);
    expect(state.goalPad.presenceMs).toBe(500);
    // Bob walks off.
    room.members.get('bob').pos = chipPos(50, 4, state.chipSize);
    tick(state, 500, room);
    expect(state.goalPad.presenceMs).toBe(0);
  });

  it('fires LEVEL_CLEARED when presenceMs >= triggerMs', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    state.phase = PHASE_GOAL_AVAILABLE;
    setSlotsAllLit(state);
    var room = makeRoom({ alice: chipPos(95, 7, state.chipSize) });
    tick(state, 800, room);
    expect(state.phase).toBe(PHASE_GOAL_AVAILABLE);
    tick(state, 800, room);
    // Cumulative 1600 >= 1500 triggerMs -> LEVEL_CLEARED.
    expect(state.phase).toBe(PHASE_LEVEL_CLEARED);
  });

  it('empty-room safety: 0 players => allPresent=false => no accumulation', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, []);
    state.phase = PHASE_GOAL_AVAILABLE;
    setSlotsAllLit(state);
    var room = makeRoom({});
    tick(state, 500, room);
    expect(state.goalPad.presenceMs).toBe(0);
    expect(state.phase).toBe(PHASE_GOAL_AVAILABLE);
  });
});

describe('V7.14 walk-through-gate -- GoalPad skips KEY_HUNT', function () {
  beforeEach(function () { _clearCache(); });

  it('GoalPad level transitions Gate-walkthrough to GOAL_AVAILABLE directly', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, state.chipSize) });
    tick(state, 200, room);   // refresh player._canvasW from room.members
    applyInput(state, 'alice', { kind: 'collect', coinId: 's1' });
    tick(state, 200, room);   // gate predicate eval after tally bump
    var dataGate = state.gates.filter(function (g) { return g.id === 'g-data'; })[0];
    expect(dataGate.opened).toBe(true);
    room.members.get('alice').pos = chipPos(88, 4, state.chipSize);
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'walk-through-gate', gateId: 'g-data' });
    expect(result).not.toBeNull();
    expect(state.phase).toBe(PHASE_GOAL_AVAILABLE);
  });

  it('Legacy level (Key + Goal, no GoalPad) keeps V7.5 KEY_HUNT path', function () {
    var def = makeLegacyEndgameLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var room = makeRoom({ alice: chipPos(4, 2, state.chipSize) }, 480);
    tick(state, 200, room);   // refresh player._canvasW
    applyInput(state, 'alice', { kind: 'collect', coinId: 's1' });
    tick(state, 200, room);
    room.members.get('alice').pos = chipPos(30, 4, state.chipSize);
    tick(state, 200, room);
    var result = applyInput(state, 'alice', { kind: 'walk-through-gate', gateId: 'g-data' });
    expect(result).not.toBeNull();
    expect(state.phase).toBe(PHASE_KEY_HUNT);   // Key present -> KEY_HUNT, not GOAL_AVAILABLE
  });
});

describe('V7.14 serialize wire shape', function () {
  beforeEach(function () { _clearCache(); });

  it('emits contextSlots[] + goalPad for Zone-5 levels', function () {
    var def = makeZone5Level();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.contextSlots).toHaveLength(3);
    expect(wire.contextSlots[0]).toEqual({ id: 'cs-q', x: 89, y: 5, label: 'QUESTION', lit: false });
    expect(wire.goalPad).toEqual({ id: 'goal-pad', x: 95, y: 7, presenceMs: 0, triggerMs: 1500 });
  });

  it('emits contextSlots = [] + goalPad = null for legacy levels', function () {
    var def = makeLegacyEndgameLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.contextSlots).toEqual([]);
    expect(wire.goalPad).toBeNull();
  });
});
