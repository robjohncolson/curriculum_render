// Random data for list-based calculator problems (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §2).
// Shared with the relay's calculator-variation.mjs. Keep byte-identical (tested).
//
// Only problems whose data lives in setup.lists and whose route never types a data value vary.
// The digits those routes do type are menu choices (ZOOM 9, STAT 8, 2ND STAT 7) or parameters that
// stay fixed (mu0, C-Level). Interpretation problems and stems that quote numbers other than the
// lists themselves (a slope, an SE) play exactly as the catalogue wrote them.
//
// varyProblem(problem, random) -> a new problem with new values/setup/stem and computed/finalView
// still null, or null when the problem does not vary. solveProblem(problem, createCalculator) then
// replays the real calculator on the new lists, exactly as scripts/build-park-curriculum.mjs built
// the catalogue, and fills computed/finalView.
//
// Protocol 11: the two randIntNoRep skills are templated instead (see varyRandInt below). Their
// numbers are typed through the route, so a round gets a new seed, population and sample/group size
// with the SAME digit counts: the route keeps its length and the goal spans still line up.
import { goalFor } from './calculator-goals.mjs';

export const RANDINT_SKILLS = new Set(['randint-sampling', 'randint-assignment']);
export const VARIED_SKILLS = new Set(['one-var-stats', 'modified-boxplot', 'histogram', 'dotplot', 'scatterplot',
  'linreg-a-plus-bx', 'residual-plot', 't-test-data', 't-interval-data', 'linreg-ttest', 'linreg-tint', ...RANDINT_SKILLS]);
// The dot plot's answer tiles offer the counts 0-5 (calculator-curriculum.mjs answerTiles).
const DOTPLOT_MAX_COUNT = 5;
const TRIES = 30;

const decimalsOf = values => Math.max(0, ...values.map(value => (String(value).split('.')[1] || '').length));
const roundTo = (value, decimals) => Number(value.toFixed(decimals));
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const ascending = values => values.every((value, i) => i === 0 || values[i - 1] < value);
const formatted = (values, decimals) => values.map(value => value.toFixed(decimals)).join(', ');

// Which values array fills which calculator list, e.g. [{ key: 'data', list: 'L1' }].
// Null when a list has no values array behind it (nothing to regenerate it from).
function listSources(problem) {
  const sources = [];
  for (const [list, listValues] of Object.entries(problem.setup.lists)) {
    const key = Object.keys(problem.values).find(key => Array.isArray(problem.values[key])
      && JSON.stringify(problem.values[key]) === JSON.stringify(listValues));
    if (!key) return null;
    sources.push({ key, list });
  }
  return sources.length ? sources : null;
}

// A list's numbers as they appear in the stem, tolerating a written trailing zero (21 vs "21.0").
function quotedPattern(values) {
  const number = value => String(value).replace('.', '\\.') + (Number.isInteger(value) ? '(?:\\.0+)?' : '0*');
  return new RegExp('(?<![\\d.])' + values.map(number).join(',\\s*') + '(?!\\d)');
}

// Numbers the stem may mention that do not change with the data.
function fixedNumbers(problem, length) {
  const v = problem.values, fixed = [length, 0.05];
  for (const value of [v.mu0, v.alpha, v.beta0]) if (Number.isFinite(value)) fixed.push(value);
  if (Number.isFinite(v.cLevel)) fixed.push(v.cLevel, roundTo(v.cLevel * 100, 6));
  return fixed;
}

// The stem with every quoted list rewritten, or null when it quotes numbers we cannot rewrite.
function rewriteStem(problem, sources, newValues) {
  let stem = problem.stem, checked = problem.stem;
  for (const { key } of sources) {
    const pattern = quotedPattern(problem.values[key]);
    if (!pattern.test(stem)) continue;
    stem = stem.replace(pattern, formatted(newValues[key], decimalsOf(problem.values[key])));
    checked = checked.replace(pattern, ' ');
  }
  // List names (L1, Plot1) carry digits but no data.
  const numbers = checked.replace(/[A-Za-z]+\d+/g, ' ').match(/-?\d+(?:\.\d+)?/g) || [];
  const fixed = fixedNumbers(problem, Object.values(problem.setup.lists)[0].length);
  if (numbers.some(number => !fixed.includes(Number(number)))) return null;
  return stem;
}

function canVary(problem) {
  if (!VARIED_SKILLS.has(problem?.skillId) || problem.interpretation) return false;
  if (Object.keys(problem.setup?.matrices || {}).length || problem.setup?.histogramWindow) return false;
  return true;
}

// One data list: every value nudged within its own range, keeping the decimals (and the order
// when the catalogue list was sorted). Keeps the shape: a skewed list or an outlier stays one.
function jitterList(values, random) {
  const decimals = decimalsOf(values), lo = Math.min(...values), hi = Math.max(...values);
  const reach = Math.max(10 ** -decimals, 1.5 * (hi - lo) / values.length);
  const jittered = values.map(value => roundTo(clamp(value + (random() * 2 - 1) * reach, lo, hi), decimals));
  const sorted = values.every((value, i) => i === 0 || values[i - 1] <= value);
  return sorted ? jittered.sort((a, b) => a - b) : jittered;
}

// Ascending distinct x values on the catalogue's grid and range. A grid with no room to spare
// (x = 1..10 for ten points) keeps its values.
function gridList(values, random) {
  const decimals = decimalsOf(values), step = 10 ** -decimals;
  const lo = Math.min(...values), hi = Math.max(...values);
  const size = Math.round((hi - lo) / step) + 1;
  if (size <= values.length) return values.slice();
  const picked = new Set([0, size - 1]);
  while (picked.size < values.length) picked.add(Math.floor(random() * size));
  return [...picked].sort((a, b) => a - b).map(index => roundTo(lo + index * step, decimals));
}

function leastSquares(x, y) {
  const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const sse = x.reduce((sum, xi, i) => sum + (y[i] - a - b * xi) ** 2, 0);
  return { a, b, s: Math.sqrt(sse / Math.max(1, n - 2)) };
}

// LinReg-family pairs: new x on the same grid, y = the catalogue's own line + noise of its own size.
// The slope keeps its sign, so a one-sided test (β > 0) still asks a sensible question.
// y stays inside the catalogue's y range: a point whose noise lands outside is redrawn (so the
// noise near the ends is one-sided, not piled on the boundary); clamped only if every draw missed.
function linearPair(x, y, random) {
  const fit = leastSquares(x, y), yDecimals = decimalsOf(y);
  const yLo = Math.min(...y), yHi = Math.max(...y);
  const spread = Math.max(fit.s, 10 ** -yDecimals);
  const noise = () => (random() + random() + random() - 1.5) * 2;   // mean 0, sd 1
  function yAt(xi) {
    for (let draw = 0; draw < TRIES; draw++) {
      const value = roundTo(fit.a + fit.b * xi + spread * noise(), yDecimals);
      if (value >= yLo && value <= yHi) return value;
    }
    return roundTo(clamp(fit.a + fit.b * xi, yLo, yHi), yDecimals);
  }
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const newX = ascending(x) ? gridList(x, random) : jitterList(x, random);
    const newY = newX.map(yAt);
    if (Math.sign(leastSquares(newX, newY).b) === Math.sign(fit.b)) return { x: newX, y: newY };
  }
  return null;
}

function dotplotFits(data) {
  const counts = new Map();
  for (const value of data) counts.set(value, (counts.get(value) || 0) + 1);
  return Math.max(...counts.values()) <= DOTPLOT_MAX_COUNT;
}

// New values for every values array behind a list, keyed like problem.values.
function newValuesFor(problem, sources, random) {
  const v = problem.values;
  if (Array.isArray(v.x_values) && Array.isArray(v.y_values)) {
    const pair = linearPair(v.x_values, v.y_values, random);
    return pair && { x_values: pair.x, y_values: pair.y };
  }
  const result = {};
  for (const { key } of sources) {
    let list = jitterList(v[key], random);
    for (let attempt = 0; problem.challenge === 'dotplot' && !dotplotFits(list) && attempt < TRIES; attempt++) list = jitterList(v[key], random);
    if (problem.challenge === 'dotplot' && !dotplotFits(list)) return null;
    result[key] = list;
  }
  return result;
}

// ---- randIntNoRep: a fresh problem every round (protocol 11) ----

// Assignment pools stay even (two equal groups) and short enough that the drawn ordering stays
// readable on the calculator screen (the catalogue's longest is 1-12).
const ASSIGNMENT_POOLS = [10, 12, 14];
// A sample of 3 to 7 keeps the draw on one readable line and the read-back short.
const SAMPLE_SIZES = { lo: 3, hi: 7 };
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

const digitKeys = value => [...String(value)];
const digitCount = value => String(value).length;
const randomInt = (lo, hi, random) => lo + Math.floor(random() * (hi - lo + 1));
const sameDigits = (value, digits) => digitCount(value) === digits;

// Every whole number with this many digits (1-digit: 1-9, never 0).
function digitRange(digits) {
  return { lo: digits === 1 ? 1 : 10 ** (digits - 1), hi: 10 ** digits - 1 };
}

// New seed / hi / n (/ groupSize), each with the catalogue value's digit count. lo stays.
function randIntValues(values, random) {
  const seedRange = digitRange(digitCount(values.seed));
  const seed = randomInt(seedRange.lo, seedRange.hi, random);
  if (values.groupSize != null) {
    const pools = ASSIGNMENT_POOLS.filter(hi => sameDigits(hi, digitCount(values.hi)));
    if (!pools.length || values.n !== values.hi) return null;
    const hi = pools[Math.floor(random() * pools.length)];
    return { ...values, seed, hi, n: hi, groupSize: hi / 2 };
  }
  const hiRange = digitRange(digitCount(values.hi));
  const hi = randomInt(Math.max(hiRange.lo, 20), hiRange.hi, random);
  const nRange = digitRange(digitCount(values.n));
  const nLo = Math.max(nRange.lo, SAMPLE_SIZES.lo), nHi = Math.min(nRange.hi, SAMPLE_SIZES.hi, hi);
  if (nLo > nHi) return null;
  return { ...values, seed, hi, n: randomInt(nLo, nHi, random) };
}

// Where a key sequence starts in the route, searching from the end (-1 = not there).
function lastIndexOfKeys(route, keys) {
  for (let at = route.length - keys.length; at >= 0; at--) {
    if (keys.every((key, i) => route[at + i] === key)) return at;
  }
  return -1;
}

// The catalogue route with the seed and the upper / n fields retyped, plus the builder's narration
// for those keys (scripts/build-park-curriculum.mjs: seed digits and type()). Null if the route
// does not have the seed -> STO-> ... lower DOWN upper DOWN n DOWN shape.
function randIntRoute(problem, next) {
  const { route, hints, values: old } = problem;
  const oldSeed = digitKeys(old.seed);
  const seedOk = oldSeed.every((key, i) => route[i] === key) && route[oldSeed.length] === 'STO→';
  if (!seedOk) return null;
  const oldFields = [...digitKeys(old.lo), 'DOWN', ...digitKeys(old.hi), 'DOWN', ...digitKeys(old.n), 'DOWN'];
  const at = lastIndexOfKeys(route, oldFields);
  if (at <= oldSeed.length) return null;

  const seedKeys = digitKeys(next.seed);
  const seedHints = seedKeys.map(key => 'Seed the random numbers: type ' + next.seed + ' (press ' + key + '), then STO→ it into rand.');
  const typed = (value, label) => ({ keys: digitKeys(value), hints: digitKeys(value).map(() => 'Enter ' + label + ' = ' + value + '.') });
  const lower = typed(next.lo, 'lower'), upper = typed(next.hi, 'upper'), size = typed(next.n, 'n');
  const fieldKeys = [...lower.keys, 'DOWN', ...upper.keys, 'DOWN', ...size.keys, 'DOWN'];
  const move = 'Move to the next field.';
  const fieldHints = [...lower.hints, move, ...upper.hints, move, ...size.hints, move];
  const middle = { keys: route.slice(oldSeed.length, at), hints: hints.slice(oldSeed.length, at) };
  const tail = { keys: route.slice(at + oldFields.length), hints: hints.slice(at + oldFields.length) };
  return {
    route: [...seedKeys, ...middle.keys, ...fieldKeys, ...tail.keys],
    hints: [...seedHints, ...middle.hints, ...fieldHints, ...tail.hints],
  };
}

function capitalizedLike(word, model) {
  return model[0] === model[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;
}

// The stem with the old seed / hi / n / groupSize swapped for the new ones (digits, and the pool
// size when it is spelled out: "Twelve volunteers"). Null when the stem quotes a number we cannot
// account for, or two old values collide so a number would be ambiguous.
function randIntStem(problem, next) {
  const old = problem.values;
  const swaps = new Map([[old.lo, next.lo]]);
  for (const key of ['seed', 'hi', 'n', 'groupSize']) {
    if (old[key] == null) continue;
    if (swaps.has(old[key]) && swaps.get(old[key]) !== next[key]) return null;
    swaps.set(old[key], next[key]);
  }
  let unknown = false;
  let stem = problem.stem.replace(/(?<![\d.])\d+(?!\.?\d)/g, token => {
    if (!swaps.has(Number(token))) { unknown = true; return token; }
    return String(swaps.get(Number(token)));
  });
  if (unknown) return null;
  const oldWord = NUMBER_WORDS[old.hi];
  if (oldWord) {
    const pattern = new RegExp('\\b' + oldWord + '\\b', 'gi');
    if (pattern.test(stem)) {
      const newWord = NUMBER_WORDS[next.hi];
      if (!newWord) return null;
      stem = stem.replace(pattern, match => capitalizedLike(newWord, match));
    }
  }
  if (!/^[\x20-\x7E]*$/.test(stem)) return null;   // the pixel font is ASCII only
  return stem;
}

// The catalogue's goal phrases (calculator-goals.mjs) with the new seed / upper / n. Null when the
// problem has none. Rides in the round's problem so a client can show goals that match the round.
function randIntGoals(problem, next) {
  const goals = [];
  for (let step = 0; step < problem.route.length; step++) {
    const goal = goalFor(problem.id, step);
    if (goal == null) return null;
    goals.push(goal.replace(/^Store \d+ as/, 'Store ' + next.seed + ' as')
      .replace(/^Enter upper = \d+$/, 'Enter upper = ' + next.hi)
      .replace(/^Enter n = \d+$/, 'Enter n = ' + next.n));
  }
  return goals;
}

// A new randIntNoRep problem: values, stem, route, hints (and goals). computed/finalView stay null
// until solveProblem replays the seed on the engine. Throws when the varied route would change
// length (goal spans are keyed by step), so the relay falls back to the catalogue with a warning.
function varyRandInt(problem, random) {
  if (problem.interpretation) return null;
  const next = randIntValues(problem.values, random);
  if (!next) return null;
  const stem = randIntStem(problem, next);
  if (stem == null) return null;
  const built = randIntRoute(problem, next);
  if (!built) return null;
  if (built.route.length !== problem.route.length || built.hints.length !== problem.route.length) {
    throw new Error(problem.id + ': varied route has ' + built.route.length + ' keys, the catalogue ' + problem.route.length);
  }
  const goals = randIntGoals(problem, next);
  return { ...problem, stem, values: next, route: built.route, hints: built.hints, ...(goals ? { goals } : {}),
    computed: null, finalView: null, varied: true };
}

// The replay of a varied randIntNoRep problem must have pasted the new command and drawn
// n distinct integers in [lo, hi]; anything else means the route did not do what it says.
function checkRandIntReplay(problem) {
  const v = problem.values, view = problem.finalView;
  if (!Array.isArray(view)) throw new Error(problem.id + ': no home screen after the replay');
  if (view.at(-2) !== 'randIntNoRep(' + v.lo + ',' + v.hi + ',' + v.n + ')') throw new Error(problem.id + ': pasted ' + view.at(-2));
  const draw = view.at(-1).replace(/[{}]/g, '').split(' ').map(Number);
  const inRange = draw.every(value => Number.isInteger(value) && value >= v.lo && value <= v.hi);
  if (draw.length !== v.n || !inRange || new Set(draw).size !== draw.length) throw new Error(problem.id + ': drew ' + view.at(-1));
}

export function varyProblem(problem, random = Math.random) {
  if (RANDINT_SKILLS.has(problem?.skillId)) return varyRandInt(problem, random);
  if (!canVary(problem)) return null;
  const sources = listSources(problem);
  if (!sources) return null;
  const newValues = newValuesFor(problem, sources, random);
  if (!newValues) return null;
  const stem = rewriteStem(problem, sources, newValues);
  if (stem == null) return null;
  const lists = Object.fromEntries(sources.map(({ key, list }) => [list, newValues[key]]));
  return { ...problem, stem, values: { ...problem.values, ...newValues },
    setup: { ...problem.setup, lists }, computed: null, finalView: null, varied: true };
}

// Replays the route on a fresh calculator and reads what the catalogue builder read: the computed
// values and the last rendered screen. createCalculator = TI84Native.create.
export function solveProblem(problem, createCalculator) {
  let rendered = null;
  const renderer = Object.fromEntries(['Home', 'Menu', 'Wizard', 'Result', 'Editor', 'Graph']
    .map(name => ['render' + name, value => { rendered = value; }]));
  const calculator = createCalculator(null, { renderer });
  for (const [name, values] of Object.entries(problem.setup.lists)) calculator.setList(name, values);
  const randInt = RANDINT_SKILLS.has(problem.skillId);
  const visible = () => JSON.stringify([calculator.save(), rendered, calculator.getWizardValues?.()]);
  for (const [step, key] of problem.route.entries()) {
    const before = randInt ? visible() : null;
    calculator.pressKey(key);
    // A templated route must never contain a press that changes nothing: the relay could not
    // tell that step apart from the one before it.
    if (randInt && visible() === before) throw new Error(problem.id + ': step ' + step + ' (' + key + ') changes nothing');
  }
  const computed = calculator.getComputedValues?.() ?? null;
  const solved = { ...problem, computed: JSON.parse(JSON.stringify(computed)), finalView: JSON.parse(JSON.stringify(rendered)) };
  if (randInt) checkRandIntReplay(solved);
  return solved;
}
