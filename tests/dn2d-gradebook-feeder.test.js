/**
 * tests/dn2d-gradebook-feeder.test.js
 *
 * DN2d — curriculum_render quiz answer-submit gradebook feeder + roster
 * sign-in surface. Frozen contract: DN2D_BUILD.md (repo root).
 *
 * Pure Node (no jsdom — cr tests are environment:'node'). Structure/source
 * assertions via text + Node `vm` for runtime behavior, mirroring the cr
 * test conventions and the follow-alongs DN2c test approach.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const ROOT = resolve(__dirname, '..');
const INDEX = resolve(ROOT, 'index.html');

let html;
beforeAll(() => { html = readFileSync(INDEX, 'utf8'); });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Shared clients copied in + loaded in order
// ─────────────────────────────────────────────────────────────────────────────

describe('DN2d — shared roster/gradebook clients', () => {
  it('the 3 client files exist in cr root', () => {
    for (const f of ['roster_config.js', 'roster-client.js', 'gradebook-client.js']) {
      expect(existsSync(resolve(ROOT, f)), `missing ${f}`).toBe(true);
    }
  });

  it('defines window.rosterClient and window.gradebookClient', () => {
    expect(readFileSync(resolve(ROOT, 'roster-client.js'), 'utf8')).toContain('window.rosterClient');
    expect(readFileSync(resolve(ROOT, 'gradebook-client.js'), 'utf8')).toContain('window.gradebookClient');
  });

  it('index.html loads config → client → feeder, in order, after railway_client.js', () => {
    const iRail = html.indexOf('<script src="railway_client.js">');
    const iCfg  = html.indexOf('<script src="roster_config.js">');
    const iCli  = html.indexOf('<script src="roster-client.js">');
    const iFeed = html.indexOf('<script src="gradebook-client.js">');
    expect(iRail).toBeGreaterThan(-1);
    expect(iCfg).toBeGreaterThan(iRail);
    expect(iCli).toBeGreaterThan(iCfg);
    expect(iFeed).toBeGreaterThan(iCli);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Roster sign-in surface (additive)
// ─────────────────────────────────────────────────────────────────────────────

describe('DN2d — roster sign-in surface', () => {
  it('fab-menu has the 🎓 Gradebook entry → showRosterSignInModal()', () => {
    expect(html).toMatch(/fab-item gradebook-signin-button[^>]*onclick="showRosterSignInModal\(\)"/);
  });

  it('modal has username + password (type=password) + Sign In button', () => {
    expect(html).toContain('id="roster-signin-username"');
    expect(html).toMatch(/id="roster-signin-password"[^>]*type=|type="password"[^>]*id="roster-signin-password"/);
    expect(html).toContain('id="roster-signin-password"');
    expect(html).toMatch(/type="password"/);
    expect(html).toContain('onclick="submitRosterSignIn()"');
  });

  it('reuses cr modal classes (visual consistency)', () => {
    expect(html).toMatch(/id="roster-signin-overlay" class="modal"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Feeder wired into saveAnswerWithTracking (source slice)
// ─────────────────────────────────────────────────────────────────────────────

/** Slice a `function NAME(...)` (or `async function`) to its matching brace.
 *  Skips the parameter list first, so `options = {}` default params don't
 *  get mistaken for the function body opening brace. */
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);

  // Walk the parameter list: from the '(' until paren depth returns to 0.
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }

  // The body opens at the next '{' after the parameter list.
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

/** Slice `window.NAME = (async )?function (...) {...}` to its matching brace. */
function fnBodyAssigned(src, name) {
  const re = new RegExp('window\\.' + name + '\\s*=\\s*(?:async\\s+)?function\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: window.' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: window.' + name);
}

// THE anti-false-green: the prior version only checked the feeder block was
// INSIDE saveAnswerWithTracking -- a function that is never called. This asserts
// the feeder is reached from the LIVE submit path.
describe('DN2d — feeder wired into the LIVE submit path', () => {
  it('window.submitAnswer calls recordToGradebookLedger(questionId, value)', () => {
    const body = fnBodyAssigned(html, 'submitAnswer');
    expect(body).toMatch(/recordToGradebookLedger\s*\(\s*questionId\s*,\s*value\s*\)/);
  });
  it('recordToGradebookLedger is a top-level function (callable from submitAnswer)', () => {
    expect(html).toMatch(/function\s+recordToGradebookLedger\s*\(/);
  });
});

describe('DN2d — feeder body (recordToGradebookLedger)', () => {
  let body;
  beforeAll(() => { body = fnBody(html, 'recordToGradebookLedger'); });

  it('calls window.gradebookClient.record, guarded', () => {
    expect(body).toMatch(/window\.gradebookClient\s*&&\s*window\.gradebookClient\.record/);
    expect(body).toMatch(/window\.gradebookClient\.record\s*\(/);
  });

  it('passes questionId verbatim as itemId (no mapping)', () => {
    expect(body).toMatch(/itemId:\s*questionId/);
  });

  it('derives source by id shape (U#-PC(26)?- → pc, else curriculum_quiz)', () => {
    // Widened from /^U\d+-PC-/ so makeup ids (U#-PC26-...) also route to 'pc'.
    expect(body).toMatch(/\/\^U\\d\+-PC\/\.test\(questionId\)/);
    expect(body).toMatch(/source:\s*isPc\s*\?\s*'pc'\s*:\s*'curriculum_quiz'/);
  });

  it('PC rows carry the open part (PcDelivery.active) for /pc/:unit/:part routing', () => {
    expect(body).toMatch(/PcDelivery\.active/);
    expect(body).toMatch(/rec\.part\s*=/);
  });

  it('is wrapped in try/catch so it can never block cr submit', () => {
    expect(body).toMatch(/try\s*\{[\s\S]*gradebookClient\.record[\s\S]*\}\s*catch\s*\(_\)\s*\{[^}]*\}/);
  });

  it('does NOT reference data/curriculum.js (id carried by questionId)', () => {
    expect(body).not.toMatch(/curriculum\.js/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RUNTIME — the feeder snippet behaves correctly
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the DN2d feeder try-block and wrap it as a callable. */
function makeFeeder() {
  const body = fnBody(html, 'recordToGradebookLedger');
  const start = body.indexOf('try {');
  const endMarker = "} catch (_) { /* never block cr's submit */ }";
  const end = body.indexOf(endMarker) + endMarker.length;
  const snippet = body.slice(start, end);

  const calls = [];
  const sandbox = {
    window: { gradebookClient: { record: (o) => { calls.push(o); } } },
  };
  createContext(sandbox);
  runInContext(
    'this.feed = function (questionId, answer) {\n' + snippet + '\n};', sandbox);
  return { feed: sandbox.feed, calls, sandbox };
}

describe('DN2d runtime — feeder source/itemId/unit derivation', () => {
  it('lesson quiz id → source curriculum_quiz, itemId passthrough, unit U#', () => {
    const f = makeFeeder();
    f.feed('U1-L2-Q01', 'B');
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({
      source: 'curriculum_quiz', itemId: 'U1-L2-Q01', unit: 'U1',
      response: 'B', attempt: 1,
    });
  });

  it('progress-check id → source pc', () => {
    const f = makeFeeder();
    f.feed('U3-PC-MCQ-A-Q05', 'C');
    expect(f.calls[0].source).toBe('pc');
    expect(f.calls[0].itemId).toBe('U3-PC-MCQ-A-Q05');
    expect(f.calls[0].unit).toBe('U3');
  });

  it('FRQ-style lesson id stays curriculum_quiz', () => {
    const f = makeFeeder();
    f.feed('U5-L3-FRQ-Q01', { parts: ['x'] });
    expect(f.calls[0].source).toBe('curriculum_quiz');
  });

  it('absent gradebookClient → no throw, no call', () => {
    const body = fnBody(html, 'recordToGradebookLedger');
    const start = body.indexOf('try {');
    const endMarker = "} catch (_) { /* never block cr's submit */ }";
    const snippet = body.slice(start, body.indexOf(endMarker) + endMarker.length);
    const sandbox = { window: {} };           // no gradebookClient
    createContext(sandbox);
    runInContext('this.feed = function (questionId, answer) {\n' + snippet + '\n};', sandbox);
    expect(() => sandbox.feed('U1-L2-Q01', 'A')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. RUNTIME — the roster sign-in IIFE
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the DN2d roster IIFE block + run it in a fake-DOM sandbox. */
function makeRosterUI({ rosterClient } = {}) {
  const marker = '// DN2d — Gradebook roster sign-in surface.';
  const mi = html.indexOf(marker);
  const iifeStart = html.indexOf('(function () {', mi);
  const iifeEnd = html.indexOf('})();', iifeStart) + '})();'.length;
  const iife = html.slice(iifeStart, iifeEnd);

  const els = new Map();
  const elFor = (id) => {
    if (!els.has(id)) els.set(id, { id, value: '', textContent: '', disabled: false, style: {} });
    return els.get(id);
  };
  const store = new Map();
  const acceptCalls = [];
  const win = { rosterClient: rosterClient || undefined };
  // Inject a fake cr identity entry point unless the test opts out.
  if (arguments[0] && arguments[0].withAcceptUsername !== false) {
    win.acceptUsername = async (name) => { acceptCalls.push(name); };
  }
  const sandbox = {
    window: win,
    document: { getElementById: elFor },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    console,
  };
  // `updateCurrentUsernameDisplay` is referenced via typeof — leave undefined.
  createContext(sandbox);
  runInContext(iife, sandbox);
  return { win: sandbox.window, el: elFor, store, acceptCalls, sandbox };
}

describe('DN2d runtime — roster sign-in mirrors identity through cr auth path', () => {
  it('successful signIn calls cr window.acceptUsername(rosterName) — the real auth path (Codex #1)', async () => {
    const ui = makeRosterUI({
      rosterClient: {
        signIn: async () => ({ ok: true }),
        current: () => ({ username: 'coconut_shark', realName: 'Pat Q' }),
      },
    });
    ui.el('roster-signin-username').value = 'coconut_shark';
    ui.el('roster-signin-password').value = ' pw with space ';
    await ui.win.submitRosterSignIn();
    // Faithful: identity goes through cr's canonical entry point (sets the
    // script-scoped `let currentUsername` + IDB setMeta + localStorage),
    // NOT a window/localStorage poke that the feeder guard would miss.
    expect(ui.acceptCalls).toEqual(['coconut_shark']);
  });

  it('falls back to window.currentUsername + consensusUsername only when cr auth is unavailable', async () => {
    const ui = makeRosterUI({
      withAcceptUsername: false,                 // simulate auth.js not loaded
      rosterClient: {
        signIn: async () => ({ ok: true }),
        current: () => ({ username: 'mango_panda' }),
      },
    });
    ui.el('roster-signin-username').value = 'mango_panda';
    ui.el('roster-signin-password').value = 'pw';
    await ui.win.submitRosterSignIn();
    expect(ui.acceptCalls).toEqual([]);
    expect(ui.win.currentUsername).toBe('mango_panda');
    expect(ui.store.get('consensusUsername')).toBe('mango_panda');
  });

  it('failed signIn does NOT mirror identity (no acceptUsername) and shows the error', async () => {
    const ui = makeRosterUI({
      rosterClient: { signIn: async () => ({ ok: false, error: 'Invalid username or password' }), current: () => null },
    });
    ui.el('roster-signin-username').value = 'x';
    ui.el('roster-signin-password').value = 'y';
    await ui.win.submitRosterSignIn();
    expect(ui.acceptCalls).toEqual([]);
    expect(ui.win.currentUsername).toBeUndefined();
    expect(ui.store.has('consensusUsername')).toBe(false);
    expect(ui.el('roster-signin-error').textContent).toBe('Invalid username or password');
  });

  it('offline (no rosterClient) → graceful message, no throw', async () => {
    const ui = makeRosterUI({ rosterClient: undefined });
    ui.el('roster-signin-username').value = 'x';
    ui.el('roster-signin-password').value = 'y';
    await ui.win.submitRosterSignIn();
    expect(ui.el('roster-signin-error').textContent).toMatch(/offline/i);
  });

  it('rosterSignOut clears the roster session but NOT cr consensusUsername', () => {
    let signedOut = 0;
    const ui = makeRosterUI({ rosterClient: { signOut: () => { signedOut++; }, current: () => null } });
    ui.store.set('consensusUsername', 'coconut_shark');   // cr identity pre-exists
    ui.win.rosterSignOut();
    expect(signedOut).toBe(1);
    expect(ui.store.get('consensusUsername')).toBe('coconut_shark'); // deliberately preserved
  });
});
