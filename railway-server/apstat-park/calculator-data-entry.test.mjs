// ABSORB_2_SPEC §2: data-entry steps. The engine proof (every list/matrix problem, typed into an
// empty calculator, ends in the same state as the catalogue's pre-loaded round), the wrong-key
// judgement during the prefix, and the relay rule (solo rung 1+ only; rung 0 and team pre-loaded).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from './calculator-native/manifest.mjs';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { createCalculatorRuntime, varyLevel } from './calculator-runtime.mjs';
import { withDataEntry, hasEntryData, dataEntryRoute, DATA_ENTRY_SKIPPED, DATA_ENTRY_MAX_KEYS } from './calculator-data-entry.mjs';
import { CALCULATOR_PROBLEMS, DEFAULT_LEVEL, challengeFor, levelById } from './calculator-curriculum.mjs';
import { createMission, pressMissionKey, missionFor, NEVER_WRONG } from './calculator-mission.mjs';
import { CALCULATOR_PROTOCOL, TEAM_BLOCK } from './calculator-lobby.mjs';
import { createCalculatorClears } from './calculator-clears.mjs';

const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) vm.runInContext(readFileSync(new URL('./calculator-native/' + file, import.meta.url), 'utf8'), sandbox);
const create = sandbox.window.TI84Native.create;

function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The calculator after the level's route from its own setup: what the student ends up looking at.
function finalState(level) {
  let rendered = null;
  const renderer = Object.fromEntries(['Home', 'Menu', 'Wizard', 'Result', 'Editor', 'Graph']
    .map(name => ['render' + name, value => { rendered = value; }]));
  const calculator = create(null, { renderer });
  for (const [name, values] of Object.entries(level.setup.lists || {})) calculator.setList(name, values);
  for (const [name, values] of Object.entries(level.setup.matrices || {})) calculator.setMatrix(name, values);
  if (level.setup.histogramWindow) calculator.setHistogramWindow(level.setup.histogramWindow);
  for (const key of level.route) calculator.pressKey(key);
  // JSON round trip: the sandbox's arrays are another realm's (deepStrictEqual compares prototypes).
  const snapshot = JSON.parse(JSON.stringify(calculator.save()));
  return { lists: snapshot.lists, matrices: snapshot.matrices, screen: snapshot.screen, rendered: JSON.parse(JSON.stringify(rendered)),
    computed: JSON.parse(JSON.stringify(calculator.getComputedValues() ?? null)) };
}

// The calculator after only the prefix: the data must be in, and we must be home.
function afterPrefix(level) {
  const calculator = create(null, {});
  for (const key of level.route.slice(0, level.dataSteps)) calculator.pressKey(key);
  return JSON.parse(JSON.stringify(calculator.save()));
}

// Every press of the route through the relay's own judgement: each key is a transition, never wrong.
function walk(level) {
  const engine = createCalculatorRuntime(level);
  const state = createMission(0, level);
  let time = 0;
  for (const key of level.route) {
    const before = state.step;
    pressMissionKey(state, key, ++time, engine.transitions(state), candidate => engine.isWrongKey(state, candidate));
    assert(state.step > before, level.id + ': ' + key + ' at step ' + before + ' did not advance');
    assert.equal(state.wrongKeys, 0, level.id + ': ' + key + ' at step ' + before + ' judged wrong');
  }
  return state;
}

// The engine proof covers every problem, including the ones over DATA_ENTRY_MAX_KEYS (which play
// pre-loaded in a round): the cap is a pacing decision, the key path is still proven to work.
function forceEntry(problem) {
  const prefix = dataEntryRoute(problem.setup);
  return { ...problem, setup: { ...problem.setup, lists: {}, matrices: {} }, entryData: problem.setup,
    route: [...prefix.route, ...problem.route], hints: [...prefix.hints, ...problem.hints],
    goals: [...prefix.goals, ...problem.route.map((_, step) => problem.goals?.[step] || problem.hints[step])],
    dataSteps: prefix.route.length };
}

function proveEntry(problem, where) {
  const capped = dataEntryRoute(problem.setup).route.length > DATA_ENTRY_MAX_KEYS;
  if (capped) assert.equal(withDataEntry(problem), problem, where + ': over the cap, plays pre-loaded');
  else assert(withDataEntry(problem).dataSteps > 0, where + ': has a prefix');
  const typed = capped ? forceEntry(problem) : withDataEntry(problem);
  const prefix = afterPrefix(typed);
  assert.equal(prefix.screen.type, 'home', where + ': the prefix ends on the home screen');
  for (const [name, values] of Object.entries(problem.setup.lists)) assert.deepEqual(prefix.lists[name], values, where + ': ' + name);
  if (problem.setup.matrices?.['[A]']) assert.deepEqual(prefix.matrices['[A]'], problem.setup.matrices['[A]'], where + ': [A]');
  assert.deepEqual(finalState(typed), finalState(problem), where + ': same final screen and computed values');
  const state = walk(typed);
  assert.equal(state.step, typed.route.length, where + ': the whole route walks');
  assert.deepEqual(challengeFor(missionFor(state)).answers, challengeFor(problem).answers, where + ': same answers');
}

const entryProblems = CALCULATOR_PROBLEMS.filter(hasEntryData);

test('the 13 list/matrix skills all get a data-entry prefix; nothing is skipped', () => {
  const skills = [...new Set(entryProblems.map(problem => problem.skillId))].sort();
  assert.deepEqual(skills, ['chi-square-gof-test', 'chi-square-test', 'dotplot', 'histogram', 'linreg-a-plus-bx',
    'linreg-tint', 'linreg-ttest', 'modified-boxplot', 'one-var-stats', 'residual-plot', 'scatterplot',
    't-interval-data', 't-test-data']);
  assert.deepEqual(DATA_ENTRY_SKIPPED, {});
  assert.equal(hasEntryData(levelById('matrix-entry')), false, 'matrix-entry IS the entry: its setup is empty');
});

test('engine proof: every catalogue list/matrix problem typed into an empty calculator ends where the pre-loaded one does', () => {
  for (const problem of entryProblems) proveEntry(problem, problem.id);
});

test('engine proof: varied rounds type their own numbers and still end where the pre-loaded varied round does', () => {
  const random = seeded(20261018);
  let proved = 0;
  for (const problem of entryProblems) {
    for (let round = 0; round < 2; round++) {
      const varied = varyLevel(problem, random);
      if (!varied.varied) continue;
      proveEntry(varied, problem.id + ' varied ' + round);
      proved++;
    }
  }
  assert(proved >= 40, 'varied rounds proved: ' + proved);
});

test('during the prefix a wrong digit is charged; arrows, CLEAR and an empty ENTER are not; CLEAR recovers', () => {
  const level = withDataEntry(levelById('one-var-stats'));
  const engine = createCalculatorRuntime(level);
  const state = createMission(0, level);
  const press = (key, time) => pressMissionKey(state, key, time, engine.transitions(state), candidate => engine.isWrongKey(state, candidate));
  press('STAT', 1); press('ENTER', 2);
  assert.equal(state.step, 2, 'in the list editor, on the first value');
  const first = String(level.entryData.lists.L1[0]);
  for (const key of ['UP', 'DOWN', 'LEFT', 'CLEAR']) {
    assert(NEVER_WRONG.has(key));
    press(key, 3);
    assert.equal(state.wrongKeys, 0, key + ' is never wrong');
  }
  press('RIGHT', 3); press('LEFT', 3);
  assert.equal(state.wrongKeys, 0);
  press('ENTER', 4);
  assert.equal(state.wrongKeys, 0, 'ENTER with nothing typed changes nothing: free');
  const wrongDigit = first[0] === '9' ? '8' : '9';
  press(wrongDigit, 5);
  assert.equal(state.wrongKeys, 1, 'a wrong digit counts as a wrong key');
  assert.equal(state.lastPress.penaltyMs, 2000, 'and costs the usual 2 s');
  assert.equal(state.step, 2);
  press('CLEAR', 10000);
  assert.equal(state.wrongKeys, 1, 'CLEAR backs out for free');
  press(first[0], 10001);
  assert.equal(state.step, 3, 'the right digit after CLEAR advances');
});

test('withDataEntry keeps the catalogue goals for every step after the prefix', () => {
  const problem = levelById('linreg-a-plus-bx');
  const typed = withDataEntry(problem);
  assert.equal(typed.goals.length, typed.route.length);
  assert.equal(typed.hints.length, typed.route.length);
  assert(typed.goals.every(goal => typeof goal === 'string' && goal.length), 'no step without a goal');
  assert.deepEqual(typed.route.slice(typed.dataSteps), problem.route);
  assert.deepEqual(typed.entryData, problem.setup);
  assert.deepEqual(typed.setup.lists, {});
});

// ---- the relay ----

function soloSetup(skill, clearsBefore) {
  let time = 0;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map();
  const clears = createCalculatorClears({ now: () => time, log: () => {} });
  if (clearsBefore) clears.record('B', ['alice'], skill, { alice: clearsBefore });
  const service = createCalculatorService({ registry, now: () => time, available: () => [DEFAULT_LEVEL], varyData: true,
    random: seeded(5), clears, log: () => {},
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  const ws = {};
  registry.join(ws, 'B', 'alice', 'student', time);
  service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill });
  const send = (type, extra = {}) => {
    const state = packets.get(ws);
    service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  };
  send('calculator_pick', { skill });
  return { service, state: () => packets.get(ws), send };
}

test('solo at rung 0: the lists are pre-loaded and the route is the catalogue\'s', () => {
  const f = soloSetup('one-var-stats', 0);
  try {
    const state = f.state(), level = missionFor(state);
    assert.equal(state.rung, 0);
    assert.equal(level.dataSteps, undefined);
    assert(level.setup.lists.L1.length > 0, 'pre-loaded');
    assert.equal(level.route[0], 'STAT');
    assert.equal(level.route.length, levelById(state.missionId).route.length);
  } finally { f.service.close(); }
});

test('solo at rung 1: an empty calculator, the prefix first, and typing the round\'s data completes the round', () => {
  for (const skill of ['one-var-stats', 'chi-square-test']) {
    const f = soloSetup(skill, 1);
    try {
      const state = f.state(), level = missionFor(state);
      assert.equal(state.rung, 1);
      assert(state.problem.dataSteps > 0, skill + ': the round state carries dataSteps');
      assert.equal(level.dataSteps, state.problem.dataSteps);
      assert.deepEqual(level.setup.lists, {}, skill + ': the calculator starts empty');
      assert.deepEqual(level.setup.matrices, {});
      assert(level.entryData, skill + ': entryData rides in state.problem');
      assert.equal(level.goals.length, level.route.length);
      for (const key of [...level.route, ...challengeFor(level).answers.map(String)]) f.send('calculator_press', { key });
      assert.equal(f.state().complete, true, skill + ': the typed round completes');
      assert.equal(f.state().wrongKeys, 0);
    } finally { f.service.close(); }
  }
});

test('a team round never enters data, whatever the rung', () => {
  let time = -12000;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map();
  const clears = createCalculatorClears({ now: () => time, log: () => {} });
  clears.record('B', ['alice', 'bob'], 'one-var-stats', { alice: 5, bob: 5 });
  const service = createCalculatorService({ registry, now: () => time, available: () => [DEFAULT_LEVEL], clears, log: () => {},
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  const a = {}, b = {};
  const join = (ws, name) => { registry.join(ws, 'B', name, 'student', time);
    service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL }); };
  try {
    join(a, 'alice'); join(b, 'bob');
    for (const ws of [a, b]) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      pose: { x: TEAM_BLOCK.start - 20, y: 676 }, pushing: true });
    while (lobbies.get(a).phase === 'gathering') {
      for (const ws of [a, b]) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
        pose: { x: lobbies.get(a).blockX - 20, y: 676 }, pushing: true });
      time += 100; service.tick();
    }
    for (const ws of [a, b]) service.handle(ws, { type: 'calculator_lobby', protocol: CALCULATOR_PROTOCOL,
      epoch: lobbies.get(ws).epoch, pose: { x: TEAM_BLOCK.dock - 20, y: 676 }, ready: true });
    service.tick();
    join(a, 'alice'); join(b, 'bob');
    const state = packets.get(a);
    assert.equal(state.rung, 2);
    const level = missionFor(state);
    assert.equal(level.dataSteps, undefined, 'no prefix in a team round');
    assert(level.setup.lists.L1.length > 0, 'the lists are pre-loaded');
  } finally { service.close(); }
});
