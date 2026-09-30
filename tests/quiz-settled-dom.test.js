/**
 * QUIZ_FIRST_ANSWER_SPEC v2 — RUNTIME DOM tests of the settled gate.
 *
 * Loads the real page scripts (every local <script> up to and including the main inline block)
 * into jsdom, renders a real MCQ with the page's own renderQuestion, and drives the real
 * submitAnswer. Chart.js is replaced by a counter so "no chart before settlement" is measurable.
 * States: unanswered / wrong-first / correct-first / pending-retry / accepted-retry /
 * rejected-retry / queued-then-replayed / reload-of-settled / reload-of-pending, plus XSS.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';
const FRQ = 'U1-L1-FRQ01';
const XSS = '<img src=x onerror="window.__xss = 1"> I changed my mind';
const EVIL_NAME = 'x"><svg/onload=window.__xss=1>';

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

// Boot the page; `seed` runs inside the page before the question renders.
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
  w.__draws = 0;
  w.Chart = function () { w.__draws += 1; return { destroy() {}, update() {} }; };
  w.gradebookClient = {
    record: (rec) => { if (records) records.push(rec); return recordImpl ? recordImpl(rec) : Promise.resolve({ ok: true, ledgerId: 'L' }); },
  };
  // Signed in as roster student 'stu-me' (no token: the ledger restore only runs when a test asks).
  w.rosterClient = { token: () => null, studentId: () => 'stu-me' };
  w.eval(`
    currentUsername = 'Me'; window.currentUsername = 'Me';
    currentQuestions = [{
      id: '${QID}', type: 'multiple-choice', prompt: 'Which one?', answerKey: 'B',
      explanation: 'Because B is right.',
      choices: [{ key: 'A', value: 'alpha' }, { key: 'B', value: 'bravo' }, { key: 'C', value: 'charlie' }]
    }, { id: '${FRQ}', type: 'free-response', prompt: 'Draw it.' }];
    classData = { users: {
      Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} },
      Peer1: { answers: { '${QID}': { value: 'B', timestamp: 1 } }, reasons: { '${QID}': ${JSON.stringify(XSS)} }, timestamps: {}, attempts: {} },
      Peer2: { answers: { '${QID}': { value: 'C', timestamp: 2 } }, reasons: {}, timestamps: {}, attempts: {} }
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

async function submit(w, letter, reasoning) {
  const radio = w.document.querySelector(`input[name="choice-${QID}"][value="${letter}"]`);
  radio.disabled = false;   // the gate may have locked it: submitAnswer itself must refuse, not the test
  radio.checked = true;
  const textarea = w.document.getElementById(`reason-${QID}`);
  if (reasoning !== undefined) {
    textarea.value = reasoning;
    textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  w.eval(`submitAnswer('${QID}', 'multiple-choice')`);
  await tick(250);   // the page's own 50 ms / 100 ms render timers
}

function view(w) {
  const d = w.document;
  const panel = d.getElementById(`peer-reasoning-content-${QID}`);
  const contributors = d.getElementById(`contributors-${QID}`);
  const key = d.getElementById(`answer-key-${QID}`);
  const cb = d.getElementById(`college-board-explanation-${QID}`);
  const button = d.getElementById(`submit-${QID}`);
  return {
    panelText: panel ? panel.textContent : '',
    panelImg: panel ? panel.querySelector('img') : null,
    peerLetters: d.querySelectorAll('.peer-answer').length,
    tinted: d.querySelectorAll('.peer-response-card.correct, .peer-response-card.incorrect').length,
    cards: d.querySelectorAll(`#peer-reasoning-content-${QID} .peer-response-card, #peer-reasoning-content-${QID} [data-key]`).length,
    contributorsText: contributors ? contributors.textContent : '',
    peerCount: (d.getElementById(`peer-count-${QID}`) || {}).textContent || '',
    draws: w.__draws,
    keyShown: !!key && key.style.display === 'block',
    keyText: key ? key.textContent : '',
    cbShown: !!cb && cb.style.display === 'block',
    buttonText: button ? button.textContent.trim() : '',
    buttonDisabled: button ? button.disabled : null,
    buttonHidden: button ? button.style.display === 'none' : null,
    lockText: (d.getElementById(`grade-lock-${QID}`) || {}).textContent || '',
    radiosDisabled: [...d.querySelectorAll(`input[name="choice-${QID}"]`)].every(r => r.disabled),
    checked: (d.querySelector(`input[name="choice-${QID}"]:checked`) || {}).value || null,
    error: (d.getElementById(`error-${QID}`) || {}).textContent || '',
  };
}

function expectLocked(v) {
  expect(v.peerLetters).toBe(0);
  expect(v.tinted).toBe(0);
  expect(v.cards).toBe(0);
  expect(v.draws).toBe(0);
  expect(v.keyShown).toBe(false);
  expect(v.cbShown).toBe(false);
  expect(v.contributorsText).not.toMatch(/Choice [ABC]/);
  expect(v.panelText).not.toContain('I changed my mind');
}

function expectRevealed(w, v) {
  // QUIZ_MCQ_REVEAL_SPEC: ONE box (the fixture has an explanation, so it always shows); the
  // College Board box is never used for an MCQ.
  expect(v.keyShown).toBe(true);
  expect(v.keyText).toContain('Because B is right.');
  expect(v.cbShown).toBe(false);
  expect(v.draws).toBeGreaterThan(0);
  expect(v.peerLetters).toBeGreaterThan(0);
  expect(v.tinted).toBeGreaterThan(0);
  expect(v.panelText).toContain('I changed my mind');   // Peer1 explained
  expect(v.peerCount).toBe('1 classmate explained');    // Peer2 did not explain: no card
  // XSS: the classmate's markup is text, never an element, and never runs.
  expect(v.panelImg).toBeNull();
  expect(v.panelText).toContain('<img');
  expect(w.__xss).toBeUndefined();
}

describe('the MCQ template hosts the key and the chart (DOM-host claim verified)', () => {
  it('renderQuestion emits the answer-key and dotplot-section hosts', () => {
    const w = boot();
    render(w);
    const d = w.document;
    expect(d.getElementById(`answer-key-${QID}`)).not.toBeNull();
    expect(d.getElementById(`dotplot-section-${QID}`)).not.toBeNull();
    expect(d.getElementById(`answer-key-${QID}`).style.display).toBe('none');
  });
});

describe('settled gate at runtime', () => {
  it('unanswered: nothing from classmates, no chart, no key', async () => {
    const w = boot();
    render(w);
    await tick(250);
    const v = view(w);
    expectLocked(v);
    expect(v.buttonText).toBe('Submit Answer');
  });

  it('wrong first answer: retry form opens, everything stays hidden', async () => {
    const w = boot();
    render(w);
    await submit(w, 'C');
    const v = view(w);
    expectLocked(v);
    expect(v.panelText).toContain('retry with an explanation');
    expect(v.buttonText).toBe('Submit retry (this becomes your grade)');
    expect(v.buttonDisabled).toBe(true);
    expect(v.radiosDisabled).toBe(false);
  });

  it('the retry button enables live at 3 words (letters/digits), not before', async () => {
    const w = boot();
    render(w);
    await submit(w, 'C');
    const textarea = w.document.getElementById(`reason-${QID}`);
    for (const [text, disabled] of [['. . .', true], ['I misread', true], ['I misread it', false]]) {
      textarea.value = text;
      textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
      expect(view(w).buttonDisabled).toBe(disabled);
    }
  });

  it('correct first answer: settled — key, College Board, chart, letters, explained peers only, XSS inert', async () => {
    const w = boot();
    render(w);
    await submit(w, 'B');
    const v = view(w);
    expectRevealed(w, v);
    expect(v.buttonHidden).toBe(true);
    expect(v.lockText).toBe('This answer is your grade.');
    expect(v.radiosDisabled).toBe(true);
  });

  it('pending retry (server has not answered): choices locked, waiting line, nothing revealed', async () => {
    const records = [];
    let call = 0;
    const w = boot({ records, recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(() => {})) });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    const v = view(w);
    expectLocked(v);
    expect(v.lockText).toBe('Retry saved — waiting for the server / connection.');
    expect(v.radiosDisabled).toBe(true);
    expect(v.buttonHidden).toBe(true);
    expect(records.map(r => [r.attempt, r.reasoning])).toEqual([[1, undefined], [2, 'I misread the axis']]);
  });

  it('accepted retry: revealed the moment the server says yes', async () => {
    let accept;
    let call = 0;
    const w = boot({ recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(r => { accept = r; })) });
    render(w);
    await submit(w, 'C');
    await submit(w, 'A', 'I misread the axis');   // a WRONG retry is still THE grade
    expectLocked(view(w));
    accept({ ok: true, ledgerId: 'L2' });
    await tick(250);
    const v = view(w);
    expectRevealed(w, v);
    expect(v.lockText).toBe('This answer is your grade.');
    expect(v.checked).toBe('A');
  });

  it('rejected retry (409): rolled back to the first answer, retry form back, reason shown, still hidden', async () => {
    let refuse;
    let call = 0;
    const w = boot({ recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(r => { refuse = r; })) });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    refuse({ ok: false, reason: 'retry-not-allowed', detail: 'explanation-required' });
    await tick(250);
    const v = view(w);
    expectLocked(v);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(1);
    expect(w.eval(`_quizRetryStatus('${QID}')`)).toBeNull();
    expect(v.checked).toBe('C');
    expect(v.buttonText).toBe('Submit retry (this becomes your grade)');
    expect(v.error).toContain('at least 3 words');
  });

  it('queued offline, then the replay is accepted: pending until the event, revealed after', async () => {
    let call = 0;
    const w = boot({ recordImpl: () => Promise.resolve(++call === 1 ? { ok: true } : { ok: false, reason: 'network', queued: true }) });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    expectLocked(view(w));
    expect(view(w).lockText).toContain('waiting for the server');
    w.dispatchEvent(new w.CustomEvent('gradebook:quiz-retry-outcome', { detail: { itemId: QID, studentId: 'stu-me', outcome: 'accepted' } }));
    await tick(250);
    expectRevealed(w, view(w));
  });

  it('queued offline, then the replay is refused: rolled back', async () => {
    let call = 0;
    const w = boot({ recordImpl: () => Promise.resolve(++call === 1 ? { ok: true } : { ok: false, reason: 'network', queued: true }) });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    w.dispatchEvent(new w.CustomEvent('gradebook:quiz-retry-outcome', { detail: { itemId: QID, studentId: 'stu-me', outcome: 'refused', reason: 'correct-first' } }));
    await tick(250);
    const v = view(w);
    expectLocked(v);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(v.error).toContain('first answer was correct');
  });

  it('a retry cannot be submitted while one is pending', async () => {
    const records = [];
    let call = 0;
    const w = boot({ records, recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(() => {})) });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    await submit(w, 'A', 'changed my mind again');
    expect(records).toHaveLength(2);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('B');
  });

  it('reload of a settled item (correct first answer): key, chart and peers appear on render', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    await tick(300);
    expectRevealed(w, view(w));
  });

  it('reload of an item whose retry is still pending: stays hidden', async () => {
    const pending = JSON.stringify({ firstAnswers: { [QID]: 'C' }, retries: { [QID]: { state: 'pending', value: 'B', submittedAt: 9, before: { answer: { value: 'C', timestamp: 5 }, attempts: 1 } } } });
    const w = boot({ seedLocalStorage: { quizRetryState_Me: pending } });
    seedMine(w, { answer: 'B', attempts: 2 });
    render(w);
    await tick(300);
    const v = view(w);
    expectLocked(v);
    expect(v.lockText).toContain('waiting for the server');
  });

  it('reload of a wrong first answer: retry form, nothing revealed', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: JSON.stringify({ firstAnswers: { [QID]: 'C' }, retries: {} }) } });
    seedMine(w, { answer: 'C', attempts: 1 });
    render(w);
    await tick(300);
    const v = view(w);
    expectLocked(v);
    expect(v.buttonText).toBe('Submit retry (this becomes your grade)');
  });
});

describe('409 rollback is ordered and complete (IDB + outbox)', () => {
  // A fake of the page's storage adapter: answers/reasons/attempts stores + the sync outbox.
  // `slowSetMs` delays every answers write so the refused save is still in flight when the 409 lands.
  function fakeStorage(slowSetMs) {
    const stores = { answers: new Map(), reasons: new Map(), attempts: new Map() };
    const outbox = [];
    let nextId = 1;
    const k = (key) => JSON.stringify(key);
    return {
      stores, outbox,
      async getMeta() { return 'client-1'; },
      async set(store, key, value) {
        if (store === 'answers' && slowSetMs) await new Promise(r => setTimeout(r, slowSetMs));
        if (!stores[store]) stores[store] = new Map();
        stores[store].set(k(key), value);
      },
      async remove(store, key) { if (stores[store]) stores[store].delete(k(key)); },
      async enqueueOutbox(opType, payload) { const id = nextId++; outbox.push({ id, opType, payload }); return id; },
      async getOutboxAll() { return outbox.slice(); },
      async removeOutboxItem(id) { const i = outbox.findIndex(o => o.id === id); if (i >= 0) outbox.splice(i, 1); },
      async getOutboxSize() { return outbox.length; },
      async getAllForUser() { return []; },
    };
  }

  it('a late save of the refused answer cannot win; the refused outbox op is dropped; the answer that counts is re-synced', async () => {
    let refuse;
    let call = 0;
    const w = boot({ recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(r => { refuse = r; })) });
    const storage = fakeStorage(0);
    w.waitForStorage = async () => storage;
    render(w);
    await submit(w, 'C');
    await tick(50);
    storage.set = ((orig) => async function (store, key, value) {
      // only the REFUSED answer's writes are slow: they must not land after the rollback
      if (store === 'answers' && value && value.value === 'B') await new Promise(r => setTimeout(r, 600));
      return orig.call(this, store, key, value);
    })(storage.set);
    await submit(w, 'B', 'I misread the axis');
    refuse({ ok: false, reason: 'retry-not-allowed', detail: 'already-retried' });   // 409 before the save lands
    await tick(1500);
    const idbAnswer = storage.stores.answers.get(JSON.stringify(['Me', QID]));
    expect(idbAnswer.value).toBe('C');
    const answerOps = storage.outbox.filter(o => o.opType === 'answer_submit' && o.payload.questionId === QID);
    expect(answerOps.some(o => o.payload.value === 'B')).toBe(false);          // refused op removed
    expect(answerOps[answerOps.length - 1].payload.value).toBe('C');            // the answer that counts, re-synced
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(JSON.parse(w.localStorage.getItem('answers_Me'))[QID].value).toBe('C');
  });

  it('the rollback belongs to the student who submitted, even if currentUsername changes', async () => {
    let refuse;
    let call = 0;
    const w = boot({ recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(r => { refuse = r; })) });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    w.eval(`currentUsername = 'SomeoneElse'; window.currentUsername = 'SomeoneElse'; classData.users.SomeoneElse = { answers: { '${QID}': { value: 'A' } }, reasons: {}, timestamps: {}, attempts: { '${QID}': 1 }, charts: {} };`);
    refuse({ ok: false, reason: 'retry-not-allowed', detail: 'already-retried' });
    await tick(300);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(w.eval(`classData.users.SomeoneElse.answers['${QID}'].value`)).toBe('A');
  });
});

describe('round 3: identity, reconcile, clear, chart XSS', () => {
  const pendingState = (value, studentId, extra = {}) => JSON.stringify({
    firstAnswers: { [QID]: 'C' },
    retries: { [QID]: { state: 'pending', value, studentId, submittedAt: 9,
      before: { answer: { value: 'C', timestamp: 5 }, reason: '', attempts: 1, timestamp: 5 }, ...extra } },
  });
  const restoreWith = async (w, rows) => {
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows }) });
    await w.restoreOwnAnswersFromLedger();
    await tick(300);
  };
  const row = (attempt, response, extra = {}) => ({ source: 'curriculum_quiz', item_id: QID, attempt, response,
    recorded_at: `2026-09-29T10:0${attempt}:00Z`, ...extra });

  it('B: two local attempts with NO retry record stay closed ("checking"), then reconcile to the server', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 2 });
    render(w);
    await tick(300);
    let v = view(w);
    expectLocked(v);
    expect(v.lockText).toBe('Checking your retry with the server\u2026');
    expect(v.radiosDisabled).toBe(true);
    // The server has only the first answer: that is the graded answer, and the retry is open again.
    await restoreWith(w, [row(1, 'C')]);
    v = view(w);
    expectLocked(v);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(1);
    expect(v.buttonText).toBe('Submit retry (this becomes your grade)');
    expect(v.checked).toBe('C');
  });

  it('B: two local attempts with no record + an attempt-2 row on the server → accepted with the SERVER value', async () => {
    const w = boot();
    seedMine(w, { answer: 'A', attempts: 2 });
    render(w);
    await tick(300);
    await restoreWith(w, [row(1, 'C'), row(2, 'B', { reasoning: 'I misread the axis' })]);
    const v = view(w);
    expectRevealed(w, v);
    expect(v.checked).toBe('B');
  });

  it('C: a replayed outcome applies to the student who queued it, never the signed-in one', async () => {
    const w = boot({ seedLocalStorage: {
      quizRetryState_Alice: pendingState('B', 'stu-alice'),
      quizRetryState_Me: pendingState('A', 'stu-me'),
    } });
    seedMine(w, { answer: 'A', attempts: 2 });
    w.eval(`classData.users.Alice = { answers: { '${QID}': { value: 'B', timestamp: 9 } }, reasons: {}, timestamps: {}, attempts: { '${QID}': 2 }, charts: {} };`);
    render(w);
    await tick(300);
    w.dispatchEvent(new w.CustomEvent('gradebook:quiz-retry-outcome', { detail: { itemId: QID, studentId: 'stu-alice', outcome: 'refused', reason: 'already-retried' } }));
    await tick(300);
    // Me (signed in) untouched: still pending, still locked, answer A
    expect(w.eval(`_quizRetryStatus('${QID}', 'Me')`)).toBe('pending');
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('A');
    expect(view(w).lockText).toContain('waiting for the server');
    expect(view(w).error).toBe('');
    // Alice reconciled: retry gone, her first answer restored, persisted
    expect(w.eval(`_quizRetryStatus('${QID}', 'Alice')`)).toBeNull();
    expect(w.eval(`classData.users.Alice.answers['${QID}'].value`)).toBe('C');
    expect(JSON.parse(w.localStorage.getItem('quizRetryState_Alice')).retries[QID]).toBeUndefined();
    // an outcome for an unknown student is ignored
    w.dispatchEvent(new w.CustomEvent('gradebook:quiz-retry-outcome', { detail: { itemId: QID, studentId: 'stu-nobody', outcome: 'accepted' } }));
    await tick(100);
    expect(w.eval(`_quizRetryStatus('${QID}', 'Me')`)).toBe('pending');
  });

  it('D: a server-accepted retry never blesses a DIFFERENT local pending retry; its 409 restores the server value', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: pendingState('A', 'stu-me') } });
    seedMine(w, { answer: 'A', attempts: 2 });
    render(w);
    await tick(300);
    await restoreWith(w, [row(1, 'C'), row(2, 'B', { reasoning: 'server explanation here' })]);
    // still pending: the local A retry has its own outcome coming
    expect(w.eval(`_quizRetryStatus('${QID}')`)).toBe('pending');
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('A');
    expectLocked(view(w));
    w.dispatchEvent(new w.CustomEvent('gradebook:quiz-retry-outcome', { detail: { itemId: QID, studentId: 'stu-me', outcome: 'refused', reason: 'already-retried' } }));
    await tick(400);
    const v = view(w);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('B');   // the grade, never the refused A
    expect(w.eval(`_quizRetryStatus('${QID}')`)).toBe('accepted');
    expect(v.checked).toBe('B');
    expectRevealed(w, v);
  });

  it('D: the same local pending retry as the server row is simply accepted', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: pendingState('B', 'stu-me') } });
    seedMine(w, { answer: 'B', attempts: 2 });
    render(w);
    await tick(300);
    await restoreWith(w, [row(1, 'C'), row(2, 'B')]);
    expect(w.eval(`_quizRetryStatus('${QID}')`)).toBe('accepted');
    expectRevealed(w, view(w));
  });

  it('E: the rollback re-posts the first answer with an explicit empty explanation (clears the refused one)', async () => {
    let refuse;
    let call = 0;
    const w = boot({ recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(r => { refuse = r; })) });
    const posts = [];
    w.eval('turboModeActive = true;');
    w.submitAnswerViaRailway = (...args) => { posts.push(args); return Promise.resolve(true); };
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    refuse({ ok: false, reason: 'retry-not-allowed', detail: 'already-retried' });
    await tick(300);
    const last = posts[posts.length - 1];
    expect(last[2]).toBe('C');
    expect(last[4]).toBe('');
  });

  it('E: a pulled/broadcast empty explanation clears a cached classmate explanation', () => {
    const w = boot();
    w.eval(`mergePeerAnswer({ username: 'Peer1', question_id: '${QID}', answer_value: 'C', timestamp: 99, reasoning: '' })`);
    expect(w.eval(`classData.users.Peer1.reasons['${QID}']`)).toBe('');
  });

  // The peer renderer decides "FRQ" from the real curriculum, so these use a real curriculum FRQ.
  const useRealFrq = (w) => w.eval(`(() => {
    const q = EMBEDDED_CURRICULUM.find(q => q.type === 'free-response');
    currentQuestions[1] = q;
    return q.id;
  })()`);

  it('A: a classmate name / chart title cannot inject markup into FRQ peer charts (both render paths)', async () => {
    let sawChart = false;
    const chart = JSON.stringify({ chartType: 'histogram', title: '<svg/onload=window.__xss=2>',
      xLabels: ['a'], series: [{ name: 'F', values: [1] }] });
    for (const noDomUtils of [false, true]) {
      const w = boot();
      const FRQ = useRealFrq(w);
      w.eval(`
        classData.users.Me.answers['${FRQ}'] = { value: 'mine', timestamp: 1 };
        classData.users[${JSON.stringify(EVIL_NAME)}] = { answers: { '${FRQ}': { value: ${JSON.stringify(chart)}, timestamp: 2 } }, reasons: {} };
        document.getElementById('host').innerHTML = renderQuestion(currentQuestions[1], 1).html;
      `);
      if (noDomUtils) w.eval('DOMUtils.updateList = undefined;');
      w.eval(`populatePeerResponses('${FRQ}', 'free-response')`);
      await tick(250);
      expect(w.document.querySelector('svg')).toBeNull();
      expect(w.__xss).toBeUndefined();
      const panel = w.document.getElementById(`peer-reasoning-content-${FRQ}`);
      expect(panel.textContent).toContain(EVIL_NAME);   // shown as text
      const ids = [...panel.querySelectorAll('[id]')].map(el => el.id);
      for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
      if (panel.querySelector('canvas, .peer-chart-container')) sawChart = true;
    }
    expect(sawChart).toBe(true);   // the chart path really ran
  });

  it('A: the no-charts fallback path escapes the container id too', async () => {
    const chart = JSON.stringify({ chartType: 'histogram', xLabels: ['a'], series: [{ name: 'F', values: [1] }] });
    const w = boot();
    const FRQ = useRealFrq(w);
    w.eval(`
      classData.users.Me.answers['${FRQ}'] = { value: 'mine', timestamp: 1 };
      classData.users[${JSON.stringify(EVIL_NAME)}] = { answers: { '${FRQ}': { value: ${JSON.stringify(chart)}, timestamp: 2 } }, reasons: {} };
      document.getElementById('host').innerHTML = renderQuestion(currentQuestions[1], 1).html;
      DOMUtils.updateList = undefined;
      window.charts.getChartHtml = undefined;
    `);
    w.eval(`populatePeerResponses('${FRQ}', 'free-response')`);
    await tick(250);
    expect(w.document.querySelector('svg')).toBeNull();
    expect(w.__xss).toBeUndefined();
  });
});

describe('round 4: correct-first legacy, rollback vs restore, POST ordering', () => {
  it('3: legacy profile (2 attempts, correct first answer, no retry record) settles via correct-first', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: JSON.stringify({ firstAnswers: { [QID]: 'B' }, retries: {} }) } });
    seedMine(w, { answer: 'C', attempts: 2 });
    render(w);
    await tick(300);
    const v = view(w);
    expect(v.lockText).not.toContain('Checking');
    expect(v.lockText).toBe('This answer is your grade.');
    expectRevealed(w, v);
  });

  it('8: a restore that ACCEPTS the retry while its 409 rollback is paused wins — nothing reverted', async () => {
    let refuse;
    let call = 0;
    const w = boot({ recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(r => { refuse = r; })) });
    // storage whose write of the retry's answer (B) is held until we release it
    let release;
    const held = new Promise(r => { release = r; });
    const answers = new Map();
    w.waitForStorage = async () => ({
      async getMeta() { return 'c'; },
      async set(store, key, value) { if (store === 'answers' && value && value.value === 'B' && value.timestamp > 100) await held; if (store === 'answers') answers.set(JSON.stringify(key), value); },
      async remove() {}, async enqueueOutbox() { return 1; }, async getOutboxAll() { return []; },
      async removeOutboxItem() {}, async getOutboxSize() { return 0; }, async getAllForUser() { return []; },
    });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    refuse({ ok: false, reason: 'retry-not-allowed', detail: 'already-retried' });   // rollback starts, waits on the held write
    await tick(100);
    // the server accepted B (from another device): the restore marks it accepted meanwhile
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows: [
      { source: 'curriculum_quiz', item_id: QID, attempt: 1, response: 'C', recorded_at: '2026-09-29T10:00:00Z' },
      { source: 'curriculum_quiz', item_id: QID, attempt: 2, response: 'B', recorded_at: '2026-09-29T10:05:00Z' },
    ] }) });
    await w.restoreOwnAnswersFromLedger();
    expect(w.eval(`_quizRetryStatus('${QID}')`)).toBe('accepted');
    release();
    await tick(500);
    expect(w.eval(`_quizRetryStatus('${QID}')`)).toBe('accepted');
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('B');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(2);
    expect(answers.get(JSON.stringify(['Me', QID])).value).toBe('B');
    const v = view(w);
    expect(v.error).toBe('');
    expectRevealed(w, v);
  });

  it('9: the rollback clear is sent only after the original retry POST lands (unconditional server)', async () => {
    let refuse;
    let call = 0;
    const w = boot({ recordImpl: () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(r => { refuse = r; })) });
    const server = new Map();   // an upsert-always store: order of arrival decides
    w.eval('turboModeActive = true;');
    w.submitAnswerViaRailway = (user, qid, value, ts, reasoning) => new Promise(resolve => {
      const delay = value === 'B' ? 600 : 0;   // the retry POST is slow
      setTimeout(() => {
        const row = { value, ts };
        if (reasoning !== undefined) row.reasoning = reasoning;
        server.set(`${user}|${qid}`, { ...(server.get(`${user}|${qid}`) || {}), ...row });
        resolve(true);
      }, delay);
    });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    refuse({ ok: false, reason: 'retry-not-allowed', detail: 'already-retried' });   // 409 before the POST lands
    await tick(1200);
    expect(server.get(`Me|${QID}`)).toMatchObject({ value: 'C', reasoning: '' });
  });
});

describe('ledger restore repaints the question', () => {
  it('a restored accepted retry (attempt-2 row) settles and reveals a rendered question', async () => {
    const w = boot();
    seedMine(w, { answer: 'C', attempts: 1 });
    render(w);
    await tick(300);
    expectLocked(view(w));
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-1' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows: [
      { source: 'curriculum_quiz', item_id: QID, attempt: 1, response: 'C', recorded_at: '2026-09-29T10:00:00Z' },
      { source: 'curriculum_quiz', item_id: QID, attempt: 2, response: 'B', reasoning: 'I misread the axis', recorded_at: '2026-09-29T10:05:00Z' },
    ] }) });
    await w.restoreOwnAnswersFromLedger();
    await tick(300);
    const v = view(w);
    expectRevealed(w, v);
    expect(v.checked).toBe('B');
    // F: the restored explanation is in the (locked) textarea
    expect(w.document.getElementById(`reason-${QID}`).value).toBe('I misread the axis');
  });

  it('F: an already-rendered FRQ input shows the restored response', async () => {
    const w = boot();
    w.eval(`document.getElementById('host').innerHTML = renderQuestion(currentQuestions[1], 1).html;`);
    await tick(200);
    expect(w.document.getElementById(`frq-${FRQ}`).value).toBe('');
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows: [
      { source: 'curriculum_quiz', item_id: FRQ, attempt: 1, response: 'My restored FRQ answer', recorded_at: '2026-09-29T10:00:00Z' },
    ] }) });
    await w.restoreOwnAnswersFromLedger();
    await tick(200);
    expect(w.document.getElementById(`frq-${FRQ}`).value).toBe('My restored FRQ answer');
  });
});

// QUIZ_MCQ_REVEAL_SPEC (teacher 2026-09-29): one box, no repeated letter, no filler.
describe('settled MCQ reveal: one box', () => {
  const acceptedWrong = JSON.stringify({ firstAnswers: { [QID]: 'A' }, retries: { [QID]: { state: 'accepted', value: 'C', submittedAt: 9 } } });

  function withoutExplanation(w) {
    w.eval(`currentQuestions[0].explanation = undefined;`);
  }

  function keyBox(w) {
    return w.document.getElementById(`answer-key-${QID}`);
  }

  it('correct + explanation: a collapsed "Why this is right" line, no letter, no College Board box', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    await tick(300);
    const box = keyBox(w);
    expect(box.style.display).toBe('block');
    const details = box.querySelector('details.mcq-why');
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.querySelector('summary').textContent).toBe('Why this is right');
    expect(box.textContent).toContain('Because B is right.');
    expect(box.textContent).not.toContain('Correct answer');
    expect(box.textContent).not.toContain('Answer Key');
    expect(box.classList.contains('mcq-reveal-quiet')).toBe(true);
    expect(view(w).cbShown).toBe(false);
  });

  it('correct + no explanation: nothing shows', async () => {
    const w = boot();
    withoutExplanation(w);
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    await tick(300);
    expect(keyBox(w).style.display).toBe('none');
    expect(view(w).cbShown).toBe(false);
    expect(w.document.getElementById('host').textContent).not.toContain('Official explanation not available');
  });

  it('wrong (retry accepted) + explanation: the correct letter and the explanation, one box', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: acceptedWrong } });
    seedMine(w, { answer: 'C', attempts: 2 });
    render(w);
    await tick(300);
    const box = keyBox(w);
    expect(box.style.display).toBe('block');
    expect(box.textContent).toContain('Correct answer: B');
    expect(box.textContent).toContain('Because B is right.');
    expect(box.querySelector('details')).toBeNull();
    expect(box.classList.contains('mcq-reveal-quiet')).toBe(false);
    expect(view(w).cbShown).toBe(false);
  });

  it('wrong (retry accepted) + no explanation: the letter only, no filler', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: acceptedWrong } });
    withoutExplanation(w);
    seedMine(w, { answer: 'C', attempts: 2 });
    render(w);
    await tick(300);
    const box = keyBox(w);
    expect(box.style.display).toBe('block');
    expect(box.textContent.trim()).toBe('Correct answer: B');
    expect(w.document.getElementById('host').textContent).not.toContain('Official explanation not available');
  });

  it('an opened "Why this is right" stays open through a repaint', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    await tick(300);
    keyBox(w).querySelector('details.mcq-why').open = true;
    w.eval(`_refreshAfterReveal('${QID}')`);
    await tick(200);
    expect(keyBox(w).querySelector('details.mcq-why').open).toBe(true);
  });
});
