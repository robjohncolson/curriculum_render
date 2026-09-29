/**
 * QUIZ_FIRST_ANSWER_SPEC §2 — peers show reasoning, not letters, until the answer key is revealed.
 * Source pins on index.html (the peer renderers live inside the page's inline script).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
let html = '';
beforeAll(() => { html = readFileSync(resolve(ROOT, 'index.html'), 'utf8'); });

function fnSrc(name) {
  const m = new RegExp('(?:async )?function ' + name + '\\s*\\(').exec(html);
  if (!m) throw new Error('missing ' + name);
  let depth = 0;
  for (let i = html.indexOf('{', m.index); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

describe('peer letters hidden until the answer key is revealed', () => {
  it('one gate function decides reveal state', () => {
    const gate = fnSrc('answerKeyRevealedFor');
    expect(gate).toContain("document.getElementById(`answer-key-${questionId}`)");
    expect(gate).toContain("style.display === 'block'");
  });

  it('every peer letter is behind the gate (no unconditional "Answer:" or "→ Choice")', () => {
    const letterLines = html.split('\n').filter(l => l.includes('<strong>Answer:</strong> ${peer.choice || peer.response}'));
    expect(letterLines.length).toBe(3);                                    // the three peer-card renderers
    for (const line of letterLines) expect(line).toContain('answerKeyRevealedFor(questionId) ? `');   // each one gated
    expect(html).not.toMatch(/→ Choice \$\{c\.choice\}<\/span>/);           // the old unconditional contributor form is gone
    expect((html.match(/answerKeyRevealedFor\(questionId\)/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('the MCQ distribution chart and consensus line wait for the key', () => {
    const fn = fnSrc('renderMCQDistribution');
    expect(fn.indexOf('answerKeyRevealedFor(questionId)')).toBeGreaterThan(0);
    expect(fn.indexOf('answerKeyRevealedFor(questionId)')).toBeLessThan(fn.indexOf('const choiceCounts'));
    expect(fn).toContain('Class results unlock with the answer key');
  });

  it('revealing the key re-renders the peer panel and the chart', () => {
    const fn = fnSrc('_refreshAfterReveal');
    expect(fn).toContain('renderMCQDistribution(questionId)');
    expect(fn).toContain('populatePeerReasoningSection(questionId)');
    // every timer/immediate reveal site calls it
    const reveals = html.match(/answerKeySection\.style\.display = 'block';\s*\n\s*_refreshAfterReveal\(questionId\);/g) || [];
    expect(reveals.length).toBeGreaterThanOrEqual(5);
  });
});
