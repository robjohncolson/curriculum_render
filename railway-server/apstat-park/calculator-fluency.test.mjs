// Protocol 10 (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC): random data (section 2), clears + rung
// (section 1) and the problem override in calculator_state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { createCalculatorRuntime, varyLevel } from './calculator-runtime.mjs';
import { varyProblem, VARIED_SKILLS, RANDINT_SKILLS } from './calculator-variation.mjs';
import { CALCULATOR_PROBLEMS, DEFAULT_LEVEL, challengeFor, levelById } from './calculator-curriculum.mjs';
import { missionFor } from './calculator-mission.mjs';
import { TEAM_BLOCK, CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { createCalculatorClears, rungFor } from './calculator-clears.mjs';
import { createSupabaseClearsStore } from './calculator-clears-store.mjs';

// Small seeded generator so a failure can be replayed.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const finite = value => Array.isArray(value) ? value.every(Number.isFinite) : Number.isFinite(value);
const variedProblems = CALCULATOR_PROBLEMS.filter(problem => varyProblem(problem, seeded(1)));
// Protocol 11: the randIntNoRep problems are templated (no lists); tested on their own below.
const listProblems = variedProblems.filter(problem => !RANDINT_SKILLS.has(problem.skillId));

test('list-based skills vary; typed-number, interpretation and number-quoting problems do not', () => {
  const skills = new Set(variedProblems.map(problem => problem.skillId));
  for (const skill of ['one-var-stats', 'modified-boxplot', 'histogram', 'scatterplot', 'linreg-a-plus-bx',
    'residual-plot', 't-test-data', 't-interval-data', 'linreg-ttest', 'linreg-tint']) assert(skills.has(skill), skill);
  for (const problem of variedProblems) assert(VARIED_SKILLS.has(problem.skillId), problem.id);
  assert.equal(varyProblem(levelById('binompdf')), null, 'binompdf types its numbers');
  const interpretation = CALCULATOR_PROBLEMS.find(problem => problem.interpretation && problem.skillId === 'one-var-stats');
  assert.equal(varyProblem(interpretation), null, 'interpretation problems play as written');
  assert.equal(varyProblem(levelById('linreg-ttest')), null, 'the stem quotes b and SE_b');
});

test('every varied list problem: 20 rounds replay to a result screen with every expected statistic, finite', () => {
  const random = seeded(20261012);
  for (const problem of listProblems) {
    for (let round = 0; round < 20; round++) {
      const level = varyLevel(problem, random);
      const where = problem.id + ' round ' + round;
      assert.equal(level.varied, true, where + ': varied');
      assert.equal(level.setup.lists.L1.length, problem.setup.lists.L1.length, where + ': list length');
      if (problem.computed) {
        for (const key of Object.keys(problem.computed)) assert(finite(level.computed[key]), where + ': ' + key);
      } else {
        assert.equal(level.finalView.type, problem.finalView.type, where + ': plot type');
        assert(level.finalView.points.every(point => finite(point.x) && finite(point.y)), where + ': points');
        for (const [key, value] of Object.entries(problem.finalView.stats || {})) {
          if (typeof value === 'number') assert(finite(level.finalView.stats[key]), where + ': ' + key);
        }
      }
      if (Array.isArray(problem.finalView.lines)) assert.equal(level.finalView.lines.length, problem.finalView.lines.length, where + ': lines');
      assert(challengeFor(level).answers.every(Number.isFinite), where + ': answers');
      if (round < 2) {
        // The written route still walks the new data, checkpoint by checkpoint.
        const engine = createCalculatorRuntime(level);
        for (let step = 0; step < level.route.length; step++) {
          const next = engine.transitions({ step, keys: level.route.slice(0, step) })[level.route[step]];
          assert(next >= step + 1, where + ': route step ' + step);
        }
      }
    }
  }
});

test('LinReg-family data keeps the sign of its slope; the stem quotes the new lists', () => {
  const random = seeded(7);
  for (const problem of variedProblems.filter(problem => problem.values.x_values)) {
    const level = varyLevel(problem, random);
    const slope = level.computed?.b ?? null;
    if (slope != null) assert.equal(Math.sign(slope), Math.sign(problem.computed.b), problem.id);
  }
  const level = varyLevel(levelById('t-interval-data'), random);
  assert(level.stem.includes(level.values.data.map(value => value.toFixed(1)).join(', ')), level.stem);
});

test('over many seeds every generated list stays inside its catalogue range; fits stay strong', () => {
  const correlation = (x, y) => {
    const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
  };
  for (const problem of variedProblems) {
    for (let seed = 1; seed <= 300; seed++) {
      const level = varyProblem(problem, seeded(seed));
      const where = problem.id + ' seed ' + seed;
      for (const [list, values] of Object.entries(problem.setup.lists)) {
        const lo = Math.min(...values), hi = Math.max(...values);
        assert(level.setup.lists[list].every(value => value >= lo && value <= hi), where + ': ' + list + ' in [' + lo + ', ' + hi + ']');
      }
      if (!problem.values.x_values) continue;
      const before = correlation(problem.values.x_values, problem.values.y_values);
      const after = correlation(level.values.x_values, level.values.y_values);
      assert.equal(Math.sign(after), Math.sign(before), where + ': slope sign');
      if (Math.abs(before) > 0.8) assert(Math.abs(after) > 0.5, where + ': r ' + after.toFixed(3) + ' (catalogue ' + before.toFixed(3) + ')');
    }
  }
});

// ---- the relay: clears, rung and the problem override in calculator_state ----

function setup(options = {}) {
  let time = -12000;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map();
  const service = createCalculatorService({ registry, now: () => time, available: () => [DEFAULT_LEVEL], ...options,
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  const a = {}, b = {};
  function join(ws, name) {
    registry.join(ws, 'B', name, 'student', time);
    return service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL });
  }
  function send(ws, type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  }
  function press(ws, keys) { for (const key of keys) send(ws, 'calculator_press', { key }); }
  function startRound() {
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
    for (const [ws, name] of [[a, 'alice'], [b, 'bob']]) join(ws, name);
  }
  join(a, 'alice'); join(b, 'bob');
  startRound();
  // The round's own answers: the override's when the data varied.
  const solve = ws => {
    const state = packets.get(ws), level = missionFor(state);
    press(ws, [...level.route, ...challengeFor(level).answers.map(String)]);
  };
  return { a, b, service, press, solve, startRound, send, state: ws => packets.get(ws), lobby: ws => lobbies.get(ws) };
}

test('a varied round sends its problem; the relay judges the varied answers', () => {
  const f = setup({ varyData: true, random: seeded(3) });
  try {
    const problem = f.state(f.a).problem;
    assert(problem, 'calculator_state.problem is set');
    assert.deepEqual(Object.keys(problem).sort(), ['computed', 'finalView', 'hints', 'route', 'setup', 'stem', 'values']);
    assert.notDeepEqual(problem.values.data, DEFAULT_LEVEL.values.data);
    assert.deepEqual(problem.setup.lists.L1, problem.values.data);
    assert.deepEqual(f.state(f.b).problem, problem, 'every member gets the same data');
    const answers = challengeFor(missionFor(f.state(f.a))).answers;
    assert.deepEqual(answers, [problem.computed.minX, problem.computed.Q1, problem.computed.Med, problem.computed.Q3, problem.computed.maxX]);
    f.solve(f.a); f.solve(f.b);
    assert.equal(f.state(f.a).complete, true);
  } finally { f.service.close(); }
});

// Protocol 11: a randIntNoRep round is a fresh problem with its own route; the relay judges that route.
test('a randint round sends its route and the relay judges the varied seed, not the catalogue seed', () => {
  const catalogue = levelById('randint-sampling');
  // A seeded round whose first seed digit differs from the catalogue's (4 of 42).
  let f = null;
  for (let seed = 1; seed < 50 && !f; seed++) {
    const candidate = setup({ varyData: true, random: seeded(seed), available: () => [catalogue] });
    if (candidate.state(candidate.a).problem.route[0] !== catalogue.route[0]) f = candidate;
    else candidate.service.close();
  }
  assert(f, 'a round with a different first seed digit');
  try {
    const problem = f.state(f.a).problem;
    assert.equal(f.state(f.a).missionId, 'randint-sampling');
    assert.equal(problem.route.length, catalogue.route.length, 'same route length');
    assert.notDeepEqual(problem.values, catalogue.values);
    assert.deepEqual(problem.route.slice(0, String(problem.values.seed).length), [...String(problem.values.seed)]);
    assert(problem.stem.includes('Seed your calculator with ' + problem.values.seed + ','), problem.stem);
    assert.equal(problem.goals[0], 'Store ' + problem.values.seed + ' as the rand seed');
    const draw = problem.finalView.at(-1).replace(/[{}]/g, '').split(' ').map(Number);
    assert.deepEqual(challengeFor(missionFor(f.state(f.a))).answers, draw, 'the answers are the varied draw');
    f.press(f.a, [catalogue.route[0]]);
    assert.equal(f.state(f.a).step, 0, 'the catalogue seed digit does not advance');
    f.send(f.a, 'calculator_press', { key: 'CLEAR' });
    f.press(f.a, [problem.route[0]]);
    assert.equal(f.state(f.a).step, 1, 'the varied seed digit advances');
    f.press(f.a, [...problem.route.slice(1), ...draw.map(String)]);
    f.solve(f.b);
    assert.equal(f.state(f.a).complete, true, 'the varied route and draw win the round');
  } finally { f.service.close(); }
});

test('varyLevel: a randint variation whose route would change length falls back to the catalogue', () => {
  const catalogue = levelById('randint-assignment');
  const broken = { ...catalogue, hints: catalogue.hints.slice(1) };
  const warn = console.warn; const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    assert.equal(varyLevel(broken, seeded(2)), broken);
  } finally { console.warn = warn; }
  assert.match(warnings.join('\n'), /randint-assignment/);
  for (const id of ['randint-sampling', 'randint-sampling@1', 'randint-sampling@2', 'randint-assignment', 'randint-assignment@1']) {
    const level = varyLevel(levelById(id), seeded(id.length));
    assert.equal(level.varied, true, id);
    assert.equal(level.route.length, levelById(id).route.length, id);
  }
});

test('without varyData the round is the catalogue problem (problem: null)', () => {
  const f = setup();
  try {
    assert.equal(f.state(f.a).problem, null);
  } finally { f.service.close(); }
});

test('clears and rung: one clear per student per completed round, for that round\'s skill', () => {
  const clears = createCalculatorClears();
  const f = setup({ clears });
  try {
    assert.equal(f.state(f.a).clears, 0);
    assert.equal(f.state(f.a).rung, 0);
    f.solve(f.a); f.solve(f.b);
    assert.equal(f.state(f.a).complete, true);
    assert.equal(f.state(f.a).clears, 1);
    assert.equal(f.state(f.a).rung, 1);
    f.service.tick(); f.service.tick();
    assert.equal(clears.clearsOf('B', 'alice', 'one-var-stats'), 1, 'counted once per round');
    f.send(f.a, 'calculator_restart');
    f.startRound();
    f.solve(f.a); f.solve(f.b);
    f.service.tick();
    assert.equal(f.state(f.b).clears, 2);
    assert.equal(f.state(f.b).rung, 2);
    f.send(f.a, 'calculator_restart');
    f.startRound();
    f.solve(f.a); f.solve(f.b);
    assert.equal(f.state(f.b).clears, 3);
    assert.equal(f.state(f.b).rung, 2, 'the rung stops at 2');
    assert.equal(clears.clearsOf('B', 'alice', 'histogram'), 0, 'per skill');
  } finally { f.service.close(); }
});

test('rungFor: 0 never cleared, 1 once, 2 twice or more', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(rungFor), [0, 1, 2, 2, 2]);
});

const flushed = () => new Promise(resolve => setTimeout(resolve, 0));

// A tiny stand-in for the supabase-js query builder: select().eq().order().order().range() and
// upsert(). Like PostgREST, one response never holds more than maxRows rows.
function fakeClient({ rows = [], error = null, maxRows = 1000 } = {}) {
  const upserts = [], ranges = [];
  return {
    upserts, ranges,
    from(table) {
      assert.equal(table, 'park_calc_clears');
      const query = { section: null, orders: [] };
      const builder = {
        eq(column, value) { assert.equal(column, 'section'); query.section = value; return builder; },
        order(column) { query.orders.push(column); return builder; },
        async range(from, to) {
          ranges.push([from, to]);
          if (error) return { data: null, error };
          assert.deepEqual(query.orders, ['username', 'skill_id'], 'a stable order for paging');
          const matching = rows.filter(row => row.section === query.section)
            .sort((x, y) => x.username.localeCompare(y.username) || x.skill_id.localeCompare(y.skill_id));
          return { data: matching.slice(from, Math.min(to + 1, from + maxRows)), error: null };
        },
      };
      return {
        select: () => builder,
        upsert: async (records, options) => {
          if (error) return { error };
          upserts.push({ records, options });
          return { error: null };
        },
      };
    },
  };
}

test('clears persist through the store: load once, add on top, write absolute changed rows', async () => {
  const client = fakeClient({ rows: [{ section: 'B', username: 'alice', skill_id: 'histogram', clears: 4 }] });
  const clears = createCalculatorClears({ store: createSupabaseClearsStore(client), now: () => 0, log: () => {} });
  clears.record('B', ['alice', 'bob'], 'histogram');
  await flushed(); await flushed();
  assert.equal(clears.clearsOf('B', 'alice', 'histogram'), 5, 'a clear before the load adds on top of the stored count');
  assert.equal(clears.clearsOf('B', 'bob', 'histogram'), 1);
  clears.flush();
  await flushed(); await flushed();
  assert.equal(client.upserts.length, 1);
  assert.equal(client.upserts[0].options.onConflict, 'section,username,skill_id');
  const written = client.upserts[0].records.map(({ section, username, skill_id, clears }) => ({ section, username, skill_id, clears }));
  assert.deepEqual(written.sort((x, y) => x.username.localeCompare(y.username)), [
    { section: 'B', username: 'alice', skill_id: 'histogram', clears: 5 },
    { section: 'B', username: 'bob', skill_id: 'histogram', clears: 1 },
  ]);
  assert.equal(clears.unsaved('B'), false);
  clears.flush();
  await flushed();
  assert.equal(client.upserts.length, 1, 'nothing changed, nothing written');
});

test('a section with more rows than one PostgREST response loads completely (paged)', async () => {
  const rows = [];
  for (let student = 0; student < 50; student++) {
    for (let skill = 0; skill < 26; skill++) rows.push({ section: 'B', username: 's' + String(student).padStart(2, '0'),
      skill_id: 'skill' + String(skill).padStart(2, '0'), clears: 3 });
  }
  const client = fakeClient({ rows });
  const loaded = await createSupabaseClearsStore(client).load('B');
  assert.equal(rows.length, 1300);
  assert.equal(loaded.length, 1300, 'every row, not the first 1000');
  assert.equal(new Set(loaded.map(row => row.username + '/' + row.skillId)).size, 1300, 'no row twice');
  assert.deepEqual(client.ranges, [[0, 499], [500, 999], [1000, 1499]]);
  // Through the clears module, a recorded clear adds on top of the stored 3 instead of writing 1.
  const clears = createCalculatorClears({ store: createSupabaseClearsStore(fakeClient({ rows })), now: () => 0, log: () => {} });
  clears.record('B', ['s49'], 'skill25');
  await flushed(); await flushed(); await flushed(); await flushed();
  assert.equal(clears.clearsOf('B', 's49', 'skill25'), 4);
});

test('a missing park_calc_clears table (migration 0008 not run) leaves the relay memory-only', async () => {
  for (const code of ['42P01', 'PGRST205']) {
    const client = fakeClient({ error: { code, message: 'relation does not exist' } }), logs = [];
    const clears = createCalculatorClears({ store: createSupabaseClearsStore(client), now: () => 0, log: (...args) => logs.push(args) });
    clears.ensure('B');
    await flushed(); await flushed();
    clears.record('B', ['alice'], 'histogram');
    clears.record('B', ['alice'], 'histogram');
    clears.flush();
    await flushed();
    assert.equal(clears.clearsOf('B', 'alice', 'histogram'), 2, code + ': counts in memory');
    assert.equal(client.upserts.length, 0, code + ': no writes');
    assert.equal(clears.unsaved('B'), false);
    assert.equal(logs.length, 1, code + ': logged once');
  }
});

test('a failed write is retried after retryMs', async () => {
  let time = 0, fail = true;
  const upserts = [];
  const store = {
    load: async () => [],
    save: async (section, rows) => { if (fail) throw new Error('network'); upserts.push(rows); },
  };
  const clears = createCalculatorClears({ store, now: () => time, log: () => {}, retryMs: 1000 });
  clears.record('B', ['alice'], 'histogram');
  await flushed();
  clears.flush(); await flushed(); await flushed();
  assert.equal(clears.unsaved('B'), true);
  fail = false;
  clears.flush(); await flushed();
  assert.equal(upserts.length, 0, 'waits for retryMs');
  time = 1000;
  clears.flush(); await flushed(); await flushed();
  assert.deepEqual(upserts, [[{ username: 'alice', skillId: 'histogram', clears: 1 }]]);
});
