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
export const VARIED_SKILLS = new Set(['one-var-stats', 'modified-boxplot', 'histogram', 'dotplot', 'scatterplot',
  'linreg-a-plus-bx', 'residual-plot', 't-test-data', 't-interval-data', 'linreg-ttest', 'linreg-tint']);
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

export function varyProblem(problem, random = Math.random) {
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
  for (const key of problem.route) calculator.pressKey(key);
  const computed = calculator.getComputedValues?.() ?? null;
  return { ...problem, computed: JSON.parse(JSON.stringify(computed)), finalView: JSON.parse(JSON.stringify(rendered)) };
}
