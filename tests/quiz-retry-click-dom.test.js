/**
 * QUIZ_INCONGRUENCE_CHECK_SPEC §1 rule 1 (teacher decision 2026-10-26, second set): a retry is a
 * NEW click. The retry form preselects nothing, the first (wrong) letter is disabled and tagged
 * "your first answer (not correct)", Submit retry enables only on a different letter plus 3+ real
 * words, submitAnswer refuses the first letter, the confirm card never offers it as a button, and
 * the fresh-device reconcile never sends the kept first answer as the retry.
 *
 * Why: the retry form kept the wrong first letter selected, so typing an explanation and pressing
 * Submit re-sent it (the teacher's own U4-L2-Q03 retry: B, then B, nine seconds apart).
 *
 * Loads the real page into jsdom (the harness of quiz-retry-pick.test.js and
 * quiz-congruence-ai-dom.test.js), drives the real renderQuestion + submitAnswer, captures
 * gradebookClient.record, and scripts fetch per test. The key is B; the first answer is D.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';   // key B; choices A alpha, B bravo, C charlie, D delta
const ROUTE = '/api/quiz/congruence';
const TAG = 'your first answer (not correct)';
const RETRY_LABEL = 'Submit retry (this becomes your grade)';
const NO_LETTER = 'the middle value resists the extreme outlier';   // names no option

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

// Every fetch is held until the test answers it (request.reply(status, body)).
function scriptFetch(w) {
  const net = { requests: [] };
  w.fetch = (url, opts = {}) => {
    const request = { url: String(url), body: opts.body ? JSON.parse(opts.body) : null };
    net.requests.push(request);
    return new Promise(resolvePromise => {
      request.reply = (status, body) => resolvePromise({ status, ok: status >= 200 && status < 300, json: async () => body });
    });
  };
  net.reads = () => net.requests.filter(r => r.url.endsWith(ROUTE));
  net.last = () => net.reads()[net.reads().length - 1];
  return net;
}

function boot({ records, recordImpl, token = null, seedLocalStorage = {} } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="messageArea"></div><div id="host"></div></body>', {
    url: 'https://quiz.test/',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  openWindows.push(w);
  for (const [k, v] of Object.entries(seedLocalStorage)) w.localStorage.setItem(k, v);
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
    }];
    classData = { users: {
      Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} },
      Peer1: { answers: { '${QID}': { value: 'B', timestamp: 1 } }, reasons: { '${QID}': 'bravo because' }, timestamps: {}, attempts: {} }
    } };
  `);
  const net = scriptFetch(w);
  return { w, net };
}

function render(w) {
  w.eval(`document.getElementById('host').innerHTML = renderQuestion(currentQuestions[0], 0).html;`);
}

const $ = (w, id) => w.document.getElementById(id);
const radio = (w, letter) => w.document.querySelector(`input[name="choice-${QID}"][value="${letter}"]`);
const checked = (w) => (w.document.querySelector(`input[name="choice-${QID}"]:checked`) || {}).value || null;
const mode = (w) => w.eval(`_quizFormState('${QID}').mode`);
const button = (w) => $(w, `submit-${QID}`);
const card = (w) => w.document.querySelector(`#congruence-${QID} .congruence-card`);
const cardTitle = (w) => { const t = $(w, `congruence-title-${QID}`); return t ? t.textContent : null; };
const cardLetters = (w) => [...w.document.querySelectorAll(`#congruence-${QID} .congruence-pick`)].map(b => b.dataset.letter);
const tags = (w) => [...w.document.querySelectorAll(`[data-question-id="${QID}"] .first-answer-tag`)];
const success = (w) => $(w, `success-${QID}`).textContent;
const errorLine = (w) => $(w, `error-${QID}`).textContent;

function type(w, text) {
  const textarea = $(w, `reason-${QID}`);
  textarea.value = text;
  textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
}

function callSubmit(w) {
  return w.eval(`submitAnswer('${QID}', 'multiple-choice')`);
}

async function repaint(w) {
  w.eval(`refreshQuestionIfVisible('${QID}')`);   // what a classmate's peer:answer schedules
  await tick();
  w.eval(`_refreshAfterReveal('${QID}')`);
  await tick();
}

// The retry form's first letter: disabled, its .choice marked, the one tag inside its label;
// every other letter enabled and untagged.
function expectFirstAnswerShown(w, letter) {
  for (const key of ['A', 'B', 'C', 'D']) {
    const div = radio(w, key).closest('.choice');
    expect(radio(w, key).disabled).toBe(key === letter);
    expect(div.classList.contains('first-answer')).toBe(key === letter);
  }
  expect(tags(w)).toHaveLength(1);
  const tag = tags(w)[0];
  expect(tag.textContent).toBe(TAG);
  expect(tag.closest('label')).toBe(radio(w, letter).closest('label'));
  expect(tag.getAttribute('aria-hidden')).toBe('false');
}

// A first answer D sent through the real form, no explanation: wrong, so the retry form opens.
async function answerWrongFirst(opts = {}) {
  const booted = boot(opts);
  const { w } = booted;
  render(w);
  w.eval(`_applyQuizFormState('${QID}')`);
  await tick(250);
  expect(mode(w)).toBe('first');
  radio(w, 'D').click();
  expect(callSubmit(w)).toBe(true);
  await tick(250);
  expect(mode(w)).toBe('retry');
  return booted;
}

const ROW_D1 = { source: 'curriculum_quiz', item_id: QID, attempt: 1, response: 'D', recorded_at: '2026-09-29T10:00:00Z' };

async function restoreFromLedger(w, rows) {
  w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
  w.ROSTER_SERVICE_URL = 'https://roster.test';
  w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows }) });
  await w.restoreOwnAnswersFromLedger();
  await tick(300);
  w.rosterClient = { token: () => null, studentId: () => 'stu-me' };
}

describe('1. the retry form opens with nothing preselected', () => {
  it('no radio checked, the first answer D disabled and tagged, Submit retry disabled', async () => {
    const { w } = await answerWrongFirst();
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'D');
    expect(w.document.querySelectorAll(`[data-question-id="${QID}"] .choice.selected`)).toHaveLength(0);
    expect(button(w).textContent.trim()).toBe(RETRY_LABEL);
    expect(button(w).disabled).toBe(true);
  });

  it('the first and settled forms carry no tag', async () => {
    const { w } = boot();
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    expect(tags(w)).toHaveLength(0);
    radio(w, 'B').click();
    expect(callSubmit(w)).toBe(true);   // correct: settled
    await tick(250);
    expect(mode(w)).toBe('settled');
    expect(checked(w)).toBe('B');
    expect(tags(w)).toHaveLength(0);
    expect(w.document.querySelector(`[data-question-id="${QID}"] .choice.first-answer`)).toBeNull();
  });
});

describe('2. Submit retry needs a different letter AND 3+ words', () => {
  it('3+ words alone keep it disabled; a new letter + 3 words enables it; the send records that letter as attempt 2', async () => {
    const records = [];
    const { w } = await answerWrongFirst({ records });
    type(w, 'I misread the axis');
    expect(button(w).disabled).toBe(true);   // no letter other than D
    radio(w, 'C').click();
    expect(button(w).disabled).toBe(false);   // the click repaints the button
    type(w, 'I misread');
    expect(button(w).disabled).toBe(true);   // two words
    type(w, 'I misread it');
    expect(button(w).disabled).toBe(false);
    button(w).click();
    await tick(250);
    expect(records.map(r => [r.attempt, r.response, r.reasoning])).toEqual([[1, 'D', undefined], [2, 'C', 'I misread it']]);
    expect(mode(w)).toBe('settled');   // the server accepted the retry: it is the grade
  });

  it('a new letter alone (no explanation) keeps it disabled', async () => {
    const { w } = await answerWrongFirst();
    radio(w, 'A').click();
    expect(checked(w)).toBe('A');
    expect(button(w).disabled).toBe(true);
  });
});

describe('3. the first letter can never be the retry', () => {
  it('clicking it does nothing: it is disabled', async () => {
    const { w } = await answerWrongFirst();
    radio(w, 'D').click();
    expect(checked(w)).toBeNull();
    expect(w.eval(`_quizRetryChoice['${QID}']`)).toBeUndefined();
  });

  it('a programmatic submit with it is refused with the message, before any write, and shows no card', async () => {
    const records = [];
    const { w } = await answerWrongFirst({ records });
    radio(w, 'D').disabled = false;
    radio(w, 'D').checked = true;
    type(w, 'C because the median resists the outlier');   // names C: would be a card for the pick D
    expect(callSubmit(w)).toBe(false);
    expect(errorLine(w)).toBe('Pick a different letter for your retry.');
    expect(records).toHaveLength(1);   // attempt 1 only
    expect(card(w)).toBeNull();
    expect(w.eval(`JSON.stringify(_quizCongruenceMarkers())`)).toBe('{}');
    expect(JSON.parse(w.localStorage.getItem('quizRetryState_Me')).retries[QID]).toBeUndefined();
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(1);
  });

  it('a submit with nothing checked is refused the same way', async () => {
    const records = [];
    const { w } = await answerWrongFirst({ records });
    type(w, 'I misread the axis');
    expect(callSubmit(w)).toBe(false);
    expect(errorLine(w)).toBe('Pick a different letter for your retry.');
    expect(records).toHaveLength(1);
  });
});

describe('4. the card in retry mode never offers the first letter', () => {
  // The detector ignores the first letter on a retry (§4 Step 3); the AI read does not
  // (QUIZ_CONGRUENCE_AI_READ_SPEC decision 1). Its reply D is the first answer here.
  async function cardForFirstLetter(records) {
    const booted = await answerWrongFirst({ records, token: 'tok-me' });
    const { w, net } = booted;
    radio(w, 'C').click();
    type(w, NO_LETTER);
    expect(callSubmit(w)).toBe(false);
    await tick(50);   // the read goes out on a microtask
    expect(net.reads()).toHaveLength(1);
    net.last().reply(200, { letter: 'D' });
    await tick(250);
    return booted;
  }

  it('shown; D is named in the sentence, not a button; the other letter is a button', async () => {
    const records = [];
    const { w } = await cardForFirstLetter(records);
    expect(card(w)).not.toBeNull();
    expect(cardTitle(w)).toBe('Your explanation argues for D, your first answer, which was not correct. You picked C: send it as your retry, or fix your explanation.');
    expect(cardLetters(w)).toEqual(['C']);
    expect(records).toHaveLength(1);
    await repaint(w);
    expect(cardLetters(w)).toEqual(['C']);
    expect(checked(w)).toBe('C');
  });

  it('"Let me fix my explanation" hands the textarea back', async () => {
    const records = [];
    const { w } = await cardForFirstLetter(records);
    w.document.querySelector(`#congruence-${QID} .congruence-fix`).click();
    await tick(50);
    expect(card(w)).toBeNull();
    expect(w.document.activeElement).toBe($(w, `reason-${QID}`));
    expect(checked(w)).toBe('C');
    expect(button(w).disabled).toBe(false);
    expect(records).toHaveLength(1);
  });

  it('its C button sends C as attempt 2', async () => {
    const records = [];
    const { w } = await cardForFirstLetter(records);
    w.document.querySelector(`#congruence-${QID} .congruence-pick[data-letter="C"]`).click();
    await tick(250);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'D'], [2, 'C']]);
  });

  it('a detector card on a retry names two other letters as buttons, never the first', async () => {
    const records = [];
    const { w } = await answerWrongFirst({ records });
    radio(w, 'A').click();
    type(w, 'C because the median resists the outlier');
    expect(callSubmit(w)).toBe(false);
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked A. Which one is your answer?');
    expect(cardLetters(w)).toEqual(['A', 'C']);
  });
});

describe('5. the fresh-device reconcile', () => {
  it('the kept first answer equals the local letter: the new message, nothing auto-sent', async () => {
    const records = [];
    const { w } = boot({ records, recordImpl: (rec) => Promise.resolve(Number(rec.attempt) === 1
      ? { ok: true, firstAnswerKept: true, keptResponse: 'D' }
      : { ok: true }) });
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    radio(w, 'D').click();
    type(w, 'the median is resistant to outliers');   // ready: still never sent as the retry
    expect(callSubmit(w)).toBe(true);
    await tick(300);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'D']]);
    expect(success(w)).toBe('The gradebook already had your first answer on this question (D), and it was not correct. Pick a different letter and explain what changed your mind.');
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'D');
    expect(button(w).disabled).toBe(true);
    await tick(3200);   // the submit line's fade does not take the instruction away
    expect($(w, `success-${QID}`).classList.contains('show')).toBe(true);
  });

  it('the kept first answer equals the local letter and is right: the submit line stands, nothing sent', async () => {
    const records = [];
    const { w } = boot({ records, recordImpl: (rec) => Promise.resolve({ ok: true, firstAnswerKept: true, keptResponse: 'B' }) });
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    radio(w, 'B').click();
    expect(callSubmit(w)).toBe(true);
    await tick(300);
    expect(records).toHaveLength(1);
    expect(mode(w)).toBe('settled');
    expect(success(w)).toBe('✅ Correct answer submitted!');
  });

  it('a different kept letter: the local letter is auto-sent as the retry, as before', async () => {
    const records = [];
    const { w } = boot({ records, recordImpl: (rec) => Promise.resolve(Number(rec.attempt) === 1
      ? { ok: true, firstAnswerKept: true, keptResponse: 'A' }
      : { ok: true }) });
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    radio(w, 'D').click();
    type(w, 'the median is resistant to outliers');
    expect(callSubmit(w)).toBe(true);
    await tick(300);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'D'], [2, 'D']]);
    expect(success(w)).toContain('The gradebook already had your first answer on this question (A). Your D was sent as your one retry.');
  });

  it('a different kept letter without an explanation: the local letter stays picked, the kept one is tagged', async () => {
    const records = [];
    const { w } = boot({ records, recordImpl: (rec) => Promise.resolve(Number(rec.attempt) === 1
      ? { ok: true, firstAnswerKept: true, keptResponse: 'A' }
      : { ok: true }) });
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    radio(w, 'D').click();
    expect(callSubmit(w)).toBe(true);
    await tick(300);
    expect(records).toHaveLength(1);
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBe('D');
    expectFirstAnswerShown(w, 'A');
    expect(button(w).disabled).toBe(true);
    type(w, 'I misread the axis');
    expect(button(w).disabled).toBe(false);
  });
});

describe('6. a teacher reset reopens the retry with nothing preselected', () => {
  it('accepted retry → reset → retry mode, nothing checked, the first answer tagged, Submit disabled', async () => {
    const acceptedWrong = JSON.stringify({ firstAnswers: { [QID]: 'D' }, retries: { [QID]: { state: 'accepted', value: 'A', submittedAt: 9 } } });
    const { w } = boot({ seedLocalStorage: { quizRetryState_Me: acceptedWrong } });
    w.eval(`
      classData.users.Me.answers['${QID}'] = { value: 'A', timestamp: 5 };
      classData.users.Me.attempts['${QID}'] = 2;
    `);
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    await tick(250);
    expect(mode(w)).toBe('settled');
    expect(checked(w)).toBe('A');
    expect(tags(w)).toHaveLength(0);
    await restoreFromLedger(w, [ROW_D1]);   // the teacher reset the retry: only the first answer is left
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'D');
    expect(button(w).disabled).toBe(true);
  });
});

describe('7. repaints during the retry', () => {
  it('a classmate\'s answer, the 30 s peer pull and the ledger restore keep "nothing checked", then keep the pick', async () => {
    const { w } = await answerWrongFirst();
    const pull = () => w.eval(`mergePeerDataIntoStores({ Peer2: { answers: { '${QID}': { value: 'C', timestamp: Date.now() } }, reasons: {} } })`);
    await repaint(w);
    pull();
    await tick();
    await restoreFromLedger(w, [ROW_D1]);
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'D');

    radio(w, 'C').click();
    type(w, 'I misread the axis');
    await repaint(w);
    pull();
    await tick();
    await restoreFromLedger(w, [ROW_D1]);
    expect(checked(w)).toBe('C');
    expectFirstAnswerShown(w, 'D');
    expect(button(w).disabled).toBe(false);
  });
});

describe('8. one student per form', () => {
  it('a same-tab sign-in clears the pick: the next student starts with nothing checked and their own first answer tagged', async () => {
    const records = [];
    const { w } = await answerWrongFirst({ records });
    radio(w, 'C').click();   // Me picks C and walks away without submitting
    type(w, 'I misread the axis');
    expect(button(w).disabled).toBe(false);

    w.localStorage.setItem('quizRetryState_Other', JSON.stringify({ firstAnswers: { [QID]: 'A' }, retries: {} }));
    w.eval(`
      classData.users.Other = { answers: { '${QID}': { value: 'A', timestamp: 5 } }, reasons: {}, timestamps: {}, attempts: { '${QID}': 1 }, charts: {} };
      currentUsername = 'Other'; window.currentUsername = 'Other';
    `);
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    await repaint(w);
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
    type(w, 'I misread the axis');
    expect(button(w).disabled).toBe(true);   // no letter picked by Other
    expect(callSubmit(w)).toBe(false);
    expect(records).toHaveLength(1);   // Me's first answer only
  });
});

describe('9. a topic reload renders the retry form by the rule', () => {
  it('renderQuestion itself, before any timer: nothing checked, the first answer tagged; then the pick checked', async () => {
    const { w } = await answerWrongFirst();
    render(w);   // no tick: the markup alone, before the render timer repaints it
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'D');
    expect(w.document.querySelectorAll(`[data-question-id="${QID}"] .choice.selected`)).toHaveLength(0);

    radio(w, 'C').click();
    render(w);
    expect(checked(w)).toBe('C');
    expect(radio(w, 'C').closest('.choice').classList.contains('selected')).toBe(true);
    expectFirstAnswerShown(w, 'D');
    await tick(250);
    expect(checked(w)).toBe('C');
    expectFirstAnswerShown(w, 'D');   // the repaint keeps the one tag
  });
});

describe('10. a first answer that lands late is never the retry', () => {
  const ROW_A1 = { ...ROW_D1, response: 'A' };
  const STANDS = 'The gradebook already had your first answer on this question (A), and it was not correct. Pick a different letter and explain what changed your mind.';

  it('a restore makes the retry card\'s pick the first answer: card and pick dropped, A disabled and tagged', async () => {
    const records = [];
    const { w } = await answerWrongFirst({ records });
    radio(w, 'A').click();
    type(w, 'C because the median resists the outlier');
    expect(callSubmit(w)).toBe(false);
    expect(cardLetters(w)).toEqual(['A', 'C']);

    await restoreFromLedger(w, [ROW_A1]);   // another device answered A first
    expect(mode(w)).toBe('retry');
    expect(card(w)).toBeNull();
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
    expect(button(w).disabled).toBe(true);
    await repaint(w);
    expect(checked(w)).toBeNull();

    radio(w, 'C').click();
    expect(callSubmit(w)).toBe(true);   // the explanation names C, the pick now: no card
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'D'], [2, 'C']]);
  });

  it('the recorded first answer, not the stored letter, is the one tagged (they differ after a refused retry)', async () => {
    const records = [];
    const { w } = boot({ records, seedLocalStorage: { quizRetryState_Me: JSON.stringify({ firstAnswers: { [QID]: 'A' }, retries: {} }) } });
    w.eval(`
      classData.users.Me.answers['${QID}'] = { value: 'B', timestamp: 5 };
      classData.users.Me.attempts['${QID}'] = 1;
    `);
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    await tick(250);
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
    radio(w, 'A').checked = true;   // forced past the disabled radio
    expect(callSubmit(w)).toBe(false);
    expect(records).toHaveLength(0);
    radio(w, 'B').click();
    type(w, 'I misread the axis');
    expect(button(w).disabled).toBe(false);
    expect(callSubmit(w)).toBe(true);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[2, 'B']]);
  });

  // Fresh device: attempt 1 (D) is slow; the student picks A for the retry and presses Submit
  // (a card, or an AI read out); then the reply says A was kept. A cannot be the retry.
  function slowFirst(records, token = null) {
    let resolveFirst = null;
    const booted = boot({ records, token, recordImpl: (rec) => (Number(rec.attempt) === 1
      ? new Promise(res => { resolveFirst = res; })
      : Promise.resolve({ ok: true })) });
    booted.keep = (letter) => resolveFirst({ ok: true, firstAnswerKept: true, keptResponse: letter });
    return booted;
  }

  async function firstAnswerD(w, text = 'the median resists the outlier') {
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    await tick(250);
    radio(w, 'D').click();
    type(w, text);
    expect(callSubmit(w)).toBe(true);
    await tick(250);
    expect(mode(w)).toBe('retry');
  }

  it('under a card: the card goes, A shows disabled and unchecked, the text stays, and the student picks again', async () => {
    const records = [];
    const booted = slowFirst(records);
    const { w } = booted;
    await firstAnswerD(w);
    radio(w, 'A').click();
    type(w, 'C observing only');
    expect(callSubmit(w)).toBe(false);
    expect(card(w)).not.toBeNull();

    booted.keep('A');
    await tick(400);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'D']]);
    expect(card(w)).toBeNull();
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
    expect($(w, `reason-${QID}`).value).toBe('C observing only');
    expect(success(w)).toBe(STANDS);
    expect(button(w).disabled).toBe(true);

    radio(w, 'C').click();
    expect(button(w).disabled).toBe(false);
    expect(callSubmit(w)).toBe(true);
    expect(records.map(r => [r.attempt, r.response, r.reasoning])).toEqual([[1, 'D', 'the median resists the outlier'], [2, 'C', 'C observing only']]);
  });

  it('under an AI read: the read is dropped, its late reply does nothing, and the student picks again', async () => {
    const records = [];
    const booted = slowFirst(records, 'tok-me');
    const { w, net } = booted;
    await firstAnswerD(w, '');   // no explanation, so no read on the first answer
    radio(w, 'A').click();
    type(w, NO_LETTER);
    expect(callSubmit(w)).toBe(false);
    await tick(50);
    expect(net.reads()).toHaveLength(1);
    expect(button(w).disabled).toBe(true);

    booted.keep('A');
    await tick(400);
    expect(checked(w)).toBeNull();
    expectFirstAnswerShown(w, 'A');
    expect(button(w).textContent).toBe(RETRY_LABEL);
    expect(success(w)).toBe(STANDS);

    net.last().reply(200, { letter: 'C' });
    await tick(250);
    expect(card(w)).toBeNull();
    expect(errorLine(w)).toBe('');
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'D']]);
    radio(w, 'C').click();
    expect(button(w).disabled).toBe(false);
  });
});
