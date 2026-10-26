/**
 * QUIZ_INCONGRUENCE_CHECK_SPEC §0 addendum (2026-10-26): the line under Submit after a retry.
 *
 * The teacher's wrong retry showed a blue line and then the reveal box "Correct answer: E", which read as
 * "your retry was marked correct". The retry was recorded as the picked (wrong) letter; only the copy
 * misled. A wrong retry now says so in red once the server accepts it, in place of the blue "waiting for
 * the server" line, also when a queued retry replays after the question was re-rendered or the sign-in ledger
 * restore finds it accepted, and after the fresh-device reconcile's own line. The generic blue
 * "submitted successfully" line never appears for a multiple-choice item with a key; an item without one
 * (a PC makeup, scored by the server) never hears "Not correct". Boots the real page the way
 * quiz-retry-pick.test.js does.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';
const PC_QID = 'U1-PC26-MCQ-A-Q01';
const FIRST_WRONG_TEXT = 'Not correct. You get one retry: explain what changed your mind, then submit.';
const RETRY_WRONG_TEXT = 'Not correct. This retry is your grade. The correct answer is shown below.';
const GENERIC_TEXT = '📝 Answer submitted successfully!';
const PENDING_TEXT = 'Retry saved — waiting for the server / connection.';
const CORRECT_TEXT = '✅ Correct answer submitted!';
const RED = 'rgb(192, 57, 43)';      // #c0392b
const GREEN = 'rgb(39, 174, 96)';    // #27ae60
const BLUE = 'rgb(52, 152, 219)';    // #3498db

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

// Signed in as 'Me', one MCQ rendered into #host: key B, or (keyless) a PC makeup item, which reaches
// the client with no key.
function boot({ recordImpl, keyless = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
    url: 'https://quiz.test/',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  openWindows.push(w);
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
  w.gradebookClient = { record: rec => (recordImpl ? recordImpl(rec) : Promise.resolve({ ok: true, ledgerId: 'L' })) };
  w.rosterClient = { token: () => null, studentId: () => 'stu-me' };
  const id = keyless ? PC_QID : QID;
  w.eval(`
    currentUsername = 'Me'; window.currentUsername = 'Me';
    currentQuestions = [{
      id: '${id}', type: 'multiple-choice', prompt: 'Which one?', ${keyless ? '' : "answerKey: 'B',"}
      explanation: 'Because B is right.',
      choices: [{ key: 'A', value: 'alpha' }, { key: 'B', value: 'bravo' }, { key: 'C', value: 'charlie' }]
    }];
    classData = { users: { Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} } } };
  `);
  render(w);
  return w;
}

// (Re)render the item: also what navigating away and back does to the line under Submit.
function render(w) {
  w.eval(`document.getElementById('host').innerHTML = renderQuestion(currentQuestions[0], 0).html;`);
}

const qid = w => w.eval('currentQuestions[0].id');
const span = w => w.document.getElementById(`success-${qid(w)}`);

// Every text the success line is given, in order (from the mutation records, so a line that is
// replaced before anyone looks still counts), and what it shows now.
function watchSuccessLine(w) {
  const texts = [];
  new w.MutationObserver(records => {
    for (const record of records) {
      if (record.target !== span(w)) continue;
      for (const node of record.addedNodes) if (node.textContent) texts.push(node.textContent);
    }
  }).observe(w.document.getElementById('host'), { subtree: true, childList: true });
  return { texts, now: () => ({ text: span(w).textContent, color: span(w).style.color }) };
}

async function answer(w, letter, explanation, wait = 250) {
  w.document.querySelector(`input[name="choice-${qid(w)}"][value="${letter}"]`).click();
  const textarea = w.document.getElementById(`reason-${qid(w)}`);
  textarea.value = explanation;
  textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
  const sent = w.eval(`submitAnswer('${qid(w)}', 'multiple-choice')`);
  await tick(wait);   // the page's own 50 ms / 100 ms render timers, and the record's reply
  return sent;
}

function itemText(w) {
  return w.document.querySelector(`[data-question-id="${qid(w)}"]`).textContent;
}

// A record reply the test sends when it wants.
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

describe('the line under Submit after each kind of multiple-choice submit', () => {
  it('a wrong first answer: the red first-wrong line', async () => {
    const w = boot();
    const seen = watchSuccessLine(w);
    expect(await answer(w, 'A', 'alpha because')).toBe(true);
    expect(seen.now()).toEqual({ text: FIRST_WRONG_TEXT, color: RED });
    expect(seen.texts).not.toContain(GENERIC_TEXT);
  });

  it('a correct first answer: the green line', async () => {
    const w = boot();
    const seen = watchSuccessLine(w);
    await answer(w, 'B', 'bravo because');
    expect(seen.now()).toEqual({ text: CORRECT_TEXT, color: GREEN });
    expect(seen.texts).not.toContain(GENERIC_TEXT);
  });

  it('a wrong retry: "waiting" while it is pending, then the red retry line over "Correct answer: B"', async () => {
    const w = boot();
    const seen = watchSuccessLine(w);
    await answer(w, 'A', 'alpha because');
    expect(await answer(w, 'C', 'charlie because I like it')).toBe(true);
    expect(seen.texts).toContain(PENDING_TEXT);   // the pending branch, unchanged
    expect(seen.now()).toEqual({ text: RETRY_WRONG_TEXT, color: RED });
    expect(itemText(w)).toContain('Correct answer: B');
    expect(seen.texts).not.toContain(GENERIC_TEXT);
  });

  it('a wrong retry the server has not answered yet: still "waiting", no key shown, no retry verdict', async () => {
    const w = boot({ recordImpl: rec => (rec.attempt === 2 ? new Promise(() => {}) : Promise.resolve({ ok: true, ledgerId: 'L' })) });
    const seen = watchSuccessLine(w);
    await answer(w, 'A', 'alpha because');
    await answer(w, 'C', 'charlie because I like it');
    expect(seen.now()).toEqual({ text: PENDING_TEXT, color: BLUE });
    expect(itemText(w)).not.toContain('Correct answer');
    expect(seen.texts).not.toContain(RETRY_WRONG_TEXT);
  });

  it('a wrong retry queued offline, the item re-rendered, then the queued retry accepted: the red retry line', async () => {
    const w = boot({ recordImpl: rec => Promise.resolve(rec.attempt === 2 ? { ok: true, queued: true } : { ok: true, ledgerId: 'L' }) });
    await answer(w, 'A', 'alpha because');
    await answer(w, 'C', 'charlie because I like it');
    expect(span(w).textContent).toBe(PENDING_TEXT);
    render(w);   // away and back: the line under Submit starts empty again
    expect(span(w).textContent).toBe('');
    w.dispatchEvent(new w.CustomEvent('gradebook:quiz-retry-outcome', { detail: { itemId: QID, studentId: 'stu-me', outcome: 'accepted' } }));
    await tick(250);
    expect({ text: span(w).textContent, color: span(w).style.color, shown: span(w).classList.contains('show') })
      .toEqual({ text: RETRY_WRONG_TEXT, color: RED, shown: true });
    expect(itemText(w)).toContain('Correct answer: B');
  });

  it('a wrong retry accepted 2.5 s after submit: the red line stays up its own 3 s (the submit timer does not hide it)', async () => {
    const reply = deferred();
    const w = boot({ recordImpl: rec => (rec.attempt === 2 ? reply.promise : Promise.resolve({ ok: true, ledgerId: 'L' })) });
    await answer(w, 'A', 'alpha because');
    await answer(w, 'C', 'charlie because I like it', 2500);
    reply.resolve({ ok: true, ledgerId: 'L2' });
    await tick(900);   // past the submit's own 3 s mark
    expect(span(w).textContent).toBe(RETRY_WRONG_TEXT);
    expect(span(w).classList.contains('show')).toBe(true);
  }, 15000);

  it('a retry the server refuses (409): no retry verdict and no key', async () => {
    const w = boot({
      recordImpl: rec => Promise.resolve(rec.attempt === 2
        ? { ok: false, reason: 'retry-not-allowed', detail: 'already-retried' }
        : { ok: true, ledgerId: 'L' }),
    });
    const seen = watchSuccessLine(w);
    await answer(w, 'A', 'alpha because');
    await answer(w, 'C', 'charlie because I like it');
    expect(seen.texts).not.toContain(RETRY_WRONG_TEXT);
    expect(span(w).textContent).not.toBe(RETRY_WRONG_TEXT);
    expect(itemText(w)).not.toContain('Correct answer');
  });

  it('a correct retry: the green line', async () => {
    const w = boot();
    const seen = watchSuccessLine(w);
    await answer(w, 'A', 'alpha because');
    await answer(w, 'B', 'bravo because the median resists');
    expect(seen.now()).toEqual({ text: CORRECT_TEXT, color: GREEN });
    expect(seen.texts).not.toContain(GENERIC_TEXT);
    expect(seen.texts).not.toContain(RETRY_WRONG_TEXT);
  });

  it('a PC makeup item (no key on the page): never "Not correct", and no verdict when its retry is accepted', async () => {
    const w = boot({ keyless: true });
    const seen = watchSuccessLine(w);
    await answer(w, 'A', 'alpha because');
    expect(seen.now()).toEqual({ text: GENERIC_TEXT, color: BLUE });
    await answer(w, 'C', 'charlie because I like it');
    expect(seen.texts).not.toContain(FIRST_WRONG_TEXT);
    expect(seen.texts).not.toContain(RETRY_WRONG_TEXT);
    expect(itemText(w)).not.toContain('Correct answer');
  });
});

describe('the line under Submit when the retry is sent or settled by another path', () => {
  // The fresh-device reconcile: the roster already held first answer A from another device, so the server keeps A
  // and the letter just chosen goes out as the one retry.
  const keptA = rec => Promise.resolve(rec.attempt === 1
    ? { ok: true, ledgerId: 'L', firstAnswerKept: true, keptResponse: 'A' }
    : { ok: true, ledgerId: 'L2' });
  const SENT_C = 'The gradebook already had your first answer on this question (A). Your C was sent as your one retry.';
  const SENT_B = 'The gradebook already had your first answer on this question (A). Your B was sent as your one retry.';

  it('the reconcile sends a wrong retry: its own line, then the red verdict over "Correct answer: B"', async () => {
    const w = boot({ recordImpl: keptA });
    const seen = watchSuccessLine(w);
    await answer(w, 'C', 'charlie because it fits best', 600);
    expect(seen.texts).toContain(SENT_C);
    expect(seen.now()).toEqual({ text: `${SENT_C} ${RETRY_WRONG_TEXT}`, color: RED });
    expect(itemText(w)).toContain('Correct answer: B');
  });

  it('the reconcile sends a right retry: its own line, in green, saying so', async () => {
    const w = boot({ recordImpl: keptA });
    const seen = watchSuccessLine(w);
    await answer(w, 'B', 'bravo because it fits best', 600);
    expect(seen.now()).toEqual({ text: `${SENT_B} ✅ It is correct.`, color: GREEN });
    expect(seen.texts).not.toContain(RETRY_WRONG_TEXT);
  });

  it('a pending wrong retry the sign-in ledger restore finds accepted (its reply was lost): the red verdict', async () => {
    const w = boot({ recordImpl: rec => Promise.resolve(rec.attempt === 2 ? { ok: false, reason: 'network', queued: true } : { ok: true, ledgerId: 'L' }) });
    await answer(w, 'A', 'alpha because');
    await answer(w, 'C', 'charlie because I like it');
    expect(span(w).textContent).toBe(PENDING_TEXT);
    const now = Date.now();
    w.rosterClient = { token: () => 'tok', studentId: () => 'stu-me' };
    w.ROSTER_SERVICE_URL = 'https://roster.test';
    w.fetch = () => Promise.resolve({ status: 200, json: () => Promise.resolve({ rows: [
      { source: 'curriculum_quiz', item_id: QID, attempt: 1, response: 'A', recorded_at: new Date(now - 9000).toISOString() },
      { source: 'curriculum_quiz', item_id: QID, attempt: 2, response: 'C', reasoning: 'charlie because I like it', recorded_at: new Date(now - 100).toISOString() },
    ] }) });
    await w.eval('restoreOwnAnswersFromLedger()');
    await tick(250);
    expect(w.eval(`_quizRetryStatus('${QID}')`)).toBe('accepted');
    expect({ text: span(w).textContent, color: span(w).style.color }).toEqual({ text: RETRY_WRONG_TEXT, color: RED });
    expect(itemText(w)).toContain('Correct answer: B');
  });
});

describe('the line under Submit after a free-response submit', () => {
  it('the generic line, never a retry verdict', async () => {
    const w = boot();
    const id = 'U1-L1-Q90';
    w.document.getElementById('host').insertAdjacentHTML('beforeend', `
      <div data-question-id="${id}"><div class="question-header"></div>
        <textarea id="frq-${id}"></textarea><span id="error-${id}"></span><span id="success-${id}"></span></div>`);
    w.eval(`currentQuestions.push({ id: '${id}', type: 'free-response', prompt: 'Explain.' });`);
    w.document.getElementById(`frq-${id}`).value = 'the median is resistant to outliers';
    w.eval(`submitAnswer('${id}', 'free-response')`);
    await tick(250);
    const line = w.document.getElementById(`success-${id}`);
    expect({ text: line.textContent, color: line.style.color }).toEqual({ text: GENERIC_TEXT, color: BLUE });
  });
});
