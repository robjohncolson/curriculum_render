// APSTAT_PARK_TRAINER_ABSORB_2_SPEC §5: GET /park/calc/progress. One row per catalogue skill with
// the calendar gate, clears, rung and spaced-recall record; read-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClassroomRegistry } from '../classroom.js';
import { createCalculatorService } from './calculator-service.mjs';
import { createParkService } from './service.mjs';
import { createCalculatorClears } from './calculator-clears.mjs';
import { createCalculatorSrs } from './calculator-srs-state.mjs';
import { CALCULATOR_LEVELS, levelById } from './calculator-curriculum.mjs';
import { cedUnitOf } from './calculator-progress.mjs';

const DAY = '2026-10-16';
const wallNow = () => Date.parse(DAY + 'T16:00:00Z');
const quiet = () => {};

function setup({ available = () => [levelById('one-var-stats'), levelById('normalcdf')] } = {}) {
  const clears = createCalculatorClears({ log: quiet });
  const srs = createCalculatorSrs({ log: quiet });
  const service = createCalculatorService({ registry: createClassroomRegistry(), send: quiet, wallNow, available,
    varyData: false, clears, srs, log: quiet });
  return { service, clears, srs };
}

const rowOf = (result, skillId) => result.skills.find(row => row.skillId === skillId);

test('shape: one row per catalogue skill, every field, today = the school date', () => {
  const { service } = setup();
  try {
    const result = service.progress('B', 'alice');
    assert.equal(result.today, DAY);
    assert.equal(result.skills.length, CALCULATOR_LEVELS.length);
    assert.equal(result.skills.length, 32);
    assert.deepEqual(result.skills.map(row => row.skillId), CALCULATOR_LEVELS.map(level => level.skillId));
    assert.deepEqual(Object.keys(result.skills[0]).sort(), ['clears', 'due', 'eligible', 'intervalDays', 'lastQuality', 'mastered',
      'nextReview', 'overdueDays', 'repetitions', 'rung', 'skillId', 'title', 'topic', 'unit'].sort());
    // A fresh record is zeros / nulls.
    assert.deepEqual(rowOf(result, 'histogram'), { skillId: 'histogram', title: 'Histogram', topic: '1.5', unit: 1,
      eligible: false, clears: 0, rung: 0, repetitions: 0, intervalDays: 0, nextReview: null, lastQuality: null,
      mastered: false, due: false, overdueDays: 0 });
  } finally { service.close(); }
});

test('eligible follows the calendar gate; a locked row is not eligible and has no record', () => {
  const { service } = setup();
  try {
    const result = service.progress('B', 'alice');
    assert.deepEqual(result.skills.filter(row => row.eligible).map(row => row.skillId), ['one-var-stats', 'normalcdf']);
    const locked = rowOf(result, 'linreg-ttest');
    assert.equal(locked.eligible, false);
    assert.equal(locked.repetitions, 0);
    assert.equal(locked.nextReview, null);
  } finally { service.close(); }
});

test('clears and the rung; a mastered row; a due row with its overdue days', () => {
  const { service, clears, srs } = setup();
  try {
    clears.record('B', ['alice'], 'one-var-stats');
    clears.record('B', ['alice'], 'one-var-stats');
    clears.record('B', ['alice'], 'one-var-stats');
    srs.record('B', 'alice', 'one-var-stats', 5, '2026-10-15', { mastery: true });
    srs.record('B', 'alice', 'normalcdf', 5, '2026-10-10');
    clears.record('B', ['alice'], 'normalcdf');
    const result = service.progress('B', 'alice');
    const mastered = rowOf(result, 'one-var-stats');
    assert.equal(mastered.clears, 3);
    assert.equal(mastered.rung, 2, 'rung caps at 2');
    assert.equal(mastered.mastered, true);
    assert.equal(mastered.repetitions, 1);
    assert.equal(mastered.nextReview, '2026-10-16');
    assert.equal(mastered.due, true, 'a mastered skill can still be due');
    assert.equal(mastered.overdueDays, 0);
    const due = rowOf(result, 'normalcdf');
    assert.deepEqual([due.rung, due.due, due.overdueDays, due.nextReview, due.lastQuality, due.intervalDays], [1, true, 5, '2026-10-11', 5, 1]);
    // Another student's records stay theirs.
    assert.equal(rowOf(service.progress('B', 'bob'), 'normalcdf').due, false);
  } finally { service.close(); }
});

test('read-only: no room, no attempt, no record is created', () => {
  const { service, srs } = setup();
  try {
    service.progress('B', 'alice');
    assert.equal(service.watch('B'), null, 'no solo or team room');
    assert.deepEqual(srs.recordsOf('B', 'alice'), {});
  } finally { service.close(); }
});

test('through the park service: records under the shared park key, the gate on the student\'s own class', () => {
  const sections = [];
  const srs = createCalculatorSrs({ log: quiet });
  srs.record('park:periods-b-e', 'alice', 'normalcdf', 5, '2026-10-01');
  const park = createParkService({ registry: createClassroomRegistry(), send: quiet, wallNow,
    calculatorOptions: { available: section => { sections.push(section); return section === 'PeriodB' ? [levelById('normalcdf')] : []; },
      varyData: false, srs, log: quiet } });
  try {
    const result = park.calcProgress('PeriodB', 'alice');
    assert.ok(sections.includes('PeriodB'), 'gate asked for the student\'s class');
    const row = rowOf(result, 'normalcdf');
    assert.equal(row.eligible, true);
    assert.equal(row.due, true);
    assert.equal(row.overdueDays, 14);
  } finally { park.close(); }
});

test('unit is the CED-2026 unit from the vendored crosswalk (bonus topics under their bonus unit)', () => {
  const map = JSON.parse(readFileSync(new URL('../data/2026-crosswalk.json', import.meta.url), 'utf8')).map;
  for (const level of CALCULATOR_LEVELS) {
    const entry = map[level.topic];
    assert.ok(entry, level.skillId + ' topic ' + level.topic + ' is in the crosswalk');
    assert.equal(cedUnitOf(level.topic), entry.status === 'core' ? entry.newUnit : entry.bonusUnit, level.skillId);
  }
  assert.equal(cedUnitOf('3.6'), 1, 'old 3.6 is CED 1.13');
  assert.equal(cedUnitOf('9.5'), 5, 'a Beyond-the-Exam topic');
  assert.equal(cedUnitOf('nope'), null);
});

test('server.js serves the route beside /park/calc/due through calc-read-routes.mjs -> park.calcProgress', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const due = server.indexOf("app.get('/park/calc/due'");
  const progress = server.indexOf("app.get('/park/calc/progress'");
  assert.ok(due > 0 && progress > due, 'progress route follows the due route');
  assert.match(server.slice(progress, progress + 60), /calcReads\.progress/);
  const routes = readFileSync(new URL('./calc-read-routes.mjs', import.meta.url), 'utf8');
  assert.match(routes, /park\.calcProgress\(who\.section, who\.username\)/);
  assert.match(routes, /section and username required/);
});

test('loading: true while the stores of a section have not answered; false once loaded or memory-only (Codex review 2026-10-18)', async () => {
  let resolveLoad;
  const store = { load: () => new Promise(resolve => { resolveLoad = resolve; }), save: async () => {} };
  const clears = createCalculatorClears({ log: quiet });
  const srs = createCalculatorSrs({ store, log: quiet });
  const service = createCalculatorService({ registry: createClassroomRegistry(), send: quiet, wallNow,
    available: () => [levelById('one-var-stats')], varyData: false, clears, srs, log: quiet });
  try {
    assert.equal(service.progress('B', 'alice').loading, true);
    await new Promise(resolve => setTimeout(resolve, 0)); // the store's load starts on a microtask
    resolveLoad([{ username: 'alice', skillId: 'one-var-stats', record: { repetitions: 2, intervalDays: 6, ease: 2.5, nextReview: DAY, lastQuality: 5, mastered: false } }]);
    await new Promise(resolve => setTimeout(resolve, 0));
    const result = service.progress('B', 'alice');
    assert.equal(result.loading, false);
    assert.equal(rowOf(result, 'one-var-stats').repetitions, 2);
    assert.equal(setup().service.progress('B', 'bob').loading, false, 'memory-only counts as loaded');
  } finally { service.close(); }
});
