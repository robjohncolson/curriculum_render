/**
 * QUIZ_INCONGRUENCE_CHECK_SPEC Part B (§4, §7): the explanation ↔ pick detector, unit level.
 *
 * quizExplanationPointsTo(text, choices, pickedKey, firstAnswerKey, prompt) answers the one option
 * letter an explanation argues for, or null when that is unclear. It is a port of the Python reference
 * points_to() in scripts/quiz-congruence-dry-run.py, and tests/fixtures/quiz-congruence-corpus.json is
 * the contract: 255 rows in 38 sets, every `expect` computed by the Python, the two known residual cards
 * included. The real page boots once in jsdom (helpers copied from quiz-settled-dom.test.js) and every
 * test calls the page's own window.quizExplanationPointsTo.
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
  it('is the 255 rows in 38 sets that the spec names', () => {
    expect(FIXTURE.sets).toHaveLength(38);
    expect(allRows()).toHaveLength(255);
    expect(FIXTURE.rowCount).toBe(255);
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
      localStorage.setItem('quizRetryState_Someone', JSON.stringify({ firstAnswers: { '${QID}': 'C' }, retries: {} }));
    `);
    try {
      const answersLater = allRows().map(({ set, row }) => rowCall(set, row));
      expect(answersLater).toEqual(answersNow);
    } finally {
      w.eval(`
        currentUsername = 'Me'; window.currentUsername = 'Me';
        delete classData.users.Someone;
        currentQuestions[0].answerKey = 'B';
        localStorage.removeItem('quizRetryState_Someone');
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
