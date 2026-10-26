/**
 * QUIZ_CONGRUENCE_AI_READ_SPEC §4–§6, §8 (client): the AI read behind the shipped confirm card.
 *
 * When the letter detector is silent, Submit asks the server which ONE option the explanation
 * argues for: "Checking your explanation…", then either the usual submit or the shipped card.
 * Every failure submits as today. One answer per question (QUIZ_RETRY_REMOVAL_SPEC): the read runs on
 * the first answer, for an explanation of any length (rule 4). Loads the real page into jsdom (the harness of
 * quiz-congruence-dom.test.js), drives the real renderQuestion + submitAnswer, captures
 * gradebookClient.record, and scripts fetch per test.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';      // key B; choices A alpha, B bravo, C charlie, D delta
const PC_QID = 'U1-PC-Q01';   // a College Board-secure item
const ROUTE = '/api/quiz/congruence';
const NO_LETTER = 'the middle value resists the extreme outlier';   // 7 words, names no option
const CHECKING = 'Checking your explanation…';

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

let openWindows = [];
afterEach(() => {
  for (const w of openWindows) { try { w.close(); } catch (_) {} }
  openWindows = [];
});

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

// Every fetch is held until the test answers it; only the congruence route is ever answered.
// reply() settles headers and body together; replyHeaders() settles the headers now and returns
// the function that settles the body later. net.ignoreAbort = true models a transport that never
// rejects on abort, so a reply after the budget really reaches the page's response handler.
function scriptFetch(w) {
  const net = { requests: [], ignoreAbort: false };
  w.fetch = (url, opts = {}) => {
    const request = { url: String(url), opts, body: opts.body ? JSON.parse(opts.body) : null };
    net.requests.push(request);
    return new Promise((resolvePromise, rejectPromise) => {
      request.reply = (status, body) => resolvePromise({
        status,
        ok: status >= 200 && status < 300,
        json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
      });
      request.replyHeaders = (status) => {
        let releaseBody = null;
        const body = new Promise(r => { releaseBody = r; });
        resolvePromise({ status, ok: status >= 200 && status < 300, json: () => body });
        return releaseBody;
      };
      request.fail = () => rejectPromise(new TypeError('Failed to fetch'));
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => {
          request.aborted = true;
          if (!net.ignoreAbort) rejectPromise(new Error('AbortError'));
        });
      }
    });
  };
  net.reads = () => net.requests.filter(r => r.url.endsWith(ROUTE));
  net.last = () => net.reads()[net.reads().length - 1];
  return net;
}

function boot({ records, recordImpl, token = 'tok-me' } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="messageArea"></div><div id="host"></div></body>', {
    url: 'https://quiz.test/',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  openWindows.push(w);
  w.fetch = () => new Promise(() => {});
  w.alert = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  w.MathJax = { typesetPromise: () => Promise.resolve() };
  for (const code of pageScripts()) {
    const el = w.document.createElement('script');
    el.textContent = code;
    w.document.body.appendChild(el);
  }
  w.onload = null;
  w.Chart = function () { return { destroy() {}, update() {} }; };
  w.gradebookClient = {
    record: (rec) => { if (records) records.push(rec); return recordImpl ? recordImpl(rec) : Promise.resolve({ ok: true, ledgerId: 'L' }); },
  };
  w.rosterClient = { token: () => token, studentId: () => 'stu-me' };
  w.eval(`
    currentUsername = 'Me'; window.currentUsername = 'Me';
    currentQuestions = [{
      id: '${QID}', type: 'multiple-choice', prompt: 'Which one?', answerKey: 'B',
      explanation: 'Because B is right.',
      choices: [{ key: 'A', value: 'alpha' }, { key: 'B', value: 'bravo' }, { key: 'C', value: 'charlie' }, { key: 'D', value: 'delta' }]
    }, {
      id: '${PC_QID}', type: 'multiple-choice', prompt: 'Secure item?', answerKey: 'A',
      choices: [{ key: 'A', value: 'one' }, { key: 'B', value: 'two' }, { key: 'C', value: 'three' }]
    }];
    classData = { users: { Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} } } };
  `);
  const net = scriptFetch(w);
  return { w, net };
}

// loadLessonWithResources lives in the page's second large script, which the harness skips.
function loadLessonScript(w) {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const block = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .map(m => m[2]).find(code => code.includes('window.loadLessonWithResources = async function'));
  const el = w.document.createElement('script');
  el.textContent = block;
  w.document.body.appendChild(el);
}

function render(w) {
  w.eval(`document.getElementById('host').innerHTML = currentQuestions.map((q, i) => renderQuestion(q, i).html).join('');`);
}

const $ = (w, id) => w.document.getElementById(id);
const radio = (w, letter, qid = QID) => w.document.querySelector(`input[name="choice-${qid}"][value="${letter}"]`);
const checked = (w, qid = QID) => (w.document.querySelector(`input[name="choice-${qid}"]:checked`) || {}).value || null;
const mode = (w) => w.eval(`_quizFormState('${QID}').mode`);
const card = (w, qid = QID) => w.document.querySelector(`#congruence-${qid} .congruence-card`);
const cardTitle = (w, qid = QID) => { const t = $(w, `congruence-title-${qid}`); return t ? t.textContent : null; };
const letterButton = (w, letter, qid = QID) => w.document.querySelector(`#congruence-${qid} .congruence-pick[data-letter="${letter}"]`);
const button = (w, qid = QID) => $(w, `submit-${qid}`);
const label = (w, qid = QID) => button(w, qid).textContent.trim();

function type(w, text, qid = QID) {
  const textarea = $(w, `reason-${qid}`);
  textarea.value = text;
  textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
}

async function pressSubmit(w, qid = QID) {
  expect(button(w, qid).disabled).toBe(false);
  const realSubmit = w.submitAnswer;
  const results = [];
  w.submitAnswer = (...args) => { const r = realSubmit(...args); results.push(r); return r; };
  try { button(w, qid).click(); } finally { w.submitAnswer = realSubmit; }
  expect(results).toHaveLength(1);
  await tick(50);
  return results[0];
}

async function settle(ms = 250) { await tick(ms); }

async function repaint(w, qid = QID) {
  w.eval(`refreshQuestionIfVisible('${qid}')`);
  await tick();
  w.eval(`_refreshAfterReveal('${qid}')`);
  await tick();
}

// A first answer: pick, explain without naming a letter, Submit → the read goes out.
async function firstAnswerRead({ records, pick = 'D', text = NO_LETTER, ...rest } = {}) {
  const { w, net } = boot({ records, ...rest });
  render(w);
  await settle();
  expect(mode(w)).toBe('first');
  radio(w, pick).click();
  type(w, text);
  expect(await pressSubmit(w)).toBe(false);
  return { w, net };
}

describe('1. the read on a first answer, then the card', () => {
  it('Submit sends { questionId, explanation } with the bearer, records nothing, and shows Checking…', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    expect(records).toHaveLength(0);
    expect(w.eval(`Object.keys(classData.users.Me.answers).length`)).toBe(0);
    expect(net.reads()).toHaveLength(1);
    const read = net.last();
    expect(read.opts.method).toBe('POST');
    expect(read.body).toEqual({ questionId: QID, explanation: NO_LETTER });
    expect(Object.keys(read.body)).toEqual(['questionId', 'explanation']);
    expect(read.opts.headers.Authorization).toBe('Bearer tok-me');
    expect(label(w)).toBe(CHECKING);
    expect(button(w).disabled).toBe(true);
    expect(button(w).getAttribute('aria-busy')).toBe('true');
  });

  it('reply C: the shipped card, no record, focus on the title, Submit back to normal; C → one record', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    net.last().reply(200, { letter: 'C' });
    await settle();
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked D. Which one is your answer?');
    expect([...w.document.querySelectorAll(`#congruence-${QID} .congruence-pick`)].map(b => b.dataset.letter)).toEqual(['C', 'D']);
    expect(records).toHaveLength(0);
    expect(w.document.activeElement).toBe($(w, `congruence-title-${QID}`));
    expect(label(w)).toBe('Submit Answer');
    expect(button(w).disabled).toBe(false);
    expect(button(w).hasAttribute('aria-busy')).toBe(false);
    letterButton(w, 'C').click();
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 1, reasoning: NO_LETTER });
    expect(net.reads()).toHaveLength(1);   // the card's button never reads again
  });
});

describe('2. a reply that agrees or is unclear: the submit goes out as today', () => {
  for (const letter of [null, 'D']) {
    it(`reply ${JSON.stringify(letter)} → one record with D, attempt 1, no card`, async () => {
      const records = [];
      const { w, net } = await firstAnswerRead({ records });
      net.last().reply(200, { letter });
      await settle();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ response: 'D', attempt: 1, reasoning: NO_LETTER });
      expect(card(w)).toBeNull();
      expect(mode(w)).toBe('settled');   // D was wrong, and it is the grade
      expect($(w, `success-${QID}`).textContent).toBe('Not correct. The correct answer is shown below.');
      expect(button(w).hasAttribute('aria-busy')).toBe(false);
    });
  }
});

describe('3. timeouts', () => {
  it('no reply: one record at 4 s, and the late reply then does nothing', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    expect(w.eval('QUIZ_CONGRUENCE_READ_BUDGET_MS')).toBe(4000);
    await tick(3500);
    expect(records).toHaveLength(0);
    expect(label(w)).toBe(CHECKING);
    await tick(800);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 1 });
    net.reads()[0].reply(200, { letter: 'C' });
    await settle();
    expect(records).toHaveLength(1);
    expect(card(w)).toBeNull();
  }, 10000);

  it('two timeouts in a row pause the read: the next eligible submit sends no request, and it resumes after five minutes', async () => {
    const records = [];
    const { w, net } = boot({ records });
    w.eval('QUIZ_CONGRUENCE_READ_BUDGET_MS = 40');   // the same rule, on a short clock
    w.eval(`currentQuestions.push(
      { id: 'U1-L1-Q02', type: 'multiple-choice', prompt: 'Two?', answerKey: 'A', choices: [{ key: 'A', value: 'x one' }, { key: 'B', value: 'y two' }] },
      { id: 'U1-L1-Q03', type: 'multiple-choice', prompt: 'Three?', answerKey: 'A', choices: [{ key: 'A', value: 'x one' }, { key: 'B', value: 'y two' }] },
      { id: 'U1-L1-Q04', type: 'multiple-choice', prompt: 'Four?', answerKey: 'A', choices: [{ key: 'A', value: 'x one' }, { key: 'B', value: 'y two' }] })`);
    render(w);
    await settle();
    for (const qid of [QID, 'U1-L1-Q02']) {
      radio(w, qid === QID ? 'D' : 'B', qid).click();
      type(w, NO_LETTER, qid);
      expect(await pressSubmit(w, qid)).toBe(false);
      await settle(150);
    }
    expect(net.reads()).toHaveLength(2);
    expect(records.map(r => r.item_id || r.itemId || r.questionId || r.response)).toHaveLength(2);
    radio(w, 'B', 'U1-L1-Q03').click();
    type(w, NO_LETTER, 'U1-L1-Q03');
    expect(await pressSubmit(w, 'U1-L1-Q03')).toBe(true);   // paused: no request, submits at once
    expect(net.reads()).toHaveLength(2);
    expect(records).toHaveLength(3);
    // Five minutes later, within the same page, the read is back.
    const realNow = w.Date.now;
    w.Date.now = () => realNow() + 5 * 60 * 1000 + 1000;
    radio(w, 'B', 'U1-L1-Q04').click();
    type(w, NO_LETTER, 'U1-L1-Q04');
    expect(await pressSubmit(w, 'U1-L1-Q04')).toBe(false);
    expect(net.reads()).toHaveLength(3);
  });
});

describe('3b. late replies and server-side timeouts', () => {
  it('headers before the budget, the body after: one record at the budget, and the late body does nothing', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    w.eval('QUIZ_CONGRUENCE_READ_BUDGET_MS = 40');   // the next read's budget; this one keeps 4 s
    const releaseBody = net.last().replyHeaders(200);
    await tick(4300);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 1 });
    releaseBody({ letter: 'C' });
    await settle();
    expect(records).toHaveLength(1);
    expect(card(w)).toBeNull();
    expect(mode(w)).toBe('settled');
  }, 10000);

  it('a transport that ignores the abort: the reply after the budget reaches the page and does nothing', async () => {
    const records = [];
    const { w, net } = boot({ records });
    net.ignoreAbort = true;
    w.eval('QUIZ_CONGRUENCE_READ_BUDGET_MS = 40');
    render(w);
    await settle();
    radio(w, 'D').click();
    type(w, NO_LETTER);
    expect(await pressSubmit(w)).toBe(false);
    await settle(150);
    expect(net.last().aborted).toBe(true);
    expect(records).toHaveLength(1);
    net.last().reply(200, { letter: 'C' });
    await settle();
    expect(records).toHaveLength(1);
    expect(card(w)).toBeNull();
  });

  it('two nulls at the server deadline in a row pause the read like two client timeouts', async () => {
    const records = [];
    const { w, net } = boot({ records });
    w.eval('QUIZ_CONGRUENCE_SERVER_DEADLINE_MS = 30');   // the same rule, on a short clock
    w.eval(`currentQuestions.push(
      { id: 'U1-L1-Q02', type: 'multiple-choice', prompt: 'Two?', answerKey: 'A', choices: [{ key: 'A', value: 'x one' }, { key: 'B', value: 'y two' }] },
      { id: 'U1-L1-Q03', type: 'multiple-choice', prompt: 'Three?', answerKey: 'A', choices: [{ key: 'A', value: 'x one' }, { key: 'B', value: 'y two' }] })`);
    render(w);
    await settle();
    for (const qid of [QID, 'U1-L1-Q02']) {
      radio(w, qid === QID ? 'D' : 'B', qid).click();
      type(w, NO_LETTER, qid);
      expect(await pressSubmit(w, qid)).toBe(false);   // pressSubmit waits 50 ms: past the deadline
      net.last().reply(200, { letter: null });
      await settle(100);
    }
    expect(net.reads()).toHaveLength(2);
    expect(records).toHaveLength(2);
    radio(w, 'B', 'U1-L1-Q03').click();
    type(w, NO_LETTER, 'U1-L1-Q03');
    expect(await pressSubmit(w, 'U1-L1-Q03')).toBe(true);   // paused: no request, submits at once
    expect(net.reads()).toHaveLength(2);
    expect(records).toHaveLength(3);
  });

  it('a quick null is a read: it resets the count and is cached', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    net.last().reply(200, { letter: null });
    await settle();
    expect(records).toHaveLength(1);
    expect(w.eval('_quizCongruenceReadState.timeouts')).toBe(0);
    expect(w.eval(`_congruenceReadCached('${QID}', ${JSON.stringify(NO_LETTER)})`)).toBeNull();
  });

  it("source pin: the page's server deadline is the route's", () => {
    const server = readFileSync(resolve(ROOT, 'railway-server/quiz-congruence.js'), 'utf8');
    const routeMs = Number(/export const CONGRUENCE_DEADLINE_MS = (\d+);/.exec(server)[1]);
    const { w } = boot();
    expect(w.eval('QUIZ_CONGRUENCE_SERVER_DEADLINE_MS')).toBe(routeMs);
  });
});

describe('4. a missing server and broken replies fail open', () => {
  it('404 → one record, and no request on later submits for the life of the page', async () => {
    const records = [];
    const { w, net } = boot({ records });
    w.eval(`currentQuestions.push(
      { id: 'U1-L1-Q02', type: 'multiple-choice', prompt: 'Two?', answerKey: 'A', choices: [{ key: 'A', value: 'x one' }, { key: 'B', value: 'y two' }] })`);
    render(w);
    await settle();
    radio(w, 'D').click();
    type(w, NO_LETTER);
    expect(await pressSubmit(w)).toBe(false);
    net.last().reply(404, { error: 'Not Found' });
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 1 });
    // The next item: words, no letter → would read, but the route is off.
    radio(w, 'B', 'U1-L1-Q02').click();
    type(w, 'I now see the middle value resists outliers', 'U1-L1-Q02');
    expect(await pressSubmit(w, 'U1-L1-Q02')).toBe(true);
    expect(net.reads()).toHaveLength(1);
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ itemId: 'U1-L1-Q02', response: 'B', attempt: 1 });
  });

  const broken = [
    ['a 500', (r) => r.reply(500, { error: 'boom' })],
    ['invalid JSON', (r) => r.reply(200, 'not json at all')],
    ["{ letter: 'Z' }", (r) => r.reply(200, { letter: 'Z' })],
    ['a body without letter', (r) => r.reply(200, { ok: true })],
    ['a 401', (r) => r.reply(401, { error: 'roster sign-in required' })],
    ['a 429', (r) => r.reply(429, { error: 'too many' })],
    ['a network error', (r) => r.fail()],
  ];
  for (const [name, answer] of broken) {
    it(`${name} → one record as picked, no card`, async () => {
      const records = [];
      const { w, net } = await firstAnswerRead({ records });
      answer(net.last());
      await settle();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ response: 'D', attempt: 1, reasoning: NO_LETTER });
      expect(card(w)).toBeNull();
    });
  }
});

describe('5. the student changes the form during the wait: the reply is discarded', () => {
  it('typing: no record, no card, the button enabled with its normal label at once', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    type(w, NO_LETTER + ' and more');
    expect(label(w)).toBe('Submit Answer');
    expect(button(w).disabled).toBe(false);
    expect(button(w).hasAttribute('aria-busy')).toBe(false);
    net.last().reply(200, { letter: 'C' });
    await settle();
    expect(records).toHaveLength(0);
    expect(card(w)).toBeNull();
    expect(label(w)).toBe('Submit Answer');
  });

  it('another radio: no record, no card, the button enabled; a null reply sends nothing either', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    radio(w, 'A').click();
    expect(label(w)).toBe('Submit Answer');
    expect(button(w).disabled).toBe(false);
    net.last().reply(200, { letter: null });
    await settle();
    expect(records).toHaveLength(0);
    expect(card(w)).toBeNull();
    expect(checked(w)).toBe('A');
  });

  it('Submit, edit, restore and Submit again: only the newest read acts, the first reply is dropped', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    const first = net.last();
    type(w, NO_LETTER + ' and more');
    type(w, NO_LETTER);
    expect(await pressSubmit(w)).toBe(false);
    expect(net.reads()).toHaveLength(2);
    const second = net.last();
    expect(second).not.toBe(first);
    expect(second.body).toEqual(first.body);   // same text and pick as the obsolete read
    first.reply(200, { letter: 'C' });
    await settle();
    expect(records).toHaveLength(0);
    expect(card(w)).toBeNull();
    expect(label(w)).toBe(CHECKING);   // the newest read is still out
    expect(w.eval(`_congruenceReadCached('${QID}', ${JSON.stringify(NO_LETTER)})`)).toBeUndefined();
    second.reply(200, { letter: 'A' });
    await settle();
    expect(cardTitle(w)).toBe('Your explanation points to A, but you picked D. Which one is your answer?');
    expect(records).toHaveLength(0);
    expect(label(w)).toBe('Submit Answer');
  });
});

describe('6. no request, one record at once', () => {
  it('offline', async () => {
    const records = [];
    const { w, net } = boot({ records });
    Object.defineProperty(w.navigator, 'onLine', { get: () => false, configurable: true });
    render(w);
    await settle();
    radio(w, 'D').click();
    type(w, NO_LETTER);
    expect(await pressSubmit(w)).toBe(true);
    expect(net.reads()).toHaveLength(0);
    expect(records).toHaveLength(1);
  });

  it('no roster token', async () => {
    const records = [];
    const { w, net } = boot({ records, token: null });
    render(w);
    await settle();
    radio(w, 'D').click();
    type(w, NO_LETTER);
    expect(await pressSubmit(w)).toBe(true);
    expect(net.reads()).toHaveLength(0);
    expect(records).toHaveLength(1);
  });

  it('a PC item', async () => {
    const records = [];
    const { w, net } = boot({ records });
    render(w);
    await settle();
    radio(w, 'B', PC_QID).click();
    type(w, NO_LETTER, PC_QID);
    expect(await pressSubmit(w, PC_QID)).toBe(true);
    expect(net.reads()).toHaveLength(0);
    expect(records).toHaveLength(1);
  });

  // No floor (QUIZ_RETRY_REMOVAL_SPEC rule 4): one real word reads; a box with no letter or digit,
  // or over the length cap, sends nothing.
  for (const [name, text] of [['punctuation only', '?! ...'], ['over 2,000 characters', 'resists '.repeat(260).trim()]]) {
    it(name, async () => {
      const records = [];
      const { w, net } = boot({ records });
      render(w);
      await settle();
      radio(w, 'D').click();
      type(w, text);
      expect(await pressSubmit(w)).toBe(true);
      expect(net.reads()).toHaveLength(0);
      expect(records).toHaveLength(1);
    });
  }

  for (const text of ['law of averages', 'median resists', 'median', '0.19']) {
    it(`${JSON.stringify(text)} reaches the read: one request, nothing recorded yet`, async () => {
      const records = [];
      const { w, net } = boot({ records });
      render(w);
      await settle();
      radio(w, 'D').click();
      type(w, text);
      expect(await pressSubmit(w)).toBe(false);
      expect(net.reads()).toHaveLength(1);
      expect(net.last().body).toEqual({ questionId: QID, explanation: text });
      expect(records).toHaveLength(0);
    });
  }

  it('a one-word explanation the read places on another letter shows the card; that letter is the one answer', async () => {
    const records = [];
    const { w, net } = boot({ records });
    render(w);
    await settle();
    radio(w, 'D').click();
    type(w, 'median');
    expect(await pressSubmit(w)).toBe(false);
    net.last().reply(200, { letter: 'C' });
    await settle();
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked D. Which one is your answer?');
    expect(records).toHaveLength(0);
    letterButton(w, 'C').click();
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 1, reasoning: 'median' });
    expect(net.reads()).toHaveLength(1);
    expect(mode(w)).toBe('settled');
  });

  it('source pin: the page floor is the route floor, one word', () => {
    const server = readFileSync(resolve(ROOT, 'railway-server/quiz-congruence.js'), 'utf8');
    const routeFloor = Number(/export const CONGRUENCE_MIN_WORDS = (\d+);/.exec(server)[1]);
    const { w } = boot();
    expect(routeFloor).toBe(1);
    expect(w.eval('QUIZ_CONGRUENCE_READ_MIN_WORDS')).toBe(routeFloor);
  });

  it('an empty explanation on a first answer: no request, one record', async () => {
    const records = [];
    const { w, net } = boot({ records });
    render(w);
    await settle();
    radio(w, 'D').click();
    expect(await pressSubmit(w)).toBe(true);
    expect(net.reads()).toHaveLength(0);
    expect(records).toHaveLength(1);
  });
});

describe('7. the detector goes first and is unchanged', () => {
  it('it names another letter → its card at once, no request', async () => {
    const records = [];
    const { w, net } = boot({ records });
    render(w);
    await settle();
    radio(w, 'D').click();
    type(w, 'C because the median resists the outlier');
    expect(await pressSubmit(w)).toBe(false);
    expect(cardTitle(w)).toContain('points to C, but you picked D');
    expect(net.reads()).toHaveLength(0);
    expect(records).toHaveLength(0);
  });

  it('it names the pick → one record, no request', async () => {
    const records = [];
    const { w, net } = boot({ records });
    render(w);
    await settle();
    radio(w, 'C').click();
    type(w, 'C because the median resists the outlier');
    expect(await pressSubmit(w)).toBe(true);
    expect(net.reads()).toHaveLength(0);
    expect(records).toHaveLength(1);
  });
});

describe('8. the fresh-device reconcile sends nothing', () => {
  it('a first answer kept by the server after the read: the kept answer stands, nothing re-sent or re-read', async () => {
    const records = [];
    const { w, net } = boot({ records, recordImpl: () => Promise.resolve({ ok: true, firstAnswerKept: true, keptResponse: 'D' }) });
    render(w);
    await settle();
    radio(w, 'A').click();
    type(w, NO_LETTER);
    expect(await pressSubmit(w)).toBe(false);   // the first answer's own read
    expect(net.reads()).toHaveLength(1);
    net.last().reply(200, { letter: null });
    await tick(500);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'A']]);
    expect(net.reads()).toHaveLength(1);
    expect(checked(w)).toBe('D');
    expect($(w, `success-${QID}`).textContent).toBe('The gradebook already had your first answer on this question (D). That answer stands.');
  });

  it('source pin: the reconcile never submits, and the read has no skip flag but the card\'s own', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    const start = html.indexOf('function _reconcileKeptFirstAnswer(');
    const body = html.slice(start, html.indexOf('\n        }\n', start));
    expect(body).not.toContain('submitAnswer(');
    expect(html).not.toContain('congruenceAiSkip');
  });
});

describe('9. repaints during the wait', () => {
  it('refreshQuestionIfVisible and _refreshAfterReveal keep Checking… and disabled, and the reply still lands', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    await repaint(w);
    await repaint(w);
    expect(label(w)).toBe(CHECKING);
    expect(button(w).disabled).toBe(true);
    expect(checked(w)).toBe('D');
    net.last().reply(200, { letter: null });
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 1 });
  });
});

describe('10. the page cache', () => {
  it('"Let me fix my explanation", then Submit with the text unchanged: the card at once, one request in total', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    net.last().reply(200, { letter: 'C' });
    await settle();
    expect(card(w)).not.toBeNull();
    w.document.querySelector(`#congruence-${QID} .congruence-fix`).click();
    await settle();
    expect(card(w)).toBeNull();
    expect(await pressSubmit(w)).toBe(false);
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked D. Which one is your answer?');
    expect(net.reads()).toHaveLength(1);
    expect(records).toHaveLength(0);
    expect(w.document.activeElement).toBe($(w, `congruence-title-${QID}`));
  });

  it('a cached answer still decides while the read is paused or offline: the card at once, no request', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    net.last().reply(200, { letter: 'C' });
    await settle();
    w.document.querySelector(`#congruence-${QID} .congruence-fix`).click();
    await settle();
    Object.defineProperty(w.navigator, 'onLine', { get: () => false, configurable: true });
    expect(await pressSubmit(w)).toBe(false);
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked D. Which one is your answer?');
    expect(net.reads()).toHaveLength(1);
    expect(records).toHaveLength(0);
  });

  it('the card\'s own letter: one record, no second read', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records, pick: 'D' });
    net.last().reply(200, { letter: 'C' });
    await settle();
    letterButton(w, 'D').click();   // no: D is my answer
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 1 });
    expect(net.reads()).toHaveLength(1);
  });

  it('a cached letter that now agrees with the pick lets the submit go out in the same call', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records, pick: 'D' });
    net.last().reply(200, { letter: 'C' });
    await settle();
    radio(w, 'C').click();          // the student switches to C themselves; the card goes
    expect(card(w)).toBeNull();
    expect(await pressSubmit(w)).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 1, reasoning: NO_LETTER });
    expect(net.reads()).toHaveLength(1);
  });
});

describe('11. correctness-blind', () => {
  it('the correct letter B sends the same request, and a differing letter shows the same card', async () => {
    const records = [];
    const right = await firstAnswerRead({ records, pick: 'B' });
    const wrong = await firstAnswerRead({ records, pick: 'D' });
    expect(right.net.last().body).toEqual(wrong.net.last().body);
    expect(right.net.last().opts.headers).toEqual(wrong.net.last().opts.headers);
    right.net.last().reply(200, { letter: 'C' });
    wrong.net.last().reply(200, { letter: 'C' });
    await settle();
    expect(cardTitle(right.w)).toBe('Your explanation points to C, but you picked B. Which one is your answer?');
    expect(cardTitle(wrong.w)).toBe('Your explanation points to C, but you picked D. Which one is your answer?');
    const shape = (w) => [...card(w).querySelectorAll('button')].map(b => b.className);
    expect(shape(right.w)).toEqual(shape(wrong.w));
    expect(records).toHaveLength(0);
  });

  it('source pin: the read path references the item id, type and options only, never the key or the pick', () => {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    const fn = (name) => {
      const start = html.indexOf(`function ${name}(`);
      expect(start).toBeGreaterThan(-1);
      return html.slice(start, html.indexOf('\n        }\n', start));
    };
    const forbidden = /answerKey|_quizKeyFor|getCorrectAnswer|firstAnswerWasCorrect|correct_answer|_quizAnswerMatchesKey|picked|:checked|_currentAnswerValue|firstAnswers|attempt/;
    for (const name of ['_congruenceReadBody', '_congruenceReadEligible', '_fetchCongruenceRead']) {
      expect(fn(name), name).not.toMatch(forbidden);
    }
    expect(fn('_congruenceReadBody')).toContain('return { questionId, explanation: text };');
  });
});

describe('12. one student per read', () => {
  it('a same-tab sign-in as someone else during the wait: the reply is discarded, nothing recorded for either', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    w.eval(`currentUsername = 'Other'; window.currentUsername = 'Other';
      classData.users.Other = { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} };`);
    net.last().reply(200, { letter: null });
    await settle();
    expect(records).toHaveLength(0);
    expect(card(w)).toBeNull();
    expect(label(w)).toBe('Submit Answer');
    w.eval(`currentUsername = 'Me'; window.currentUsername = 'Me';`);
    await settle();
    expect(records).toHaveLength(0);
  });
});

describe('13. send-on-exit (decision 5)', () => {
  it('pagehide during the wait: exactly one record, and the late reply adds nothing', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    w.dispatchEvent(new w.Event('pagehide'));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 1, reasoning: NO_LETTER });
    net.last().reply(200, { letter: 'C' });
    await settle();
    expect(records).toHaveLength(1);
    expect(card(w)).toBeNull();
  });

  it('a topic reload during the wait: exactly one record, sent before the form goes', async () => {
    const records = [];
    const { w, net } = await firstAnswerRead({ records });
    loadLessonScript(w);
    expect(typeof w.loadLessonWithResources).toBe('function');
    let formAtRecord = null;
    w.gradebookClient.record = (rec) => {
      formAtRecord = !!$(w, `reason-${QID}`);
      records.push(rec);
      return Promise.resolve({ ok: true });
    };
    await w.loadLessonWithResources({ questions: [] });
    expect(records).toHaveLength(1);
    expect(formAtRecord).toBe(true);
    net.last().reply(200, { letter: null });
    await settle();
    expect(records).toHaveLength(1);
  });

  // The page's real exits from a quiz: "← Back to Topics" and "← Back to Units" replace the form
  // without a topic reload, so each flushes on its own.
  for (const nav of ['backToLessons', 'backToUnits']) {
    it(`${nav} during the wait: exactly one record, sent before the form goes`, async () => {
      const records = [];
      const { w, net } = await firstAnswerRead({ records });
      loadLessonScript(w);
      const host = $(w, 'host');   // inside the page's own container, which the navigation replaces
      const container = w.document.createElement('div');
      container.id = 'questionsContainer';
      host.replaceWith(container);
      container.appendChild(host);
      let formAtRecord = null;
      w.gradebookClient.record = (rec) => {
        formAtRecord = !!$(w, `reason-${QID}`);
        records.push(rec);
        return Promise.resolve({ ok: true });
      };
      w.eval(`${nav}()`);
      expect($(w, `reason-${QID}`)).toBeNull();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ response: 'D', attempt: 1, reasoning: NO_LETTER });
      expect(formAtRecord).toBe(true);
      net.last().reply(200, { letter: 'C' });
      await settle();
      expect(records).toHaveLength(1);
    });
  }

  it('a pending read whose text changed is not sent on exit', async () => {
    const records = [];
    const { w } = await firstAnswerRead({ records });
    w.eval(`document.getElementById('reason-${QID}').value = 'something else entirely now typed'`);   // no input event
    w.dispatchEvent(new w.Event('pagehide'));
    expect(records).toHaveLength(0);
  });
});
