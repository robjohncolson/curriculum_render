/**
 * QUIZ_INCONGRUENCE_CHECK_SPEC Part B (§4, §7): the explanation ↔ pick detector, unit level.
 *
 * quizExplanationPointsTo(text, choices, pickedKey, firstAnswerKey, prompt) answers the one option
 * letter an explanation argues for, or null when that is unclear. It is a port of the Python reference
 * points_to() in scripts/quiz-congruence-dry-run.py, and tests/fixtures/quiz-congruence-corpus.json is
 * the contract: 345 rows in 68 sets, every `expect` computed by the Python, the two known residual cards
 * and the 2026-10-26 teacher-test rows (R1 article-tolerant paste, R2 bare-number options) and review
 * fixes included. The real page boots once in jsdom (helpers copied from quiz-settled-dom.test.js) and
 * every test calls the page's own window.quizExplanationPointsTo.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';
const FIXTURE = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/quiz-congruence-corpus.json'), 'utf8'));
const BLOCK_START = '// ── Explanation ↔ pick congruence (QUIZ_INCONGRUENCE_CHECK_SPEC §4) ──';
const BLOCK_END = '// ── end congruence ──';

let pageSources = null;
function pageScripts() {
  if (pageSources) return pageSources;
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  pageSources = [];
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src = /src="([^"]+)"/.exec(m[1]);
    if (src) {
      const file = resolve(ROOT, src[1]);
      if (/^https?:/.test(src[1]) || !existsSync(file)) continue;
      pageSources.push(readFileSync(file, 'utf8'));
      continue;
    }
    pageSources.push(m[2]);
    if (m[2].length > 500000) break;   // the main quiz script: everything the tests need
  }
  return pageSources;
}

// The quiz-settled-dom boot: the real page scripts, signed in as 'Me', one MCQ in currentQuestions.
function boot() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
    url: 'https://quiz.test/',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  w.fetch = () => new Promise(() => {});   // nothing on the network ever answers
  w.alert = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  for (const code of pageScripts()) {
    const el = w.document.createElement('script');
    el.textContent = code;
    w.document.body.appendChild(el);
  }
  w.onload = null;
  w.Chart = function () { return { destroy() {}, update() {} }; };
  w.gradebookClient = { record: () => Promise.resolve({ ok: true, ledgerId: 'L' }) };
  w.rosterClient = { token: () => null, studentId: () => 'stu-me' };
  w.eval(`
    currentUsername = 'Me'; window.currentUsername = 'Me';
    currentQuestions = [{
      id: '${QID}', type: 'multiple-choice', prompt: 'Which one?', answerKey: 'B',
      explanation: 'Because B is right.',
      choices: [{ key: 'A', value: 'alpha' }, { key: 'B', value: 'bravo' }, { key: 'C', value: 'charlie' }]
    }];
    classData = { users: { Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} } } };
  `);
  return w;
}

let w;
let pointsTo;
beforeAll(() => {
  w = boot();
  pointsTo = w.quizExplanationPointsTo;
}, 60000);
afterAll(() => {
  try { w.close(); } catch (_) {}
});

const setNamed = name => FIXTURE.sets.find(s => s.name === name);
const GEN = setNamed('spec:GEN');    // the spec's general item: "Compare Group A and Group B."
const PROB = setNamed('spec:PROB');  // events A and B, LaTeX prompt, numeric choice texts
const rowCall = (set, row, choices = set.choices) => pointsTo(row.text, choices, row.pick, row.first, set.prompt);
const allRows = () => FIXTURE.sets.flatMap(set => set.rows.map(row => ({ set, row })));

function pageBlock() {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const start = html.indexOf(BLOCK_START);
  const end = html.indexOf(BLOCK_END);
  return start >= 0 && end > start ? html.slice(start, end + BLOCK_END.length) : '';
}

describe('quizExplanationPointsTo on the page', () => {
  it('is on window and takes (text, choices, pickedKey, firstAnswerKey, prompt)', () => {
    expect(typeof pointsTo).toBe('function');
    expect(pointsTo.length).toBe(5);
    expect(pageBlock()).not.toBe('');
  });
});

describe('the contract corpus (tests/fixtures/quiz-congruence-corpus.json)', () => {
  it('is the 345 rows in 68 sets that the spec names', () => {
    expect(FIXTURE.sets).toHaveLength(68);
    expect(allRows()).toHaveLength(345);
    expect(FIXTURE.rowCount).toBe(345);
  });

  for (const set of FIXTURE.sets) {
    it(`${set.name}: every row matches the Python reference (${set.rows.length} rows)`, () => {
      const mismatches = set.rows
        .map(row => ({ text: row.text, pick: row.pick, first: row.first, expected: row.expect, got: rowCall(set, row) }))
        .filter(result => result.got !== result.expected);
      expect(mismatches).toEqual([]);
    });
  }

  it('keeps the two known residual cards (spec §4: a human would not show them; one tap dismisses)', () => {
    const adversarial = setNamed('adversarial-1');
    const row = text => adversarial.rows.find(r => r.text === text);
    const outlier = row('D would be right if there was no outlier but there is one');
    const letterE = row('the letter E is the most common letter in english so the expected count is highest');
    expect(rowCall(adversarial, outlier)).toBe('D');
    expect(rowCall(adversarial, letterE)).toBe('E');
  });
});

// A real bank item, and the detector on it.
const bankItem = id => w.eval(`JSON.parse(JSON.stringify(EMBEDDED_CURRICULUM.find(q => q.id === '${id}')))`);
const choicesOf = item => (item.attachments && item.attachments.choices) || item.choices;
const on = (id, text, pick, first = null) => {
  const item = bankItem(id);
  return pointsTo(text, choicesOf(item), pick, first, item.prompt);
};
const lettered = values => values.map((value, i) => ({ key: 'ABCDE'[i], value }));

// The 2026-10-26 teacher test (spec §0 addendum, §4 R1 and R2), on the real bank items.
describe('R1 (a pasted option without its article) and R2 (a bare-number option named by its value)', () => {
  const SPREAD = setNamed('spec:SPREAD');
  const onSpread = text => pointsTo(text, SPREAD.choices, 'A', null, SPREAD.prompt);

  it('the four real rows: "0.19 because" names B, "law of large numbers" names D, the other two stay unclear', () => {
    expect(on('U4-L2-Q01', '0.19 because', 'A')).toBe('B');
    expect(on('U4-L2-Q01', '0l19 because I like', 'C', 'A')).toBeNull();
    expect(on('U4-L2-Q03', 'addition rule because!', 'B')).toBeNull();   // two words: under the R1 floor
    expect(on('U4-L2-Q03', 'law of large numbers', 'B', 'B')).toBe('D');
  });

  it('R1: one leading article may be missing; the stripped option still needs 12 characters and 3 words', () => {
    expect(on('U4-L2-Q03', 'the law of large numbers', 'B', 'B')).toBe('D');
    expect(on('U4-L2-Q03', 'conditional probability rule', 'D')).toBe('A');
    expect(on('U4-L2-Q03', 'multiplication rule', 'D')).toBeNull();
    expect(onSpread('mean')).toBeNull();
    expect(onSpread('the mean')).toBeNull();
    expect(onSpread('standard deviation')).toBeNull();
    expect(onSpread('the standard deviation')).toBe('E');
  });

  it('R2: a number equal to exactly one bare-number option names it; a percent equals its proportion', () => {
    expect(on('U4-L2-Q01', '0.190', 'A')).toBe('B');
    expect(on('U4-L2-Q01', '19% because', 'A')).toBe('B');
    expect(on('U4-L2-Q01', '0.19 because I like', 'C', 'A')).toBe('B');
    const percents = setNamed('spec:teacher-test-2026-10-26/percent-options');
    expect(pointsTo('0.19 because', percents.choices, 'A', null, percents.prompt)).toBe('B');
    expect(pointsTo('19 because', percents.choices, 'A', null, percents.prompt)).toBeNull();   // no tolerance
  });

  it('R2 never counts a number the question prints, two options at once, LaTeX, a glued token, or worked arithmetic', () => {
    expect(on('U4-L2-Q01', '15 percent of callers wait so 0.15', 'B')).toBeNull();   // "15 percent" is printed
    expect(on('U4-L2-Q01', '0.15 because', 'B')).toBeNull();
    expect(on('U4-L2-Q01', '0.19 or 0.474', 'A')).toBeNull();
    expect(on('U4-L2-Q01', '\\(0.19\\) because', 'A')).toBeNull();
    expect(on('U4-L2-Q01', 'x0.19 because', 'A')).toBeNull();
    expect(on('U4-L2-Q01', '0.19 because 0.15 + 0.04 = 0.19', 'A')).toBeNull();
    expect(on('U4-L2-Q02', '0 to 6 because!', 'E')).toBeNull();   // sentence options: R2 does not apply
    const shared = setNamed('spec:teacher-test-2026-10-26/shared-value');
    expect(pointsTo('0.5 because half', shared.choices, 'C', null, shared.prompt)).toBeNull();   // 0.5 and 50% share a value
  });

  it('R2 references go through the negation rules like letters do', () => {
    expect(on('U4-L2-Q01', 'not 0.19, it is 0.474', 'A')).toBe('C');
    expect(on('U4-L2-Q01', '0.19 is wrong', 'A')).toBeNull();
  });

  it('neither rule reads the key: the same letters with the key deleted, and with a wrong key', () => {
    const rows = setNamed('spec:teacher-test-2026-10-26/U4-L2-Q01').rows.map(row => ['U4-L2-Q01', row])
      .concat(setNamed('spec:teacher-test-2026-10-26/U4-L2-Q03').rows.map(row => ['U4-L2-Q03', row]));
    const lettersWith = keyFor => rows.map(([id, row]) => {
      const item = bankItem(id);
      const choices = choicesOf(item);
      const key = keyFor(item.answerKey);
      if (key === undefined) delete item.answerKey; else item.answerKey = key;
      choices.answerKey = key;   // even riding along on the array the detector does read
      return pointsTo(row.text, choices, row.pick, row.first, item.prompt);
    });
    const asShipped = lettersWith(key => key);
    expect(asShipped).toEqual(rows.map(([, row]) => row.expect));
    expect(lettersWith(() => undefined)).toEqual(asShipped);
    expect(lettersWith(key => (key === 'A' ? 'B' : 'A'))).toEqual(asShipped);
  });
});

// The 2026-10-26 review of R1 / R2. The expected letters are written by hand from the review's
// scenarios (null = no card), not regenerated from the Python, so a rule that drifts in both fails here.
describe('R1 / R2 review cases: a rejected paste, cue-less numbers, fractions, long lists', () => {
  it('a pasted option the words around it reject is no hit (Step 2 rules, as for a letter)', () => {
    expect(on('U4-L2-Q03', 'not law of large numbers', 'B')).toBeNull();
    expect(on('U4-L2-Q03', 'law of large numbers is wrong', 'B')).toBeNull();
    expect(on('U4-L2-Q03', 'the law of large numbers? no', 'B')).toBeNull();
    expect(on('U4-L2-Q03', 'not the law of large numbers', 'B')).toBeNull();
    expect(on('U4-L2-Q03', 'I think the law of large numbers', 'B')).toBe('D');
    expect(on('U4-L2-Q03', 'law of large numbers, not C', 'B')).toBe('D');   // the "not" is C's
  });

  it('a capital A that is a label is not an article ("A and B are independent")', () => {
    const choices = lettered(['A and C are mutually exclusive', 'B and C are mutually exclusive', 'A and B are independent',
      'None of these events', 'A simple random sample of the students']);
    const prompt = 'Events A, B and C. Which is true?';
    expect(pointsTo('C and B are independent', choices, 'D', null, prompt)).toBeNull();
    expect(pointsTo('and C are mutually exclusive', choices, 'B', null, prompt)).toBeNull();
    expect(pointsTo('simple random sample of the students', choices, 'B', null, prompt)).toBe('E');   // a real article
  });

  it('a number needs a cue: working that passes a distractor names nothing', () => {
    expect(on('U4-L2-Q01', '1 minus 0.19', 'E')).toBeNull();
    expect(on('U4-L2-Q01', 'P(at most 2) is 1 - 0.19', 'E')).toBeNull();
    expect(on('U4-L2-Q01', 'the complement of 0.19', 'E')).toBeNull();
    expect(on('U4-L2-Q01', 'at least 3 callers is 0.19, so at most 2 is the rest', 'E')).toBeNull();
    expect(on('U4-L10-Q03', 'add 0.16, 0.34, 0.29 and 0.15', 'E')).toBeNull();
    expect(on('U4-L8-Q01', 'multiply each number of books by its probability, starting at 0 books', 'C')).toBeNull();
    expect(on('U2-L8-Q02', 'the slope is the estimate next to diameter, the 5 is the intercept, 2.50 is its standard error', 'A')).toBeNull();
    expect(on('U1-L8-Q01', 'the max is 50 but the top quarter starts at Q3', 'D')).toBeNull();
    expect(on('U8-L4-Q01', 'the observed count is 58 but expected uses the totals', 'E')).toBeNull();
    const counts = lettered(['19', '0.19', '0.5']);
    expect(pointsTo('I counted 19 outcomes', counts, 'C', null, 'Pick one.')).toBeNull();
  });

  it('a number that leads, follows a pick word, or continues such a list still names its option', () => {
    expect(on('U4-L2-Q01', 'its 0.19', 'A')).toBe('B');
    expect(on('U4-L2-Q01', 'the answer is 0.19', 'A')).toBe('B');
    expect(on('U4-L2-Q01', 'I picked 0.19', 'A')).toBe('B');
    expect(on('U4-L2-Q01', 'I think it is 0.474', 'A')).toBe('C');
    expect(on('U4-L2-Q01', '0.19 or 0.474', 'A')).toBeNull();   // the list: two options, unclear
    expect(on('U4-L2-Q01', 'I picked 0.81 but meant 0.19', 'A')).toBeNull();
  });

  it('a fraction is working, never a pick (typed or as LaTeX source)', () => {
    expect(on('U8-L4-Q02', '9/51', 'B')).toBeNull();
    expect(on('U8-L4-Q02', '9/38 because 9 out of 38', 'A')).toBeNull();
    expect(on('U8-L4-Q02', 'its \\frac{9}{51}', 'B')).toBeNull();
    expect(on('U2-L8-Q02', 'its 1/30', 'E')).toBeNull();
    expect(pointsTo('19/100 because', lettered(['19', '0.19', '0.5']), 'C', null, 'Pick one.')).toBeNull();
  });

  it('a negation carries along a bare list of numbers of any length', () => {
    expect(on('U4-L2-Q01', 'not 0.19, 0.474, 0.526, 0.81', 'A')).toBeNull();
    expect(on('U4-L2-Q01', 'I ruled out 0.19, 0.474, 0.526 and 0.81', 'A')).toBeNull();
    const tenths = lettered(['0.1', '0.2', '0.3', '0.4', '0.5']);
    expect(pointsTo('not 0.1, 0.2, 0.3, 0.4', tenths, 'E', null, 'Pick one.')).toBeNull();
    expect(pointsTo('not 0.1, 0.2, 0.3, 0.4, 0.5', tenths, 'E', null, 'Pick one.')).toBeNull();
  });

  it('a printed LaTeX percent is a printed value: "\\(19\\%\\)" prints 0.19', () => {
    const choices = lettered(['0.19', '0.81', '19', '75%', '0.5']);
    const prompt = 'The rate is \\(19\\%\\). Find its complement.';
    expect(pointsTo('0.19 because', choices, 'B', null, prompt)).toBeNull();
    expect(pointsTo('0.19 is the given rate', choices, 'B', null, prompt)).toBeNull();
    expect(pointsTo('its 0.81', choices, 'A', null, prompt)).toBe('B');
  });

  it('only option text is a number option: a number value prints differently in the browser and in Python', () => {
    expect(pointsTo('0.000001 because', [{ key: 'A', value: 0.000001 }, { key: 'B', value: '0.5' }], 'B', null, 'Pick one.')).toBeNull();
    expect(pointsTo('0.000001 because', [{ key: 'A', value: '0.000001' }, { key: 'B', value: '0.5' }], 'B', null, 'Pick one.')).toBe('A');
  });

  it('a number touching any character outside the plain list is skipped, whatever the Unicode version', () => {
    expect(on('U4-L2-Q01', '0.19\u1C89', 'A')).toBeNull();
    expect(on('U4-L2-Q01', '\u1C890.19', 'A')).toBeNull();
    expect(on('U4-L2-Q01', '0.19\u{10D4A}', 'A')).toBeNull();
    expect(on('U4-L2-Q01', '~0.19', 'A')).toBeNull();
    expect(on('U4-L2-Q01', '0.19\u00a0because', 'A')).toBe('B');   // a space is a space
    expect(on('U4-L2-Q01', '(0.19) because', 'A')).toBe('B');
  });
});

// The second review of R1 / R2 (2026-10-26). Hand-written outcomes again (null = no card): each case gave a card
// for a letter the student never argued for, often on a pick that was the key.
describe('R1 / R2 second review: a number that describes a step, fractions in words, lists rejected after them', () => {
  it('a leading number names its option only alone or before a reason, never as the subject of a step', () => {
    expect(on('U4-L2-Q01', '0.19 is P(at least 3) so I took the complement', 'E')).toBeNull();   // E is the key
    expect(on('U2-L8-Q02', '5 is the intercept and 30 the slope', 'A')).toBeNull();
    expect(on('U4-L10-Q03', '0.15 is the last bar so I added up to 3', 'E')).toBeNull();
    expect(on('U1-L8-Q01', '50 is the max but Q3 is 35', 'D')).toBeNull();
    expect(on('U4-L8-Q01', '0 books has 0.35 so multiply', 'C')).toBeNull();
    expect(on('U1-L10-Q07', '32% is outside so half', 'C')).toBeNull();
    expect(on('U4-L2-Q01', '0.19', 'A')).toBe('B');
    expect(on('U4-L2-Q01', '0.19, because', 'A')).toBe('B');
    expect(on('U4-L2-Q01', '0.19 BECAUSE it fits', 'A')).toBe('B');
    expect(on('U4-L2-Q01', '0.19 becausex', 'A')).toBeNull();
  });

  it('a fraction, ratio or product typed with spaces, brackets or words is working, never a pick', () => {
    expect(on('U8-L4-Q03', '(39)(87)/91', 'B')).toBeNull();
    expect(on('U8-L4-Q03', '(39)(87)/91 because row times column', 'B')).toBeNull();
    expect(on('U8-L4-Q02', '9 divided by 51', 'B')).toBeNull();
    expect(on('U8-L4-Q02', '9 / 38', 'A')).toBeNull();
    expect(on('U8-L4-Q02', '9 of the 38 students', 'A')).toBeNull();
    expect(on('U8-L4-Q02', '(9)/(38)', 'A')).toBeNull();
    expect(on('U8-L4-Q02', '9 times 38 over 153', 'E')).toBeNull();
    const ones = lettered(['1', '0.5', '0.2']);
    for (const text of ['its 1 / 30', 'its 1 in 5', 'its 1:5', 'its 1 fifth', 'its 1 IN 5']) {
      expect(pointsTo(text, ones, 'B', null, 'Pick one.')).toBeNull();
    }
    expect(pointsTo('its 1', ones, 'B', null, 'Pick one.')).toBe('A');
  });

  it('a negation after a list of numbers reaches back along it', () => {
    expect(on('U4-L2-Q01', '0.19 and 0.474 are wrong', 'E')).toBeNull();
    expect(on('U4-L2-Q01', 'I think 0.19 and 0.474 are wrong', 'E')).toBeNull();
    const tenths = lettered(['0.1', '0.2', '0.3', '0.4', '0.5']);
    expect(pointsTo('I think 0.1, 0.2 and 0.3 are wrong', tenths, 'E', null, 'Pick one.')).toBeNull();
  });

  it('a number inside LaTeX names nothing, also with a space before the closing delimiter', () => {
    expect(on('U4-L2-Q01', 'its \\(0.19 \\) because', 'A')).toBeNull();
    expect(on('U4-L2-Q01', 'the answer is \\(0.19 \\)', 'A')).toBeNull();
  });

  it('a percent the question prints counts however it is spelled, and whatever letter follows "percent"', () => {
    const rates = lettered(['0.19', '0.81']);
    for (const prompt of ['The rate is 19 percentᲉ.', 'The rate is \\(19\\ \\%\\).', 'The rate is 19-percent.',
      'The rate is 19 per cent.', 'The rate is 19 %.', 'The rate is 19 PERCENT.']) {
      expect(pointsTo('its 0.19', rates, 'B', null, prompt)).toBeNull();
    }
    expect(pointsTo('its 0.19', rates, 'B', null, 'The rate is 19 percentage points.')).toBe('A');
  });

  it('a capital A before a copula is event A, not the article ("A is independent of itself")', () => {
    const choices = lettered(['None of these', 'Both events occur', 'A is independent of itself', 'A sample of thirty students']);
    const prompt = 'Events A and B. Which statement is true?';
    expect(pointsTo('B is independent of itself', choices, 'A', null, prompt)).toBeNull();
    expect(pointsTo('sample of thirty students', choices, 'A', null, prompt)).toBe('D');   // a real article
  });
});

describe('correctness-blind by construction (spec §3)', () => {
  const KEY_NAMES = ['answerKey', '_quizKeyFor', 'getCorrectAnswer', 'firstAnswerWasCorrect', 'correct_answer'];
  const PAGE_NAMES = ['document', 'window', 'classData', 'currentUsername', 'localStorage', 'fetch'];

  it('the function on window names neither the key, the question object nor the page', () => {
    const source = pointsTo.toString();
    for (const name of [...KEY_NAMES, 'question.', ...PAGE_NAMES]) expect(source).not.toContain(name);
  });

  it('nor does anything else in its block of index.html (tables, helpers, comments)', () => {
    const block = pageBlock();
    for (const name of [...KEY_NAMES, 'question.', ...PAGE_NAMES, 'Date', 'Math.random']) expect(block).not.toContain(name);
  });

  it('the pick never changes the answer, so a right pick and a wrong pick get the same letter', () => {
    const changed = allRows().filter(({ set, row }) => {
      const answers = ['A', 'B', 'C', 'D', 'E', null].map(pick => pointsTo(row.text, set.choices, pick, row.first, set.prompt));
      return new Set(answers).size !== 1;
    }).map(({ set, row }) => `${set.name}: ${row.text}`);
    expect(changed).toEqual([]);
  });
});

describe('pure', () => {
  it('gives the same answer for the same input, every time', () => {
    const unstable = allRows().filter(({ set, row }) => rowCall(set, row) !== rowCall(set, row));
    expect(unstable).toEqual([]);
  });

  it('never writes to the choices it is given (frozen choices give the same answers)', () => {
    const before = JSON.stringify(FIXTURE.sets.map(set => set.choices));
    const deepFrozen = choices => Object.freeze(choices.map(choice => Object.freeze({ ...choice })));
    const differ = allRows().filter(({ set, row }) => rowCall(set, row, deepFrozen(set.choices)) !== rowCall(set, row));
    expect(differ).toEqual([]);
    expect(JSON.stringify(FIXTURE.sets.map(set => set.choices))).toBe(before);
  });

  it('needs nothing from the page: its block alone, in an empty sandbox, answers every row the same', () => {
    // A reference to any page global would throw in here (and read as null); a global it created would show.
    const sandbox = createContext({});
    const alone = runInContext(`${pageBlock()}\nquizExplanationPointsTo;`, sandbox);
    const differ = allRows().filter(({ set, row }) => alone(row.text, set.choices, row.pick, row.first, set.prompt) !== row.expect)
      .map(({ set, row }) => `${set.name}: ${row.text}`);
    expect(differ).toEqual([]);
    expect(Object.keys(sandbox)).toEqual([]);
  });

  it('reads no page state: the signed-in student, their answers, storage and the key do not move it', () => {
    const answersNow = allRows().map(({ set, row }) => rowCall(set, row));
    w.eval(`
      currentUsername = 'Someone'; window.currentUsername = 'Someone';
      classData.users.Someone = { answers: { '${QID}': { value: 'E', timestamp: 1 } }, reasons: {}, timestamps: {}, attempts: { '${QID}': 1 } };
      currentQuestions[0].answerKey = 'E';
    `);
    try {
      const answersLater = allRows().map(({ set, row }) => rowCall(set, row));
      expect(answersLater).toEqual(answersNow);
    } finally {
      w.eval(`
        currentUsername = 'Me'; window.currentUsername = 'Me';
        delete classData.users.Someone;
        currentQuestions[0].answerKey = 'B';
      `);
    }
  });

  it('tolerates any argument: a non-string text is null, a non-string prompt is no prompt, never a throw', () => {
    const think = (overrides = {}) => {
      const args = { text: 'I think its C', choices: GEN.choices, pick: 'D', first: null, prompt: GEN.prompt, ...overrides };
      return pointsTo(args.text, args.choices, args.pick, args.first, args.prompt);
    };
    expect(think()).toBe('C');
    for (const text of [undefined, null, 0, 42, true, {}, [], ['I think its C'], { toString: () => 'I think its C' }, Symbol('C')]) {
      expect(think({ text })).toBeNull();
    }
    const withoutPrompt = think({ prompt: '' });
    for (const prompt of [undefined, null, 0, 42, true, {}, ['Compare Group A and Group B.']]) {
      expect(think({ prompt })).toBe(withoutPrompt);
    }
    for (const pick of [undefined, null, '', 0, 'c', 'Z', {}]) expect(think({ pick })).toBe('C');
    for (const first of [undefined, null, '', 0, false]) expect(think({ first })).toBe('C');
    for (const choices of [undefined, null, 'ABCDE', 5, {}, [], [null, 5, 'x', undefined], [{ value: 'a choice without a key' }]]) {
      expect(think({ choices })).toBeNull();
    }
    // hostile values: a throwing getter, a throwing Proxy, a Symbol key — still null, still no throw
    const throwing = GEN.choices.slice();
    Object.defineProperty(throwing, 0, { get() { throw new Error('a getter that throws'); } });
    const proxy = new Proxy([], { get() { throw new Error('a proxy that throws'); } });
    for (const choices of [throwing, proxy, [{ key: Symbol('A'), value: 'x' }]]) {
      expect(think({ choices })).toBeNull();
    }
  });
});

describe('robust on whatever a student pastes', () => {
  const BUDGET_MS = 50;
  const char = (...codes) => String.fromCodePoint(...codes);
  const fill = (unit, length) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
  const PROSE = 'The median is resistant to outliers, so one huge value moves the mean a lot but barely moves the median. ';
  // Each expected letter is the Python reference's answer for the same input (spec:GEN item, pick D).
  const INPUTS = [
    ['empty', '', null],
    ['spaces', '     ', null],
    ['newlines and tabs only', '\n\t\n', null],
    ['a 6,000-character paste', `${fill(PROSE, 5990)} I pick C.`, 'C'],
    ['emoji', `${char(0x1F600, 0x1F600)} C ${char(0x1F44D, 0x1F3FD)} because the median ${char(0x1F937)}`, 'C'],
    ['curly quotes', `I think it${char(0x2019)}s ${char(0x201C)}C${char(0x201D)} because the median resists`, 'C'],
    ['newlines', 'C\n\nbecause the median\nresists', 'C'],
    ['tabs', 'C\tbecause\tthe median', 'C'],
    ['a no-break space', `C${char(0xA0)}because the median resists`, 'C'],
    ['a byte-order mark', `${char(0xFEFF)}C because the median resists`, 'C'],
    ['a zero-width space', `C${char(0x200B)} because the median resists`, 'C'],
    ['a lone surrogate', `${String.fromCharCode(0xD83D)} C because the median resists`, 'C'],
    ['HTML and LaTeX', '\\(P(A \\cap B)\\) = <b>0.12</b> so A', null],
  ];

  // One untimed call first, then the best of `runs`: the whole suite runs in parallel, and a busy
  // machine should not fail a budget the detector itself meets.
  function bestOf(runs, fn) {
    let answer = fn();
    let best = Infinity;
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      answer = fn();
      best = Math.min(best, performance.now() - start);
    }
    return { answer, ms: best };
  }

  for (const [name, text, expected] of INPUTS) {
    it(`${name}: ${expected === null ? 'unclear' : expected}, in under ${BUDGET_MS} ms, no throw`, () => {
      const { answer, ms } = bestOf(5, () => pointsTo(text, GEN.choices, 'D', null, GEN.prompt));
      expect(answer).toBe(expected);
      expect(ms).toBeLessThan(BUDGET_MS);
    });
  }

  it(`a choice value that is a number reads like the same value written as text, in under ${BUDGET_MS} ms`, () => {
    const numeric = PROB.choices.map(choice => ({ key: choice.key, value: Number(choice.value) }));
    expect(numeric.every(choice => typeof choice.value === 'number' && !Number.isNaN(choice.value))).toBe(true);
    const off = PROB.rows
      .map(row => ({ text: row.text, expected: row.expect, ...bestOf(5, () => rowCall(PROB, row, numeric)) }))
      .filter(result => result.answer !== result.expected || result.ms >= BUDGET_MS);
    expect(off).toEqual([]);
  });

  it('a paste of nothing but letters stays linear (6,000 and 60,000 characters)', () => {
    // The worst input found: every token is a letter to weigh. Alone it takes ~5-15 ms and ~70 ms; an
    // earlier, quadratic draft took ~75 ms at 6,000. The budgets leave room for a busy machine.
    const six = bestOf(3, () => pointsTo(fill('A B C D E ', 6000), GEN.choices, 'D', null, GEN.prompt));
    const sixty = bestOf(2, () => pointsTo(fill('A B C D E ', 60000), GEN.choices, 'D', null, GEN.prompt));
    expect(six.answer).toBeNull();
    expect(sixty.answer).toBeNull();
    expect(six.ms).toBeLessThan(250);
    expect(sixty.ms).toBeLessThan(1000);
  });

  it('one long run of spaces or punctuation stays linear (40,000 characters)', () => {
    // The strip helpers once trimmed the end with a `[…]+$` regex, which retries the whole run from
    // every start: 40,000 spaces took ~1.7 s. Each expected letter is the Python reference's answer.
    const N = 40000;
    const RUNS = [
      ['not A, spaces, B', 'not A' + ' '.repeat(N) + 'B', null],
      ['C, spaces, the reason', 'C' + ' '.repeat(N) + 'because the median resists', 'C'],
      ['trailing spaces', 'C because the median resists' + ' '.repeat(N), 'C'],
      ['A, commas, B (one token)', 'A' + ','.repeat(N) + 'B', null],
      ['C, commas, the reason', 'C' + ','.repeat(N) + ' because the median resists', 'C'],
      ['leading commas', ','.repeat(N) + 'C because the median resists', 'C'],
      ['C, dots, the reason', 'C' + '.'.repeat(N) + ' because the median resists', 'C'],
      ['C, dots, x', 'C ' + '.'.repeat(N) + ' x', 'C'],
      ['trailing dots', 'C because the median resists' + '.'.repeat(N), 'C'],
      ['trailing commas', 'C because the median resists' + ','.repeat(N), 'C'],
    ];
    const off = RUNS
      .map(([name, text, expected]) => ({ name, expected, ...bestOf(2, () => pointsTo(text, GEN.choices, 'D', null, GEN.prompt)) }))
      .filter(result => result.answer !== result.expected || result.ms >= 250);
    expect(off).toEqual([]);
  });

  it('an engine that cannot build lookbehind patterns (Safari before 16.4) gets null, never an error', () => {
    const RealRegExp = w.RegExp;
    w.RegExp = function RegExpWithoutLookbehind(source, flags) {
      if (String(source).includes('(?<')) throw new w.SyntaxError('Invalid regular expression: invalid group specifier name');
      return new RealRegExp(source, flags);
    };
    let answer;
    try {
      answer = pointsTo('I think its C', GEN.choices, 'D', null, GEN.prompt);
    } finally {
      w.RegExp = RealRegExp;
    }
    expect(answer).toBeNull();
    expect(pointsTo('I think its C', GEN.choices, 'D', null, GEN.prompt)).toBe('C');
  });

  it('writes every lookbehind pattern as a string for new RegExp, never as a regex literal', () => {
    // A literal with lookbehind is a parse error before Safari 16.4: the whole quiz script would not run.
    const lines = pageBlock().split('\n').filter(line => line.includes('(?<'));
    expect(lines.length).toBeGreaterThan(0);
    const literal = lines.filter(line => !/rx\(|String\.raw`/.test(line) || /(^|[=(,:!&|?{};\s])\/\(\?<[=!]/.test(line));
    expect(literal).toEqual([]);
  });
});
