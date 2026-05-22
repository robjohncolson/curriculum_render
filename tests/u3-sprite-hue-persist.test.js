/**
 * tests/u3-sprite-hue-persist.test.js
 *
 * U3 -- structural tests for the roster-server hue-persist call added to
 * saveSpriteConfig() in index.html.  Frozen contract: LIVE_CLASSROOM_R3_BUILD.md
 * Section 7.
 *
 * Pure Node (no jsdom -- cr tests are environment:'node').  Source assertions
 * via text + Node `vm` for runtime behaviour, matching the dn2d-gradebook-feeder
 * test conventions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const ROOT  = resolve(__dirname, '..');
const INDEX = resolve(ROOT, 'index.html');

let html;
beforeAll(() => { html = readFileSync(INDEX, 'utf8'); });

// ---------------------------------------------------------------------------
// Helper: extract a named function's body from index.html source
// (copied verbatim from dn2d-gradebook-feeder.test.js -- stable util)
// ---------------------------------------------------------------------------

function fnBody(src, name) {
    const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
    const m = re.exec(src);
    if (!m) throw new Error('not found: ' + name);

    let i = src.indexOf('(', m.index);
    let paren = 0;
    for (; i < src.length; i++) {
        if (src[i] === '(') paren++;
        else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
    }

    let depth = 0;
    for (let j = src.indexOf('{', i); j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
    }
    throw new Error('unbalanced: ' + name);
}

// ---------------------------------------------------------------------------
// 1. Structural pins -- the PATCH call and its guards must be present
// ---------------------------------------------------------------------------

describe('U3 -- saveSpriteConfig hue persist (structural)', () => {
    let body;
    beforeAll(() => { body = fnBody(html, 'saveSpriteConfig'); });

    it('calls PATCH on the sprite-hue endpoint', () => {
        expect(body).toContain('/sprite-hue');
        expect(body).toContain("method: 'PATCH'");
    });

    it('uses window.ROSTER_SERVICE_URL as the base URL', () => {
        expect(body).toContain('window.ROSTER_SERVICE_URL');
    });

    it('gates on rosterClient.token() and rosterClient.studentId()', () => {
        expect(body).toMatch(/rosterClient\.token\s*\(/);
        expect(body).toMatch(/rosterClient\.studentId\s*\(/);
    });

    it('includes Authorization Bearer header', () => {
        expect(body).toContain('Authorization');
        expect(body).toContain('Bearer');
    });

    it('sends spriteHue in the JSON body', () => {
        expect(body).toMatch(/spriteHue/);
        expect(body).toMatch(/JSON\.stringify/);
    });

    it('attaches a .catch() to the fetch promise (best-effort rejected-promise guard)', () => {
        expect(body).toMatch(/\.catch\s*\(/);
    });

    it('wraps the entire roster call in try/catch (never blocks local save)', () => {
        // The try must come AFTER playerSprite.setHue (local save is first)
        const localSavePos = body.indexOf('playerSprite.setHue');
        const tryPos       = body.indexOf('try {', localSavePos);
        expect(localSavePos).toBeGreaterThan(-1);
        expect(tryPos).toBeGreaterThan(localSavePos);
    });

    it('localStorage lines and playerSprite.setHue are unchanged before the new block', () => {
        expect(body).toContain("localStorage.setItem('spritesEnabled', spritesEnabled.toString())");
        expect(body).toContain("localStorage.setItem('spriteColorHue', hue.toString())");
        expect(body).toContain('playerSprite.setHue(hue)');
    });
});

// ---------------------------------------------------------------------------
// 2. Runtime -- the roster write fires when a session exists
// ---------------------------------------------------------------------------

function makeSaveConfig({ token, studentId, base, fetchImpl } = {}) {
    const body = fnBody(html, 'saveSpriteConfig');

    const fetchCalls = [];
    const defaultFetch = (url, opts) => {
        fetchCalls.push({ url, opts });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };

    const store = new Map();
    const els   = new Map();
    const elFor = (id) => {
        if (!els.has(id)) {
            els.set(id, {
                id,
                value: '180',       // default hue slider value
                checked: true,      // default toggle
                style: {}
            });
        }
        return els.get(id);
    };

    const win = {
        ROSTER_SERVICE_URL: base !== undefined ? base : 'https://roster.example.com',
        rosterClient: {
            token:     () => (token     !== undefined ? token     : 'tok-abc'),
            studentId: () => (studentId !== undefined ? studentId : 'stu-42'),
        },
    };

    const sandbox = {
        window:    win,
        fetch:     fetchImpl || defaultFetch,
        document:  { getElementById: elFor },
        JSON:      JSON,
        localStorage: {
            setItem: (k, v) => store.set(k, v),
            getItem: k       => store.get(k) || null,
        },
        // Stubs for the rest of saveSpriteConfig (engine + modal)
        playerSprite:  { setHue: () => {} },
        canvasEngine:  null,
        closeSpriteConfigModal: () => {},
    };

    createContext(sandbox);
    runInContext(
        'this.run = function () { ' + body.replace(/^function saveSpriteConfig\s*\(\)\s*/, '') + ' };',
        sandbox
    );

    return { run: sandbox.run.bind(sandbox), fetchCalls, store, win, sandbox };
}

describe('U3 -- runtime: PATCH fires with a valid session', () => {
    it('fires PATCH with the correct URL, token, and spriteHue', async () => {
        const ctx = makeSaveConfig({ token: 'tok-abc', studentId: 'stu-42', base: 'https://roster.example.com' });
        ctx.run();
        // Allow the microtask queue to flush so the fire-and-forget fetch is invoked.
        await new Promise(r => setTimeout(r, 0));
        expect(ctx.fetchCalls).toHaveLength(1);
        const call = ctx.fetchCalls[0];
        expect(call.url).toBe('https://roster.example.com/roster/stu-42/sprite-hue');
        expect(call.opts.method).toBe('PATCH');
        expect(call.opts.headers['Authorization']).toBe('Bearer tok-abc');
        expect(JSON.parse(call.opts.body)).toEqual({ spriteHue: 180 });
    });

    it('does NOT fire PATCH when token() returns falsy', async () => {
        const ctx = makeSaveConfig({ token: null });
        ctx.run();
        await new Promise(r => setTimeout(r, 0));
        expect(ctx.fetchCalls).toHaveLength(0);
    });

    it('does NOT fire PATCH when studentId() returns falsy', async () => {
        const ctx = makeSaveConfig({ studentId: null });
        ctx.run();
        await new Promise(r => setTimeout(r, 0));
        expect(ctx.fetchCalls).toHaveLength(0);
    });

    it('does NOT fire PATCH when ROSTER_SERVICE_URL is falsy', async () => {
        const ctx = makeSaveConfig({ base: null });
        ctx.run();
        await new Promise(r => setTimeout(r, 0));
        expect(ctx.fetchCalls).toHaveLength(0);
    });

    it('does NOT fire PATCH when rosterClient is absent', async () => {
        const ctx = makeSaveConfig();
        ctx.sandbox.window.rosterClient = undefined;
        ctx.run();
        await new Promise(r => setTimeout(r, 0));
        expect(ctx.fetchCalls).toHaveLength(0);
    });
});

describe('U3 -- runtime: local save is NOT affected by roster errors', () => {
    it('localStorage write succeeds even when fetch throws synchronously', () => {
        const ctx = makeSaveConfig({
            fetchImpl: () => { throw new Error('network down'); }
        });
        // Must not throw
        expect(() => ctx.run()).not.toThrow();
        // Local save must have happened
        expect(ctx.store.get('spriteColorHue')).toBe('180');
        expect(ctx.store.get('spritesEnabled')).toBe('true');
    });

    it('localStorage write succeeds even when fetch returns a rejected promise', async () => {
        const ctx = makeSaveConfig({
            fetchImpl: () => Promise.reject(new Error('offline'))
        });
        expect(() => ctx.run()).not.toThrow();
        await new Promise(r => setTimeout(r, 0));
        expect(ctx.store.get('spriteColorHue')).toBe('180');
    });
});
