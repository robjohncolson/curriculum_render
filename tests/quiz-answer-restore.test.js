/**
 * Quiz own-answer restore from the roster ledger.
 *
 * The normal sign-in path never hydrated a student's OWN quiz answers into
 * classData (the store renderQuestion reads): pullPeerDataFromSupabase .neq's
 * self + needs turbo mode, restoreFromCloudByUsername is a manual turbo prompt,
 * and mergePeerDataIntoStores skips self for classData. So a student re-opening
 * the quiz on a fresh device / after a storage wipe saw none of their own work.
 * restoreOwnAnswersFromLedger (index.html) fixes it from the authoritative
 * roster ledger. These tests pin (1) the wiring is present, and (2) the merge
 * rules (curriculum_quiz-only, timestamp-max, FRQ-object coercion).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = readFileSync(resolve(repo, 'index.html'), 'utf8');
const AUTH = readFileSync(resolve(repo, 'js', 'auth.js'), 'utf8');

describe('quiz own-answer restore — wiring', () => {
  it('index.html defines window.restoreOwnAnswersFromLedger', () => {
    expect(INDEX).toMatch(/window\.restoreOwnAnswersFromLedger\s*=\s*async function/);
  });
  it('restores from the authoritative roster ledger (/ledger/student/), curriculum_quiz only', () => {
    expect(INDEX).toContain("/ledger/student/");
    expect(INDEX).toMatch(/r\.source !== 'curriculum_quiz'/);
  });
  it('timestamp-max guard so live local work is never clobbered', () => {
    expect(INDEX).toMatch(/if \(u\.answers\[qid\] && ts <= existingTs\) return;/);
  });
  it('hydrates the classData store renderQuestion reads (users[user].answers)', () => {
    expect(INDEX).toMatch(/u\.answers\[qid\]\s*=\s*\{\s*value:\s*val,\s*timestamp:\s*ts\s*\}/);
  });
  it('acceptUsername calls it on sign-in AND reload (fire-and-forget)', () => {
    expect(AUTH).toMatch(/window\.restoreOwnAnswersFromLedger\(\)\.catch/);
  });
});

// The merge rules, mirrored (this repo's self-contained test style) — pins the
// contract restoreOwnAnswersFromLedger implements against the roster /ledger rows.
function mergeLedgerAnswers(existing, rows) {
  const u = { answers: { ...(existing.answers || {}) }, timestamps: { ...(existing.timestamps || {}) } };
  for (const r of rows) {
    if (!r || r.source !== 'curriculum_quiz' || !r.item_id) continue;
    if (r.response === undefined || r.response === null || r.response === '') continue;
    const qid = String(r.item_id);
    const ts = r.recorded_at ? (Date.parse(r.recorded_at) || 0) : 0;
    const existingTs = u.timestamps[qid] || (u.answers[qid] && u.answers[qid].timestamp) || 0;
    if (u.answers[qid] && ts <= existingTs) continue;
    let val = r.response;
    if (typeof val === 'string') {
      const t = val.trim();
      if (t.charAt(0) === '{' || t.charAt(0) === '[') { try { val = JSON.parse(t); } catch (_) {} }
    }
    u.answers[qid] = { value: val, timestamp: ts };
    u.timestamps[qid] = ts;
  }
  return u;
}

describe('quiz own-answer restore — merge rules', () => {
  const T1 = '2026-09-10T10:00:00Z', T2 = '2026-09-10T11:00:00Z';

  it('restores MCQ answers from ledger rows into the render store', () => {
    const u = mergeLedgerAnswers({}, [
      { source: 'curriculum_quiz', item_id: 'U1-L1-Q01', response: 'B', recorded_at: T1 },
      { source: 'curriculum_quiz', item_id: 'U1-L1-Q02', response: 'D', recorded_at: T1 },
    ]);
    expect(u.answers['U1-L1-Q01'].value).toBe('B');
    expect(u.answers['U1-L1-Q02'].value).toBe('D');
  });

  it('ignores non-quiz sources (worksheet/frq/pc restore elsewhere)', () => {
    const u = mergeLedgerAnswers({}, [
      { source: 'worksheet', item_id: 'WS-U1L1-r1', response: 'x', recorded_at: T1 },
      { source: 'frq', item_id: 'WS-U1L1-r2', response: 'y', recorded_at: T1 },
      { source: 'pc', item_id: 'U1-PC26-MCQ-A-Q01', response: 'A', recorded_at: T1 },
    ]);
    expect(Object.keys(u.answers)).toHaveLength(0);
  });

  it('timestamp-max: never clobbers newer local work, fills when older/absent', () => {
    const local = { answers: { 'U1-L1-Q01': { value: 'LOCAL', timestamp: Date.parse(T2) } }, timestamps: { 'U1-L1-Q01': Date.parse(T2) } };
    const u = mergeLedgerAnswers(local, [
      { source: 'curriculum_quiz', item_id: 'U1-L1-Q01', response: 'OLD', recorded_at: T1 }, // older → keep LOCAL
      { source: 'curriculum_quiz', item_id: 'U1-L1-Q09', response: 'NEW', recorded_at: T1 }, // absent → fill
    ]);
    expect(u.answers['U1-L1-Q01'].value).toBe('LOCAL');
    expect(u.answers['U1-L1-Q09'].value).toBe('NEW');
  });

  it('coerces a JSON-stringified progressive-FRQ object back to an object', () => {
    const u = mergeLedgerAnswers({}, [
      { source: 'curriculum_quiz', item_id: 'U1-L1-FRQ', response: '{"partA":"foo","allComplete":true}', recorded_at: T1 },
    ]);
    expect(u.answers['U1-L1-FRQ'].value).toEqual({ partA: 'foo', allComplete: true });
  });

  it('skips empty/blank responses', () => {
    const u = mergeLedgerAnswers({}, [
      { source: 'curriculum_quiz', item_id: 'U1-L1-Q01', response: '', recorded_at: T1 },
      { source: 'curriculum_quiz', item_id: 'U1-L1-Q02', response: null, recorded_at: T1 },
    ]);
    expect(Object.keys(u.answers)).toHaveLength(0);
  });
});
