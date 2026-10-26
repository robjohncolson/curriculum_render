/**
 * QUIZ_INCONGRUENCE_CHECK_SPEC Part B (§2, §3, §5) — the confirm card, at runtime.
 *
 * When the explanation argues for a different letter than the one picked, Submit asks first:
 * "Your explanation points to C, but you picked D. Which one is your answer?" Nothing is written
 * or recorded until the student answers. Loads the real page into jsdom (helpers copied from
 * quiz-retry-pick.test.js) and drives the real renderQuestion + submitAnswer; the gradebook
 * client is captured and MathJax is a spy.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';     // key B; choices A alpha, B bravo, C charlie, D delta
const TEX_QID = 'U1-L1-Q02'; // LaTeX option texts

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

// The first answer D (wrong; the key is B) is on file, so the item opens in retry mode.
const WRONG_FIRST_D = JSON.stringify({ firstAnswers: { [QID]: 'D' }, retries: {} });

function boot({ records, recordImpl, seedLocalStorage = {} } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="messageArea"></div><div id="host"></div></body>', {
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
  const typesetCalls = [];
  w.MathJax = { typesetPromise: (els) => { typesetCalls.push(els); return Promise.resolve(); } };
  w.__typesetCalls = typesetCalls;
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
      choices: [{ key: 'A', value: 'alpha' }, { key: 'B', value: 'bravo' }, { key: 'C', value: 'charlie' }, { key: 'D', value: 'delta' }]
    }, {
      id: '${TEX_QID}', type: 'multiple-choice', prompt: 'Which statistic estimates a proportion?', answerKey: 'C',
      explanation: 'A sample proportion.',
      choices: [{ key: 'A', value: '\\\\(\\\\bar{x} = 4\\\\)' }, { key: 'B', value: '\\\\(\\\\mu = 5\\\\)' }, { key: 'C', value: '\\\\(\\\\hat{p} = 0.5\\\\)' }, { key: 'D', value: 'none of these' }]
    }];
    classData = { users: {
      Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} },
      Peer1: { answers: { '${QID}': { value: 'B', timestamp: 1 } }, reasons: { '${QID}': 'bravo because' }, timestamps: {}, attempts: {} }
    } };
  `);
  return w;
}

function render(w) {
  w.eval(`document.getElementById('host').innerHTML = currentQuestions.map((q, i) => renderQuestion(q, i).html).join('');`);
}

function seedMine(w, { answer, attempts, reason = '' }) {
  w.eval(`
    classData.users.Me.answers['${QID}'] = { value: '${answer}', timestamp: 5 };
    classData.users.Me.attempts['${QID}'] = ${attempts};
    classData.users.Me.reasons['${QID}'] = ${JSON.stringify(reason)};
  `);
}

const $ = (w, id) => w.document.getElementById(id);

function radio(w, letter, qid = QID) {
  return w.document.querySelector(`input[name="choice-${qid}"][value="${letter}"]`);
}

function checked(w, qid = QID) {
  return (w.document.querySelector(`input[name="choice-${qid}"]:checked`) || {}).value || null;
}

function mode(w) {
  return w.eval(`_quizFormState('${QID}').mode`);
}

function type(w, text, qid = QID) {
  const textarea = $(w, `reason-${qid}`);
  textarea.value = text;
  textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
}

function card(w, qid = QID) {
  return w.document.querySelector(`#congruence-${qid} .congruence-card`);
}

function cardTitle(w, qid = QID) {
  const title = $(w, `congruence-title-${qid}`);
  return title ? title.textContent : null;
}

function marker(w, qid = QID) {
  return w.eval(`JSON.stringify(_quizCongruencePrompt['${qid}'] || null)`) === 'null'
    ? null
    : JSON.parse(w.eval(`JSON.stringify(_quizCongruencePrompt['${qid}'])`));
}

function letterButton(w, letter, qid = QID) {
  return w.document.querySelector(`#congruence-${qid} .congruence-pick[data-letter="${letter}"]`);
}

function hostTypesets(w, qid = QID) {
  const host = $(w, `congruence-${qid}`);
  return w.__typesetCalls.filter(args => Array.isArray(args) && args.includes(host)).length;
}

// Click the real Submit button, so its inline onclick runs. The wrapper counts the calls (a missing
// or doubled handler fails here) and hands back submitAnswer's return value, the new contract.
async function pressSubmit(w, qid = QID) {
  const button = $(w, `submit-${qid}`);
  expect(button.disabled).toBe(false);
  const realSubmit = w.submitAnswer;
  const results = [];
  w.submitAnswer = (...args) => {
    const result = realSubmit(...args);
    results.push(result);
    return result;
  };
  try {
    button.click();
  } finally {
    w.submitAnswer = realSubmit;
  }
  expect(results).toHaveLength(1);
  await tick(250);   // the page's own 50 ms / 100 ms render timers
  return results[0];
}

// Call submitAnswer directly: for the early returns a student cannot reach with a click.
function callSubmit(w, qid = QID, questionType = 'multiple-choice') {
  return w.eval(`submitAnswer('${qid}', '${questionType}')`);
}

async function clickAndSettle(el) {
  el.click();
  await tick(250);
}

// What the page does when a classmate answers, the peer pull lands, or a restore runs.
async function repaint(w, qid = QID) {
  w.eval(`refreshQuestionIfVisible('${qid}')`);
  await tick();
  w.eval(`_refreshAfterReveal('${qid}')`);
  await tick();
}

// The ledger restore a fresh device runs: the roster answers with these rows.
async function restoreFromLedger(w, rows) {
  w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
  w.ROSTER_SERVICE_URL = 'https://roster.test';
  w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows }) });
  await w.restoreOwnAnswersFromLedger();
  await tick(300);
  w.fetch = () => new Promise(() => {});
}

// First answer: pick D, explain C, Submit → the card.
async function firstAnswerCard({ records, pick = 'D', text = 'C because the median resists' } = {}) {
  const w = boot({ records });
  render(w);
  await tick(250);
  expect(mode(w)).toBe('first');
  radio(w, pick).click();
  type(w, text);
  const result = await pressSubmit(w);
  expect(result).toBe(false);
  return w;
}

// Wrong first answer D on file, retry form open: nothing checked, D disabled (a retry is a new click).
async function openRetry(opts = {}, { seedState = true } = {}) {
  const w = boot({ ...opts, seedLocalStorage: seedState ? { quizRetryState_Me: WRONG_FIRST_D } : {} });
  seedMine(w, { answer: 'D', attempts: 1 });
  render(w);
  w.eval(`_applyQuizFormState('${QID}')`);
  await tick(250);
  expect(mode(w)).toBe('retry');
  expect(checked(w)).toBeNull();
  expect(radio(w, 'D').disabled).toBe(true);
  return w;
}

describe('Part B: the confirm card on a first answer', () => {
  it('(1) pick D, explanation names C: the card asks, nothing is recorded or written, focus on the title', async () => {
    const records = [];
    const w = await firstAnswerCard({ records });
    expect(card(w)).not.toBeNull();
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked D. Which one is your answer?');
    expect([...w.document.querySelectorAll(`#congruence-${QID} .congruence-pick`)].map(b => b.dataset.letter)).toEqual(['C', 'D']);
    expect(letterButton(w, 'C').querySelector('.muted').textContent).toBe('charlie');
    expect(letterButton(w, 'D').querySelector('.muted').textContent).toBe('delta');
    expect(records).toHaveLength(0);
    expect(w.eval(`Object.keys(classData.users.Me.answers).length`)).toBe(0);
    expect(w.localStorage.getItem('quizRetryState_Me')).toBeNull();
    expect(w.document.activeElement).toBe($(w, `congruence-title-${QID}`));
    expect(marker(w)).toEqual({ picked: 'D', pointsTo: 'C', text: 'C because the median resists', attempt: 1 });
    // The card is the last child of the MCQ answer-section.
    const host = $(w, `congruence-${QID}`);
    expect(host.parentElement.classList.contains('answer-section')).toBe(true);
    expect(host.parentElement.lastElementChild).toBe(host);
  });

  it('(2) click C: one record with C, attempt 1 and the explanation as typed; C is the first answer now; card and marker gone', async () => {
    const records = [];
    const w = await firstAnswerCard({ records });
    await clickAndSettle(letterButton(w, 'C'));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 1, reasoning: 'C because the median resists' });
    // C is wrong (key B): the retry form opens with nothing checked and C disabled.
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expect(radio(w, 'C').disabled).toBe(true);
    expect(card(w)).toBeNull();
    expect(marker(w)).toBeNull();
    expect(w.document.activeElement).toBe($(w, `success-${QID}`));
  });

  it('(3) click the picked letter D instead: one record with D, attempt 1', async () => {
    const records = [];
    const w = await firstAnswerCard({ records });
    await clickAndSettle(letterButton(w, 'D'));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 1, reasoning: 'C because the median resists' });
    expect(mode(w)).toBe('retry');
    expect(checked(w)).toBeNull();
    expect(radio(w, 'D').disabled).toBe(true);
    expect(card(w)).toBeNull();
  });

  it('(4) "Let me fix my explanation": no record, textarea focused, card gone; typing keeps it gone; Submit re-checks', async () => {
    const records = [];
    const w = await firstAnswerCard({ records });
    await clickAndSettle(w.document.querySelector(`#congruence-${QID} .congruence-fix`));
    expect(records).toHaveLength(0);
    expect(card(w)).toBeNull();
    expect(marker(w)).toBeNull();
    expect(w.document.activeElement).toBe($(w, `reason-${QID}`));
    type(w, 'C because the median really resists');
    expect(card(w)).toBeNull();
    expect(await pressSubmit(w)).toBe(false);   // the text still names C: the check runs again
    expect(cardTitle(w)).toContain('points to C');
    expect(records).toHaveLength(0);
  });

  it('(5) the card is up and the student types: card and marker gone, nothing recorded', async () => {
    const records = [];
    const w = await firstAnswerCard({ records });
    type(w, 'C because the median resists!');
    expect(card(w)).toBeNull();
    expect(marker(w)).toBeNull();
    await tick(250);
    expect(records).toHaveLength(0);
  });

  it('(6) correctness-blind: the correct letter B with an explanation naming C gets the same card', async () => {
    const records = [];
    const w = await firstAnswerCard({ records, pick: 'B' });
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked B. Which one is your answer?');
    expect([...card(w).querySelectorAll('button')].map(b => b.className)).toEqual(['congruence-pick', 'congruence-pick', 'congruence-fix link']);
    expect(card(w).getAttribute('role')).toBe('group');
    expect(records).toHaveLength(0);
  });

  it('a change on the radios voids the card and the highlight follows the click', async () => {
    const w = await firstAnswerCard();
    radio(w, 'A').click();
    expect(card(w)).toBeNull();
    expect(marker(w)).toBeNull();
    const selected = [...w.document.querySelectorAll(`[data-question-id="${QID}"] .choice.selected`)]
      .map(div => div.querySelector('input').value);
    expect(selected).toEqual(['A']);
  });
});

describe('Part B: the confirm card on the retry', () => {
  it('(7) retry picks A with "C observing only": the card; click C → attempt 2 with C, pending C', async () => {
    const records = [];
    const w = await openRetry({ records, recordImpl: () => new Promise(() => {}) });   // the server never answers
    radio(w, 'A').click();   // re-picking D is no longer possible: D is disabled
    type(w, 'C observing only');
    expect(await pressSubmit(w)).toBe(false);
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked A. Which one is your answer?');
    expect(marker(w)).toMatchObject({ picked: 'A', pointsTo: 'C', attempt: 2 });
    expect(records).toHaveLength(0);
    await clickAndSettle(letterButton(w, 'C'));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 2, reasoning: 'C observing only' });
    const state = JSON.parse(w.localStorage.getItem('quizRetryState_Me'));
    expect(state.retries[QID]).toMatchObject({ state: 'pending', value: 'C' });
    expect(mode(w)).toBe('pending');
    expect(card(w)).toBeNull();
  });

  it('(8) a retry explanation naming only the first letter: no card, one record', async () => {
    const records = [];
    const w = await openRetry({ records });
    radio(w, 'C').click();
    type(w, 'I thought D at first but the median is resistant');
    expect(await pressSubmit(w)).toBe(true);
    expect(card(w)).toBeNull();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 2 });
  });

  it('(8) the same with quizRetryState_Me absent: the first answer falls back to the stored letter', async () => {
    const records = [];
    const w = await openRetry({ records }, { seedState: false });
    expect(w.localStorage.getItem('quizRetryState_Me')).toBeNull();
    radio(w, 'C').click();
    type(w, 'I thought D at first but the median is resistant');
    expect(await pressSubmit(w)).toBe(true);
    expect(card(w)).toBeNull();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'C', attempt: 2 });
  });

  it('(9) unclear ("between C and D"): no card, one record', async () => {
    const records = [];
    const w = boot({ records });
    render(w);
    await tick(250);
    radio(w, 'D').click();
    type(w, 'I was between C and D');
    expect(await pressSubmit(w)).toBe(true);
    expect(card(w)).toBeNull();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 1 });
  });

  // The ledger restore lands a wrong first answer while a first-answer card is up: the item is now
  // on its retry, and a card stamped attempt 1 is stale (§5 marker). The retry form shows nothing
  // checked and the restored letter disabled.
  const ROW_A1 = { source: 'curriculum_quiz', item_id: QID, attempt: 1, response: 'A', recorded_at: '2026-09-29T10:00:00Z' };
  const ROW_D1 = { ...ROW_A1, response: 'D' };
  async function cardAcrossRestore(records, row = ROW_A1) {
    const w = await firstAnswerCard({ records });
    expect(marker(w)).toMatchObject({ picked: 'D', pointsTo: 'C', attempt: 1 });
    await restoreFromLedger(w, [row]);
    expect(mode(w)).toBe('retry');
    expect(marker(w)).toBeNull();
    expect(card(w)).toBeNull();
    expect(checked(w)).toBeNull();
    expect(radio(w, row.response).disabled).toBe(true);
    expect($(w, `submit-${QID}`).disabled).toBe(true);
    return w;
  }

  it('(13) a first-answer card does not survive a restore into the retry; a new pick checks attempt 2, then sends once', async () => {
    const records = [];
    const w = await cardAcrossRestore(records);
    await repaint(w);
    expect(card(w)).toBeNull();
    expect(checked(w)).toBeNull();
    radio(w, 'D').click();
    expect(await pressSubmit(w)).toBe(false);   // the text still names C: the retry's own card
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked D. Which one is your answer?');
    expect(marker(w)).toMatchObject({ picked: 'D', pointsTo: 'C', attempt: 2 });
    expect(records).toHaveLength(0);
    await clickAndSettle(letterButton(w, 'D'));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ response: 'D', attempt: 2, reasoning: 'C because the median resists' });
    expect(card(w)).toBeNull();
  });

  it('(13) the restored first answer is the card pick itself: the first letter is not checked, and no card can send the retry', async () => {
    const records = [];
    const w = await cardAcrossRestore(records, ROW_D1);
    expect(w.document.querySelector(`[data-question-id="${QID}"] .choice.first-answer .first-answer-tag`)).not.toBeNull();
    expect(letterButton(w, 'C')).toBeNull();
    await repaint(w);
    expect(checked(w)).toBeNull();
    expect(records).toHaveLength(0);
  });

  it('(13) after the restore the student edits the explanation: Submit checks attempt 2', async () => {
    const records = [];
    const w = await cardAcrossRestore(records);
    type(w, 'C because the median resists more');
    await repaint(w);
    expect(card(w)).toBeNull();
    expect(radio(w, 'A').disabled).toBe(true);
    radio(w, 'D').click();
    expect(await pressSubmit(w)).toBe(false);   // the edited text still names C
    expect(marker(w)).toMatchObject({ pointsTo: 'C', text: 'C because the median resists more', attempt: 2 });
    expect(records).toHaveLength(0);
  });
});

describe('Part B: repaints carry the card; leaving the open form drops it', () => {
  it('(10) refreshQuestionIfVisible and _refreshAfterReveal: the card stays, the pick stays, focus stays, one typeset', async () => {
    const w = await firstAnswerCard();
    const title = $(w, `congruence-title-${QID}`);
    expect(hostTypesets(w)).toBe(1);
    await repaint(w);
    await repaint(w);
    expect(card(w)).not.toBeNull();
    expect($(w, `congruence-title-${QID}`)).toBe(title);   // not rewritten
    expect(checked(w)).toBe('D');
    expect(w.document.activeElement).toBe(title);
    expect(hostTypesets(w)).toBe(1);
  });

  it('(10) retry: a repaint keeps the card and marker.picked checked over a stored first answer', async () => {
    const w = await openRetry();
    radio(w, 'A').click();
    type(w, 'C observing only');
    expect(await pressSubmit(w)).toBe(false);
    expect(marker(w)).toMatchObject({ picked: 'A', pointsTo: 'C' });
    await repaint(w);
    expect(card(w)).not.toBeNull();
    expect(checked(w)).toBe('A');
  });

  it('a topic re-render (renderQuestion + loadProgress) drops a first-answer card; nothing is left to click', async () => {
    const records = [];
    const w = await firstAnswerCard({ records });
    render(w);
    w.eval('loadProgress()');
    await tick(300);
    expect(card(w)).toBeNull();
    expect(marker(w)).toBeNull();
    expect($(w, `reason-${QID}`).value).toBe('');
    expect(checked(w)).toBeNull();
    expect(w.document.querySelector(`#congruence-${QID} button`)).toBeNull();
    await repaint(w);
    expect(card(w)).toBeNull();
    expect(records).toHaveLength(0);
  });

  it('a card belongs to one student: a same-tab sign-in as someone else never shows or answers it', async () => {
    const records = [];
    const w = await firstAnswerCard({ records });
    w.eval(`currentUsername = 'Other'; window.currentUsername = 'Other';
      classData.users.Other = { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} };`);
    expect(w.eval(`JSON.stringify(_quizCongruenceMarkers())`)).toBe('{}');   // Me's card is not Other's
    await repaint(w);
    expect(card(w)).toBeNull();
    render(w);
    w.eval('loadProgress()');
    await tick(300);
    expect(card(w)).toBeNull();
    expect(records).toHaveLength(0);
  });

  for (const state of ['pending', 'accepted']) {
    it(`(10) a card is removed once the item is ${state === 'pending' ? 'pending' : 'settled'}`, async () => {
      const w = await openRetry();
      radio(w, 'A').click();
      type(w, 'C observing only');
      expect(await pressSubmit(w)).toBe(false);
      expect(card(w)).not.toBeNull();
      w.eval(`
        _quizRetryState('Me').retries['${QID}'] = { state: '${state}', value: 'D', submittedAt: 9, before: { answer: { value: 'D', timestamp: 5 }, attempts: 1 } };
        classData.users.Me.attempts['${QID}'] = 2;
      `);
      await repaint(w);
      expect(mode(w)).toBe(state === 'pending' ? 'pending' : 'settled');
      expect(card(w)).toBeNull();
      expect(marker(w)).toBeNull();
    });
  }

  it('(11) a LaTeX option: the muted line carries the option text and MathJax typesets the host', async () => {
    const records = [];
    const w = boot({ records });
    render(w);
    await tick(250);
    radio(w, 'A', TEX_QID).click();
    type(w, 'C because it estimates a proportion', TEX_QID);
    expect(await pressSubmit(w, TEX_QID)).toBe(false);
    expect(cardTitle(w, TEX_QID)).toContain('points to C, but you picked A');
    expect(letterButton(w, 'C', TEX_QID).querySelector('.muted').textContent).toBe('\\(\\hat{p} = 0.5\\)');
    expect(letterButton(w, 'A', TEX_QID).querySelector('.muted').textContent).toBe('\\(\\bar{x} = 4\\)');
    expect(hostTypesets(w, TEX_QID)).toBe(1);
    expect(records).toHaveLength(0);
  });
});

describe('Part B: the fresh-device reconcile path', () => {
  it('(12) a ready explanation that points elsewhere: no auto-send, the card, the message; a repaint shows chosen', async () => {
    // The server already holds D as the first answer; this device sends A with "I was between C and D".
    // As a first answer that is unclear (no card); as the retry, D is the first answer and drops out,
    // so the explanation points to C while A is picked.
    const records = [];
    const w = boot({ records, recordImpl: (rec) => (Number(rec.attempt) === 1
      ? Promise.resolve({ ok: true, firstAnswerKept: true, keptResponse: 'D' })
      : Promise.resolve({ ok: true })) });
    render(w);
    await tick(250);
    const text = 'I was between C and D';
    expect(w.quizExplanationPointsTo(text, w.eval('currentQuestions[0].choices'), 'A', null, 'Which one?')).toBeNull();
    expect(w.quizExplanationPointsTo(text, w.eval('currentQuestions[0].choices'), 'A', 'D', 'Which one?')).toBe('C');
    radio(w, 'A').click();
    type(w, text);
    expect(await pressSubmit(w)).toBe(true);
    await tick(300);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'A']]);   // no auto-sent retry
    expect(mode(w)).toBe('retry');
    expect(cardTitle(w)).toBe('Your explanation points to C, but you picked A. Which one is your answer?');
    expect($(w, `success-${QID}`).textContent).toBe('The gradebook already had your first answer on this question (D). Check the question below and submit your one retry.');
    expect(w.document.activeElement).toBe($(w, `congruence-title-${QID}`));
    await repaint(w);
    expect(checked(w)).toBe('A');
    expect(card(w)).not.toBeNull();
    // The student answers the card: the retry goes out once, as attempt 2.
    await clickAndSettle(letterButton(w, 'C'));
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'A'], [2, 'C']]);
  });
});

describe('Part B: the reconcile lands while a retry card is up', () => {
  it('never sends under the card or swaps its explanation; a card on the kept letter goes, and the student picks again', async () => {
    // Fresh device; the server already holds A. Attempt 1 (D) is slow to answer; meanwhile the
    // student re-picks A with "C observing only" and gets the card. Then the reply says A was kept:
    // A is the first answer now, so the card (its pick A) goes and A cannot be the retry (§1 rule 1).
    const records = [];
    let resolveFirst = null;
    const w = boot({ records, recordImpl: (rec) => (Number(rec.attempt) === 1
      ? new Promise(res => { resolveFirst = res; })
      : Promise.resolve({ ok: true })) });
    render(w);
    await tick(250);
    radio(w, 'D').click();
    type(w, 'the median resists the outlier');
    expect(await pressSubmit(w)).toBe(true);
    expect(mode(w)).toBe('retry');
    radio(w, 'A').click();
    type(w, 'C observing only');
    expect(await pressSubmit(w)).toBe(false);
    expect(marker(w)).toMatchObject({ picked: 'A', pointsTo: 'C', attempt: 2 });

    resolveFirst({ ok: true, firstAnswerKept: true, keptResponse: 'A' });
    await tick(400);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'D']]);   // nothing sent for the student
    expect(card(w)).toBeNull();
    expect(checked(w)).toBeNull();
    expect(radio(w, 'A').disabled).toBe(true);
    expect($(w, `reason-${QID}`).value).toBe('C observing only');
    expect($(w, `success-${QID}`).textContent).toBe('The gradebook already had your first answer on this question (A), and it was not correct. Pick a different letter and explain what changed your mind.');

    radio(w, 'C').click();
    expect(await pressSubmit(w)).toBe(true);
    expect(records.map(r => [r.attempt, r.response, r.reasoning])).toEqual([[1, 'D', 'the median resists the outlier'], [2, 'C', 'C observing only']]);
  });
});

describe('Part B: submitAnswer returns whether the submit went out', () => {
  it('(14) true on a sent submit, false on every early return', async () => {
    const records = [];
    const w = boot({ records });
    render(w);
    await tick(250);

    w.eval(`currentUsername = null; window.currentUsername = null;`);   // not signed in
    expect(callSubmit(w)).toBe(false);
    w.eval(`currentUsername = 'Me'; window.currentUsername = 'Me';`);

    expect(await pressSubmit(w)).toBe(false);   // no radio
    expect($(w, `error-${QID}`).textContent).toContain('Please select an answer');

    radio(w, 'D').click();
    type(w, 'C because the median resists');
    expect(await pressSubmit(w)).toBe(false);   // the card
    expect(card(w)).not.toBeNull();

    type(w, 'the median resists the outlier');
    expect(await pressSubmit(w)).toBe(true);    // sent
    expect(records).toHaveLength(1);
    expect(mode(w)).toBe('retry');               // D was wrong: one explained retry

    radio(w, 'C').click();
    type(w, 'too short');
    expect($(w, `submit-${QID}`).disabled).toBe(true);   // < 3 words on the retry: no click gets through
    expect(callSubmit(w)).toBe(false);                   // and the function itself refuses it
    expect(records).toHaveLength(1);
  });

  it('(14) false on the pending, settled and FRQ early returns too; nothing recorded', async () => {
    const records = [];
    const w = boot({ records });

    // pending: the retry is out and the server has not answered
    seedMine(w, { answer: 'C', attempts: 2 });
    w.eval(`_quizRetryState('Me').retries['${QID}'] = { state: 'pending', value: 'C', submittedAt: 9, before: { answer: { value: 'D', timestamp: 5 }, attempts: 1 } };`);
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    await tick(250);
    expect(mode(w)).toBe('pending');
    expect(callSubmit(w)).toBe(false);
    expect($(w, `error-${QID}`).textContent).toBe(w.eval('QUIZ_RETRY_PENDING_TEXT'));

    // settled: a correct first answer is the grade
    w.eval(`delete _quizRetryState('Me').retries['${QID}'];`);
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    w.eval(`_applyQuizFormState('${QID}')`);
    await tick(250);
    expect(mode(w)).toBe('settled');
    expect(callSubmit(w)).toBe(false);
    expect($(w, `error-${QID}`).textContent).toBe('This answer is already your grade.');

    // FRQ: multi-part (the accordion submits), an empty response, a histogram with no bars
    w.eval(`
      currentQuestions.push({ id: 'U1-L1-FRQ-PARTS', type: 'free-response', prompt: 'Parts', solution: { parts: [{ partId: 'a' }] } });
      currentQuestions.push({ id: 'U1-L1-FRQ-TEXT', type: 'free-response', prompt: 'Explain.' });
      EMBEDDED_CURRICULUM.push({ id: 'U1-L1-FRQ-HIST', type: 'free-response', prompt: 'Draw it.', requiresGraph: 'histogram' });
      document.getElementById('host').insertAdjacentHTML('beforeend',
        '<textarea id="frq-U1-L1-FRQ-TEXT"></textarea><span id="error-U1-L1-FRQ-TEXT"></span>' +
        '<span id="error-U1-L1-FRQ-HIST"></span><div id="graph-input-U1-L1-FRQ-HIST"><div class="graph-row">' +
        '<input class="label" value=""><input class="value" value="3"></div></div>');
    `);
    expect(callSubmit(w, 'U1-L1-FRQ-PARTS', 'free-response')).toBe(false);
    expect(callSubmit(w, 'U1-L1-FRQ-TEXT', 'free-response')).toBe(false);
    expect($(w, 'error-U1-L1-FRQ-TEXT').textContent).toBe('Please enter a response.');
    expect(callSubmit(w, 'U1-L1-FRQ-HIST', 'free-response')).toBe(false);
    expect($(w, 'error-U1-L1-FRQ-HIST').textContent).toBe('Please add at least one bar to your histogram.');

    await tick(250);
    expect(records).toHaveLength(0);
  });
});
