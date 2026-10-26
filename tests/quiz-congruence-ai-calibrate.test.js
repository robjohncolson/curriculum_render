/**
 * QUIZ_CONGRUENCE_AI_READ_SPEC §7: the calibration script measures what the route does.
 *
 * Runs scripts/quiz-congruence-ai-calibrate.mjs as a child process against a one-item bank and a
 * four-row ledger, with fetch stubbed by a preload module (no network, no real key). Pins three
 * things: latency is measured after the body, as the route's deadline is; the verbatim-reason
 * rule reads the sanitized text the model saw, as the route does; and the population floor is the
 * route's CONGRUENCE_MIN_WORDS.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const SCRIPT = resolve(ROOT, 'scripts/quiz-congruence-ai-calibrate.mjs');
const SLOW = 'the slow body talks about the middle value resisting outliers';
const MARKED = 'the <<<middle value>>> resists the extreme outlier here';
const ONE_WORD = 'averages';   // the route's floor, one real word: in the population
const NO_WORDS = '?! ...';      // no letter or digit, under it: tallied, never sent

// Headers at once; the body of the SLOW read only after the route's 3.5 s deadline.
const PRELOAD = `
const reply = (content) => ({ choices: [{ message: { content: JSON.stringify(content) } }], usage: {} });
globalThis.fetch = async (url, opts) => {
    const user = JSON.parse(opts.body).messages[1].content;
    if (user.includes(${JSON.stringify(SLOW)})) {
        return { ok: true, status: 200, json: () => new Promise(r => setTimeout(() => r(reply({ letter: 'C', confidence: 0.9, reason: 'the slow body talks about the middle value' })), 3700)) };
    }
    if (user.includes('the "middle value" resists')) {
        return { ok: true, status: 200, json: async () => reply({ letter: 'C', confidence: 0.9, reason: 'the "middle value" resists the extreme outlier' }) };
    }
    return { ok: true, status: 200, json: async () => reply({ letter: 'UNCLEAR', confidence: 0.2, reason: '' }) };
};
`;

const dir = mkdtempSync(join(tmpdir(), 'congruence-calibrate-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run() {
  const preload = join(dir, 'preload.mjs');
  const bank = join(dir, 'bank.js');
  const ledger = join(dir, 'ledger.json');
  writeFileSync(preload, PRELOAD);
  writeFileSync(bank, 'const EMBEDDED_CURRICULUM = ' + JSON.stringify([{
    id: 'U1-L1-Q01', type: 'multiple-choice', prompt: 'Which one?', answerKey: 'B',
    choices: [{ key: 'A', value: 'alpha' }, { key: 'B', value: 'bravo' }, { key: 'C', value: 'charlie' }, { key: 'D', value: 'delta' }],
  }]) + ';\n');
  writeFileSync(ledger, JSON.stringify([
    { student_id: 's1', item_id: 'U1-L1-Q01', attempt: 1, response: 'D', reasoning: SLOW },
    { student_id: 's2', item_id: 'U1-L1-Q01', attempt: 1, response: 'D', reasoning: MARKED },
    { student_id: 's3', item_id: 'U1-L1-Q01', attempt: 1, response: 'D', reasoning: ONE_WORD },
    { student_id: 's4', item_id: 'U1-L1-Q01', attempt: 1, response: 'D', reasoning: NO_WORDS },
  ]));
  const out = join(dir, 'out');
  const child = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, SCRIPT, ledger, bank, out], {
    env: { ...process.env, DEEPSEEK_API_KEY: 'test-not-a-key' },
    encoding: 'utf8',
    timeout: 60000,
  });
  expect(child.status, child.stdout + child.stderr).toBe(0);
  const results = readFileSync(join(out, 'results.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  return { results, summary };
}

describe('calibration matches the route', () => {
  let results = [];
  let summary = {};
  beforeAll(() => { ({ results, summary } = run()); }, 60000);
  const row = (text) => results.find(r => r.kind === 'population' && r.text === text);

  it('latency covers the body: a reply whose body lands after the deadline counts as over it', () => {
    expect(row(SLOW).latencyMs).toBeGreaterThanOrEqual(3500);
    expect(summary.overDeadline).toBe(1);
  });

  it('the reason is grounded in the sanitized text the model saw, not the raw explanation', () => {
    expect(row(MARKED).letter).toBe('C');
    expect(summary.droppedByVerbatimRule).toBe(0);
    expect(summary.lettersGrounded).toBe(2);
  });

  it("the population floor is the route's: one word is read, a box with no word is tallied under it", () => {
    expect(row(ONE_WORD)).toBeTruthy();
    expect(row(NO_WORDS)).toBeUndefined();
    expect(summary.detector.underFloor).toBe(1);
  });
});
