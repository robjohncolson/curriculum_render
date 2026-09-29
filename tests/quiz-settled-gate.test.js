/**
 * QUIZ_FIRST_ANSWER_SPEC v2 (teacher 2026-09-29): one answer; one explained retry after a WRONG
 * first answer, PENDING until the roster server accepts it; nothing from classmates (cards,
 * letters, chart, consensus, key) until the item is settled; only classmates who explained get a
 * card. Supersedes peer-letters-hidden.test.js (v1).
 *
 * Source pins only — the behaviour is exercised at runtime in quiz-settled-dom.test.js (real page
 * scripts in jsdom). These pins catch a gate being bypassed in a renderer that test does not reach.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
let html = '';
beforeAll(() => { html = readFileSync(resolve(ROOT, 'index.html'), 'utf8'); });

function fnSrc(name, from = 0) {
  const re = new RegExp('(?:async )?function ' + name + '\\s*\\(', 'g');
  re.lastIndex = from;
  const hit = re.exec(html);
  if (!hit) throw new Error('missing ' + name);
  let depth = 0;
  // The body starts at the first ') {' (params may hold a destructuring default like `{ a } = {}`).
  for (let i = html.indexOf(') {', hit.index) + 2; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(hit.index, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

function allFnSrc(name) {
  const out = [];
  const re = new RegExp('function ' + name + '\\s*\\(', 'g');
  let hit;
  while ((hit = re.exec(html))) out.push(fnSrc(name, hit.index));
  return out;
}

describe('quizSettledFor: the one gate', () => {
  it('is used at every former answerKeyRevealedFor site; the v1 gate is gone', () => {
    expect(html).not.toContain('answerKeyRevealedFor');
    const letterLines = html.split('\n').filter(l => l.includes('<strong>Answer:</strong> ${_escHtml(peer.choice || peer.response)}'));
    expect(letterLines.length).toBe(3);
    for (const line of letterLines) expect(line).toContain('quizSettledFor(questionId) ? `');
    expect(html).toContain('${quizSettledFor(questionId) ? ` → Choice ${_escHtml(c.choice)}` : \'\'}');
    expect(html).not.toMatch(/→ Choice \$\{c\.choice\}<\/span>/);
  });

  it('a PENDING retry is never settled; an ACCEPTED one is', () => {
    const fn = fnSrc('quizSettledFor');
    expect(fn).toContain("if (retryStatus === 'pending') return false;");
    expect(fn).toContain("if (retryStatus === 'accepted') return true;");
    // pending first, then the correct-first exception; anything else (incl. 2 attempts, no record) stays closed
    expect(fn.indexOf("'pending') return false")).toBeLessThan(fn.indexOf('if (firstAnswerWasCorrect(questionId)) return true;'));
    expect(fn.trim().endsWith('return false;\n        }')).toBe(true);
  });

  it('canRetry encodes attempts === 0 || (attempts === 1 && first answer wrong), and never while pending', () => {
    const fn = fnSrc('canRetry');
    expect(fn).toContain("if (_quizRetryStatus(questionId) === 'pending') return false;");
    expect(fn).toContain('return attempts === 0 || (attempts === 1 && !firstAnswerWasCorrect(questionId));');
  });

  it('retry state (first answers + pending/accepted retries) is persisted per student', () => {
    expect(fnSrc('_quizRetryState')).toContain('localStorage.getItem(`quizRetryState_${user}`');
    expect(fnSrc('_saveQuizRetryState')).toContain('localStorage.setItem(`quizRetryState_${user}`');
  });

  it('the retry needs 3+ words with a letter or digit (the server rule)', () => {
    expect(fnSrc('retryReasoningReady')).toContain('/[\\p{L}\\p{N}]/u');
  });
});

describe('surfaces behind the gate', () => {
  it('the MCQ distribution chart and consensus line wait until settled', () => {
    const fn = fnSrc('renderMCQDistribution');
    expect(fn.indexOf('quizSettledFor(questionId)')).toBeGreaterThan(0);
    expect(fn.indexOf('quizSettledFor(questionId)')).toBeLessThan(fn.indexOf('const choiceCounts'));
    expect(fn).toContain('QUIZ_PEERS_LOCKED_TEXT');
    expect(html).toContain("'Answer (and, if you were wrong, retry with an explanation) to see what classmates wrote.'");
    expect(html).not.toContain('Class results unlock with the answer key');
  });

  it('BOTH peer renderers lock until settled and show only classmates who explained', () => {
    const renderers = allFnSrc('populatePeerReasoning');
    expect(renderers.length).toBe(2);
    for (const fn of renderers) {
      expect(fn).toContain('!quizSettledFor(questionId)');
      expect(fn).toContain('QUIZ_PEERS_LOCKED_TEXT');
      expect(fn).toContain('(isFrqPeers || _peerExplained(c))');
      expect(fn).toContain('_explainedCountText(');
      expect(fn.indexOf('!quizSettledFor(questionId)')).toBeLessThan(fn.indexOf('_peerExplained(c)'));
    }
    expect(html).toContain("${n === 1 ? 'classmate' : 'classmates'} explained");
  });

  it('the contributors list skips classmates with no explanation', () => {
    expect(fnSrc('renderMCQDistribution')).toContain('if (!isCurrentUser && !_peerExplained(c)) return;');
  });

  it('classmate text is escaped in every peer renderer (no raw ${peer.reason} / ${c.reason} / ${peer.username})', () => {
    const renderers = [...allFnSrc('populatePeerReasoning'), fnSrc('renderMCQDistribution'), fnSrc('renderFRQResponses')];
    for (const src of renderers) {
      const fn = src.split('\n').filter(line => !line.includes('console.log(')).join('\n');   // logs are not HTML
      expect(fn).not.toMatch(/\$\{peer\.(reason|username|choice)\}/);
      expect(fn).not.toMatch(/\$\{c\.(reason|username|choice)\}/);
      expect(fn).not.toMatch(/\$\{r\.(reason|username|response)\}/);
      expect(fn).not.toMatch(/'\$\{(peer|r)\.username\}'/);    // no raw name inside an onclick string
      expect(fn).not.toMatch(/answerHtml = peer\.response;/);
    }
    expect(fnSrc('_escHtml')).toContain("replace(/</g, '&lt;')");
  });

  it('the answer-key reveal has no 5/15-minute timers; it follows the settled rule', () => {
    const fn = fnSrc('displayAnswerKey');
    expect(fn).not.toContain('setTimeout(');
    expect(fn).not.toContain('15 * 60 * 1000');
    expect(fn).not.toContain('5 * 60 * 1000');
    expect(fn).toContain('if (!quizSettledFor(questionId))');
    expect(html).not.toContain('answerKeyTimers');
  });

  it('one state→DOM refresh drives the form, the real key/chart renderers and the peer panel', () => {
    const fn = fnSrc('_refreshAfterReveal');
    expect(fn).toContain('_applyQuizFormState(questionId)');
    expect(fn).toContain('displayAnswerKey(questionId)');
    expect(fn).toContain('showDotplot(questionId, type)');
    expect(fn).toContain('populatePeerResponses(questionId, type)');
    expect(html).not.toContain('populatePeerReasoningSection');
  });
});

describe('retry form + outcomes', () => {
  it('labels, button text and the pending line per spec', () => {
    const fn = fnSrc('_quizFormState');
    expect(fn).toContain("'You were not correct. One retry: explain what changed your mind.'");
    expect(fn).toContain("'Submit retry (this becomes your grade)'");
    expect(fn).toContain("mode: 'pending'");
    expect(html).toContain("'Retry saved \\u2014 waiting for the server / connection.'");
    expect(html).toContain("'This answer is your grade.'");
  });

  it('the retry button is re-checked live on every input (not rendered disabled once)', () => {
    expect(html).toContain("document.addEventListener('input', _onQuizReasonInput);");
    const fn = fnSrc('_onQuizReasonInput');
    expect(fn).toContain("_quizFormState(questionId).mode !== 'retry'");
    expect(fn).toContain('button.disabled = !retryReasoningReady(target.value);');
  });

  it('the dead "Add Explanation to Retry" path is gone', () => {
    expect(html).not.toContain('addExplanationToRetry');
    expect(html).not.toContain('Add Reasoning to Retry');
  });

  it('the submit sends attempt + reasoning and routes the server answer through _settleQuizRetry', () => {
    const feeder = fnSrc('recordToGradebookLedger');
    expect(feeder).toContain('attempt: (!isPc && ledgerOpts.attempt) ? ledgerOpts.attempt : 1');
    expect(feeder).toContain('rec.reasoning = ledgerOpts.reasoning.trim();');
    expect(feeder).toContain('_reportLedgerOutcome(ledgerOpts, r);');
    expect(fnSrc('_reportLedgerOutcome')).toContain("r.reason === 'retry-not-allowed'");
    expect(html).toContain('? (outcome, detail) => _settleQuizRetry(submitUsername, questionId, outcome, detail)');
    expect(html).toContain("window.addEventListener('gradebook:quiz-retry-outcome'");
  });

  it('the rollback waits for the submit writes, fixes IDB + outbox, and uses the submitting student', () => {
    const fn = fnSrc('_revertRefusedRetry');
    expect(fn.indexOf('await _awaitQuizWrites(username, questionId);')).toBeGreaterThan(0);
    expect(fn.indexOf('await _awaitQuizWrites(username, questionId);')).toBeLessThan(fn.indexOf('restore('));
    expect(fn).toContain('storage.removeOutboxItem(op.id)');
    expect(fn).not.toContain('classData.users[currentUsername]');
  });

  it('the submit and Share My Reasoning pass the reasoning to Railway', () => {
    expect(html).toContain('window.submitAnswerViaRailway(currentUsername, questionId, value, timestampNow, isFRQ ? undefined : reason)');
    expect(html).toContain('window.submitAnswerViaRailway(currentUsername, questionId, answerValue, newTimestamp, reason)');
  });
});
