// review-comment.test.js — POST /api/ai/review-comment (Nightly Review v2).
// The Desk's 🌙 Nightly Review taps ✨ Draft → this endpoint returns a ONE-LINE
// (≤180 char) teacher comment on a free response, or one SHARED comment for a
// ≤5-answer cluster. Follows the repo's AI-endpoint test convention: static
// source pins on railway-server/server.js + extract-and-run the pure helpers.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SERVER = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'railway-server', 'server.js'),
  'utf8'
);

// The review-comment block: from its banner to the next section banner.
const blockStart = SERVER.indexOf('NIGHTLY REVIEW COMMENT DRAFTER');
const blockEnd = SERVER.indexOf('IDENTITY CLAIM RESOLUTION', blockStart);
const BLOCK = SERVER.slice(blockStart, blockEnd);

describe('endpoint registration + gates', () => {
  it('registers POST /api/ai/review-comment', () => {
    expect(SERVER).toContain("app.post('/api/ai/review-comment'");
  });

  it('400s without a response and 503s without AI providers', () => {
    expect(BLOCK).toContain("res.status(400).json({ error: 'response (or answers[]) is required' })");
    expect(BLOCK).toContain('if (!AI_AVAILABLE)');
    expect(BLOCK).toContain("res.status(503).json({ error: 'AI service not configured' })");
  });

  it('rides the shared grading queue with free-form (non-JSON) low-temp opts', () => {
    expect(BLOCK).toContain('gradingQueue.add((provider) => callAI(null, provider,');
    expect(BLOCK).toContain('temperature: 0.4');
    expect(BLOCK).toContain('maxTokens: 120');
    expect(BLOCK).toContain('skipJsonFormat: true');
    expect(BLOCK).toContain('rawResponse: true');
  });
});

describe('privacy envelope (NIGHTLY_REVIEW_V2_SPEC.md §0.2–0.3)', () => {
  it('the endpoint block reads NO structured identifiers from the request', () => {
    // The guarantee is on the ENVELOPE: the handler must never touch a name,
    // student id, or username field. (Answer TEXT may contain a typed name —
    // that is covered by the system-prompt rule below, not this pin.)
    // Assert against comment-stripped CODE (the block's privacy comment
    // legitimately names the fields it promises not to read).
    const CODE = BLOCK.replace(/^\s*\/\/.*$/gm, '');
    expect(CODE).not.toContain('studentId');
    expect(CODE).not.toContain('student_id');
    expect(CODE).not.toContain('realName');
    expect(CODE).not.toContain('real_name');
    expect(CODE).not.toContain('username');
    expect(CODE).not.toContain('ledgerId');
  });

  it('the system prompt orders the model to ignore + never repeat names', () => {
    expect(BLOCK).toContain('ignore them and never repeat them');
  });

  it('cluster batches are capped at 5 answers with no per-answer labels', () => {
    expect(BLOCK).toContain('REVIEW_COMMENT_MAX_ANSWERS = 5');
    expect(BLOCK).toContain('Never reference "answer 1"');
  });
});

describe('system prompt shape', () => {
  it('demands one warm, actionable, second-person line with no grade talk', () => {
    expect(BLOCK).toContain('REVIEW_COMMENT_MAX_CHARS = 180');
    expect(BLOCK).toContain('exactly one concrete next step');
    expect(BLOCK).toContain('No grade, no score, no preamble');
    expect(BLOCK).toContain('comment text ONLY');
  });
});

// ── extract-and-run the pure helpers ─────────────────────────────────────────
const helperSrc = BLOCK.slice(
  BLOCK.indexOf('const REVIEW_COMMENT_MAX_CHARS'),
  BLOCK.indexOf("app.post('/api/ai/review-comment'")
);
const helpers = new Function(
  helperSrc + '\nreturn { normalizeReviewAnswers, buildReviewCommentUserMessage, clampReviewComment };'
)();

describe('normalizeReviewAnswers', () => {
  it('wraps a single response, accepts an answers[] cluster, and caps at 5', () => {
    expect(helpers.normalizeReviewAnswers({ response: 'my answer' })).toEqual(['my answer']);
    expect(helpers.normalizeReviewAnswers({ answers: ['a', 'b', 'c'] })).toEqual(['a', 'b', 'c']);
    expect(helpers.normalizeReviewAnswers({ answers: ['1', '2', '3', '4', '5', '6', '7', '8'] }).length).toBe(5);
  });

  it('drops empties, stringifies non-strings, and clips giant answers', () => {
    expect(helpers.normalizeReviewAnswers({ answers: ['', '  ', 'real'] })).toEqual(['real']);
    expect(helpers.normalizeReviewAnswers({ response: 42 })).toEqual(['42']);
    expect(helpers.normalizeReviewAnswers({})).toEqual([]);
    const clipped = helpers.normalizeReviewAnswers({ response: 'x'.repeat(5000) })[0];
    expect(clipped.length).toBe(1201); // 1200 + ellipsis
  });
});

describe('buildReviewCommentUserMessage', () => {
  it('single answer: context lines + one unlabeled quoted block, no identifiers', () => {
    const msg = helpers.buildReviewCommentUserMessage({
      answers: ['the CLT needs n at least 30'],
      score: 0.5, source: 'frq', topic: 'U5 sampling dist', question: 'Why normal?'
    });
    expect(msg).toContain('Topic: U5 sampling dist');
    expect(msg).toContain('Work type: frq');
    expect(msg).toContain('Question: Why normal?');
    expect(msg).toContain('Score already given (do not mention it): 0.5');
    expect(msg).toContain('the CLT needs n at least 30');
    expect(msg).not.toMatch(/student\s*(id|name)/i);
  });

  it('cluster: announces N answers for ONE shared comment, without numbering them', () => {
    const msg = helpers.buildReviewCommentUserMessage({ answers: ['a1', 'a2', 'a3'] });
    expect(msg).toContain('3 student answers to the same item (write ONE shared comment):');
    expect(msg).not.toMatch(/answer\s*1\s*:/i);
    expect(msg).not.toMatch(/student\s*1/i);
  });

  it('omits absent context lines and non-numeric scores', () => {
    const msg = helpers.buildReviewCommentUserMessage({ answers: ['a'], score: 'E' });
    expect(msg).not.toContain('Topic:');
    expect(msg).not.toContain('Score already given');
  });
});

describe('clampReviewComment', () => {
  it('strips wrapping quotes and collapses to one line', () => {
    expect(helpers.clampReviewComment('"Nice start — now name the parameter."'))
      .toBe('Nice start — now name the parameter.');
    expect(helpers.clampReviewComment('“Smart quotes too.”')).toBe('Smart quotes too.');
    expect(helpers.clampReviewComment('Line one.\n\nLine two.')).toBe('Line one. Line two.');
  });

  it('clamps to 180 chars with an ellipsis and passes empties through', () => {
    const long = helpers.clampReviewComment('y'.repeat(400));
    expect(long.length).toBe(180);
    expect(long.endsWith('…')).toBe(true);
    expect(helpers.clampReviewComment('')).toBe('');
    expect(helpers.clampReviewComment(null)).toBe('');
    expect(helpers.clampReviewComment('short')).toBe('short');
  });
});
