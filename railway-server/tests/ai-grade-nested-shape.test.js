import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { gradeBodyShapeError } from '../grade-shape.js';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

// Execute the actual route and prompt builders without starting the production server.
function gradeRoute(path) {
  const routes = new Map();
  const context = {
    app: { post: (name, handler) => routes.set(name, handler) },
    gradeBodyShapeError,
    sidFromRequest: () => null,
    AI_AVAILABLE: true,
    getFrameworkForQuestion: () => null,
    buildFrameworkContext: () => '',
    legacyAppealRefusal: async () => null,
    gradingQueue: { getQueueLength: () => 0, add: vi.fn(async () => ({ score: 'E', feedback: 'correct' })) },
    applyWrongMcqCap: result => result,
    quizReviewCredit: () => 1,
    console: { log() {}, error() {} },
  };
  // These markers are independent of CRLF in the checked-out source.
  const builderStart = source.indexOf('function buildDefaultGradingPrompt(');
  const builderEnd = source.indexOf('// AI APPEAL ENDPOINT', builderStart);
  const appealStart = source.indexOf("app.post('/api/ai/appeal',");
  const appealEnd = source.indexOf('// Build appeal prompt', appealStart);
  const promptStart = source.indexOf('function buildAppealPrompt(');
  const promptEnd = source.indexOf('// "TALK IT THROUGH"', promptStart);
  const gradeEnd = source.indexOf('function buildBatchGradingPrompt(', source.indexOf("app.post('/api/ai/grade',"));
  runInNewContext(
    source.slice(source.indexOf("app.post('/api/ai/grade',"), gradeEnd) +
    source.slice(builderStart, builderEnd) +
    source.slice(appealStart, appealEnd) +
    source.slice(promptStart, promptEnd), context,
  );
  return { handler: routes.get(path), queue: context.gradingQueue.add };
}

const poisonedText = () => ({ toString: 'not a function' });
const base = () => ({ scenario: { questionId: 'q1' }, answers: { answer: 'mean' } });

describe('AI shape validation covers the nested values used by real prompt builders', () => {
  it.each([
    ['template scenario value', '/api/ai/grade', () => ({ ...base(), scenario: { questionId: 'q1', lessonContext: poisonedText() }, aiPromptTemplate: '{{lessonContext}}' })],
    ['appeal choice text', '/api/ai/appeal', () => ({ ...base(), scenario: { questionId: 'q1', choices: [{ key: 'A', text: poisonedText() }] }, appealText: 'Please reconsider' })],
    ['appeal previous score', '/api/ai/appeal', () => ({ ...base(), appealText: 'Please reconsider', previousResults: { answer: { score: poisonedText() } } })],
    ['appeal previous feedback', '/api/ai/appeal', () => ({ ...base(), appealText: 'Please reconsider', previousResults: { answer: { feedback: poisonedText() } } })],
  ])('%s returns 400 rather than 500', async (_name, path, body) => {
    const { handler, queue } = gradeRoute(path);
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ body: JSON.parse(JSON.stringify(body())) }, response);
    expect(response.statusCode, response.body.error).toBe(400);
    expect(typeof response.body.error).toBe('string');
    expect(queue).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/ai/grade', { ...base(), scenario: { questionId: 'q1', lessonContext: { summary: 'normal context' } }, aiPromptTemplate: '{{lessonContext}}' }],
    ['/api/ai/appeal', { ...base(), scenario: { questionId: 'q1', choices: [{ key: 'A', text: 'normal choice' }] }, appealText: 'Please reconsider', previousResults: { answer: { score: 'P', feedback: 'normal feedback' } } }],
  ])('%s still accepts normal nested client values', async (path, body) => {
    const { handler, queue } = gradeRoute(path);
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ body }, response);
    expect(response.statusCode, response.body.error).toBe(200);
    expect(queue).toHaveBeenCalledOnce();
  });
});
