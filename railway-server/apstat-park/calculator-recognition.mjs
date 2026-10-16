// Pattern recognition (APSTAT_PARK_TRAINER_ABSORB_SPEC §4, protocol 14): before the route, a
// round can open with a canonical word problem and four procedure tiles. Shared byte-identical
// with the relay, which is the only judge; the client draws what the round packet carries.
const V = new URL(import.meta.url).search;
const { PATTERN_SIGNATURES, CONFUSION_PAIRS, CANONICAL_PROBLEMS } = await import('./calculator-patterns.mjs' + V);
const { CALCULATOR_LEVELS } = await import('./calculator-curriculum.mjs' + V);

export const RECOGNITION_OPTIONS = 4;

// Every skill with at least one canonical problem can open with the recognition step.
export function hasRecognition(skillId) {
  return (CANONICAL_PROBLEMS[skillId] || []).length > 0;
}

export function skillTitle(skillId) {
  return CALCULATOR_LEVELS.find(level => level.id === skillId)?.title || skillId;
}

// The three distractors for a skill: its confusion-pair partners first (same unit before other
// units, then the pairs' own order), then other skills of the same unit, then anything else.
// Deterministic; the caller shuffles the four tiles.
export function distractorsFor(skillId, count = RECOGNITION_OPTIONS - 1) {
  const unitOf = id => PATTERN_SIGNATURES[id]?.unit ?? null;
  const unit = unitOf(skillId);
  const partners = [];
  for (const pair of CONFUSION_PAIRS) {
    const other = pair.a === skillId ? pair.b : pair.b === skillId ? pair.a : null;
    if (other && other !== skillId && !partners.includes(other) && PATTERN_SIGNATURES[other]) partners.push(other);
  }
  const ranked = [...partners.filter(id => unitOf(id) === unit), ...partners.filter(id => unitOf(id) !== unit)];
  const sameUnit = Object.keys(PATTERN_SIGNATURES).filter(id => id !== skillId && unitOf(id) === unit && !ranked.includes(id)).sort();
  const rest = Object.keys(PATTERN_SIGNATURES).filter(id => id !== skillId && !ranked.includes(id) && !sameUnit.includes(id)).sort();
  return [...ranked, ...sameUnit, ...rest].slice(0, count);
}

// One recognition round: a canonical problem for the skill and the four tiles in a random order.
// random: () => [0, 1). Returns null when the skill has no canonical problem.
export function recognitionFor(skillId, random = Math.random) {
  const problems = CANONICAL_PROBLEMS[skillId] || [];
  if (!problems.length) return null;
  const problem = problems[Math.min(problems.length - 1, Math.floor(random() * problems.length))];
  const options = [skillId, ...distractorsFor(skillId)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { skill: skillId, stem: problem.stem, options, picked: null, correct: null, message: null };
}

const PARAMETER = {
  proportion: 'a proportion', mean: 'a mean', slope: 'a slope', probability: 'a probability',
  percentile: 'a cutoff value for a given area', distribution: 'how counts are spread over categories',
  descriptive: 'a summary of the data', graphical: 'a graph of the data', regression: 'a regression line',
};
const QUESTION = {
  test: 'a test of a claim', interval: 'a confidence interval', calculation: 'a calculation',
  display: 'a display', randomization: 'a randomization', setup: 'a setup step',
};
const STRUCTURE = {
  'one-sample': 'one sample', 'two-sample': 'two separate samples', paired: 'paired data', 'two-group': 'two groups',
};
const DATA = { categorical: 'categorical data (counts or percents)', quantitative: 'quantitative data (measurements)' };

// One sentence naming the signal that separates the right procedure from a wrong pick: the first
// signature field that differs, in the order parameter, question, sample structure, data type.
// With no differing field, the confusion pair's own contrast (first sentence), else the titles.
export function discriminatorFor(rightId, wrongId) {
  const right = PATTERN_SIGNATURES[rightId] || {}, wrong = PATTERN_SIGNATURES[wrongId] || {};
  const differs = (field, words) => right[field] !== wrong[field] && words[right[field]] && words[wrong[field]];
  if (differs('parameterType', PARAMETER)) return 'This asks about ' + PARAMETER[right.parameterType] + ', not ' + PARAMETER[wrong.parameterType] + '.';
  if (differs('questionType', QUESTION)) return 'This asks for ' + QUESTION[right.questionType] + ', not ' + QUESTION[wrong.questionType] + '.';
  if (differs('sampleStructure', STRUCTURE)) return 'This has ' + STRUCTURE[right.sampleStructure] + ', not ' + STRUCTURE[wrong.sampleStructure] + '.';
  if (differs('dataType', DATA)) return 'This uses ' + DATA[right.dataType] + ', not ' + DATA[wrong.dataType] + '.';
  const pair = CONFUSION_PAIRS.find(pair => (pair.a === rightId && pair.b === wrongId) || (pair.a === wrongId && pair.b === rightId));
  // Same test, different input: the signatures agree, so the signal is what the problem gives.
  if (pair?.type === 'input-mode') return rightId.endsWith('-data')
    ? 'This gives the raw data, so enter it in a list (Data input), not summary statistics.'
    : 'This gives summary statistics (Stats input), not the raw data.';
  if (pair?.contrast) return pair.contrast.split(/(?<=\.)\s/)[0];
  return 'This calls for ' + skillTitle(rightId) + ', not ' + skillTitle(wrongId) + '.';
}
