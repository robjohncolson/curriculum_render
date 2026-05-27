// level-engine-tally-chute.test.js
// Unit tests for V7.11 Zone 3 Tally Machine. TallyChute is a pure-
// visual actor: parsed into state.tallyChutes[] + serialized for the
// client; no engine state machine change. The chute's count comes
// from the EXISTING state.tally.sips[label] (V7.4 wire field).
//
// Contract: LIVE_CLASSROOM_V7_11_BUILD.md sections 1-4.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createLevelState,
  serialize,
  _clearCache
} from '../level-engine.js';

function makeChuteLevel() {
  return {
    schema:    'v7-level-1',
    levelKey:  'TEST.CHUTE',
    lessonKey: 'TEST.CHUTE',
    map: { width: 48, height: 8, chipSize: 10 },
    actors: [
      { type: 'PlayerSpawn', x: 4, y: 4 },
      { type: 'SipStation',  id: 's1', x: 4,  y: 2, drink: 'A' },
      { type: 'SipStation',  id: 's2', x: 28, y: 2, drink: 'B' },
      { type: 'TallyChute',  id: 'tc-A', x: 32, y: 5, label: 'A' },
      { type: 'TallyChute',  id: 'tc-B', x: 34, y: 5, label: 'B' },
      { type: 'Goal',        x: 47, y: 7 }
    ]
  };
}

describe('V7.11 TallyChute actor -- createLevelState parsing', function () {
  beforeEach(function () { _clearCache(); });

  it('populates state.tallyChutes[] with id/x/y/label fields', function () {
    var def = makeChuteLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.tallyChutes).toHaveLength(2);
    expect(state.tallyChutes[0]).toEqual({ id: 'tc-A', x: 32, y: 5, label: 'A' });
    expect(state.tallyChutes[1]).toEqual({ id: 'tc-B', x: 34, y: 5, label: 'B' });
  });

  it('emits state.tallyChutes = [] for levels without TallyChute actors', function () {
    var def = makeChuteLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'TallyChute'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.tallyChutes).toEqual([]);
  });

  it('default label = "A" when not specified', function () {
    var def = makeChuteLevel();
    def.actors.push({ type: 'TallyChute', id: 'tc-no-label', x: 36, y: 5 });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var noLabel = state.tallyChutes.filter(function (c) { return c.id === 'tc-no-label'; })[0];
    expect(noLabel.label).toBe('A');
  });

  it('auto-id when none provided', function () {
    var def = makeChuteLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'TallyChute'; });
    def.actors.push({ type: 'TallyChute', x: 32, y: 5, label: 'A' });
    def.actors.push({ type: 'TallyChute', x: 34, y: 5, label: 'B' });
    var state = createLevelState(def, [{ username: 'alice' }]);
    expect(state.tallyChutes[0].id).toBe('chute-0');
    expect(state.tallyChutes[1].id).toBe('chute-1');
  });
});

describe('V7.11 TallyChute -- serialize wire shape', function () {
  beforeEach(function () { _clearCache(); });

  it('emits tallyChutes[] with id/x/y/label (no count field)', function () {
    var def = makeChuteLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.tallyChutes).toHaveLength(2);
    expect(wire.tallyChutes[0]).toEqual({ id: 'tc-A', x: 32, y: 5, label: 'A' });
    expect(wire.tallyChutes[0]).not.toHaveProperty('count');
  });

  it('emits tallyChutes = [] for legacy levels (backward compat)', function () {
    var def = makeChuteLevel();
    def.actors = def.actors.filter(function (a) { return a.type !== 'TallyChute'; });
    var state = createLevelState(def, [{ username: 'alice' }]);
    var wire = serialize(state);
    expect(wire.tallyChutes).toEqual([]);
  });

  it('chute count comes from the EXISTING state.tally.sips (not chute state)', function () {
    // V7.11 design: TallyChute carries no count. The client reads
    // state.tally.sips[label] directly. Pin: tally.sips is wire-
    // visible (V7.4 field, unchanged), and tallyChutes doesn't
    // duplicate the count. Source-of-truth is unambiguous.
    var def = makeChuteLevel();
    var state = createLevelState(def, [{ username: 'alice' }]);
    state.tally.sips.A = 5;
    state.tally.sips.B = 3;
    var wire = serialize(state);
    expect(wire.tally.sips.A).toBe(5);
    expect(wire.tally.sips.B).toBe(3);
    expect(wire.tallyChutes[0].label).toBe('A');   // chute carries label only
    expect(wire.tallyChutes[1].label).toBe('B');
  });
});
