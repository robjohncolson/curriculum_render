/**
 * CED2026_SINGLE_SOURCE_SPEC §1 + §4 — one crosswalk, vendored.
 *
 * follow-alongs/2026-crosswalk.json is the single source. Its sync script
 * (follow-alongs/scripts/sync-ced-crosswalk.mjs) copies it to every path in
 * VENDORED_COPIES below. The copies must stay byte-identical; when the sibling
 * repo is not checked out next to this one, the identity check is skipped.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, '../follow-alongs/2026-crosswalk.json');
const SOURCE_PRESENT = existsSync(SOURCE);

const VENDORED_COPIES = [
    'data/2026-crosswalk.json',             // quiz app (fetched by index.html)
    'railway-server/data/2026-crosswalk.json' // relay (AI grading framework header)
];

const crosswalk = JSON.parse(readFileSync(resolve(ROOT, 'data/2026-crosswalk.json'), 'utf8'));
const entries = Object.entries(crosswalk.map);

function bankOldKeys() {
    const source = readFileSync(resolve(ROOT, 'data/curriculum.js'), 'utf8');
    const keys = new Set();
    for (const match of source.matchAll(/"id":\s*"U(\d+)-L(\d+)-/g)) {
        keys.add(`${match[1]}.${match[2]}`);
    }
    return [...keys];
}

describe('vendored CED crosswalk is byte-identical to follow-alongs', () => {
    if (!SOURCE_PRESENT) {
        it.skip(`SKIPPED: sibling source ${SOURCE} not found — check out follow-alongs next to curriculum_render to run the identity check`, () => {});
        return;
    }

    const source = readFileSync(SOURCE);

    VENDORED_COPIES.forEach((copy) => {
        it(`${copy} matches follow-alongs/2026-crosswalk.json (run follow-alongs/scripts/sync-ced-crosswalk.mjs if not)`, () => {
            const path = resolve(ROOT, copy);
            expect(existsSync(path), `${copy} is missing`).toBe(true);
            expect(readFileSync(path).equals(source)).toBe(true);
        });
    });
});

describe('crosswalk shape: every lesson resolves to exactly one CED destination', () => {
    it('every core entry maps to exactly one CED topic in its own unit', () => {
        const topicOwners = new Map();

        entries.filter(([, entry]) => entry.status === 'core').forEach(([oldKey, entry]) => {
            expect(entry.newTopic, oldKey).toMatch(/^[1-5]\.\d{1,2}$/);
            expect(Number(entry.newTopic.split('.')[0]), oldKey).toBe(entry.newUnit);
            expect(String(entry.newLabel || '').trim(), oldKey).not.toBe('');
            expect(entry.bonusUnit, oldKey).toBe(null);

            // Old keys folded into one topic must agree on its label.
            const owner = topicOwners.get(entry.newTopic);
            if (owner) expect(entry.newLabel, `${oldKey} vs ${owner.oldKey}`).toBe(owner.newLabel);
            topicOwners.set(entry.newTopic, { oldKey, newLabel: entry.newLabel });
        });

        expect(topicOwners.size).toBeGreaterThan(0);
    });

    it('every bonus entry has no CED topic and names a bonus unit', () => {
        entries.filter(([, entry]) => entry.status === 'bonus').forEach(([oldKey, entry]) => {
            expect(entry.newTopic, oldKey).toBe(null);
            expect(entry.newUnit, oldKey).toBe(null);
            expect(entry.bonusUnit, oldKey).toBeGreaterThanOrEqual(1);
            expect(entry.bonusUnit, oldKey).toBeLessThanOrEqual(5);
        });
    });

    it('every entry is core or bonus — no third status for the label code to fall through', () => {
        entries.forEach(([oldKey, entry]) => {
            expect(['core', 'bonus'], oldKey).toContain(entry.status);
        });
    });

    it('every old lesson in the quiz bank has a crosswalk entry (no silent fallthrough to the old key)', () => {
        const missing = bankOldKeys().filter((oldKey) => !crosswalk.map[oldKey]);
        expect(missing).toEqual([]);
    });
});
