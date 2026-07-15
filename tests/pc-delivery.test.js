/**
 * pc-delivery.js adapter — PC26 figure rendering (PC_FIGURES_INTEGRATION_SPEC D1-a).
 * Loads the IIFE in a vm sandbox (the cr node/vm convention) and exercises
 * pc26ToCrQuestion: server-signed item.figures → attachments.image/images + choice
 * .image; and the array-visual collapse bug fix for the no-figure fallback.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(resolve(repo, 'js', 'pc-delivery.js'), 'utf8');

function loadAdapter() {
  const sandbox = {};
  createContext(sandbox); // sandbox becomes the context global → IIFE sets globalThis.PcDelivery
  runInContext(SRC, sandbox);
  return sandbox.PcDelivery.pc26ToCrQuestion;
}
const adapt = loadAdapter();

const mcq = (extra) => Object.assign({ id: 'X', type: 'multiple-choice', stem: 'Q', choices: { A: 'a', B: 'b', C: 'c', D: 'd' } }, extra);
const figCount = (s) => (s.match(/\[Figure:/g) || []).length;

describe('pc26ToCrQuestion — server-signed figures', () => {
  it('single stem figure → attachments.image, no placeholder', () => {
    const q = adapt(mcq({ figures: { stems: ['https://s/0.png'], choices: {} } }));
    expect(q.attachments.image).toBe('https://s/0.png');
    expect(q.attachments.images).toBeUndefined();
    expect(q.prompt).not.toContain('[Figure');
  });

  it('multiple stem figures → attachments.images array in slot order', () => {
    const q = adapt(mcq({ visual: [{ kind: 'histogram' }, { kind: 'histogram' }], figures: { stems: ['u0', 'u1'], choices: {} } }));
    expect(q.attachments.images).toEqual(['u0', 'u1']);
    expect(q.attachments.image).toBeUndefined();
    expect(q.prompt).not.toContain('[Figure'); // figures win over the visual fallback
  });

  it('figure choices → each choice carries .image, value kept as fallback', () => {
    const q = adapt(mcq({ figures: { stems: [], choices: { A: 'uA', B: 'uB', C: 'uC', D: 'uD' } } }));
    const byKey = Object.fromEntries(q.attachments.choices.map((c) => [c.key, c.image]));
    expect(byKey).toEqual({ A: 'uA', B: 'uB', C: 'uC', D: 'uD' });
    expect(q.attachments.choices[0].value).toBe('a');
  });

  it('FRQ with a stem figure → attachments.image (figures apply before the FRQ split)', () => {
    const q = adapt({ id: 'X', type: 'free-response', questionParts: [{ label: 'a', prompt: 'do' }], figures: { stems: ['uF'], choices: {} } });
    expect(q.type).toBe('free-response');
    expect(q.attachments.image).toBe('uF');
  });
});

describe('pc26ToCrQuestion — no-figure fallback (older cache / env unset)', () => {
  it('ARRAY visual gets ONE placeholder PER figure (array-collapse bug fixed)', () => {
    const q = adapt(mcq({ visual: [{ kind: 'histogram', source: 'p1.png' }, { kind: 'histogram', source: 'p2.png' }] }));
    expect(figCount(q.prompt)).toBe(2); // was 1 (collapsed to a single '[Figure: visual]') before
  });

  it('single object visual → one placeholder (unchanged)', () => {
    const q = adapt(mcq({ visual: { kind: 'scatterplot', source: 'p.png' } }));
    expect(q.prompt).toContain('[Figure: scatterplot — p.png]');
  });

  it('native table (v.data) still renders when there is no figure url', () => {
    const q = adapt(mcq({ visual: { kind: 'table', data: [['h'], ['1']] } }));
    expect(q.attachments.table).toEqual([['h'], ['1']]);
  });

  it('choices without a figure are untouched (no .image field)', () => {
    const q = adapt(mcq({}));
    expect(q.attachments.choices.every((c) => !('image' in c))).toBe(true);
  });
});
