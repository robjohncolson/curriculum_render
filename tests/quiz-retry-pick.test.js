/**
 * QUIZ_INCONGRUENCE_CHECK_SPEC Part A (§1) — the retry form never overrides the student's pick.
 *
 * The bug (2026-10-23): in retry mode every repaint (a classmate's answer, the 30 s peer pull,
 * the ledger restore) re-checked the stored WRONG first answer, so the student clicked C, typed
 * an explanation, and Submit recorded the first letter again. Loads the real page into jsdom
 * (helpers copied from quiz-settled-dom.test.js) and clicks the radio for real: the click fires
 * the `change` event the page listens for, where the old harness only set `.checked`.
 *
 * Since 2026-10-26 (second teacher decision) a retry is a new click: the retry form preselects
 * nothing, the first (wrong) letter is disabled and tagged "your first answer (not correct)", and
 * Submit retry needs a different letter. Every case that pinned "retry mode shows the stored
 * letter" now pins that; tests/quiz-retry-click-dom.test.js covers the rule itself.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';

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

// The first answer A (wrong; the key is B) is on file, so the item opens in retry mode.
const WRONG_FIRST = JSON.stringify({ firstAnswers: { [QID]: 'A' }, retries: {} });

function boot({ records, recordImpl, seedLocalStorage = {} } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
    url: 'https://quiz.test/',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  openWindows.push(w);
  for (const [k, v] of Object.entries(seedLocalStorage)) w.localStorage.setItem(k, v);
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
  w.gradebookClient = {
    record: (rec) => { if (records) records.push(rec); return recordImpl ? recordImpl(rec) : Promise.resolve({ ok: true, ledgerId: 'L' }); },
  };
  w.rosterClient = { token: () => null, studentId: () => 'stu-me' };
  w.eval(`
    currentUsername = 'Me'; window.currentUsername = 'Me';
    currentQuestions = [{
      id: '${QID}', type: 'multiple-choice', prompt: 'Which one?', answerKey: 'B',
      explanation: 'Because B is right.',
      choices: [{ key: 'A', value: 'alpha' }, { key: 'B', value: 'bravo' }, { key: 'C', value: 'charlie' }]
    }];
    classData = { users: {
      Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} },
      Peer1: { answers: { '${QID}': { value: 'B', timestamp: 1 } }, reasons: { '${QID}': 'bravo because' }, timestamps: {}, attempts: {} }
    } };
  `);
  return w;
}

function render(w) {
  w.eval(`document.getElementById('host').innerHTML = renderQuestion(currentQuestions[0], 0).html;`);
}

function seedMine(w, { answer, attempts, reason = '' }) {
  w.eval(`
    classData.users.Me.answers['${QID}'] = { value: '${answer}', timestamp: 5 };
    classData.users.Me.attempts['${QID}'] = ${attempts};
    classData.users.Me.reasons['${QID}'] = ${JSON.stringify(reason)};
  `);
}

function radio(w, letter) {
  return w.document.querySelector(`input[name="choice-${QID}"][value="${letter}"]`);
}

function checked(w) {
  return (w.document.querySelector(`input[name="choice-${QID}"]:checked`) || {}).value || null;
}

function selectedChoices(w) {
  const divs = [...w.document.querySelectorAll(`[data-question-id="${QID}"] .choice.selected`)];
  return divs.map(div => div.querySelector('input[type="radio"]').value);
}

function radiosDisabled(w) {
  return [...w.document.querySelectorAll(`input[name="choice-${QID}"]`)].every(r => r.disabled);
}

function mode(w) {
  return w.eval(`_quizFormState('${QID}').mode`);
}

// The retry form's first letter: disabled, its .choice marked, the tag inside its label.
function expectFirstAnswerShown(w, letter) {
  expect(radio(w, letter).disabled).toBe(true);
  const div = radio(w, letter).closest('.choice');
  expect(div.classList.contains('first-answer')).toBe(true);
  expect(div.querySelector('label .first-answer-tag').textContent).toBe('your first answer (not correct)');
  expect(w.document.querySelectorAll(`[data-question-id="${QID}"] .first-answer-tag`)).toHaveLength(1);
}

function type(w, text) {
  const textarea = w.document.getElementById(`reason-${QID}`);
  textarea.value = text;
  textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
}

async function pressSubmit(w) {
  w.eval(`submitAnswer('${QID}', 'multiple-choice')`);
  await tick(250);   // the page's own 50 ms / 100 ms render timers
}

// What the page does when a classmate answers, the peer pull lands, or a restore runs.
async function repaint(w) {
  w.eval(`refreshQuestionIfVisible('${QID}')`);
  await tick();
  w.eval(`refreshQuestionIfVisible('${QID}')`);
  await tick();
  w.eval(`_refreshAfterReveal('${QID}')`);
  await tick();
}

// Wrong first answer A on file, retry form open: nothing checked, the first answer A disabled and tagged.
async function openRetry(opts = {}) {
  const w = boot({ ...opts, seedLocalStorage: { quizRetryState_Me: WRONG_FIRST } });
  seedMine(w, { answer: 'A', attempts: 1 });
  render(w);
  w.eval(`_applyQuizFormState('${QID}')`);
  await tick(250);
  expect(mode(w)).toBe('retry');
  expect(checked(w)).toBeNull();
  expectFirstAnswerShown(w, 'A');
  return w;
}

describe("Part A: the retry form keeps the student's pick through repaints", () => {
  it('(a) click C, three repaints, Submit: C is still checked and C is what gets recorded', async () => {
    const records = [];
    const w = await openRetry({ records });
    radio(w, 'C').click();
    await repaint(w);
    expect(checked(w)).toBe('C');
    expect(selectedChoices(w)).toEqual(['C']);
    expectFirstAnswerShown(w, 'A');
    radio(w, 'A').click();   // disabled: the first answer can never be the retry
    expect(checked(w)).toBe('C');
    type(w, 'the median is resistant');
    await pressSubmit(w);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 2, reasoning: 'the median is resistant' });
  });

  it('(b) a refused submit (<3 words) does not reset the pick', async () => {
    const records = [];
    const w = await openRetry({ records });
    radio(w, 'C').click();
    type(w, 'no');
    await pressSubmit(w);
    expect(records).toHaveLength(0);
    expect(w.document.getElementById(`error-${QID}`).textContent).toContain('at least 3 words');
    await repaint(w);
    expect(checked(w)).toBe('C');
    type(w, 'the median is resistant');
    await pressSubmit(w);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 2 });
  });

  it('(c) pending: radios disabled and the stored (sent) letter shown after a repaint', async () => {
    const pending = JSON.stringify({ firstAnswers: { [QID]: 'A' }, retries: { [QID]: { state: 'pending', value: 'C', submittedAt: 9, before: { answer: { value: 'A', timestamp: 5 }, attempts: 1 } } } });
    const w = boot({ seedLocalStorage: { quizRetryState_Me: pending } });
    seedMine(w, { answer: 'C', attempts: 2 });
    render(w);
    await tick(250);
    expect(mode(w)).toBe('pending');
    w.eval(`_quizRetryChoice['${QID}'] = 'A'`);   // a stale pick never shows outside retry mode
    radio(w, 'A').checked = true;
    await repaint(w);
    expect(checked(w)).toBe('C');
    expect(radiosDisabled(w)).toBe(true);
  });

  it('(c) settled: radios disabled and the stored letter shown after a repaint', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });   // correct first answer: this is the grade
    render(w);
    await tick(250);
    expect(mode(w)).toBe('settled');
    radio(w, 'C').checked = true;
    await repaint(w);
    expect(checked(w)).toBe('B');
    expect(radiosDisabled(w)).toBe(true);
  });

  it('(d) a submit that goes out clears the live pick; the pending form shows the sent C', async () => {
    const records = [];
    const w = await openRetry({ records, recordImpl: () => new Promise(() => {}) });   // the server never answers
    radio(w, 'C').click();
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBe('C');
    await repaint(w);
    type(w, 'the median is resistant');
    await pressSubmit(w);
    expect(records).toHaveLength(1);
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBeUndefined();
    expect(mode(w)).toBe('pending');
    await repaint(w);
    expect(checked(w)).toBe('C');
    expect(radiosDisabled(w)).toBe(true);
  });

  it('(e) the delegated listener ignores first mode and is wired', async () => {
    const w = boot();
    render(w);
    await tick(250);
    expect(mode(w)).toBe('first');
    radio(w, 'C').click();
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBeUndefined();
    expect(checked(w)).toBe('C');
    expect(w.__quizRetryChoiceWired).toBe(true);
  });

  it('a 409 revert after a clicked pick reopens the retry form with nothing checked, the first answer tagged', async () => {
    let refuse;
    const w = await openRetry({ recordImpl: () => new Promise(r => { refuse = r; }) });
    radio(w, 'C').click();
    type(w, 'the median is resistant');
    await pressSubmit(w);
    refuse({ ok: false, reason: 'retry-not-allowed', detail: 'explanation-required' });
    await tick(250);
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
  });
});

// The ledger restore as it runs after a sign-in or a reopen: these rows are the server's truth.
async function restoreFromLedger(w, rows) {
  w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
  w.ROSTER_SERVICE_URL = 'https://roster.test';
  w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows }) });
  await w.restoreOwnAnswersFromLedger();
  await tick(300);
}

const ROW_A1 = { source: 'curriculum_quiz', item_id: QID, attempt: 1, response: 'A', recorded_at: '2026-09-29T10:00:00Z' };
const ROW_B2 = { source: 'curriculum_quiz', item_id: QID, attempt: 2, response: 'B', reasoning: 'from my phone', recorded_at: '2026-09-29T11:00:00Z' };

describe('Part A: a pick belongs to one student and one open retry form', () => {
  it("a same-tab sign-in as another student never shows (or submits) the last student's pick", async () => {
    const records = [];
    const w = await openRetry({ records });
    radio(w, 'C').click();   // Me picks C and walks away without submitting
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBe('C');

    // Other signs in on the same tab (no reload) with their own wrong first answer A on file.
    w.localStorage.setItem('quizRetryState_Other', WRONG_FIRST);
    w.eval(`
      classData.users.Other = { answers: { '${QID}': { value: 'A', timestamp: 5 } }, reasons: {}, timestamps: {}, attempts: { '${QID}': 1 }, charts: {} };
      currentUsername = 'Other'; window.currentUsername = 'Other';
    `);
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);   // what loadProgress does on the reopened topic
    await repaint(w);
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expect(selectedChoices(w)).toEqual([]);
    expectFirstAnswerShown(w, 'A');

    type(w, 'I still think alpha');
    await pressSubmit(w);   // nothing picked: refused, nothing sent
    expect(records).toHaveLength(0);
    expect(w.document.getElementById(`error-${QID}`).textContent).toBe('Pick a different letter for your retry.');
    radio(w, 'B').click();
    await pressSubmit(w);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'B', attempt: 2 });
  });

  it('an unsent pick does not survive settle then teacher reset: the reopened form preselects nothing', async () => {
    const w = await openRetry();
    radio(w, 'C').click();
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBe('C');   // the click did record a pick
    await restoreFromLedger(w, [ROW_A1, ROW_B2]);   // the retry B was sent from another device
    expect(mode(w)).toBe('settled');
    expect(checked(w)).toBe('B');
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBeUndefined();

    await restoreFromLedger(w, [ROW_A1]);   // the teacher reset the retry
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
    await repaint(w);
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
  });

  it('the same chain with the item off screen: the restore itself voids the pick', async () => {
    const w = await openRetry();
    radio(w, 'C').click();
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBe('C');   // the click did record a pick
    w.document.getElementById('host').innerHTML = '';   // the student left the topic
    await restoreFromLedger(w, [ROW_A1, ROW_B2]);
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBeUndefined();
    await restoreFromLedger(w, [ROW_A1]);
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    await tick(250);
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
  });

  it("a slow ledger reply for the last student leaves the new student's pick alone", async () => {
    const records = [];
    const w = await openRetry({ records });

    // Me's restore starts; its reply (a retry B sent from another device) is slow.
    let answer;
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    w.fetch = () => new Promise(r => { answer = r; });
    const restoring = w.restoreOwnAnswersFromLedger();

    // Other signs in on the same tab, opens the item in retry mode and picks C.
    w.localStorage.setItem('quizRetryState_Other', WRONG_FIRST);
    w.eval(`
      classData.users.Other = { answers: { '${QID}': { value: 'A', timestamp: 5 } }, reasons: {}, timestamps: {}, attempts: { '${QID}': 1 }, charts: {} };
      currentUsername = 'Other'; window.currentUsername = 'Other';
    `);
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    await tick(250);
    expect(mode(w)).toBe('retry');
    radio(w, 'C').click();
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBe('C');

    // Me's reply lands now: it must not void Other's pick.
    answer({ status: 200, json: async () => ({ ok: true, rows: [ROW_A1, ROW_B2] }) });
    await restoring;
    await tick(300);
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBe('C');
    await repaint(w);
    expect(checked(w)).toBe('C');

    // A retry's 3+ words reach the confirm card's AI read while a token is present: it names no letter.
    w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ letter: null }) });
    type(w, 'the median is resistant');
    await pressSubmit(w);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 2 });
  });
});
