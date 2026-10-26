/**
 * QUIZ_RETRY_REMOVAL_SPEC (teacher 2026-10-26): one answer per multiple-choice question; the first
 * answer is the grade and settles the item. Nothing from classmates (cards, letters, chart,
 * consensus, key) until the item is settled; only classmates who explained get a card
 * (QUIZ_FIRST_ANSWER_SPEC v2, whose retry is removed).
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

  it('an answered MCQ is settled: the first answer is the grade, no retry state exists', () => {
    const fn = fnSrc('quizSettledFor');
    expect(fn).toContain('if (_quizIsFrq(questionId)) return true;');
    expect(fn).toContain('return isQuestionAnswered(questionId);');
    for (const gone of ['canRetry', '_quizRetryState', '_saveQuizRetryState', '_quizRetryStatus', '_quizEffectiveAttempts',
      'firstAnswerWasCorrect', '_quizRetryUnknown', '_quizRetryPicks', '_quizRetryFirstLetter', '_quizRetrySubmitReady',
      '_settleQuizRetry', '_revertRefusedRetry', '_applyAcceptedRetry', '_quizRetryOwner', '_sayWrongRetryRecorded',
      '_quizRetrySentText', '_sayKeptFirstAnswerStands', '_reportLedgerOutcome', '_trackQuizWrite']) {
      expect(html, gone).not.toMatch(new RegExp('function ' + gone + '\\s*\\('));
    }
    expect(html).not.toContain('quizRetryState_');
    expect(html).not.toMatch(/QUIZ_RETRY_[A-Z_]+ =/);
    expect(html).not.toContain('half credit if correct');
  });

  it('"Talk it through" sends at 3+ words with a letter or digit', () => {
    expect(fnSrc('talkReasoningReady')).toContain('/[\\p{L}\\p{N}]/u');
  });
});

describe('surfaces behind the gate', () => {
  it('the MCQ distribution chart and consensus line wait until settled', () => {
    const fn = fnSrc('renderMCQDistribution');
    expect(fn.indexOf('quizSettledFor(questionId)')).toBeGreaterThan(0);
    expect(fn.indexOf('quizSettledFor(questionId)')).toBeLessThan(fn.indexOf('const choiceCounts'));
    expect(fn).toContain('QUIZ_PEERS_LOCKED_TEXT');
    expect(html).toContain("var QUIZ_PEERS_LOCKED_TEXT = 'Answer to see what classmates wrote.';");
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

describe('the one-answer form + the ledger write', () => {
  it('two modes, first and settled; the first-answer hint per spec', () => {
    const fn = fnSrc('_quizFormState');
    expect(fn).toContain("mode: 'first'");
    expect(fn).toContain("mode: 'settled'");
    expect(fn).not.toMatch(/mode: '(retry|pending|checking)'/);
    expect(fn).toContain("'Optional: say why, in your own words. It protects you from a mis-click.'");
    expect(html).toContain("'This answer is your grade.'");
  });

  it('typing or a new pick only voids a card or a pending read', () => {
    expect(html).toContain("document.addEventListener('input', _onQuizReasonInput);");
    expect(fnSrc('_onQuizReasonInput')).not.toContain('button.disabled');
    expect(fnSrc('_onQuizChoiceChange')).not.toContain('_paintQuizSubmitButton');
  });

  it('the dead "Add Explanation to Retry" path is gone', () => {
    expect(html).not.toContain('addExplanationToRetry');
    expect(html).not.toContain('Add Reasoning to Retry');
  });

  it('every quiz write is attempt 1 with the reasoning; a replayed retry outcome repaints from the ledger', () => {
    const feeder = fnSrc('recordToGradebookLedger');
    expect(feeder).toContain('attempt: 1');
    expect(feeder).not.toContain('ledgerOpts.attempt');
    expect(feeder).toContain('rec.reasoning = ledgerOpts.reasoning.trim();');
    expect(html).toContain("window.addEventListener('gradebook:quiz-retry-outcome'");
    expect(html).toContain("var QUIZ_RETRIES_CLOSED_TEXT = 'Retries have closed; your first answer stands.';");
  });

  it('the submit and Share My Reasoning pass the reasoning to Railway', () => {
    expect(html).toContain('window.submitAnswerViaRailway(currentUsername, questionId, value, timestampNow, isFRQ ? undefined : reason)');
    expect(html).toContain('window.submitAnswerViaRailway(currentUsername, questionId, answerValue, newTimestamp, reason)');
  });
});
