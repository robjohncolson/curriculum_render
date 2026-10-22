// Shape check for the bodies of POST /api/ai/grade and POST /api/ai/appeal (review
// 2026-10-22, "plausible": a malformed scenario / answers reached the prompt builders
// and applyWrongMcqCap, and a TypeError there was a 500). The routes already answer a
// 400 for a missing scenario / answers; this makes every wrong SHAPE the same 400.
//
// Lenient on purpose: only the fields the server reads are typed. Worksheets put a
// nested lessonContext object in the scenario and an object under previousResults, and
// the quiz app spreads its grading context into the scenario, so unknown keys and
// nested values are allowed. Size is not a shape question: the byte caps in
// ai-grade-auth.js answer 413 before this runs, so a long string passes here.

const isScalar = value => value === null || value === undefined ||
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isOptionalString = value => value === null || value === undefined || typeof value === 'string';

// JSON objects can shadow toString with a non-function. Check the coercions the
// prompt builders perform without rejecting ordinary nested lesson context.
function canRenderText(value) {
  try { String(value); return true; }
  catch { return false; }
}

// Scenario fields read as text by the prompt builders and the MCQ cap.
const SCALAR_SCENARIO_FIELDS = ['questionType', 'correctAnswer', 'prompt', 'topic', 'partId'];

// Returns the error string for a bad body, or null when the shape is fine.
// appeal: also check appealText and previousResults (the /api/ai/appeal fields).
export function gradeBodyShapeError(body, { appeal = false } = {}) {
  const { scenario, answers, prompt, aiPromptTemplate, appealText, previousResults } = body || {};

  if (!isPlainObject(scenario)) return 'scenario must be an object';
  if (!isOptionalString(scenario.questionId)) return 'scenario.questionId must be a string';
  for (const field of SCALAR_SCENARIO_FIELDS) {
    if (!isScalar(scenario[field])) return 'scenario.' + field + ' must be text';
  }
  if (scenario.expectedElements != null) {
    if (!Array.isArray(scenario.expectedElements) || !scenario.expectedElements.every(isScalar)) {
      return 'scenario.expectedElements must be a list of text';
    }
  }
  if (scenario.choices != null) {
    if (!Array.isArray(scenario.choices) || scenario.choices.some(choice =>
      choice == null || !canRenderText(choice.key) || !canRenderText(choice.text))) {
      return 'scenario.choices must be a list';
    }
  }

  if (!isPlainObject(answers)) return 'answers must be an object';
  if (!Object.values(answers).every(isScalar)) return 'answers values must be text';

  if (!isOptionalString(prompt)) return 'prompt must be a string';
  if (!isOptionalString(aiPromptTemplate)) return 'aiPromptTemplate must be a string';
  if (!prompt && aiPromptTemplate && !Object.values(scenario).every(canRenderText)) {
    return 'scenario template values must be text';
  }

  if (!appeal) return null;
  if (typeof appealText !== 'string') return 'appealText must be a string';
  if (previousResults != null) {
    if (!isPlainObject(previousResults) || Object.values(previousResults).some(result =>
      result == null || !canRenderText(result.score || result) || !canRenderText(result.feedback || 'No feedback'))) {
      return 'previousResults must be an object of results';
    }
  }
  return null;
}
