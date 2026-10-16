// Protocol 15 (APSTAT_PARK_TRAINER_ABSORB_SPEC §5): spaced recall on the relay. The SM-2 port,
// the quality of a round, the mastery rule, the state module's memory/store behaviour, the
// service hook on every completed round, the due list, and the solo room's "first due skill".
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { ROUND_MS, missionFor } from './calculator-mission.mjs';
import { DEFAULT_LEVEL, levelById, challengeFor } from './calculator-curriculum.mjs';
import { CALCULATOR_PROTOCOL } from './calculator-lobby.mjs';
import { createCalculatorClears } from './calculator-clears.mjs';
import { createCalculatorSrs } from './calculator-srs-state.mjs';
import { advance, qualityFor, isMasteryClear, freshRecord, dueSkills, addDays, daysBetween, EASE_FLOOR } from './calculator-srs.mjs';
import { rowToRecord, recordToRow } from './calculator-srs-store.mjs';

// ---- the pure port ----

test('acceptance: quality 5 twice on consecutive days puts the next review six days out', () => {
  let record = freshRecord();
  record = advance(record, 5, '2026-10-16');
  assert.equal(record.intervalDays, 1);
  assert.equal(record.nextReview, '2026-10-17');
  record = advance(record, 5, '2026-10-17');
  assert.equal(record.intervalDays, 6);
  assert.equal(record.nextReview, '2026-10-23');
  assert.equal(record.repetitions, 2);
  assert.ok(record.ease > 2.5, 'ease grows at quality 5');
});

test('acceptance: a quality 2 clear resets the schedule to tomorrow', () => {
  let record = freshRecord();
  for (const day of ['2026-10-16', '2026-10-17', '2026-10-23']) record = advance(record, 5, day);
  assert.ok(record.intervalDays > 6, 'third repetition is interval x ease');
  record = advance(record, 2, '2026-11-02');
  assert.equal(record.repetitions, 0);
  assert.equal(record.intervalDays, 1);
  assert.equal(record.nextReview, '2026-11-03');
  assert.equal(record.lastQuality, 2);
});

test('the v2 numbers: 1, 6, then round(interval x ease); ease floor 1.3', () => {
  let record = { ...freshRecord(), ease: 2.5 };
  record = advance(record, 4, '2026-01-01');   // interval 1, ease 2.5
  record = advance(record, 4, '2026-01-02');   // interval 6
  record = advance(record, 4, '2026-01-08');   // round(6 * 2.5) = 15
  assert.equal(record.intervalDays, 15);
  assert.equal(record.ease, 2.5);
  let floor = freshRecord();
  for (let i = 0; i < 10; i++) floor = advance(floor, 0, '2026-01-01');
  assert.equal(floor.ease, EASE_FLOOR);
});

test('property: interval never below 1 and ease never below 1.3, whatever the qualities', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 60 }), qualities => {
    let record = freshRecord(), day = '2026-09-01';
    for (const quality of qualities) {
      record = advance(record, quality, day);
      if (record.intervalDays < 1 || record.ease < EASE_FLOOR) return false;
      if (daysBetween(day, record.nextReview) !== record.intervalDays) return false;
      day = record.nextReview;
    }
    return true;
  }), { numRuns: 300 });
});

test('qualityFor: 5, minus wrong keys beyond the first, a time-up restart, a wrong pick; floor 0', () => {
  assert.equal(qualityFor({ wrongKeys: 0, timeoutCount: 0, recognition: null }), 5);
  assert.equal(qualityFor({ wrongKeys: 1 }), 5, 'the first wrong key is free');
  assert.equal(qualityFor({ wrongKeys: 3 }), 3);
  assert.equal(qualityFor({ wrongKeys: 0, timeoutCount: 2 }), 4, 'one point however many restarts');
  assert.equal(qualityFor({ recognition: { picked: 'x', correct: false } }), 4);
  assert.equal(qualityFor({ recognition: { picked: 'x', correct: true } }), 5);
  assert.equal(qualityFor({ wrongKeys: 9, timeoutCount: 1, recognition: { correct: false } }), 0);
  assert.equal(qualityFor(null), 5);
});

test('mastery: solo, hint rung 2, quality >= 4; never a team clear', () => {
  assert.equal(isMasteryClear({ solo: true, rung: 2, quality: 4 }), true);
  assert.equal(isMasteryClear({ solo: true, rung: 2, quality: 3 }), false);
  assert.equal(isMasteryClear({ solo: true, rung: 1, quality: 5 }), false);
  assert.equal(isMasteryClear({ solo: false, rung: 2, quality: 5 }), false);
});

test('dueSkills: due today or earlier, most overdue first; store rows round-trip', () => {
  const records = { a: { ...freshRecord(), nextReview: '2026-10-10' }, b: { ...freshRecord(), nextReview: '2026-10-16' },
    c: { ...freshRecord(), nextReview: '2026-10-20' }, d: freshRecord() };
  assert.deepEqual(dueSkills(records, '2026-10-16').map(e => [e.skillId, e.overdueDays]), [['a', 6], ['b', 0]]);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const record = { repetitions: 2, intervalDays: 6, ease: 2.6, nextReview: '2026-10-23', lastQuality: 5, mastered: true };
  assert.deepEqual(rowToRecord(recordToRow('park:periods-b-e', 'alice', 'one-var-stats', record, 'now')), record);
});

// ---- the state module ----

function fakeStore({ rows = [], failLoads = 0, missing = false } = {}) {
  const saved = [];
  return { saved,
    async load() {
      if (missing) throw Object.assign(new Error('missing'), { missingTable: true });
      if (failLoads > 0) { failLoads--; throw new Error('load failed'); }
      return rows;
    },
    async save(section, batch) { saved.push({ section, batch }); } };
}
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

test('state: a round advances the record; a load in flight never overwrites it; changed rows are saved whole', async () => {
  let time = 0;
  const store = fakeStore({ rows: [{ username: 'alice', skillId: 'one-var-stats', record: { ...freshRecord(), repetitions: 1, intervalDays: 1, nextReview: '2026-10-16' } },
    { username: 'bob', skillId: 'one-var-stats', record: { ...freshRecord(), repetitions: 3, intervalDays: 15, nextReview: '2026-10-30' } }] });
  const srs = createCalculatorSrs({ store, now: () => time, log: () => {} });
  srs.ensure('S');
  // Alice clears before the load resolves: her memory record is newer than the stored row.
  const first = srs.record('S', 'alice', 'one-var-stats', 5, '2026-10-16');
  assert.equal(first.record.intervalDays, 1);
  await flushMicrotasks();
  assert.equal(srs.recordOf('S', 'alice', 'one-var-stats').nextReview, '2026-10-17', 'the newer record won');
  assert.equal(srs.recordOf('S', 'bob', 'one-var-stats').repetitions, 3, 'the stored row loaded');
  srs.flush(); await flushMicrotasks();
  assert.equal(store.saved.length, 1);
  assert.deepEqual(store.saved[0].batch.map(row => row.username), ['alice']);
  assert.equal(store.saved[0].batch[0].record.nextReview, '2026-10-17');
  assert.equal(srs.unsaved('S'), false);
  assert.deepEqual(srs.due('S', 'bob', '2026-11-01').map(e => e.skillId), ['one-var-stats']);
});

test('state: no store or a missing table keeps records memory-only; a failed load is retried', async () => {
  const memory = createCalculatorSrs({ log: () => {} });
  memory.record('S', 'alice', 'normalcdf', 4, '2026-10-16');
  assert.equal(memory.recordOf('S', 'alice', 'normalcdf').intervalDays, 1);
  memory.flush();
  const missing = createCalculatorSrs({ store: fakeStore({ missing: true }), log: () => {} });
  missing.ensure('S'); await flushMicrotasks();
  missing.record('S', 'alice', 'normalcdf', 4, '2026-10-16');
  assert.equal(missing.unsaved('S'), false, 'nothing queued for a missing table');
  let time = 0;
  const flaky = fakeStore({ failLoads: 1, rows: [{ username: 'alice', skillId: 'invnorm', record: { ...freshRecord(), nextReview: '2026-10-01' } }] });
  const retry = createCalculatorSrs({ store: flaky, now: () => time, log: () => {}, retryMs: 1000 });
  retry.ensure('S'); await flushMicrotasks();
  assert.equal(retry.recordOf('S', 'alice', 'invnorm'), null, 'first load failed');
  time = 1000; retry.flush(); await flushMicrotasks();
  assert.equal(retry.recordOf('S', 'alice', 'invnorm').nextReview, '2026-10-01', 'retried after retryMs');
  const mastered = retry.master('S', 'alice', 'invnorm', '2026-10-16');
  assert.equal(mastered.masteredNow, true);
  assert.equal(retry.master('S', 'alice', 'invnorm', '2026-10-16').masteredNow, false, 'once');
});

// ---- the service ----

function setup({ available = () => [DEFAULT_LEVEL], wallDay = '2026-10-16', clearsSeed = 0 } = {}) {
  let time = 0, day = wallDay;
  const registry = createClassroomRegistry(), packets = new Map(), lobbies = new Map(), mastered = [];
  const clears = createCalculatorClears({ now: () => time, log: () => {} });
  const srs = createCalculatorSrs({ now: () => time, log: () => {} });
  for (let i = 0; i < clearsSeed; i++) clears.record('B', ['alice'], 'one-var-stats');
  const service = createCalculatorService({ registry, now: () => time, wallNow: () => Date.parse(day + 'T16:00:00Z'), available, varyData: false,
    clears, srs, onMastery: event => mastered.push(event), log: () => {},
    send: (ws, packet) => (packet.type === 'calculator_lobby_state' ? lobbies : packets).set(ws, packet) });
  function joinSolo(ws, name, skill) {
    registry.join(ws, 'B', name, 'student', time);
    const reply = service.handle(ws, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill });
    pick(ws);
    return reply;
  }
  function send(ws, type, extra = {}) {
    const state = packets.get(ws);
    return service.handle(ws, { type, epoch: state.epoch, revision: state.revision, ...extra });
  }
  function pick(ws) {
    const state = packets.get(ws);
    if (state?.recognition && !state.recognition.picked) send(ws, 'calculator_pick', { skill: levelById(state.missionId).skillId });
  }
  const press = (ws, keys) => { pick(ws); for (const key of keys) send(ws, 'calculator_press', { key }); };
  const solve = ws => { const level = missionFor(packets.get(ws)); press(ws, [...level.route, ...challengeFor(level).answers.map(String)]); };
  const door = ws => { send(ws, 'calculator_restart'); pick(ws); };
  return { service, registry, srs, clears, joinSolo, send, press, pick, solve, door, mastered, state: ws => packets.get(ws), lobby: ws => lobbies.get(ws),
    setDay: value => { day = value; }, clock: value => { time = value; } };
}

test('a solo clear advances the student\'s record at the round\'s quality and the packet carries the review', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-var-stats');
    const level = missionFor(f.state(ws));
    // One wrong key (free; CLEAR backs out of the menu it opened), then the route and the answers.
    f.press(ws, ['MATH', 'CLEAR']);
    assert.equal(f.state(ws).wrongKeys, 1);
    f.solve(ws);
    const done = f.state(ws);
    assert.equal(done.complete, true);
    assert.deepEqual(done.review, { quality: 5, intervalDays: 1, nextReview: '2026-10-17', mastered: false, masteredNow: false });
    assert.equal(f.srs.recordOf('B', 'alice', 'one-var-stats').repetitions, 1);
    assert.deepEqual(f.mastered, [], 'rung 0: hints were on, no mastery');
    // The next day, the door starts the next round; a clean clear is the second repetition.
    f.setDay('2026-10-17'); f.door(ws);
    assert.equal(f.state(ws).review, null, 'a fresh round has no review yet');
    f.solve(ws);
    assert.equal(f.state(ws).review.nextReview, '2026-10-23', 'acceptance: six days out');
    assert.equal(level.skillId, 'one-var-stats');
  } finally { f.service.close(); }
});

test('wrong keys and a time-up restart lower the quality; a wrong recognition pick costs a point', () => {
  const f = setup();
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-var-stats');
    // The engine charges a wrong key only when it changes the screen (fluency §5): this sequence
    // opens the MATH menu twice from the home screen.
    f.press(ws, ['MATH', 'CLEAR', 'MATH', 'CLEAR', 'MATH', 'CLEAR', 'MATH', 'CLEAR']);
    const wrongKeys = f.state(ws).wrongKeys;
    assert.ok(wrongKeys >= 2, 'at least two wrong keys, got ' + wrongKeys);
    // Let the clock run out (wrong keys shortened it): the restart keeps the wrong-key count and counts once.
    let t = 0;
    const beat = () => { t += 500; f.clock(t); f.send(ws, 'calculator_pose', { pose: { x: 70, y: 676 } }); f.service.tick(); };
    while (!f.state(ws).failure && t < ROUND_MS + 5000) beat();
    assert.ok(f.state(ws).failure, 'time ran out');
    beat(); beat(); beat();
    assert.equal(f.state(ws).failure, null, 'restarted after the death animation');
    assert.equal(f.state(ws).timeoutCount, 1);
    assert.equal(f.state(ws).wrongKeys, wrongKeys, 'carried across the restart');
    f.solve(ws);
    assert.equal(f.state(ws).review.quality, Math.max(0, 5 - (wrongKeys - 1) - 1));
    assert.equal(f.state(ws).review.intervalDays, 1);
    const g = setup();
    const w2 = {};
    try {
      g.registry.join(w2, 'B', 'bob', 'student', 0);
      g.service.handle(w2, { type: 'calculator_join', protocol: CALCULATOR_PROTOCOL, mode: 'solo', skill: 'one-var-stats' });
      const wrong = g.state(w2).recognition.options.find(id => id !== 'one-var-stats');
      g.send(w2, 'calculator_pick', { skill: wrong });
      g.solve(w2);
      assert.equal(g.state(w2).review.quality, 4);
    } finally { g.service.close(); }
  } finally { f.service.close(); }
});

test('mastery flips once: a solo clear at rung 2 with quality >= 4; the hook fires once; a team clear never masters', () => {
  const f = setup({ clearsSeed: 2 });
  const ws = {};
  try {
    f.joinSolo(ws, 'alice', 'one-var-stats');
    assert.equal(f.state(ws).rung, 2, 'no hints');
    f.solve(ws);
    assert.equal(f.state(ws).review.mastered, true);
    assert.equal(f.state(ws).review.masteredNow, true);
    assert.deepEqual(f.mastered, [{ section: 'B', username: 'alice', skillId: 'one-var-stats' }]);
    f.door(ws); f.solve(ws);
    assert.equal(f.state(ws).review.mastered, true);
    assert.equal(f.state(ws).review.masteredNow, false, 'the second mastery of the same skill is not news');
    assert.equal(f.mastered.length, 1, 'the hook fired once');
    assert.equal(f.srs.recordOf('B', 'alice', 'one-var-stats').mastered, true);
  } finally { f.service.close(); }
});

test('a solo join with no skill opens the most overdue due skill, then the rotation when nothing is due', () => {
  const f = setup({ available: () => [DEFAULT_LEVEL, levelById('normalcdf'), levelById('invnorm')] });
  const ws = {};
  try {
    // Two records from earlier days: normalcdf is more overdue than invnorm.
    f.srs.record('B', 'alice', 'normalcdf', 5, '2026-10-01');
    f.srs.record('B', 'alice', 'invnorm', 5, '2026-10-10');
    f.joinSolo(ws, 'alice', undefined);
    assert.equal(levelById(f.state(ws).missionId).skillId, 'normalcdf', 'the most overdue skill first');
    assert.equal(f.state(ws).pinnedSkill, null, 'not a pin: the next round chooses again');
    f.solve(ws);
    f.door(ws);
    assert.equal(levelById(f.state(ws).missionId).skillId, 'invnorm', 'normalcdf is rescheduled; invnorm is due');
    f.solve(ws);
    f.door(ws);
    assert.ok(f.state(ws).missionId, 'nothing due: the rotation plays');
    const due = f.service.due('B', 'alice', ['one-var-stats', 'normalcdf', 'nonsense']);
    assert.equal(due.today, '2026-10-16');
    assert.deepEqual(due.due, [], 'both rescheduled to tomorrow');
    assert.deepEqual(due.todaySkills.map(e => e.skillId), ['one-var-stats', 'normalcdf']);
    f.srs.record('B', 'alice', 'histogram', 5, '2026-10-01');
    const later = f.service.due('B', 'alice', ['histogram']);
    assert.deepEqual(later.due.map(e => [e.skillId, e.overdueDays, e.title]), [['histogram', 14, 'Histogram']]);
    assert.equal(later.count, 1);
    assert.deepEqual(later.todaySkills, [], 'a due skill is not repeated under today');
  } finally { f.service.close(); }
});
