// Data-entry steps (APSTAT_PARK_TRAINER_ABSORB_2_SPEC §2). Shared with the relay's
// calculator-data-entry.mjs. Keep byte-identical (tested).
//
// At hint rung 1+ in a solo round, a list or matrix problem starts with an EMPTY calculator and
// its route is prefixed with the keys that type the data in:
//   lists:  STAT ENTER (1:Edit), each L1 value's keys + ENTER, RIGHT to L2, ..., 2ND MODE (QUIT)
//   matrix: 2ND x⁻¹ RIGHT RIGHT ENTER (MATRIX, EDIT, [A]), rows ENTER cols ENTER,
//           each cell's keys + ENTER (row by row), 2ND MODE (QUIT)
// Everything after the prefix (challenge, answers, computed, finalView) is the catalogue's,
// because the calculator holds the same data once the prefix is done (engine proof test).
import { goalFor } from './calculator-goals.mjs';

// skillId -> why that skill keeps its pre-loaded data. Empty: every list/matrix skill is driven.
// (matrix-entry needs no entry: its own route IS the matrix entry and its setup is empty.)
export const DATA_ENTRY_SKIPPED = {};
// The longest prefix a round asks for (ABSORB_2 §2, decided 2026-10-18): the two-list regression sets
// run to 220 keys, which is minutes of typing before the procedure even starts. A problem whose prefix
// is longer plays pre-loaded at every rung (scatterplot's 63 keys is the largest that is typed).
export const DATA_ENTRY_MAX_KEYS = 64;

const LIST_COLUMNS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
// The catalogue's matrix-entry route opens the [A] editor with these keys.
export const MATRIX_OPEN_KEYS = ['2ND', 'x⁻¹', 'RIGHT', 'RIGHT', 'ENTER'];
const QUIT_KEYS = ['2ND', 'MODE'];
const QUIT_GOAL = 'Quit to the home screen.';
const QUIT_HINTS = ['Press 2ND, then MODE (QUIT).', 'Press MODE: 2ND MODE is QUIT, back to the home screen.'];

const listsOf = setup => setup?.lists || {};
const matrixOf = setup => setup?.matrices?.['[A]'] || null;
const hasLists = setup => Object.values(listsOf(setup)).some(values => values?.length);
const hasMatrix = setup => !!matrixOf(setup)?.length;

// The keys that type one number: (−) for a minus sign, '.', digits.
export function valueKeys(value) {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error('cannot type ' + text + ' on the keypad');
  return [...text].map(char => (char === '-' ? '(−)' : char));
}

// Rung-0 text for one typed number (ASCII only: the pixel font has no (−) glyph).
function typeHint(value) {
  if (value < 0) return 'Type ' + value + ', then ENTER. The minus sign is the (-) key.';
  return 'Type ' + value + ', then ENTER.';
}

// One step per key: { route, hints, goals } built up by push().
function createPrefix() {
  const prefix = { route: [], hints: [], goals: [] };
  prefix.push = (keys, hint, goal) => {
    for (const [i, key] of keys.entries()) {
      prefix.route.push(key);
      prefix.hints.push(Array.isArray(hint) ? hint[i] : hint);
      prefix.goals.push(goal);
    }
  };
  return prefix;
}

// One number and its ENTER, all under the same hint and goal.
function pushValue(prefix, value, goal) {
  prefix.push([...valueKeys(value), 'ENTER'], typeHint(value), goal);
}

function listPrefix(lists) {
  const prefix = createPrefix();
  const editorGoal = 'Open the list editor (STAT, 1:Edit).';
  prefix.push(['STAT', 'ENTER'], ['Press STAT to open the statistics menu.', 'Press ENTER for 1:Edit.'], editorGoal);
  const names = LIST_COLUMNS.filter(name => lists[name]?.length);
  let column = 0;
  for (const name of names) {
    const target = LIST_COLUMNS.indexOf(name);
    // The cursor starts in L1; each RIGHT moves one list over.
    if (target > column) prefix.push(Array(target - column).fill('RIGHT'), 'Press RIGHT to move to ' + name + '.', 'Move to ' + name + '.');
    column = target;
    for (const value of lists[name]) pushValue(prefix, value, 'Enter the next ' + name + ' value.');
  }
  prefix.push(QUIT_KEYS, QUIT_HINTS, QUIT_GOAL);
  return prefix;
}

function matrixPrefix(matrix) {
  const prefix = createPrefix();
  const rows = matrix.length, cols = matrix[0].length;
  prefix.push(MATRIX_OPEN_KEYS, ['Press 2ND, then x^-1 (MATRIX).', 'Press x^-1: 2ND x^-1 is MATRIX.',
    'Press RIGHT to move to MATH.', 'Press RIGHT again to move to EDIT.', 'Press ENTER for 1:[A].'], 'Open MATRIX EDIT for [A].');
  const dimensionGoal = 'Set [A] to ' + rows + ' x ' + cols + '.';
  pushValue(prefix, rows, dimensionGoal);
  pushValue(prefix, cols, dimensionGoal);
  for (const row of matrix) for (const value of row) pushValue(prefix, value, 'Enter the next [A] cell.');
  prefix.push(QUIT_KEYS, QUIT_HINTS, QUIT_GOAL);
  return prefix;
}

// The keys that type a level's setup into an empty calculator: { route, hints, goals }, one entry
// per key. Lists win when a setup somehow has both (no catalogue problem does).
export function dataEntryRoute(setup) {
  const prefix = hasLists(setup) ? listPrefix(listsOf(setup)) : hasMatrix(setup) ? matrixPrefix(matrixOf(setup)) : createPrefix();
  return { route: prefix.route, hints: prefix.hints, goals: prefix.goals };
}

// True when the level starts with data in the calculator that a student could type in.
export function hasEntryData(level) {
  if (!level?.setup || level.dataSteps) return false;
  if (DATA_ENTRY_SKIPPED[level.skillId]) return false;
  return hasLists(level.setup) || hasMatrix(level.setup);
}

// A copy of the level that starts empty and types its own data first. entryData = the original
// setup; dataSteps = the prefix length. The catalogue's goals are carried explicitly for every
// step (goalFor is keyed by step, so the prefix would otherwise shift the lookup).
export function withDataEntry(level) {
  if (!hasEntryData(level)) return level;
  const prefix = dataEntryRoute(level.setup);
  if (prefix.route.length > DATA_ENTRY_MAX_KEYS) return level;
  const goals = level.route.map((_, step) => level.goals?.[step] ?? goalFor(level.id, step) ?? level.hints[step]);
  return { ...level,
    setup: { ...level.setup, lists: {}, matrices: {} },
    entryData: level.setup,
    route: [...prefix.route, ...level.route],
    hints: [...prefix.hints, ...level.hints],
    goals: [...prefix.goals, ...goals],
    dataSteps: prefix.route.length };
}

// What is in the calculator so far, per list (or [A]): { L1: { entered, total }, ... }.
// lists/matrices: calculator.save().lists / .matrices. A list counts its values present; [A]
// counts the cells already equal to the data, in typing order (unset cells read 0).
export function dataEntryProgress(entryData, { lists = {}, matrices = {} } = {}) {
  const progress = {};
  for (const [name, values] of Object.entries(listsOf(entryData))) {
    if (!values?.length) continue;
    progress[name] = { entered: Math.min(values.length, (lists[name] || []).length), total: values.length };
  }
  if (Object.keys(progress).length || !hasMatrix(entryData)) return progress;
  const expected = matrixOf(entryData).flat();
  const typed = (matrices['[A]'] || []).flat();
  const sameShape = typed.length === expected.length;
  let entered = 0;
  while (sameShape && entered < expected.length && typed[entered] === expected[entered]) entered++;
  progress['[A]'] = { entered, total: expected.length };
  return progress;
}
