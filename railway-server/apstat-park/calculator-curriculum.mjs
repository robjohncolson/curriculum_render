const { CALCULATOR_LEVELS, CALCULATOR_PROBLEMS } = await import('./calculator-catalog.mjs' + new URL(import.meta.url).search);
export { CALCULATOR_LEVELS, CALCULATOR_PROBLEMS };
export const levelById = id => CALCULATOR_PROBLEMS.find(level => level.id === id);
export const DEFAULT_LEVEL = levelById('one-var-stats');

export function schoolDate(time = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  const get = type => parts.find(part => part.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

export function eligibleLevels(section, date = schoolDate(), levels = CALCULATOR_LEVELS) {
  // Match Desk/lesson-grade: parked and teacher accounts follow Period E.
  const period = { PERIODB: 'B', PERIODE: 'E', PERIODX: 'E', B: 'B', E: 'E' }[String(section).trim().toUpperCase()];
  if (!period) return [];
  return levels.filter(level => {
    const lessons = level.coverage || [{ dates: level.dates }];
    return lessons.some(lesson => {
      const taught = lesson.dates[period];
      return typeof taught === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(taught) && taught <= date;
    });
  });
}

// A shuffled bag covers every available skill before repeating one. New lessons
// enter the bag immediately; changing a date never admits an ineligible skill.
export function createLevelRotation(random = Math.random, { varyProblems = true } = {}) {
  let remaining = [], seen = new Set(), last = null;
  const lastProblem = new Map();
  return {
    next(eligible) {
      if (!eligible.length) return null;
      const ids = new Set(eligible.map(level => level.id));
      remaining = remaining.filter(id => ids.has(id));
      for (const id of ids) if (!seen.has(id)) remaining.push(id);
      seen = ids;
      if (!remaining.length) remaining = [...ids];
      const candidates = remaining.filter(id => id !== last);
      const choices = candidates.length ? candidates : remaining;
      const id = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
      remaining.splice(remaining.indexOf(id), 1); last = id;
      const level = eligible.find(level => level.id === id);
      if (!varyProblems) return level;
      const variants = CALCULATOR_PROBLEMS.filter(problem => problem.skillId === id && problem.id !== lastProblem.get(id));
      const selected = variants.length ? variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))] : level;
      lastProblem.set(id, selected.id);
      return selected;
    },
  };
}

export function initializeCalculator(calculator, level = DEFAULT_LEVEL) {
  for (const [name, values] of Object.entries(level.setup.lists)) calculator.setList(name, values);
  for (const [name, values] of Object.entries(level.setup.matrices)) calculator.setMatrix(name, values);
  if (level.setup.histogramWindow) calculator.setHistogramWindow(level.setup.histogramWindow);
}

const round = value => typeof value === 'number' ? Number(Number(value).toPrecision(5)) : value;

// One answer check for every challenge (relay and client):
// - categories (string keys) and whole numbers (counts, n) must match exactly;
// - decimals: both sides are already rounded to the 5 significant digits the tiles
//   show, so the source screen-verification tolerance absorbs only float noise.
export function answerMatches(value, expected) {
  if (typeof expected === 'string') return value === expected;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (Number.isInteger(expected)) return value === expected;
  return Math.abs(value - expected) <= Math.max(1, Math.abs(expected)) * 1e-9;
}

// The value a pressed answer tile stands for: a number for numeric questions, else the key.
export function answerValue(level, index, key) {
  return typeof challengeFor(level).answers[index] === 'number' ? Number(key) : String(key);
}

// Specific feedback for a whole wrong answer: the first wrong pick and why it is wrong.
export function feedbackFor(level, values) {
  const challenge = challengeFor(level);
  const index = values.findIndex((value, i) => !answerMatches(value, challenge.answers[i]));
  if (index < 0) return null;
  const option = challenge.questions?.[index]?.options.find(option => option.key === String(values[index]));
  if (option?.feedback) return option.feedback;
  return challenge.labels[index] + ': ' + values[index] + ' does not match the calculator result. Read that line again.';
}

export function challengeFor(level = DEFAULT_LEVEL) {
  const { computed: c, finalView: graph, values: v } = level;
  const id = level.procedureId || level.id;
  if (level.interpretation) {
    // Interpretation variants (A-F): reference answers come from the independent oracles.
    const { title, note, questions } = level.interpretation;
    return { kind: 'interpret', title, note, questions,
      labels: questions.map(question => question.label), prompts: questions.map(question => question.prompt),
      answers: questions.map(question => round(question.answer)) };
  }
  let kind, title, labels, answers, note;
  if (level.challenge === 'dotplot') {
    kind = 'dotplot'; title = 'BUILD THE DOT PLOT';
    const positions = [...new Set(v.data)].sort((a, b) => a - b);
    labels = positions.map(value => 'Dots at ' + value);
    answers = positions.map(value => v.data.filter(observation => observation === value).length);
    note = 'Each dot represents one observation. Stack equal values.';
  } else if (id === 'one-var-stats' || id === 'modified-boxplot') {
    kind = 'boxplot'; title = id === 'modified-boxplot' ? 'BUILD THE MODIFIED BOXPLOT' : 'BUILD THE BOXPLOT';
    const stats = c || graph.stats;
    answers = [stats.minX, stats.Q1, stats.Med, stats.Q3, stats.maxX];
    labels = ['Minimum', 'Q1', 'Median', 'Q3', 'Maximum'];
    if (id === 'modified-boxplot') {
      const fence = 1.5 * (stats.Q3 - stats.Q1), data = v.data;
      answers[0] = Math.min(...data.filter(x => x >= stats.Q1 - fence));
      answers[4] = Math.max(...data.filter(x => x <= stats.Q3 + fence));
      labels = ['Low whisker', 'Q1', 'Median', 'Q3', 'High whisker'];
    }
    note = 'Half the observations lie between Q1 and Q3.';
  } else if (id === 'histogram') {
    kind = 'histogram'; title = 'BUILD THE HISTOGRAM';
    labels = graph.points.map(p => p.x + ' to <' + p.upper);
    answers = graph.points.map(p => p.y); note = 'Bar height is frequency. The bars account for every observation.';
  } else if (id === 'scatterplot' || id === 'residual-plot') {
    kind = 'scatter'; title = id === 'residual-plot' ? 'PLACE THE RESIDUALS' : 'PLACE THE POINTS';
    const points = graph.points.slice(0, 5);
    labels = points.map(p => 'y at x=' + p.x); answers = points.map(p => p.y);
    note = id === 'residual-plot' ? 'Residual = observed y minus predicted y.' : 'Each point pairs an x value with its y value.';
  } else if (id === 'matrix-entry') {
    kind = 'matrix'; title = 'REBUILD THE COUNT TABLE';
    labels = v.matrix.flatMap((row, r) => row.map((_, col) => 'Row ' + (r + 1) + ', col ' + (col + 1)));
    answers = v.matrix.flat(); note = 'Keep the rows and columns in the original category order.';
  } else if (id.startsWith('randint')) {
    kind = 'sampling'; title = id === 'randint-assignment' ? 'ASSIGN TREATMENT A' : 'BUILD THE SAMPLE';
    const draw = graph.at(-1).replace(/[{}]/g, '').split(' ').map(Number);
    answers = id === 'randint-assignment' ? draw.slice(0, v.groupSize) : draw;
    labels = answers.map((_, i) => 'Label ' + (i + 1));
    note = 'Use the draw in order. No subject appears twice.';
  } else if (c.lower != null) {
    kind = 'interval'; title = 'BUILD THE CONFIDENCE INTERVAL';
    labels = ['Lower bound', 'Upper bound']; answers = [c.lower, c.upper];
    note = 'The interval gives plausible values for the population parameter.';
  } else if (c.p != null) {
    kind = 'test'; title = 'BUILD THE TEST RESULT';
    labels = [c.chi2 != null ? 'Chi-square' : c.t != null ? 't statistic' : 'z statistic', 'p-value', 'Reject H0? 1=yes'];
    answers = [c.chi2 ?? c.t ?? c.z, c.p, Number(c.p < (v.alpha || .05))];
    note = 'Compare p with alpha=' + (v.alpha || .05) + '. A small p is evidence against H0.';
  } else if (c.b != null) {
    kind = 'regression'; title = 'BUILD THE REGRESSION LINE';
    labels = ['Intercept a', 'Slope b', 'r-squared']; answers = [c.a, c.b, c.r2];
    note = 'Predicted y = a + bx. The slope measures change in predicted y.';
  } else {
    kind = id.startsWith('invnorm') ? 'quantile' : 'probability';
    title = kind === 'quantile' ? 'PLACE THE CUTOFF' : 'BUILD THE PROBABILITY';
    labels = [kind === 'quantile' ? 'Cutoff x' : 'Probability']; answers = [c.value];
    note = kind === 'quantile' ? 'The cutoff leaves the requested area in the chosen tail.' : 'Probability is area or mass, between 0 and 1.';
  }
  answers = answers.map(round);
  return { kind, title, labels, answers, note };
}

// Answer tiles sit in two rows that a cat can climb (from the floor ledges, each rise
// is at most 34px) as well as click; number keys choose them too (room).
// Rows fill upward from the lowest one (y 604), so a single row is never out of reach.
const ANSWER_BOTTOM_Y = 604, ANSWER_ROW_STEP = 34;
const answerRowY = (i, count, perRow) => ANSWER_BOTTOM_Y - (Math.ceil(count / perRow) - 1 - Math.floor(i / perRow)) * ANSWER_ROW_STEP;
// Stable scramble so the authored order (correct first) never shows.
const scrambleKey = text => [...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 7);
export function answerTiles(level, index) {
  const challenge = challengeFor(level), answer = challenge.answers[index];
  const question = challenge.questions?.[index];
  if (question) {
    const options = question.options.slice().sort((a, b) => scrambleKey(a.key) - scrambleKey(b.key));
    const numeric = typeof answer === 'number';
    const perRow = numeric ? 4 : 2, width = numeric ? 142 : 300, gap = numeric ? 155 : 320;
    return options.map((option, i) => ({ key: option.key, label: option.text,
      x: 60 + (i % perRow) * gap, y: answerRowY(i, options.length, perRow), w: width, h: 30 }));
  }
  let options;
  if (challenge.kind === 'dotplot') options = [3, 0, 5, 1, 4, 2];
  else if (level.id === 'one-var-stats') options = [14, 4, 20, 7, 11];
  else {
    const delta = Math.max(Math.abs(answer || 1) * .2, .01);
    options = [...new Set([...challenge.answers, round(answer + delta), round(answer - delta), 0, 1])];
    if (options.length > 8) options = [answer, ...options.filter(value => value !== answer).slice(0, 7)];
    // Stable scrambled tiles: classmates see the same choices, not answer-first.
    options.sort((a, b) => Math.sin(a * 17 + 4) - Math.sin(b * 17 + 4));
  }
  return options.map((value, i) => ({ key: String(value), x: 60 + (i % 4) * 155, y: answerRowY(i, options.length, 4), w: 142, h: 30 }));
}
