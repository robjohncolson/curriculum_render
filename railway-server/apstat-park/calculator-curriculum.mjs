const { CALCULATOR_LEVELS } = await import('./calculator-catalog.mjs' + new URL(import.meta.url).search);
export { CALCULATOR_LEVELS };
export const levelById = id => CALCULATOR_LEVELS.find(level => level.id === id);
export const DEFAULT_LEVEL = levelById('one-var-stats');

export function schoolDate(time = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  const get = type => parts.find(part => part.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}

export function eligibleLevels(section, date = schoolDate(), levels = CALCULATOR_LEVELS) {
  return levels.filter(level => {
    const taught = level.dates[section];
    return typeof taught === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(taught) && taught <= date;
  });
}

// A shuffled bag covers every available skill before repeating one. New lessons
// enter the bag immediately; changing a date never admits an ineligible skill.
export function createLevelRotation(random = Math.random) {
  let remaining = [], seen = new Set(), last = null;
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
      return eligible.find(level => level.id === id);
    },
  };
}

export function initializeCalculator(calculator, level = DEFAULT_LEVEL) {
  for (const [name, values] of Object.entries(level.setup.lists)) calculator.setList(name, values);
  for (const [name, values] of Object.entries(level.setup.matrices)) calculator.setMatrix(name, values);
}

const round = value => Number(Number(value).toPrecision(5));
export function challengeFor(level = DEFAULT_LEVEL) {
  const { id, computed: c, finalView: graph, values: v } = level;
  let kind, title, labels, answers, note;
  if (id === 'one-var-stats' || id === 'modified-boxplot') {
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

export function answerTiles(level, index) {
  const challenge = challengeFor(level), answer = challenge.answers[index];
  let options;
  if (level.id === 'one-var-stats') options = [14, 4, 20, 7, 11];
  else {
    const delta = Math.max(Math.abs(answer || 1) * .2, .01);
    options = [...new Set([...challenge.answers, round(answer + delta), round(answer - delta), 0, 1])];
    if (options.length > 8) options = [answer, ...options.filter(value => value !== answer).slice(0, 7)];
    // Stable scrambled tiles: classmates see the same choices, not answer-first.
    options.sort((a, b) => Math.sin(a * 17 + 4) - Math.sin(b * 17 + 4));
  }
  return options.map((value, i) => ({ key: String(value), x: 60 + (i % 4) * 155, y: 566 + Math.floor(i / 4) * 42, w: 142, h: 30 }));
}
