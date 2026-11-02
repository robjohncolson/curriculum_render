/**
 * Reload of an already-answered MCQ restores the AI area (hint hidden, feedback header,
 * Verify My Understanding button) — gradeMCQAnswer used to run only at submit time.
 *
 * Same harness as quiz-settled-dom.test.js: the real page scripts in jsdom, the real
 * renderQuestion. The fix lives in _refreshAfterReveal and is guarded so a peer repaint never
 * overwrites feedback already drawn this page session.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';
const FRQ = 'U1-L1-FRQ01';
const SETTLED_WRONG = JSON.stringify({
  firstAnswers: { [QID]: 'C' },
  retries: { [QID]: { state: 'accepted', value: 'A', submittedAt: 9 } }
});
const WRONG_FIRST = JSON.stringify({ firstAnswers: { [QID]: 'C' }, retries: {} });

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

// Every boot records gradebook writes and network calls: restoring the AI area must do neither.
// `aiResponse`: when set, POST /api/ai/grade answers with it (a real, successful AI round-trip).
function boot({ seedLocalStorage = {}, aiResponse = null } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
    url: 'https://quiz.test/',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  openWindows.push(w);
  for (const [k, v] of Object.entries(seedLocalStorage)) w.localStorage.setItem(k, v);
  w.__fetches = [];
  w.fetch = (url) => {
    w.__fetches.push(String(url));
    if (aiResponse && String(url).includes('/api/ai/grade')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ...aiResponse }) });
    }
    return new Promise(() => {});   // everything else never answers
  };
  w.alert = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  for (const code of pageScripts()) {
    const el = w.document.createElement('script');
    el.textContent = code;
    w.document.body.appendChild(el);
  }
  w.onload = null;
  w.Chart = function () { return { destroy() {}, update() {} }; };
  w.__records = [];
  w.gradebookClient = { record: (rec) => { w.__records.push(rec); return Promise.resolve({ ok: true, ledgerId: 'L' }); } };
  w.rosterClient = { token: () => null, studentId: () => 'stu-me' };
  w.eval(`
    currentUsername = 'Me'; window.currentUsername = 'Me';
    currentQuestions = [{
      id: '${QID}', type: 'multiple-choice', prompt: 'Which one?', answerKey: 'B',
      explanation: 'Because B is right.',
      choices: [{ key: 'A', value: 'alpha' }, { key: 'B', value: 'bravo' }, { key: 'C', value: 'charlie' }]
    }, { id: '${FRQ}', type: 'free-response', prompt: 'Draw it.' }];
    classData = { users: { Me: { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} } } };
  `);
  return w;
}

function seedMine(w, { answer, attempts, id = QID }) {
  w.eval(`
    classData.users.Me.answers['${id}'] = { value: ${JSON.stringify(answer)}, timestamp: 5 };
    classData.users.Me.attempts['${id}'] = ${attempts};
  `);
}

async function reload(w, index = 0) {
  w.eval(`document.getElementById('host').innerHTML = renderQuestion(currentQuestions[${index}], ${index}).html;`);
  await tick(300);   // the page's own post-render timers
}

async function submit(w, letter, reasoning) {
  const radio = w.document.querySelector(`input[name="choice-${QID}"][value="${letter}"]`);
  radio.disabled = false;
  radio.checked = true;
  const textarea = w.document.getElementById(`reason-${QID}`);
  if (reasoning !== undefined) {
    textarea.value = reasoning;
    textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  w.eval(`submitAnswer('${QID}', 'multiple-choice')`);
  await tick(250);   // the page's own 50 ms / 100 ms render timers
}

// Point the page's NetworkManager at a fake turbo (Groq) endpoint so the AI flows run.
function turbo(w) {
  w.eval(`
    NetworkManager.currentTier = 'turbo';
    NetworkManager.detectTier = async () => 'turbo';
    NetworkManager.getAIEndpoint = () => ({ type: 'groq', url: 'https://srv.test/api/ai/grade' });
  `);
}

function expectNoWrites(w) {
  expect(w.__records).toHaveLength(0);
  expect(w.__fetches.filter(u => u.includes('/api/ai'))).toHaveLength(0);
}

function aiArea(w, id = QID) {
  const d = w.document;
  const hint = d.getElementById(`ai-section-hint-${id}`);
  const escalation = d.getElementById(`escalation-${id}`);
  const feedback = d.getElementById(`grading-feedback-${id}`);
  const verify = d.getElementById(`btn-ai-review-${id}`);
  return {
    hintShown: !!hint && hint.style.display !== 'none',
    escalationShown: !!escalation && escalation.style.display === 'block',
    feedbackText: feedback ? feedback.textContent : '',
    verifyShown: !!verify && verify.style.display === 'inline-block',
    verifyText: verify ? verify.textContent.trim() : '',
    result: w.eval(`window.gradingResults['${id}'] || null`),
  };
}

describe('reload restores the MCQ AI area', () => {
  it('correct answered MCQ: hint hidden, correct header, Verify button', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    await reload(w);
    const v = aiArea(w);
    expect(v.hintShown).toBe(false);
    expect(v.escalationShown).toBe(true);
    expect(v.feedbackText).toContain('MC Answer Correct');
    expect(v.verifyShown).toBe(true);
    expect(v.verifyText).toBe('🤖 Verify My Understanding');
    expect(v.result.score).toBe('E');
    expectNoWrites(w);
  });

  it('wrong settled MCQ: Incorrect header points to Talk it through; no Verify button', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: SETTLED_WRONG } });
    seedMine(w, { answer: 'A', attempts: 2 });
    await reload(w);
    const v = aiArea(w);
    expect(v.hintShown).toBe(false);
    expect(v.escalationShown).toBe(true);
    expect(v.feedbackText).toContain('Incorrect');
    expect(v.feedbackText).toContain('Talk it through with the AI below');
    expect(v.verifyShown).toBe(false);
    expect(v.result.score).toBe('I');
    expectNoWrites(w);
  });

  it('wrong first answer with the retry still unused: "Use your one retry first"', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: WRONG_FIRST } });
    seedMine(w, { answer: 'C', attempts: 1 });
    await reload(w);
    const v = aiArea(w);
    expect(v.hintShown).toBe(false);
    expect(v.feedbackText).toContain('Incorrect');
    expect(v.feedbackText).toContain('Use your one retry first');
    expect(v.verifyShown).toBe(false);
    expectNoWrites(w);
  });

  it('a peer repaint never overwrites feedback already drawn this session', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    await reload(w);
    // Simulate a Verify My Understanding result landing.
    w.eval(`
      window.gradingResults['${QID}'] = { score: 'E', feedback: 'AI verified.', _aiGraded: true };
      document.getElementById('grading-feedback-${QID}').innerHTML = '<div id="verify-result">AI verified your reasoning</div>';
    `);
    w.eval(`_refreshAfterReveal('${QID}')`);
    await tick(50);
    const v = aiArea(w);
    expect(v.feedbackText).toBe('AI verified your reasoning');
    expect(v.feedbackText).not.toContain('MC Answer Correct');
    expect(v.result.feedback).toBe('AI verified.');
  });

  it('retry after a wrong answer: the submit path still redraws with the new answer', async () => {
    const w = boot();
    await reload(w);
    await submit(w, 'C');
    expect(aiArea(w).feedbackText).toContain('Use your one retry first');
    await submit(w, 'B', 'I misread the axis');
    const v = aiArea(w);
    expect(v.feedbackText).toContain('MC Answer Correct');
    expect(v.verifyShown).toBe(true);
    expect(v.result.answer).toBe('B');
  });

  it('unanswered MCQ: hint stays visible, nothing drawn', async () => {
    const w = boot();
    await reload(w);
    w.eval(`_refreshAfterReveal('${QID}')`);
    const v = aiArea(w);
    expect(v.hintShown).toBe(true);
    expect(v.escalationShown).toBe(false);
    expect(v.feedbackText.trim()).toBe('');
    expect(v.result).toBeNull();
  });

  it('FRQ is untouched: no MCQ feedback drawn, no grading result', async () => {
    const w = boot();
    seedMine(w, { answer: 'My histogram is skewed right.', attempts: 1, id: FRQ });
    await reload(w, 1);
    w.eval(`_refreshAfterReveal('${FRQ}')`);
    const v = aiArea(w, FRQ);
    expect(v.feedbackText).not.toContain('MC Answer');
    expect(v.feedbackText).not.toContain('Incorrect answer');
    expect(v.result).toBeNull();
  });
});

describe('restore follows the DOM host and the state it shows', () => {
  it('reopening the topic (new DOM, same page session) redraws the feedback', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    await reload(w);
    await reload(w);   // Back to Topics -> reopen: renderQuestion builds a fresh, empty AI area
    const v = aiArea(w);
    expect(v.hintShown).toBe(false);
    expect(v.escalationShown).toBe(true);
    expect(v.feedbackText).toContain('MC Answer Correct');
    expect(v.verifyShown).toBe(true);
    expectNoWrites(w);
  });

  it('reopening after a Verify result re-shows that AI result, never an auto-grade', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    await reload(w);
    w.eval(`window.gradingResults['${QID}'] = {
      score: 'P', feedback: 'Your reasoning skips the axis.', answer: 'B',
      questionType: 'multiple-choice', _aiGraded: true, _provider: 'groq'
    };`);
    await reload(w);
    const v = aiArea(w);
    expect(v.hintShown).toBe(false);
    expect(v.escalationShown).toBe(true);
    expect(v.feedbackText).toContain('Your reasoning skips the axis.');
    expect(v.feedbackText).not.toContain('MC Answer Correct');
    expect(v.result.feedback).toBe('Your reasoning skips the axis.');
    // A plain repaint afterwards is still a no-op.
    w.eval(`_refreshAfterReveal('${QID}')`);
    expect(aiArea(w).feedbackText).toContain('Your reasoning skips the axis.');
    expectNoWrites(w);
  });

  it('an AI result for a DIFFERENT answer is not re-shown', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: WRONG_FIRST } });
    seedMine(w, { answer: 'C', attempts: 1 });
    w.eval(`window.gradingResults['${QID}'] = { score: 'I', feedback: 'Old AI words.', answer: 'A', _aiGraded: true };`);
    await reload(w);
    const v = aiArea(w);
    expect(v.feedbackText).toContain('Use your one retry first');
    expect(v.feedbackText).not.toContain('Old AI words.');
  });

  it('late ledger reconciliation (local wrong C -> server accepted retry B) redraws as correct', async () => {
    const w = boot({ seedLocalStorage: { quizRetryState_Me: WRONG_FIRST } });
    seedMine(w, { answer: 'C', attempts: 1 });
    await reload(w);
    expect(aiArea(w).feedbackText).toContain('Use your one retry first');
    // What restoreOwnAnswersFromLedger does: take the server's answer + retry record, then repaint.
    w.eval(`
      _quizRetryState().retries['${QID}'] = { state: 'accepted', value: 'B', submittedAt: 9 };
      classData.users.Me.answers['${QID}'] = { value: 'B', timestamp: 9 };
      classData.users.Me.attempts['${QID}'] = 2;
      _refreshAfterReveal('${QID}');
    `);
    const v = aiArea(w);
    expect(v.feedbackText).toContain('MC Answer Correct');
    expect(v.feedbackText).not.toContain('Incorrect');
    expect(v.verifyShown).toBe(true);
    expect(v.result.answer).toBe('B');
    expectNoWrites(w);
  });

  it('the reverse: local correct B superseded by a server wrong retry redraws as incorrect', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    await reload(w);
    w.eval(`
      _quizRetryState().firstAnswers['${QID}'] = 'C';
      _quizRetryState().retries['${QID}'] = { state: 'accepted', value: 'A', submittedAt: 9 };
      classData.users.Me.answers['${QID}'] = { value: 'A', timestamp: 9 };
      classData.users.Me.attempts['${QID}'] = 2;
      _refreshAfterReveal('${QID}');
    `);
    const v = aiArea(w);
    expect(v.feedbackText).toContain('Incorrect');
    expect(v.feedbackText).toContain('Talk it through with the AI below');
    expect(v.verifyShown).toBe(false);
    expectNoWrites(w);
  });

  it('unsettled -> settled (pending retry accepted) redraws the wrong-answer text', async () => {
    const pending = JSON.stringify({ firstAnswers: { [QID]: 'C' }, retries: { [QID]: { state: 'pending', value: 'A', submittedAt: 9, before: { answer: { value: 'C', timestamp: 5 }, attempts: 1 } } } });
    const w = boot({ seedLocalStorage: { quizRetryState_Me: pending } });
    seedMine(w, { answer: 'A', attempts: 2 });
    await reload(w);
    expect(aiArea(w).feedbackText).not.toContain('Talk it through with the AI below');
    w.eval(`
      _quizRetryState().retries['${QID}'] = { state: 'accepted', value: 'A', submittedAt: 9 };
      _refreshAfterReveal('${QID}');
    `);
    expect(aiArea(w).feedbackText).toContain('Talk it through with the AI below');
    expectNoWrites(w);
  });

  it('object-form saved reasoning ({ value }) still restores the correct header', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    w.eval(`classData.users.Me.reasons['${QID}'] = { value: 'B is the only one that fits', timestamp: 5 };`);
    await reload(w);
    const v = aiArea(w);
    expect(v.hintShown).toBe(false);
    expect(v.feedbackText).toContain('MC Answer Correct');
    expect(v.feedbackText).toContain('Click "Verify My Understanding"');   // the has-reasoning wording
    expect(v.verifyShown).toBe(true);
    expectNoWrites(w);
  });

  it('Verify with object-form reasoning goes straight to the AI review (no crash, no form)', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    w.eval(`classData.users.Me.reasons['${QID}'] = { value: 'B is the only one that fits' };`);
    await reload(w);
    let threw = null;
    try { w.eval(`showReasoningForm('${QID}', 'multiple-choice')`); } catch (e) { threw = e; }
    await tick(50);
    expect(threw).toBeNull();
    const form = w.document.getElementById(`reasoning-form-${QID}`);
    expect(form.style.display).not.toBe('block');   // reasoning exists -> no form, straight to review
  });
});

describe('saved AI results survive a reopened topic', () => {
  it('a successful Verify (E) with object-form reasoning renders, and survives a reopen', async () => {
    const w = boot({ aiResponse: { score: 'E', feedback: 'Solid reasoning about the axis.', matched: [], missing: [] } });
    turbo(w);
    seedMine(w, { answer: 'B', attempts: 1 });
    w.eval(`classData.users.Me.reasons['${QID}'] = { value: 'B is the only one that fits' };`);
    await reload(w);
    w.eval(`showReasoningForm('${QID}', 'multiple-choice')`);
    await tick(100);
    expect(aiArea(w).feedbackText).toContain('Solid reasoning about the axis.');
    expect(aiArea(w).feedbackText).not.toContain('AI review failed');

    const fetchesBefore = w.__fetches.length;
    await reload(w);   // Back to Topics -> reopen
    const v = aiArea(w);
    expect(v.hintShown).toBe(false);
    expect(v.feedbackText).toContain('Solid reasoning about the axis.');
    expect(v.feedbackText).not.toContain('MC Answer Correct');
    expect(w.__fetches.length).toBe(fetchesBefore);   // restoring never calls the AI
    expect(w.__records).toHaveLength(0);
  });

  it('a Groq re-evaluation (server response has no `answer`) survives a reopen', async () => {
    const w = boot({ aiResponse: { score: 'P', feedback: 'Groq says: mostly there.', matched: [], missing: [] } });
    turbo(w);
    seedMine(w, { answer: 'B', attempts: 1 });
    await reload(w);
    await w.eval(`requestGroqReeval('${QID}')`);
    await tick(50);
    expect(aiArea(w).feedbackText).toContain('Groq says: mostly there.');
    expect(aiArea(w).result.answer).toBe('B');

    await reload(w);
    const v = aiArea(w);
    expect(v.feedbackText).toContain('Groq says: mostly there.');
    expect(v.feedbackText).not.toContain('MC Answer Correct');
  });

  it('a saved appeal result is re-shown with its appeal text and outcome notice', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    await reload(w);
    // What submitAppeal stores after a successful appeal (merged over the earlier result).
    w.eval(`window.gradingResults['${QID}'] = {
      score: 'P', feedback: 'The original AI feedback.', appealResponse: 'The appeal reviewer says: partly right.',
      answer: 'B', questionType: 'multiple-choice', _aiGraded: true, _appealProcessed: true,
      _autoGraded: false, _previousScore: 'I'
    };`);
    await reload(w);
    const v = aiArea(w);
    expect(v.hintShown).toBe(false);
    expect(v.escalationShown).toBe(true);
    expect(v.feedbackText).toContain('The appeal reviewer says: partly right.');
    expect(v.feedbackText).toContain('Partial credit (2/3)');
    expect(v.feedbackText).toContain('Appeal');
    expect(v.feedbackText).not.toContain('MC Answer Correct');
    expectNoWrites(w);
  });

  it('a renderer that throws is not retried on every repaint (stamped first)', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    await reload(w);
    w.eval(`
      window.gradingResults['${QID}'] = { score: 'E', feedback: 'x', answer: 'B', _aiGraded: true };
      window.__renders = 0;
      displayGradingFeedback = function () { window.__renders += 1; throw new Error('boom'); };
    `);
    await reload(w);
    w.eval(`_refreshAfterReveal('${QID}'); _refreshAfterReveal('${QID}');`);
    expect(w.eval('window.__renders')).toBe(1);
    expect(aiArea(w).hintShown).toBe(false);
  });
});
