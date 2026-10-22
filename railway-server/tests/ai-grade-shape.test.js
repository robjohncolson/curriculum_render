// POST /api/ai/grade and /api/ai/appeal body shapes (railway-server/grade-shape.js).
// Review 2026-10-22, "plausible": only `!scenario || !answers` was checked, so a scenario or
// answers of the wrong shape reached buildDefaultGradingPrompt / buildAppealPrompt /
// applyWrongMcqCap / getFrameworkForQuestion, and a TypeError there was a 500. These are the
// probes the review suspected: every one is a 400 string now, and every real client shape
// (quiz app, worksheets, grading engine) still passes.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { gradeBodyShapeError } from '../grade-shape.js';
import { applyWrongMcqCap } from '../receipts.js';

const here = dirname(fileURLToPath(import.meta.url));

const good = () => ({ scenario: { questionId: 'U1-L3-Q2', topic: 'AP Statistics' }, answers: { answer: 'the mean' }, prompt: 'rubric' });

describe('gradeBodyShapeError: the shapes the review suspected are 400s, never 500s', () => {
  it('scenario must be a plain object', () => {
    for (const scenario of [null, [], ['a'], 7, 'text', true]) {
      expect(gradeBodyShapeError({ ...good(), scenario })).toBe('scenario must be an object');
    }
  });

  it('answers must be a plain object of text values', () => {
    for (const answers of [null, [], ['a'], 7, 'text']) {
      expect(gradeBodyShapeError({ ...good(), answers })).toBe('answers must be an object');
    }
    for (const value of [{}, { toString: 'x' }, ['a'], { nested: { deep: 1 } }]) {
      expect(gradeBodyShapeError({ ...good(), answers: { answer: value } })).toBe('answers values must be text');
    }
  });

  it('a non-string questionId used to throw inside getFrameworkForQuestion (questionId.match)', () => {
    for (const questionId of [7, {}, ['U1-L3-Q2'], true]) {
      expect(gradeBodyShapeError({ ...good(), scenario: { questionId } })).toBe('scenario.questionId must be a string');
    }
  });

  it('nested objects where the MCQ cap and the prompt read text are refused', () => {
    for (const field of ['questionType', 'correctAnswer', 'prompt', 'topic', 'partId']) {
      for (const value of [{}, { toString: 'x' }, ['a']]) {
        expect(gradeBodyShapeError({ ...good(), scenario: { [field]: value } })).toBe('scenario.' + field + ' must be text');
      }
    }
    expect(gradeBodyShapeError({ ...good(), scenario: { expectedElements: 'not a list' } })).toBe('scenario.expectedElements must be a list of text');
    expect(gradeBodyShapeError({ ...good(), scenario: { expectedElements: [{ toString: 'x' }] } })).toBe('scenario.expectedElements must be a list of text');
    expect(gradeBodyShapeError({ ...good(), scenario: { choices: 'A, B' } })).toBe('scenario.choices must be a list');
    expect(gradeBodyShapeError({ ...good(), scenario: { choices: [null] } })).toBe('scenario.choices must be a list');
  });

  it('prompt and aiPromptTemplate must be strings when present (a number has no .replace)', () => {
    expect(gradeBodyShapeError({ ...good(), prompt: 7 })).toBe('prompt must be a string');
    expect(gradeBodyShapeError({ ...good(), prompt: { text: 'x' } })).toBe('prompt must be a string');
    expect(gradeBodyShapeError({ ...good(), aiPromptTemplate: 7 })).toBe('aiPromptTemplate must be a string');
    expect(gradeBodyShapeError({ ...good(), aiPromptTemplate: ['x'] })).toBe('aiPromptTemplate must be a string');
  });

  it('the appeal checks appealText and previousResults too', () => {
    expect(gradeBodyShapeError({ ...good(), appealText: 'I think' }, { appeal: true })).toBeNull();
    expect(gradeBodyShapeError({ ...good(), appealText: 7 }, { appeal: true })).toBe('appealText must be a string');
    expect(gradeBodyShapeError({ ...good(), appealText: ['x'] }, { appeal: true })).toBe('appealText must be a string');
    for (const previousResults of ['text', 7, ['x'], { answer: null }]) {
      expect(gradeBodyShapeError({ ...good(), appealText: 'I think', previousResults }, { appeal: true }))
        .toBe('previousResults must be an object of results');
    }
    // The grade route never looks at the appeal fields.
    expect(gradeBodyShapeError({ ...good(), appealText: 7, previousResults: 'x' })).toBeNull();
  });

  it('every real client shape passes: quiz app, worksheet (nested lessonContext), grading engine, appeal', () => {
    // index.html quiz MCQ
    expect(gradeBodyShapeError({
      username: 'alice',
      scenario: { questionId: 'U1-L3-Q2', topic: 'What is', prompt: 'What is the mean?', questionType: 'multiple-choice', correctAnswer: 'B', choices: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }] },
      answers: { answer: 'B' }, prompt: 'rubric', aiPromptTemplate: 'rubric',
    })).toBeNull();
    // a worksheet: nested lessonContext object, numbers and nulls elsewhere are fine
    expect(gradeBodyShapeError({
      scenario: { topic: 'AP Statistics - Topic 1.10', questionId: 'WS-U1L10-Q3', lessonContext: { summary: 'x', keyPoints: ['a'] }, correctAnswer: null, partId: 2 },
      answers: { answer: 'because' }, prompt: 'rubric',
    })).toBeNull();
    // grading-engine.js: expectedElements list, spread context, aiPromptTemplate undefined
    expect(gradeBodyShapeError({
      scenario: { topic: 'AP Statistics FRQ', questionId: 'q1', partId: 'a', expectedElements: ['names the parameter', 'states Ho'], rubric: [{ description: 'x' }] },
      answers: { a: 'Ho: p = 0.5' }, prompt: 'rubric', aiPromptTemplate: undefined,
    })).toBeNull();
    // the worksheet appeal: previousResults carries the previous verdict object
    expect(gradeBodyShapeError({
      scenario: { questionId: 'WS-U1L10-Q3', topic: 'AP Statistics', lessonContext: { summary: 'x' } },
      answers: { answer: 'because' }, appealText: 'I did say that', previousResults: { answer: { score: 'P', feedback: 'missing' } },
    }, { appeal: true })).toBeNull();
    // scenario with no questionId at all (grade-batch style) is fine
    expect(gradeBodyShapeError({ scenario: { topic: 'AP Statistics' }, answers: { answer: 'x' } })).toBeNull();
  });

  it('length is not a shape question: a 1 MB string passes here (the byte caps answer 413 first)', () => {
    const big = 'x'.repeat(1024 * 1024);
    expect(gradeBodyShapeError({ scenario: { questionId: 'q1', prompt: big }, answers: { answer: big }, prompt: big, aiPromptTemplate: big })).toBeNull();
    expect(gradeBodyShapeError({ ...good(), appealText: big, previousResults: { answer: big } }, { appeal: true })).toBeNull();
  });

  it('what the helper lets through cannot throw in applyWrongMcqCap', () => {
    const bodies = [
      { scenario: { questionType: 'multiple-choice', correctAnswer: 'B', questionId: 'q' }, answers: { answer: 'A' } },
      { scenario: { questionType: 'multiple-choice', correctAnswer: 2, questionId: 'q' }, answers: { answer: 2 } },
      { scenario: { questionType: 'multiple-choice', correctAnswer: true }, answers: { answer: null } },
      { scenario: { questionType: 'multiple-choice', correctAnswer: 'B' }, answers: {} },
      { scenario: { correctAnswer: 'B' }, answers: { other: 0 } },
    ];
    for (const body of bodies) {
      expect(gradeBodyShapeError(body)).toBeNull();
      expect(() => applyWrongMcqCap({ score: 'E' }, body.scenario, body.answers)).not.toThrow();
    }
    const capped = applyWrongMcqCap({ score: 'E' }, bodies[0].scenario, bodies[0].answers);
    expect(capped.score).toBe('P');
  });
});

describe('server.js wiring', () => {
  const source = readFileSync(resolve(here, '../server.js'), 'utf8');

  it('both routes run the shape check right after their existing missing-field 400, with the same error body style', () => {
    const grade = source.indexOf("app.post('/api/ai/grade',");
    const appeal = source.indexOf("app.post('/api/ai/appeal',");
    expect(grade).toBeGreaterThan(0);
    expect(appeal).toBeGreaterThan(grade);
    const gradeBody = source.slice(grade, source.indexOf('gradingQueue.add', grade));
    const appealBody = source.slice(appeal, source.indexOf('gradingQueue.add', appeal));
    expect(gradeBody).toMatch(/Missing scenario or answers[\s\S]*gradeBodyShapeError\(req\.body\);[\s\S]*res\.status\(400\)\.json\(\{ error: shapeError \}\)/);
    expect(appealBody).toMatch(/Missing scenario, answers, or appeal text[\s\S]*gradeBodyShapeError\(req\.body, \{ appeal: true \}\);[\s\S]*res\.status\(400\)\.json\(\{ error: shapeError \}\)/);
    expect(gradeBody.indexOf('gradeBodyShapeError')).toBeLessThan(gradeBody.indexOf('AI_AVAILABLE'));
    expect(appealBody.indexOf('gradeBodyShapeError')).toBeLessThan(appealBody.indexOf('AI_AVAILABLE'));
  });

  it('template placeholder keys are regex-escaped (a key like "(a)" used to throw SyntaxError, a 500)', () => {
    const start = source.indexOf('function buildDefaultGradingPrompt(');
    const body = source.slice(start, source.indexOf('// Default prompt', start));
    expect(body).toContain('escapeRegExp(key)');
    expect(body).not.toMatch(/\$\{key\}/);
    // The escape itself, run against the keys the clients can send.
    const escapeRegExp = key => String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(() => new RegExp('\\{\\{' + escapeRegExp('(a)') + 'Answer\\}\\}', 'g')).not.toThrow();
    expect('{{(a)Answer}}'.replace(new RegExp('\\{\\{' + escapeRegExp('(a)') + 'Answer\\}\\}', 'g'), 'x')).toBe('x');
    expect(() => new RegExp('\\{\\{' + '(a' + 'Answer\\}\\}', 'g')).toThrow();
  });
});
