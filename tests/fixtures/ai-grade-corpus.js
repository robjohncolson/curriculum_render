import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Frozen on 2026-08-21 from the checked-in SY2627 sibling corpus. These
// Brotli strings contain the real JSON bodies, not generated size stand-ins.
function decodeFrozenBody(chunks) {
  return JSON.parse(brotliDecompressSync(Buffer.from(chunks.join(''), 'base64')).toString('utf8'));
}

const maximumBatchBody = decodeFrozenBody([
  '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',
]);

const worksheet81Body = decodeFrozenBody([
  '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',
]);

const worksheet75Body = decodeFrozenBody([
  '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',
]);

// The study-guide fixture is rebuilt from this repository's frozen curriculum
// and framework snapshots with the checked-in caller's exact prompt algorithm.
const here = dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  readFileSync(resolve(here, '../../data/curriculum.js'), 'utf8') +
    '\n' +
    readFileSync(resolve(here, '../../data/frameworks.js'), 'utf8') +
    '\n;globalThis.__fixtureSource={curriculum:EMBEDDED_CURRICULUM,frameworks:UNIT_FRAMEWORKS};',
  sandbox,
);

function getFrameworkContext(unitNumber, frameworks) {
  const unit = frameworks[unitNumber];
  const simplified = {};
  Object.keys(unit.lessons || {}).forEach((key) => {
    const lesson = unit.lessons[key] || {};
    simplified[key] = {
      topic: lesson.topic || '',
      skills: Array.isArray(lesson.skills) ? lesson.skills : [],
      learningObjectives: (lesson.learningObjectives || []).map((lo) => ({
        id: lo && lo.id ? lo.id : '',
        text: lo && lo.text ? lo.text : '',
      })),
      keyConcepts: Array.isArray(lesson.keyConcepts) ? lesson.keyConcepts : [],
    };
  });
  return {
    title: unit.title,
    examWeight: unit.examWeight || '',
    bigIdeas: Array.isArray(unit.bigIdeas) ? unit.bigIdeas : [],
    lessons: simplified,
  };
}

function buildFocusPrompt(options) {
  const mcqLines = options.mcqResults.map((result) => [
    '- Lesson ' + result.lesson + ' (' + (result.questionId || '') + '): ',
    result.correct ? 'correct' : 'INCORRECT',
    ' (student chose ' + (result.selected || '?'),
    ', correct answer is ' + (result.correctAnswer || '?') + ')',
    result.prompt ? '\n    prompt: ' + result.prompt.slice(0, 140) : '',
  ].join('')).join('\n');
  const masteryLines = Object.keys(options.masterySnapshot).sort().map((id) =>
    '- ' + id + ': ' + Math.round(Number(options.masterySnapshot[id]) * 100) + '%'
  ).join('\n');
  return [
    'You are an AP Statistics tutor building a personalized review plan for a student.',
    'Unit: Unit 6: Inference for Categorical Data - Proportions',
    'Unit focus: Confidence interval for p, justifying a claim from a CI',
    '',
    'The student just completed a diagnostic for this unit. Use their MCQ answers, their FRQ answer (if any), the AP Course Framework, and the current BKT mastery snapshot to recommend which lessons they should review.',
    '',
    '## MCQ signal:',
    mcqLines,
    '',
    "## Student's FRQ response:",
    options.frqAnswer,
    '',
    '## FRQ grade (already assigned by the grader):',
    '(not yet graded)',
    '',
    '## AP Course Framework for this unit (authoritative lesson list):',
    JSON.stringify(options.frameworkContext, null, 2),
    '',
    '## Current estimated mastery per learning objective (from Bayesian Knowledge Tracing, 0-100%):',
    masteryLines,
    '',
    'Use these numbers to break ties - LOs with lower mastery should be prioritized over LOs the student already understands.',
    '',
    '## Your task:',
    'Return a prioritized list of lessons the student should focus on next. Ground every recommendation in a specific learning objective (LO) ID from the framework. If the student nailed the MCQs but stumbled on the FRQ, emphasize synthesis practice. If the student missed adjacent MCQs, group them and recommend the bridging concept. If the student did not attempt the FRQ, say so and keep the recommendation based on MCQ signal alone.',
    '',
    'Respond in JSON format:',
    '{',
    '  "priority": "high" | "medium" | "low",',
    '  "overallSummary": "1-2 sentences naming the biggest gap for this unit",',
    '  "focusLessons": [',
    '    {',
    '      "lesson": <lesson number as integer>,',
    '      "topic": "<lesson topic from the framework>",',
    '      "loIds": ["VAR-1.A", "..."],',
    '      "reason": "1 sentence tying MCQ or FRQ signal to this lesson",',
    '      "suggestedAction": "1 short action - watch the video, do the follow-along, run the Blooket, etc."',
    '    }',
    '  ],',
    '  "synthesisNote": "optional: 1 sentence if FRQ reveals a synthesis gap the MCQs missed"',
    '}',
    '',
    "Keep 'focusLessons' to at most 4 entries. If the student did well, return an empty array and set 'priority' to \"low\".",
  ].join('\n');
}

const unit6Questions = sandbox.__fixtureSource.curriculum.filter((question) =>
  question && question.type === 'multiple-choice' && String(question.id || '').startsWith('U6-L')
);
const mcqResults = unit6Questions.map((question) => ({
  questionId: question.id,
  lesson: Number((question.id.match(/^U\d+-L(\d+)/) || [])[1] || 0),
  correct: false,
  selected: 'A',
  correctAnswer: question.answerKey || '',
  prompt: (question.prompt || '').slice(0, 400),
}));
const masteryIds = [
  'VAR-1.H', 'UNC-4.A', 'UNC-4.B', 'UNC-4.C', 'UNC-4.D', 'UNC-4.F',
  'UNC-4.G', 'UNC-4.H', 'VAR-6.D', 'VAR-6.F', 'VAR-6.G', 'DAT-3.A',
  'DAT-3.B', 'UNC-5.A', 'UNC-5.B', 'UNC-5.C', 'UNC-4.I', 'UNC-4.J',
  'UNC-4.K', 'UNC-4.N', 'VAR-6.H', 'VAR-6.J', 'VAR-6.K',
];
const masterySnapshot = Object.fromEntries(masteryIds.map((id) => [id, 0.3]));
const studyGuidePrompt = buildFocusPrompt({
  mcqResults,
  frqAnswer: 'F'.repeat(8 * 1024),
  frameworkContext: getFrameworkContext(6, sandbox.__fixtureSource.frameworks),
  masterySnapshot,
});
const lessonContext = [
  '',
  'This is a diagnostic study guide for AP Statistics. Each unit is graded independently so the student can see immediate feedback and decide where to focus their review. Grade FRQs as the AP Exam would grade them - partial credit is allowed, but the student should be addressing every part of the question with statistically correct reasoning. Be strict about statistical vocabulary (population vs sample, parameter vs statistic, interval vs point estimate, interpret vs compute, random assignment vs random selection) but forgiving of minor arithmetic slips as long as the method is right.',
  '',
  'The purpose of this diagnostic is to help the student decide which units and lessons to review before the AP Exam. Your feedback should be specific enough that the student knows exactly which part of the question they stumbled on, so they can find the corresponding lesson in the AP Course Framework.',
  '',
].join('\n');
const studyGuideFocusBody = {
  scenario: {
    topic: 'AP Statistics Diagnostic Focus Synthesis',
    questionId: 'SG-U6-FOCUS',
    lessonContext,
  },
  answers: { answer: 'Focus synthesis request' },
  prompt: studyGuidePrompt,
  student_id: null,
};

const answer38 = 'A statistically sound response of 38b.';
const answer8192 = 'A'.repeat(8 * 1024);
const wsU8L6MaxAnswerBody = {
  scenario: JSON.parse(JSON.stringify(maximumBatchBody.scenario)),
  items: ['exitTicket', 'reflect1', 'reflect2'].map((questionId) => {
    const source = maximumBatchBody.items.find((item) => item.questionId === questionId);
    return {
      questionId,
      prompt: source.prompt.replace(answer38, answer8192),
      answer: answer8192,
    };
  }),
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

export const AI_GRADE_CORPUS_EVIDENCE = deepFreeze({
  sourceRevision: 'SY2627 checked-in corpus frozen 2026-08-21',
  maximumBatchPromptBytes: [
    { worksheet: 'WS-U8L6', item: 'exitTicket', bytes: 10278, sha256: '2c365a0fac72bce93251ea022f72213172f04fca31359fa6f3bbb54f8cf8d4a9' },
    { worksheet: 'WS-U8L6', item: 'reflect2', bytes: 10135, sha256: 'd2f41d92c63fbf593d7ecf6fda617eba127b960ece3c0b5743b9ef32aaa37e30' },
    { worksheet: 'WS-U8L3', item: 'exitTicket', bytes: 9896, sha256: 'a213c36182a06e8dcb06e9b3752d84287fdcdf2759931301effc0978e0afa082' },
    { worksheet: 'WS-U8L6', item: 'reflect1', bytes: 9784, sha256: '7fbcfd995fea9dcb47b5a4d3b09095c638709f7dfbe74cd5e4e8792fc4c41338' },
    { worksheet: 'WS-U8L3', item: 'reflect1', bytes: 9466, sha256: '191830c77de395f6ea4e6c25fe0301830a7f32746b4ce5bdfd1fc2c3c69f0993' },
    { worksheet: 'WS-U8L3', item: 'reflect2', bytes: 9216, sha256: 'cf353043b89f5b3f2301f9686cf33e458c5935f596aafea3bd62fc9db94fbc7a' },
    { worksheet: 'WS-U7L7', item: 'exitTicket', bytes: 8617, sha256: 'ab8f361978a47761543f025e4d3d70a3604fc6b404e953fce48fa286cb75b0dc' },
    { worksheet: 'WS-U7L3', item: 'exitTicket', bytes: 8089, sha256: '4fc2ed8ae57d20ef180db2950ffa1b7c6891f08fb07b29a0ccfec3725e1a0a7a' },
  ],
  maximumBatchBodyBytes: 83929,
  wsU8L6MaxAnswerBodyBytes: 86450,
  studyGuideMcqCount: 81,
  studyGuidePromptBytes: Buffer.byteLength(studyGuidePrompt),
  studyGuideBodyBytes: Buffer.byteLength(JSON.stringify(studyGuideFocusBody)),
  worksheet81BodyBytes: 23805,
  worksheet75BodyBytes: 19146,
});

export const MAXIMUM_BATCH_BODY = deepFreeze(maximumBatchBody);
export const WS_U8L6_MAX_ANSWER_BODY = deepFreeze(wsU8L6MaxAnswerBody);
export const STUDY_GUIDE_FOCUS_BODY = deepFreeze(studyGuideFocusBody);
export const WORKSHEET_81_BODY = deepFreeze(worksheet81Body);
export const WORKSHEET_75_BODY = deepFreeze(worksheet75Body);
