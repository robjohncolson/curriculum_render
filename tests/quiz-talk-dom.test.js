/**
 * QUIZ_AI_HALF_CREDIT_SPEC — RUNTIME DOM tests of "Talk it through".
 *
 * Same harness as quiz-settled-dom.test.js: the real page scripts in jsdom, the real
 * renderQuestion / submitAnswer. /api/ai/appeal is a STATEFUL server stub that mirrors the real
 * lifecycle (stored exchange 1, one immutable final, 409s, replay with a fresh grant), and the
 * roster ledger client is a stub whose acknowledgement each test controls.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const QID = 'U1-L1-Q01';
const FRQ = 'U1-L1-FRQ01';
const FINAL_MARKER = '{"mode":"understanding","phase":"final"}';
const E1_MARKER = '{"mode":"understanding","phase":1}';
const SETTLED_WRONG = JSON.stringify({
  firstAnswers: { [QID]: 'C' },
  retries: { [QID]: { state: 'accepted', value: 'A', submittedAt: 9 } }
});
const HOSTILE = '<img src=x onerror="window.__xss = 1"> B is right because';

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
    if (m[2].length > 500000) break;
  }
  return pageSources;
}

let openWindows = [];
afterEach(() => {
  for (const w of openWindows) { try { w.close(); } catch (_) {} }
  openWindows = [];
});

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function b64url(text) {
  return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeGrant(credit, expOffset = 300000, n = 0) {
  return `${b64url(JSON.stringify({ t: 'review-grant', credit, exp: Date.now() + expOffset, n }))}.sig`;
}

// The server stub: `ai` = scripted outcomes in order ({ followUp } or { verdict, feedback,
// exceptionGranted }). `hold` = true parks every request until test.release() is called.
function createServer({ ai = [], eligible = true } = {}) {
  const server = { calls: [], requests: [], e1: null, final: null, grants: 0, held: [], hold: false, eligible };
  const outcomes = ai.slice();
  server.release = () => { const held = server.held.splice(0); held.forEach(fn => fn()); };
  server.handle = (body) => {
    server.calls.push(body);
    if (body.mode !== 'understanding') {
      return { status: 200, body: { score: 'P', feedback: 'partial', appealResponse: 'Appeal reviewed: <b>partial</b>.', appealGranted: false, exceptionGranted: false, reviewCredit: 2 / 3 } };
    }
    const finalBody = (replayed) => {
      const out = { mode: 'understanding', final: true, verdict: server.final.verdict, exceptionGranted: !!server.final.exceptionGranted, feedback: server.final.feedback || '', turns: server.final.turns, reviewCredit: server.final.credit, replayed };
      if (server.final.credit > 0) { server.grants += 1; out.reviewGrant = makeGrant(server.final.credit, 300000, server.grants); }
      return out;
    };
    if (server.final) return { status: 200, body: finalBody(true) };
    if (body.exchange === 1 && server.e1) return { status: 409, body: { error: 'conversation already started', studentTurn: server.e1.studentTurn, followUp: server.e1.followUp } };
    if (body.exchange === 2 && !server.e1) return { status: 409, body: { error: 'no conversation to continue' } };
    if (!server.eligible) return { status: 403, body: { error: 'not eligible', reason: 'no-settled-retry' } };
    const next = outcomes.shift() || { verdict: 'not-yet', feedback: '' };
    const priorTurns = body.exchange === 2 ? [{ role: 'student', text: server.e1.studentTurn }, { role: 'ai', text: server.e1.followUp }] : [];
    const turns = priorTurns.concat([{ role: 'student', text: body.appealText }]);
    if (next.followUp !== undefined) {
      if (body.exchange === 1) server.e1 = { studentTurn: body.appealText, followUp: next.followUp };
      return { status: 200, body: { mode: 'understanding', exchange: body.exchange, final: false, verdict: null, followUp: next.followUp, feedback: '', reviewCredit: 0, turns: turns.concat([{ role: 'ai', text: next.followUp }]) } };
    }
    if (body.exchange === 1) server.e1 = { studentTurn: body.appealText, followUp: '' };
    const credit = next.exceptionGranted ? 1 : (next.verdict === 'understands' ? 0.5 : 0);
    server.final = { verdict: next.verdict, exceptionGranted: !!next.exceptionGranted, feedback: next.feedback, turns, credit };
    return { status: 200, body: finalBody(false) };
  };
  return server;
}

function boot({ server = createServer(), records, ack = () => ({ ok: true, ledgerId: 'L' }), seedLocalStorage = {}, token = 'tok' } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
    url: 'https://quiz.test/',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  openWindows.push(w);
  for (const [k, v] of Object.entries(seedLocalStorage)) w.localStorage.setItem(k, v);
  w.__server = server;
  w.fetch = (url, opts) => {
    if (!String(url).includes('/api/ai/appeal')) return new Promise(() => {});
    const body = JSON.parse(opts.body);
    server.requests.push(body);
    const respond = () => {
      const { status, body: out } = server.handle(body);
      return { ok: status < 400, status, json: () => Promise.resolve(out) };
    };
    if (server.hold) return new Promise(r => server.held.push(() => r(respond())));
    return Promise.resolve(respond());
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
  w.gradebookClient = {
    record: (rec) => {
      if (records) records.push(rec);
      if (rec.source === 'quiz_review') return Promise.resolve(ack(rec));
      return Promise.resolve({ ok: true, ledgerId: 'L' });
    },
  };
  w.rosterClient = { token: () => token, studentId: () => 'stu-me' };
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

function render(w, index = 0) {
  w.eval(`document.getElementById('host').innerHTML = renderQuestion(currentQuestions[${index}], ${index}).html;`);
}

function seedMine(w, { answer, attempts, id = QID }) {
  w.eval(`
    classData.users.Me.answers['${id}'] = { value: ${JSON.stringify(answer)}, timestamp: 5 };
    classData.users.Me.attempts['${id}'] = ${attempts};
  `);
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
  await tick(250);
}

async function bootSettledWrong(opts = {}) {
  const w = boot({ ...opts, seedLocalStorage: { quizRetryState_Me: SETTLED_WRONG, ...(opts.seedLocalStorage || {}) } });
  seedMine(w, { answer: 'A', attempts: 2 });
  if (opts.beforeRender) opts.beforeRender(w);
  render(w);
  await tick(300);
  return w;
}

function talk(w, id = QID) {
  const d = w.document;
  const panel = d.getElementById(`talk-${id}`);
  const send = d.getElementById(`talk-send-${id}`);
  return {
    shown: !!panel && panel.style.display !== 'none' && panel.innerHTML.trim() !== '',
    text: panel ? panel.textContent : '',
    textarea: d.getElementById(`talk-text-${id}`),
    send,
    sendDisabled: send ? send.disabled : null,
    counter: (d.getElementById(`talk-counter-${id}`) || {}).textContent || '',
    status: (d.getElementById(`talk-status-${id}`) || {}).textContent || '',
    injected: panel ? panel.querySelector('img, b, script, svg') : null,
    oldReviewShown: (() => {
      const btn = d.getElementById(`btn-ai-review-${id}`);
      return !!btn && btn.style.display !== 'none';
    })(),
  };
}

function type(w, text, id = QID) {
  const textarea = w.document.getElementById(`talk-text-${id}`);
  textarea.value = text;
  textarea.dispatchEvent(new w.Event('input', { bubbles: true }));
}

async function send(w, text) {
  type(w, text);
  w.eval(`sendTalkItThrough('${QID}')`);
  await tick(60);
}

// A stale / hand-made textarea full of words: the send function itself must refuse.
function forceTextarea(w, text = 'one more try please AI') {
  let area = w.document.getElementById(`talk-text-${QID}`);
  if (!area) {
    area = w.document.createElement('textarea');
    area.id = `talk-text-${QID}`;
    w.document.body.appendChild(area);
  }
  area.readOnly = false;
  area.value = text;
}

const understandCalls = (server) => server.requests.filter(c => c.mode === 'understanding');
const reviewRecords = (records) => records.filter(r => r.source === 'quiz_review');
const pendingOf = (w) => JSON.parse(w.localStorage.getItem('quizTalkPending_Me') || '{}');

describe('Talk it through: the gate', () => {
  it('absent before any answer', async () => {
    const w = boot();
    render(w);
    await tick(300);
    expect(talk(w).shown).toBe(false);
  });

  it('absent after a wrong FIRST answer (retry open); the old appeal button is not offered', async () => {
    const w = boot();
    render(w);
    await submit(w, 'C');
    expect(talk(w).shown).toBe(false);
    expect(talk(w).oldReviewShown).toBe(false);
    expect(w.document.getElementById(`grading-feedback-${QID}`).textContent).toContain('Use your one retry first');
  });

  it('absent after a correct first answer and after a CORRECT retry', async () => {
    const w1 = boot();
    render(w1);
    await submit(w1, 'B');
    expect(talk(w1).shown).toBe(false);

    let call = 0;
    const w2 = boot({ ack: () => ({ ok: true }) });
    w2.gradebookClient.record = () => Promise.resolve(++call === 1 ? { ok: true } : { ok: true, ledgerId: 'L2' });
    render(w2);
    await submit(w2, 'C');
    await submit(w2, 'B', 'I misread the axis');
    await tick(250);
    expect(w2.eval(`quizSettledFor('${QID}')`)).toBe(true);
    expect(talk(w2).shown).toBe(false);
  });

  it('absent while a wrong retry is pending, present the moment the server accepts it', async () => {
    let accept;
    let call = 0;
    const w = boot();
    w.gradebookClient.record = () => (++call === 1 ? Promise.resolve({ ok: true }) : new Promise(r => { accept = r; }));
    render(w);
    await submit(w, 'C');
    await submit(w, 'A', 'I misread the axis');
    expect(talk(w).shown).toBe(false);
    accept({ ok: true, ledgerId: 'L2' });
    await tick(250);
    expect(talk(w).shown).toBe(true);
    expect(talk(w).text).toContain("You've used your retry. Talk it through with the AI");
    expect(talk(w).oldReviewShown).toBe(false);
  });

  it('direct sends for ineligible items never reach the server', async () => {
    const server = createServer({ ai: [{ verdict: 'understands' }] });
    const w = boot({ server });
    render(w);
    await tick(300);
    forceTextarea(w, 'B is right because of the spread');
    w.eval(`sendTalkItThrough('${QID}')`);       // unanswered
    await submit(w, 'C');
    forceTextarea(w, 'B is right because of the spread');
    w.eval(`sendTalkItThrough('${QID}')`);       // wrong first answer, retry still open
    await tick(60);
    const w2 = boot({ server });
    seedMine(w2, { answer: 'B', attempts: 1 });
    render(w2);
    await tick(300);
    forceTextarea(w2, 'B is right because of the spread');
    w2.eval(`sendTalkItThrough('${QID}')`);      // correct
    w2.eval(`sendTalkItThrough('${FRQ}')`);      // free response
    await tick(60);
    expect(understandCalls(server)).toHaveLength(0);
  });

  it('free-response keeps its own appeal flow, and it still runs (appeal mode, no panel)', async () => {
    const server = createServer();
    const w = boot({ server });
    seedMine(w, { answer: 'my frq answer here', attempts: 1, id: FRQ });
    render(w, 1);
    await tick(300);
    expect(talk(w, FRQ).shown).toBe(false);
    w.document.getElementById(`appeal-text-${FRQ}`).value = 'My answer names the key idea';
    await w.eval(`submitAppeal('${FRQ}', 'free-response')`);
    await tick(60);
    const appeal = server.calls.find(c => c.mode === undefined);
    expect(appeal).toBeTruthy();
    expect(appeal.appealText).toBe('My answer names the key idea');
    expect(appeal.scenario.questionId).toBe(FRQ);
    const feedback = w.document.getElementById(`grading-feedback-${FRQ}`);
    expect(feedback.textContent).toContain('Appeal reviewed');
    expect(feedback.querySelector('b')).toBeNull();          // escaped
    expect(talk(w, FRQ).shown).toBe(false);
  });

  it('present on reload of a settled-wrong item, with the opening prompt and exchange 1 of 2', async () => {
    const w = await bootSettledWrong();
    const t = talk(w);
    expect(t.shown).toBe(true);
    expect(t.text).toContain('If you show you understand, you get half credit.');
    expect(t.counter).toBe('Exchange 1 of 2');
  });
});

describe('Talk it through: sending', () => {
  it('Send stays disabled until 3 real words; a short message is never sent', async () => {
    const server = createServer({ ai: [{ followUp: 'Why?' }] });
    const w = await bootSettledWrong({ server });
    expect(talk(w).sendDisabled).toBe(true);
    for (const [text, disabled] of [['. . .', true], ['B because', true], ['B because variance', false]]) {
      type(w, text);
      expect(talk(w).sendDisabled).toBe(disabled);
    }
    await send(w, 'too short');
    expect(understandCalls(server)).toHaveLength(0);
  });

  it('only the questionId identifies the item; no client turns are sent', async () => {
    const server = createServer({ ai: [{ followUp: 'Why not C?' }] });
    const w = await bootSettledWrong({ server });
    await send(w, 'B is right because the spread is larger');
    const call = understandCalls(server)[0];
    expect(call).toMatchObject({ mode: 'understanding', exchange: 1, scenario: { questionId: QID } });
    expect(call.turns).toBeUndefined();
    expect(call.scenario.correctAnswer).toBeUndefined();
  });

  it('simultaneous sends while the request is pending: exactly one request', async () => {
    const server = createServer({ ai: [{ followUp: 'Why not C?' }] });
    const w = await bootSettledWrong({ server });
    server.hold = true;
    type(w, 'B is right because the spread is larger');
    w.eval(`sendTalkItThrough('${QID}'); sendTalkItThrough('${QID}'); sendTalkItThrough('${QID}');`);
    await tick(20);
    expect(understandCalls(server)).toHaveLength(1);
    server.release();
    await tick(60);
    expect(talk(w).counter).toBe('Exchange 2 of 2');
    expect(understandCalls(server)).toHaveLength(1);
  });

  it('hostile STUDENT text is shown as text, never markup', async () => {
    const server = createServer({ ai: [{ followUp: '<svg onload="window.__xss=1"> why?' }] });
    const w = await bootSettledWrong({ server });
    await send(w, HOSTILE);
    const t = talk(w);
    expect(t.text).toContain('<img src=x');
    expect(t.text).toContain('<svg onload');
    expect(t.injected).toBeNull();
    expect(w.__xss).toBeUndefined();
  });

  it('a network failure does not use up the exchange', async () => {
    const server = createServer({ ai: [{ followUp: 'Why not C?' }] });
    const w = await bootSettledWrong({ server });
    const realFetch = w.fetch;
    w.fetch = () => Promise.reject(new Error('offline'));
    await send(w, 'B is right because the spread is larger');
    expect(talk(w).counter).toBe('Exchange 1 of 2');
    expect(talk(w).status).toContain('Your message was not used');
    expect(talk(w).textarea.value).toBe('B is right because the spread is larger');
    w.fetch = realFetch;
    w.eval(`sendTalkItThrough('${QID}')`);
    await tick(60);
    expect(talk(w).counter).toBe('Exchange 2 of 2');
  });

  it('a server refusal (not eligible) is shown and does not use up the exchange', async () => {
    const server = createServer({ eligible: false });
    const w = await bootSettledWrong({ server });
    await send(w, 'B is right because the spread is larger');
    expect(talk(w).counter).toBe('Exchange 1 of 2');
    expect(talk(w).status).toContain('not eligible');
  });
});

describe('Talk it through: two exchanges, then locked', () => {
  it('follow-up, then ½ credit: grant recorded, pending cleared on ack, panel locked', async () => {
    const records = [];
    const server = createServer({ ai: [{ followUp: 'Why not C?' }, { verdict: 'understands', feedback: 'Nice work.' }] });
    const w = await bootSettledWrong({ server, records });
    await send(w, 'B is right because the spread is larger');
    expect(talk(w).counter).toBe('Exchange 2 of 2');
    expect(talk(w).text).toContain('Why not C?');
    expect(reviewRecords(records)).toHaveLength(0);

    await send(w, 'A ignores the outlier so it is wrong');
    await tick(60);
    const t = talk(w);
    expect(t.text).toContain('½ credit earned');
    expect(t.text).toContain('Nice work.');
    expect(t.textarea).toBeNull();
    expect(reviewRecords(records)).toEqual([expect.objectContaining({ itemId: `${QID}#rev`, response: 'A', attempt: 1 })]);
    expect(pendingOf(w)).toEqual({});
  });

  it('an acknowledged credit is marked delivered: repeated repaints never record it again or ask the server again', async () => {
    // Regression (2026-09-29): the drain deleted the pending record on ack but never set
    // state.delivered, so every repaint re-created a pending record and drained again —
    // an endless loop of /api/ai/appeal "recover" calls and ledger writes.
    const records = [];
    const server = createServer({ ai: [{ verdict: 'understands', feedback: 'Clear.' }] });
    const w = await bootSettledWrong({ server, records });
    await send(w, 'B is right because the spread is larger and A ignores it');
    await tick(60);
    expect(reviewRecords(records)).toHaveLength(1);
    const callsAfterAck = server.requests.length;
    for (let i = 0; i < 5; i++) { w.eval(`_renderTalkItThrough('${QID}')`); await tick(20); }
    expect(reviewRecords(records)).toHaveLength(1);
    expect(server.requests.length).toBe(callsAfterAck);
    expect(pendingOf(w)).toEqual({});
    expect(JSON.parse(w.localStorage.getItem('quizTalkState_Me'))[QID].delivered).toBe(true);
  });

  it('circuit breaker: a ledger that never acknowledges is tried at most 3 times per page load', async () => {
    const records = [];
    const server = createServer({ ai: [{ verdict: 'understands', feedback: 'Clear.' }] });
    const w = await bootSettledWrong({ server, records, ack: () => ({ ok: false, reason: 'network' }) });
    await send(w, 'B is right because the spread is larger and A ignores it');
    await tick(60);
    for (let i = 0; i < 8; i++) { w.eval(`_renderTalkItThrough('${QID}')`); await tick(20); }
    expect(reviewRecords(records).length).toBeLessThanOrEqual(3);
    expect(Object.keys(pendingOf(w))).toEqual([QID]);   // still pending: retried on the next load
  });

  it('final at exchange 1, then a forced resend through a stale textarea: nothing sent', async () => {
    const server = createServer({ ai: [{ verdict: 'understands', feedback: 'Clear.' }] });
    const w = await bootSettledWrong({ server });
    await send(w, 'B is right because the spread is larger and A ignores it');
    expect(talk(w).text).toContain('½ credit earned');
    forceTextarea(w);
    w.eval(`sendTalkItThrough('${QID}')`);
    await tick(60);
    expect(understandCalls(server)).toHaveLength(1);
  });

  it('exchange 2 answered with final:false still locks: never a third exchange', async () => {
    const server = createServer({ ai: [{ followUp: 'Why not C?' }, { followUp: 'And another?' }] });
    const w = await bootSettledWrong({ server });
    await send(w, 'B is right because the spread is larger');
    await send(w, 'A ignores the outlier so it is wrong');
    expect(talk(w).textarea).toBeNull();
    expect(talk(w).text).toContain('Not yet');
    forceTextarea(w);
    w.eval(`sendTalkItThrough('${QID}')`);
    await tick(60);
    expect(understandCalls(server)).toHaveLength(2);
  });

  it('not-yet: "your grade stands" and nothing recorded', async () => {
    const records = [];
    const server = createServer({ ai: [{ followUp: 'Why?' }, { verdict: 'not-yet', feedback: 'Not quite.' }] });
    const w = await bootSettledWrong({ server, records });
    await send(w, 'B is right because reasons here');
    await send(w, 'A is wrong because also reasons');
    expect(talk(w).text).toContain('Not yet — your grade stands');
    expect(reviewRecords(records)).toHaveLength(0);
  });

  it('a flawed question: full credit, recorded', async () => {
    const records = [];
    const server = createServer({ ai: [{ verdict: 'not-yet', exceptionGranted: true, feedback: 'Ambiguous.' }] });
    const w = await bootSettledWrong({ server, records });
    await send(w, 'Both A and B fit the wording here');
    await tick(60);
    expect(talk(w).text).toContain('Full credit: the question was flawed');
    expect(reviewRecords(records)).toHaveLength(1);
  });

  it('the server says the conversation was already started: the page adopts the stored turn', async () => {
    const server = createServer({ ai: [] });
    server.e1 = { studentTurn: 'words from my other laptop', followUp: 'Why not C?' };
    const w = await bootSettledWrong({ server });
    await send(w, 'B is right because the spread is larger');
    const t = talk(w);
    expect(t.counter).toBe('Exchange 2 of 2');
    expect(t.text).toContain('words from my other laptop');
    expect(t.status).toContain('already started');
  });
});

describe('Talk it through: credit is never lowered, never lost', () => {
  it('an existing higher credit (an appeal showed 2/3): the note is shown AND the ½ is still delivered (the ledger floor keeps the higher one)', async () => {
    // Review history is not proof the 2/3 ever reached the ledger; skipping would strand the ½.
    const records = [];
    const server = createServer({ ai: [{ verdict: 'understands', feedback: 'Good.' }] });
    const w = await bootSettledWrong({
      server, records,
      beforeRender: (win) => win.eval(`window.quizReviewsByQuestion['${QID}'] = [{ question_id: '${QID}', appeal_text: 'my appeal', verdict: 'P', credit: 2/3, created_at: '2026-09-01T00:00:00Z' }];`)
    });
    await send(w, 'B is right because the spread is larger');
    await tick(60);
    expect(reviewRecords(records)).toHaveLength(1);
    expect(talk(w).text).toContain('You already have higher credit for this item');
    expect(pendingOf(w)).toEqual({});
  });

  it('the higher-credit note never blocks recovery: a hydrated final with the note and no pending still delivers', async () => {
    const records = [];
    const server = createServer({ ai: [{ verdict: 'understands', feedback: 'Good.' }] });
    const seeded = JSON.stringify({ [QID]: { exchange: 2, final: true, verdict: 'understands', credit: 0.5, creditNote: 'higher', turns: [], feedback: 'Good.', answer: 'A' } });
    const w = await bootSettledWrong({ server, records, seedLocalStorage: { quizTalkState_Me: seeded } });
    server.final = { verdict: 'understands', exceptionGranted: false, feedback: 'Good.', turns: [], credit: 0.5 };
    w.eval(`_renderTalkItThrough('${QID}')`);
    await tick(120);
    expect(reviewRecords(records)).toHaveLength(1);
    expect(pendingOf(w)).toEqual({});
  });

  it('an undelivered grant stays pending across reload; recovery fetches a FRESH grant and records it', async () => {
    const server = createServer({ ai: [{ verdict: 'understands', feedback: 'Good.' }] });
    const w1 = await bootSettledWrong({ server, ack: () => ({ ok: false, reason: 'network', queued: true }) });
    await send(w1, 'B is right because the spread is larger');
    await tick(60);
    expect(talk(w1).text).toContain('½ credit earned');
    const pending = pendingOf(w1);
    expect(pending[QID]).toMatchObject({ credit: 0.5, itemId: `${QID}#rev` });

    // Reload later: the stored grant has expired; the server's final replays with a new grant.
    pending[QID].grant = makeGrant(0.5, -60000, 99);
    const records = [];
    const w2 = await bootSettledWrong({
      server, records,
      seedLocalStorage: { quizTalkState_Me: w1.localStorage.getItem('quizTalkState_Me'), quizTalkPending_Me: JSON.stringify(pending) }
    });
    await tick(120);
    const recovered = reviewRecords(records);
    expect(recovered).toHaveLength(1);
    expect(recovered[0].grant).not.toBe(pending[QID].grant);
    expect(understandCalls(server).length).toBe(2);           // the recovery call, no new AI exchange
    expect(server.calls[server.calls.length - 1].exchange).toBe(2);
    expect(pendingOf(w2)).toEqual({});
    expect(talk(w2).text).toContain('½ credit earned');
  });
});

describe('Talk it through: reload + other devices', () => {
  it('reload after the verdict shows the lock and never offers a third exchange', async () => {
    const server = createServer({ ai: [{ followUp: 'Why?' }, { verdict: 'understands', feedback: 'Good.' }] });
    const w1 = await bootSettledWrong({ server });
    await send(w1, 'B is right because the spread is larger');
    await send(w1, 'A ignores the outlier so it is wrong');
    const saved = w1.localStorage.getItem('quizTalkState_Me');
    const w2 = await bootSettledWrong({ server, seedLocalStorage: { quizTalkState_Me: saved } });
    expect(talk(w2).text).toContain('½ credit earned');
    expect(talk(w2).textarea).toBeNull();
    forceTextarea(w2);
    w2.eval(`sendTalkItThrough('${QID}')`);
    await tick(60);
    expect(understandCalls(server)).toHaveLength(2);
  });

  it('reload between exchanges resumes at exchange 2 of 2 with the follow-up shown', async () => {
    const server = createServer({ ai: [{ followUp: '<b>Why</b> is C wrong?' }] });
    const w1 = await bootSettledWrong({ server });
    await send(w1, 'B is right because the spread is larger');
    const w2 = await bootSettledWrong({ server, seedLocalStorage: { quizTalkState_Me: w1.localStorage.getItem('quizTalkState_Me') } });
    expect(talk(w2).counter).toBe('Exchange 2 of 2');
    expect(talk(w2).text).toContain('<b>Why</b> is C wrong?');
    expect(talk(w2).injected).toBeNull();
  });

  it('a server FINAL (another device) beats unfinished local state, is saved locally, and blocks sending', async () => {
    const server = createServer({ ai: [{ verdict: 'understands' }] });
    const local = JSON.stringify({ [QID]: { exchange: 1, final: false, turns: [{ role: 'student', text: 'my first words' }, { role: 'ai', text: 'Why?' }] } });
    const w = await bootSettledWrong({
      server,
      seedLocalStorage: { quizTalkState_Me: local },
      beforeRender: (win) => win.eval(`window.quizReviewsByQuestion['${QID}'] = [{
        question_id: '${QID}', appeal_text: ${JSON.stringify(FINAL_MARKER)}, verdict: 'I', credit: 0, exception_granted: false,
        feedback: JSON.stringify({ verdict: 'not-yet', feedback: 'Finished on the laptop.', turns: [{ role: 'student', text: 'laptop words here' }] }),
        created_at: '2026-09-29T00:00:00Z'
      }];`)
    });
    const t = talk(w);
    expect(t.text).toContain('Not yet — your grade stands');
    expect(t.text).toContain('Finished on the laptop.');
    expect(t.textarea).toBeNull();
    expect(JSON.parse(w.localStorage.getItem('quizTalkState_Me'))[QID].final).toBe(true);
    forceTextarea(w);
    w.eval(`sendTalkItThrough('${QID}')`);
    await tick(60);
    expect(understandCalls(server)).toHaveLength(0);
  });

  it('hydration arriving mid-conversation is re-checked right before send', async () => {
    const server = createServer({ ai: [{ followUp: 'Why?' }, { verdict: 'understands' }] });
    const w = await bootSettledWrong({ server });
    await send(w, 'B is right because the spread is larger');
    // Another device finished it; the review history loads now (and the server holds that final).
    server.final = { verdict: 'understands', exceptionGranted: false, feedback: 'Done elsewhere.', turns: [], credit: 0.5 };
    w.eval(`window.quizReviewsByQuestion['${QID}'] = [{ question_id: '${QID}', appeal_text: ${JSON.stringify(FINAL_MARKER)}, verdict: 'P', credit: 0.5, exception_granted: false, feedback: JSON.stringify({ verdict: 'understands', feedback: 'Done elsewhere.', turns: [] }), created_at: '2026-09-29T00:00:00Z' }];`);
    type(w, 'A ignores the outlier so it is wrong');
    w.eval(`sendTalkItThrough('${QID}')`);
    await tick(60);
    // The typed message is never sent; the only later request is the credit recovery replay.
    expect(understandCalls(server).filter(c => c.appealText === 'A ignores the outlier so it is wrong')).toHaveLength(0);
    expect(understandCalls(server).filter(c => c.appealText !== 'recover my stored verdict')).toHaveLength(1);
    expect(talk(w).text).toContain('Done elsewhere.');
  });

  it('a stored exchange 1 from another device resumes at exchange 2', async () => {
    const w = await bootSettledWrong({
      beforeRender: (win) => win.eval(`window.quizReviewsByQuestion['${QID}#talk1'] = [{ question_id: '${QID}#talk1', appeal_text: ${JSON.stringify(E1_MARKER)}, verdict: 'I', credit: 0, feedback: JSON.stringify({ studentTurn: 'tablet words here', aiFollowUp: 'Why not C?' }), created_at: '2026-09-29T00:00:00Z' }];`)
    });
    expect(talk(w).counter).toBe('Exchange 2 of 2');
    expect(talk(w).text).toContain('tablet words here');
  });
});

describe('Talk it through: round 3 (hydrated finals deliver credit exactly once; MCQ appeals gone)', () => {
  const serverFinalRow = (verdict, credit) => `window.quizReviewsByQuestion['${QID}'] = [{
    question_id: '${QID}', appeal_text: ${JSON.stringify(FINAL_MARKER)}, verdict: '${verdict === 'understands' ? 'P' : 'I'}', credit: ${credit}, exception_granted: false,
    feedback: JSON.stringify({ verdict: '${verdict}', feedback: 'Stored on the server.', turns: [{ role: 'student', text: 'words from before' }] }),
    created_at: '2026-09-29T00:00:00Z'
  }];`;

  it('the final response was lost: hydration of a positive final records the grant once, never twice', async () => {
    const records = [];
    const server = createServer();
    server.e1 = { studentTurn: 'words from before', followUp: '' };
    server.final = { verdict: 'understands', exceptionGranted: false, feedback: 'Stored on the server.', turns: [{ role: 'student', text: 'words from before' }], credit: 0.5 };
    const w = await bootSettledWrong({ server, records, beforeRender: (win) => win.eval(serverFinalRow('understands', 0.5)) });
    await tick(120);
    expect(talk(w).text).toContain('½ credit earned');
    expect(reviewRecords(records)).toHaveLength(1);
    expect(reviewRecords(records)[0]).toMatchObject({ itemId: `${QID}#rev`, response: 'A' });
    expect(understandCalls(server)).toHaveLength(1);            // one replay request for a fresh grant
    expect(pendingOf(w)).toEqual({});

    // More repaints + another hydration on this device: nothing more is recorded.
    w.eval(`_renderTalkItThrough('${QID}'); ${serverFinalRow('understands', 0.5)} updateQuizReviewDisplays(); _renderTalkItThrough('${QID}');`);
    await tick(120);
    expect(reviewRecords(records)).toHaveLength(1);

    // A reload of this device keeps the delivered mark.
    const records2 = [];
    const w2 = await bootSettledWrong({ server, records: records2, seedLocalStorage: { quizTalkState_Me: w.localStorage.getItem('quizTalkState_Me') }, beforeRender: (win) => win.eval(serverFinalRow('understands', 0.5)) });
    await tick(120);
    expect(reviewRecords(records2)).toHaveLength(0);
    expect(talk(w2).text).toContain('½ credit earned');
  });

  it('a pending credit is cleared only by a real ledger ack (queued keeps it), whatever the review history says', async () => {
    const records = [];
    const server = createServer();
    server.e1 = { studentTurn: 'x y z', followUp: '' };
    server.final = { verdict: 'understands', exceptionGranted: false, feedback: '', turns: [], credit: 0.5 };
    const w = await bootSettledWrong({
      server, records, ack: () => ({ ok: false, reason: 'network', queued: true }),
      beforeRender: (win) => win.eval(`${serverFinalRow('understands', 0.5)} window.quizReviewsByQuestion['${QID}'].push({ question_id: '${QID}', appeal_text: 'old appeal', verdict: 'E', credit: 1, created_at: '2026-09-01T00:00:00Z' });`)
    });
    await tick(120);
    expect(reviewRecords(records).length).toBeGreaterThanOrEqual(1);
    expect(pendingOf(w)[QID]).toBeTruthy();
  });

  it('a negative hydrated final creates no pending credit and records nothing', async () => {
    const records = [];
    const server = createServer();
    const w = await bootSettledWrong({ server, records, beforeRender: (win) => win.eval(serverFinalRow('not-yet', 0)) });
    await tick(120);
    expect(talk(w).text).toContain('Not yet');
    expect(reviewRecords(records)).toHaveLength(0);
    expect(pendingOf(w)).toEqual({});
    expect(understandCalls(server)).toHaveLength(0);
  });

  it('a terminal exchange 1 held in the claim row hydrates as the final', async () => {
    const w = await bootSettledWrong({
      beforeRender: (win) => win.eval(`window.quizReviewsByQuestion['${QID}#talk1'] = [{ question_id: '${QID}#talk1', appeal_text: ${JSON.stringify(E1_MARKER)}, verdict: 'I', credit: 0,
        feedback: JSON.stringify({ studentTurn: 'claim words here', aiFollowUp: '', terminal: { verdict: 'not-yet', exceptionGranted: false, exceptionReason: '', feedback: 'Held in the claim.' } }), created_at: '2026-09-29T00:00:00Z' }];`)
    });
    expect(talk(w).text).toContain('Held in the claim.');
    expect(talk(w).textarea).toBeNull();
  });

  it('a multiple-choice appeal never reaches the server', async () => {
    const server = createServer();
    const w = await bootSettledWrong({ server });
    w.document.getElementById(`appeal-text-${QID}`).value = 'please reconsider my answer';
    await w.eval(`submitAppeal('${QID}', 'multiple-choice')`);
    await tick(30);
    expect(server.requests).toHaveLength(0);
    expect(w.document.getElementById(`grading-feedback-${QID}`).textContent).toContain('Talk it through');
  });
});

describe('multiple-choice feedback appeal (teacher 2026-09-29)', () => {
  function showVerdict(w, score) {
    w.eval(`displayGradingFeedback('${QID}', { score: '${score}', feedback: 'Show the computation next time.', questionType: 'multiple-choice', matched: [], missing: [] });`);
  }

  it('a CORRECT answer with a P verdict: appeal offered, and the note says the grade is already full', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    await tick(50);
    showVerdict(w, 'P');
    const btn = w.document.getElementById(`btn-appeal-${QID}`);
    expect(btn && btn.style.display).toBe('inline-block');
    expect(w.document.getElementById(`grading-feedback-${QID}`).textContent)
      .toContain('Your answer is correct: full credit. This feedback is about your explanation only');
  });

  it('a WRONG answer never offers the appeal (retry, then Talk it through) and shows no full-credit note', async () => {
    const w = boot();
    seedMine(w, { answer: 'A', attempts: 1 });
    render(w);
    await tick(50);
    showVerdict(w, 'P');
    const btn = w.document.getElementById(`btn-appeal-${QID}`);
    expect(!btn || btn.style.display !== 'inline-block').toBe(true);
    expect(w.document.getElementById(`grading-feedback-${QID}`).textContent).not.toContain('full credit');
  });

  it('the explanation written for the AI review is shared with classmates', async () => {
    const w = boot();
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    await tick(50);
    let shared = null;
    w.eval(`window.requestAIReview = async () => {};`);
    w.shareReasoningWithPeers = async (qid) => { shared = qid; };
    w.document.getElementById(`reasoning-text-${QID}`).value = 'the sum of all squared deviations of the scores from the mean';
    await w.eval(`submitForAIReview('${QID}', 'multiple-choice')`);
    expect(shared).toBe(QID);
    expect(w.eval(`classData.users.Me.reasons['${QID}']`)).toBe('the sum of all squared deviations of the scores from the mean');
  });

  it('a CORRECT answer can actually send the appeal (no mode: the server checks the ledger)', async () => {
    const server = createServer();
    const w = boot({ server });
    seedMine(w, { answer: 'B', attempts: 1 });
    render(w);
    await tick(300);
    w.document.getElementById(`appeal-text-${QID}`).value = 'My explanation of the squared deviations was within scope';
    await w.eval(`submitAppeal('${QID}', 'multiple-choice')`);
    await tick(60);
    const appeal = server.calls.find(c => c.mode === undefined);
    expect(appeal).toBeTruthy();
    expect(appeal.scenario.questionId).toBe(QID);
  });

  it('a WRONG answer is stopped on the page before any appeal request', async () => {
    const server = createServer();
    const w = boot({ server });
    seedMine(w, { answer: 'A', attempts: 1 });
    render(w);
    await tick(300);
    w.document.getElementById(`appeal-text-${QID}`).value = 'please reconsider my answer';
    await w.eval(`submitAppeal('${QID}', 'multiple-choice')`);
    await tick(60);
    expect(server.calls.find(c => c.mode === undefined)).toBeUndefined();
  });

  it('no explanation is shared for a question that has no answer', async () => {
    const w = boot();
    render(w);
    await tick(50);
    let shared = null;
    w.eval(`window.requestAIReview = async () => {};`);
    w.shareReasoningWithPeers = async (qid) => { shared = qid; };
    w.document.getElementById(`reasoning-text-${QID}`).value = 'some explanation text here';
    await w.eval(`submitForAIReview('${QID}', 'multiple-choice')`);
    expect(shared).toBeNull();
  });

  it('the reasoning rubric accepts a correct conceptual explanation without the arithmetic', () => {
    const w = boot();
    const prompt = w.eval(`buildMCQGradingPrompt(currentQuestions[0], 'B', 'x')`);
    expect(prompt).toMatch(/Do NOT require the arithmetic to be shown/);
    expect(prompt).toMatch(/correctly explains the METHOD or CONCEPT/);
  });
});
