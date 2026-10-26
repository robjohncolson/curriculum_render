/**
 * QUIZ_RETRY_REMOVAL_SPEC (teacher 2026-10-26) — RUNTIME DOM tests of the settled gate.
 *
 * One answer per multiple-choice question: the first answer the ledger records is the grade and
 * settles the item at once (right or wrong). Loads the real page scripts (every local <script> up
 * to and including the main inline block) into jsdom, renders a real MCQ with the page's own
 * renderQuestion, and drives the real submitAnswer. Chart.js is replaced by a counter so "no chart
 * before settlement" is measurable. States: unanswered / wrong first / correct first / a second
 * answer refused / reload / a replayed old-page retry (rule 6) / the fresh-device reconcile (rule 5)
 * / the ledger restore with a historical attempt-2 row / FRQ / a PC makeup item (one answer too),
 * plus XSS.
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

const RED = 'rgb(192, 57, 43)';      // #c0392b
const GREEN = 'rgb(39, 174, 96)';    // #27ae60
const BLUE = 'rgb(52, 152, 219)';    // #3498db
const successLine = (w) => w.document.getElementById(`success-${QID}`);

// The roster answers the ledger restore with these rows.
async function restoreWith(w, rows) {
  w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
  w.ROSTER_SERVICE_URL = 'https://roster.test';
  w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows }) });
  await w.restoreOwnAnswersFromLedger();
  await tick(300);
}

const row = (attempt, response, extra = {}) => ({ source: 'curriculum_quiz', item_id: QID, attempt, response,
  recorded_at: `2026-09-29T10:0${attempt}:00Z`, ...extra });

// Turbo mode on, with the peer-server write captured as [username, questionId, value, reasoning].
function capturePeerWrites(w) {
  const writes = [];
  w.eval('turboModeActive = true;');
  w.submitAnswerViaRailway = (user, qid, value, ts, reasoning) => { writes.push([user, qid, value, reasoning]); return Promise.resolve(true); };
  return writes;
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
    expect(w.document.getElementById(`reason-${QID}`).placeholder).toBe('Optional: say why, in your own words. It protects you from a mis-click.');
  });

  it('wrong first answer: "Not correct" in red, then the reveal; settled, no retry form', async () => {
    const records = [];
    const w = boot({ records });
    render(w);
    await submit(w, 'C', 'the middle value');
    const v = view(w);
    expectRevealed(w, v);
    expect(successLine(w).textContent).toBe('Not correct. The correct answer is shown below.');
    expect(successLine(w).style.color).toBe(RED);
    expect(v.keyText).toContain('Correct answer: B');
    expect(v.checked).toBe('C');
    expect(v.radiosDisabled).toBe(true);
    expect(v.buttonHidden).toBe(true);
    expect(v.lockText).toBe('This answer is your grade.');
    expect(w.document.getElementById(`reason-${QID}`).readOnly).toBe(true);
    expect(records.map(r => [r.attempt, r.response, r.reasoning])).toEqual([[1, 'C', 'the middle value']]);
  });

  it('correct first answer: settled, "Correct answer submitted!" in green — key, chart, letters, explained peers only, XSS inert', async () => {
    const w = boot();
    render(w);
    await submit(w, 'B');
    const v = view(w);
    expectRevealed(w, v);
    expect(successLine(w).textContent).toBe('✅ Correct answer submitted!');
    expect(successLine(w).style.color).toBe(GREEN);
    expect(v.buttonHidden).toBe(true);
    expect(v.lockText).toBe('This answer is your grade.');
    expect(v.radiosDisabled).toBe(true);
  });

  it('a second answer is refused: nothing recorded, the first answer stays', async () => {
    const records = [];
    const w = boot({ records });
    render(w);
    await submit(w, 'C');
    await submit(w, 'B', 'I misread the axis');
    expect(records).toHaveLength(1);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(1);
    expect(view(w).error).toBe('This answer is already your grade.');
  });

  it('reload of a settled item (correct first answer): key, chart and peers appear on render', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    await tick(300);
    expectRevealed(w, view(w));
  });

  it('reload of a wrong first answer: settled and revealed', async () => {
    const w = boot();
    seedMine(w, { answer: 'C', attempts: 1 });
    render(w);
    await tick(300);
    const v = view(w);
    expectRevealed(w, v);
    expect(v.checked).toBe('C');
    expect(v.lockText).toBe('This answer is your grade.');
  });

  it('reload of a historical retry kept on this device (2 attempts): settled on that answer, nothing "checking"', async () => {
    const w = boot();
    seedMine(w, { answer: 'A', attempts: 2 });
    render(w);
    await tick(300);
    const v = view(w);
    expectRevealed(w, v);
    expect(v.checked).toBe('A');
    expect(v.lockText).toBe('This answer is your grade.');
  });
});

describe('retries have closed: a replayed old-page retry (QUIZ_RETRY_REMOVAL_SPEC rule 6)', () => {
  // The old page queued an attempt 2 (B) offline over the wrong first answer C; this page loads with
  // B as the local answer, and gradebook-client.js replays the queued row.
  async function oldPageRetry() {
    const records = [];
    const w = boot({ records });
    seedMine(w, { answer: 'B', attempts: 2, reason: 'I misread the axis' });
    render(w);
    await tick(300);
    return { w, records };
  }
  // gradebook-client.js names the owner signed in when it sent the replay, and the refused letter.
  const outcome = (w, detail) => w.dispatchEvent(new w.CustomEvent('gradebook:quiz-retry-outcome',
    { detail: { itemId: QID, studentId: 'stu-me', username: 'Me', response: 'B', ...detail } }));

  // The page's persistent peer outbox, seeded with the old page's queued writes: the first answer C
  // (still queued) and the retry B. Other storage calls are no-ops.
  function fakeOutbox(w, ops = [['Me', 'C', 5], ['Me', 'B', 6], ['Other', 'B', 7]]) {
    const outbox = ops.map(([username, value, timestamp], i) => ({ id: i + 1, opType: 'answer_submit', payload: { username, questionId: QID, value, timestamp } }));
    let nextId = outbox.length + 1;
    const api = {
      getOutboxAll: async () => outbox.slice(),
      removeOutboxItem: async (id) => { const i = outbox.findIndex(op => op.id === id); if (i >= 0) outbox.splice(i, 1); },
      enqueueOutbox: async (opType, payload) => { outbox.push({ id: nextId, opType, payload }); return nextId++; },
      getOutboxSize: async () => outbox.length,
      getMeta: async () => 'client-1',
    };
    const storage = new Proxy(api, { get: (t, k) => (k in t ? t[k] : (k === 'then' ? undefined : async () => undefined)) });
    w.waitForStorage = async () => storage;
    // [username, value] per queued write, plus whether its time is fresh (after the seeded ones).
    return () => outbox.map(op => [op.payload.username, op.payload.value, op.payload.timestamp > 1000]);
  }

  // Someone else signs in on this device: the roster session and the page user both move.
  function signInAsOther(w) {
    w.rosterClient = { token: () => 'tok-other', studentId: () => 'stu-other' };
    w.eval(`currentUsername = 'Other'; window.currentUsername = 'Other';
      classData.users.Other = { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} };`);
  }

  // The ledger answers /ledger/student with `replies` in turn (a number = that HTTP status).
  function ledgerReplies(w, replies) {
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    w.eval('QUIZ_LEDGER_REREAD_DELAYS_MS = [20, 20];');
    let reads = 0;
    w.fetch = () => {
      const reply = replies[Math.min(reads++, replies.length - 1)];
      if (typeof reply === 'number') return Promise.resolve({ status: reply, json: async () => ({}) });
      return Promise.resolve({ status: 200, json: async () => ({ ok: true, rows: reply }) });
    };
    return () => reads;
  }

  function expectFirstAnswerStands(w, v) {
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(1);
    expect(v.checked).toBe('C');
    expectRevealed(w, v);
    expect(v.lockText).toBe('This answer is your grade.');
    expect(successLine(w).textContent).toBe('Retries have closed; your first answer stands.');
    expect(successLine(w).style.color).toBe(BLUE);
    expect(successLine(w).classList.contains('show')).toBe(true);
    expect(v.error).toBe('');
  }

  it('refused (retries-closed): the item settles on the first answer with the line; classmates see it, the ledger gets nothing', async () => {
    const { w, records } = await oldPageRetry();
    const peer = capturePeerWrites(w);
    ledgerReplies(w, [[row(1, 'C')]]);
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(400);
    expectFirstAnswerStands(w, view(w));
    // the refused retry's explanation is gone from the item and from the peer server
    expect(w.document.getElementById(`reason-${QID}`).value).toBe('');
    expect(peer).toEqual([['Me', QID, 'C', '']]);
    expect(records).toHaveLength(0);
  });

  it('refused (retries-closed) while the ledger read fails: no claim until a read lands, then the line', async () => {
    const { w, records } = await oldPageRetry();
    const reads = ledgerReplies(w, [500, [row(1, 'C')]]);
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(5);
    expect(successLine(w).textContent).toBe('');
    expect(view(w).checked).toBe('B');
    await tick(400);
    expect(reads()).toBe(2);
    expectFirstAnswerStands(w, view(w));
    expect(records).toHaveLength(0);
  });

  it('refused (retries-closed) and every ledger read fails: the line never shows', async () => {
    const { w, records } = await oldPageRetry();
    const reads = ledgerReplies(w, [500]);
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(400);
    expect(reads()).toBe(3);
    expect(successLine(w).textContent).toBe('');
    expect(view(w).checked).toBe('B');
    expect(records).toHaveLength(0);
  });

  it('refused with turbo off: the queued retry B leaves the outbox and the kept C is queued fresh, nothing live', async () => {
    const { w } = await oldPageRetry();
    const queued = fakeOutbox(w);
    const live = [];
    w.submitAnswerViaRailway = (...args) => { live.push(args); return Promise.resolve(true); };
    ledgerReplies(w, [[row(1, 'C')]]);
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(400);
    expectFirstAnswerStands(w, view(w));
    expect(queued()).toEqual([['Other', 'B', false], ['Me', 'C', true]]);
    expect(live).toHaveLength(0);
  });

  it('refused while the live peer write fails: the queued kept C still replaces the queued B', async () => {
    const { w } = await oldPageRetry();
    const queued = fakeOutbox(w);
    w.eval('turboModeActive = true;');
    let liveTries = 0;
    w.submitAnswerViaRailway = () => { liveTries++; return Promise.reject(new Error('peer server down')); };
    ledgerReplies(w, [[row(1, 'C')]]);
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(400);
    expectFirstAnswerStands(w, view(w));
    expect(liveTries).toBe(1);
    expect(queued()).toEqual([['Other', 'B', false], ['Me', 'C', true]]);
  });

  it('another student signed in while the replay was out: nothing is read or shown for them; the owner is reconciled at their next sign-in', async () => {
    const { w } = await oldPageRetry();
    const queued = fakeOutbox(w);
    const reads = ledgerReplies(w, [[row(1, 'C')]]);
    signInAsOther(w);
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(400);
    expect(reads()).toBe(0);                                 // the other student's token reads nothing for the owner
    expect(successLine(w).textContent).toBe('');
    expect(w.eval(`classData.users.Other.answers['${QID}']`)).toBeUndefined();
    expect(queued()).toEqual([['Me', 'C', false], ['Other', 'B', false]]);   // only the owner's refused B left

    // The owner signs back in: the sign-in restore moves their answer and classmates' view to C.
    w.eval(`currentUsername = 'Me'; window.currentUsername = 'Me';`);
    await restoreWith(w, [row(1, 'C')]);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(queued()).toEqual([['Other', 'B', false], ['Me', 'C', true]]);
  });

  it('another student signs in during a reread wait: the rereads stop, nothing is shown for them', async () => {
    const { w } = await oldPageRetry();
    fakeOutbox(w);
    const reads = ledgerReplies(w, [500, [row(1, 'C')]]);
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(5);
    expect(reads()).toBe(1);
    signInAsOther(w);
    await tick(400);
    expect(reads()).toBe(1);
    expect(successLine(w).textContent).toBe('');
    expect(w.eval(`classData.users.Other.answers['${QID}']`)).toBeUndefined();
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('B');   // the owner's next sign-in reconciles it
  });

  it('another student signs in while a ledger read is out: the owner\'s rows land on the owner, no line for the other', async () => {
    const { w } = await oldPageRetry();
    fakeOutbox(w);
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    let answerRead;
    w.fetch = () => new Promise(resolve => { answerRead = () => resolve({ status: 200, json: async () => ({ ok: true, rows: [row(1, 'C')] }) }); });
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(5);
    signInAsOther(w);
    answerRead();
    await tick(400);
    expect(successLine(w).textContent).toBe('');
    expect(w.eval(`classData.users.Other.answers['${QID}']`)).toBeUndefined();
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
  });

  it('an event that does not name its owner is ignored', async () => {
    const { w } = await oldPageRetry();
    const reads = ledgerReplies(w, [[row(1, 'C')]]);
    outcome(w, { outcome: 'refused', reason: 'retries-closed', username: null });
    await tick(400);
    expect(reads()).toBe(0);
    expect(view(w).checked).toBe('B');
  });

  for (const reason of ['already-retried', null]) {
    it(`refused (${reason}): the item repaints from the ledger without the closed line`, async () => {
      const { w, records } = await oldPageRetry();
      ledgerReplies(w, [[row(1, 'C')]]);
      outcome(w, { outcome: 'refused', reason });
      await tick(400);
      expect(view(w).checked).toBe('C');
      expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(1);
      expect(successLine(w).textContent).toBe('');
      expect(records).toHaveLength(0);
    });
  }

  it('refused (retries-closed) over a historical retry the server holds: it shows, without the closed line', async () => {
    const { w } = await oldPageRetry();
    ledgerReplies(w, [[row(1, 'C'), row(2, 'A')]]);
    outcome(w, { outcome: 'refused', reason: 'retries-closed' });
    await tick(400);
    expect(view(w).checked).toBe('A');
    expect(successLine(w).textContent).toBe('');
  });

  it('accepted (it reached the server before the cutoff): that retry is the grade, no closed line', async () => {
    const { w } = await oldPageRetry();
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    w.fetch = () => Promise.resolve({ status: 200, json: async () => ({ ok: true, rows: [row(1, 'C'), row(2, 'B')] }) });
    outcome(w, { outcome: 'accepted' });
    await tick(400);
    expect(view(w).checked).toBe('B');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(2);
    expect(successLine(w).textContent).toBe('');
  });

  it('this page never sends an attempt 2, and a leftover quizRetryState_ key is ignored', async () => {
    const records = [];
    const w = boot({ records, seedLocalStorage: { quizRetryState_Me: JSON.stringify({ firstAnswers: { [QID]: 'C' }, retries: {} }) } });
    seedMine(w, { answer: 'C', attempts: 1 });
    render(w);
    await tick(300);
    expectRevealed(w, view(w));
    await submit(w, 'B', 'I misread the axis');
    expect(records).toHaveLength(0);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
  });
});

describe('peer rendering: cleared explanations and chart XSS', () => {
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

describe('server kept an earlier first answer (QUIZ_RETRY_REMOVAL_SPEC rule 5)', () => {
  // The fixture key is B. The server already holds a first answer; this device sends a letter as
  // attempt 1 and is told firstAnswerKept + keptResponse. The kept answer is the grade.
  function keptBoot(records, kept) {
    return boot({ records, recordImpl: () => Promise.resolve({ ok: true, firstAnswerKept: true, keptResponse: kept }) });
  }

  it('a wrong kept answer: it shows settled with the line in red, the chosen letter is dropped, nothing re-sent', async () => {
    const records = [];
    const w = keptBoot(records, 'C');
    const peer = capturePeerWrites(w);
    render(w);
    await submit(w, 'B', 'I misread the axis');
    await tick(300);
    expect(records.map(r => [r.attempt, r.response])).toEqual([[1, 'B']]);
    const v = view(w);
    expectRevealed(w, v);
    expect(v.checked).toBe('C');
    expect(v.lockText).toBe('This answer is your grade.');
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(1);
    expect(successLine(w).textContent).toBe('The gradebook already had your first answer on this question (C). That answer stands.');
    expect(successLine(w).style.color).toBe(RED);
    // The explanation argued for B: it leaves the item, and classmates see C with no explanation.
    expect(w.eval(`classData.users.Me.reasons['${QID}']`)).toBe('');
    expect(w.document.getElementById(`reason-${QID}`).value).toBe('');
    expect(peer).toEqual([['Me', QID, 'B', 'I misread the axis'], ['Me', QID, 'C', '']]);
  });

  it('a correct kept answer: the same line in green', async () => {
    const records = [];
    const w = keptBoot(records, 'B');
    render(w);
    await submit(w, 'C', 'I changed my mind');
    await tick(300);
    expect(records).toHaveLength(1);
    expect(view(w).checked).toBe('B');
    expect(successLine(w).textContent).toBe('The gradebook already had your first answer on this question (B). That answer stands.');
    expect(successLine(w).style.color).toBe(GREEN);
  });

  it('the kept answer equals the chosen letter: nothing to reconcile', async () => {
    const records = [];
    const w = keptBoot(records, 'C');
    render(w);
    await submit(w, 'C', 'I misread the axis');
    await tick(300);
    expect(records).toHaveLength(1);
    expect(view(w).checked).toBe('C');
    expect(successLine(w).textContent).toBe('Not correct. The correct answer is shown below.');
  });
});

describe('ledger restore repaints the question', () => {
  it('a historical retry (attempt-2 row) settles the item with that answer shown', async () => {
    const w = boot();
    seedMine(w, { answer: 'C', attempts: 1 });
    render(w);
    await tick(300);
    await restoreWith(w, [row(1, 'C'), row(2, 'B', { reasoning: 'I misread the axis' })]);
    const v = view(w);
    expectRevealed(w, v);
    expect(v.checked).toBe('B');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(2);
    // the restored explanation is in the (locked) textarea
    expect(w.document.getElementById(`reason-${QID}`).value).toBe('I misread the axis');
  });

  it('a fresh device with no local answer restores a historical retry as that answer', async () => {
    const w = boot();
    render(w);
    await tick(300);
    expectLocked(view(w));
    await restoreWith(w, [row(1, 'C'), row(2, 'A')]);
    const v = view(w);
    expectRevealed(w, v);
    expect(v.checked).toBe('A');
  });

  it('a historical retry gone from the server (teacher reset): the first answer shows, still settled', async () => {
    const w = boot();
    seedMine(w, { answer: 'A', attempts: 2, reason: 'I meant B' });
    render(w);
    await tick(300);
    await restoreWith(w, [row(1, 'C')]);
    const v = view(w);
    expect(w.eval(`classData.users.Me.answers['${QID}'].value`)).toBe('C');
    expect(w.eval(`classData.users.Me.attempts['${QID}']`)).toBe(1);
    expect(v.checked).toBe('C');
    expectRevealed(w, v);
    expect(v.lockText).toBe('This answer is your grade.');
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

describe('FRQ is unchanged; a PC makeup item takes one answer too', () => {
  it('an FRQ keeps unlimited revisions: every submit records, the button reads Update Answer', async () => {
    const records = [];
    const w = boot({ records });
    w.eval(`document.getElementById('host').innerHTML = renderQuestion(currentQuestions[1], 1).html;`);
    await tick(200);
    for (const text of ['first draft', 'second draft']) {
      w.document.getElementById(`frq-${FRQ}`).value = text;
      expect(w.eval(`submitAnswer('${FRQ}', 'free-response')`)).toBe(true);
      await tick(250);
    }
    expect(records.map(r => [r.itemId, r.attempt, r.response])).toEqual([[FRQ, 1, 'first draft'], [FRQ, 1, 'second draft']]);
    expect(w.eval(`classData.users.Me.attempts['${FRQ}']`)).toBe(2);
    expect(w.document.getElementById(`submit-${FRQ}`).textContent.trim()).toBe('Update Answer');
  });

  it('a PC makeup item (no key on the page) goes to the PC route as attempt 1, never says "Not correct" or offers Talk, and refuses a second answer', async () => {
    const PC = 'U1-PC26-MCQ-A-Q01';
    const records = [];
    const w = boot({ records });
    w.eval(`currentQuestions = [{ id: '${PC}', type: 'multiple-choice', prompt: 'Secure?',
      choices: [{ key: 'A', value: 'one' }, { key: 'B', value: 'two' }, { key: 'C', value: 'three' }] }];
      document.getElementById('host').innerHTML = renderQuestion(currentQuestions[0], 0).html;`);
    await tick(250);
    w.document.querySelector(`input[name="choice-${PC}"][value="A"]`).click();
    expect(w.eval(`submitAnswer('${PC}', 'multiple-choice')`)).toBe(true);
    await tick(250);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ source: 'pc', itemId: PC, attempt: 1, response: 'A', kind: 'pc', part: 'A' });
    expect(w.document.getElementById(`success-${PC}`).textContent).toBe('📝 Answer submitted successfully!');
    // No key on the page, so no "not correct" to talk through: the server scores a PC item.
    const talk = w.document.getElementById(`talk-${PC}`);
    expect(talk).not.toBeNull();
    expect(talk.style.display).toBe('none');
    expect(talk.textContent).toBe('');

    // Settled: the choices lock, and a second submit is refused before anything is recorded.
    const radioB = w.document.querySelector(`input[name="choice-${PC}"][value="B"]`);
    expect(radioB.disabled).toBe(true);
    radioB.disabled = false;
    radioB.checked = true;
    w.document.getElementById(`reason-${PC}`).value = 'I changed my mind about the spread';
    w.eval(`submitAnswer('${PC}', 'multiple-choice')`);
    await tick(250);
    expect(records.map(r => [r.source, r.attempt, r.response])).toEqual([['pc', 1, 'A']]);
    expect(w.eval(`classData.users.Me.answers['${PC}'].value`)).toBe('A');
    expect(w.document.getElementById(`error-${PC}`).textContent).toBe('This answer is already your grade.');
  });
});

// QUIZ_MCQ_REVEAL_SPEC (teacher 2026-09-29): one box, no repeated letter, no filler.
describe('settled MCQ reveal: one box', () => {
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

  it('wrong + explanation: the correct letter and the explanation, one box', async () => {
    const w = boot();
    seedMine(w, { answer: 'C', attempts: 1 });
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

  it('wrong + no explanation: the letter only, no filler', async () => {
    const w = boot();
    withoutExplanation(w);
    seedMine(w, { answer: 'C', attempts: 1 });
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
