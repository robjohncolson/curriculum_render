/**
 * tests/u3-sprite-hue-crossdevice.test.js
 *
 * Cross-device companion to the roster-session hue sync. The roster session
 * caches spriteHue only as of sign-in, so a color picked on ANOTHER device (or
 * changed on the Desk) never reaches this device without a re-sign-in.
 * reconcileSpriteHueFromServer() (index.html) GETs the authoritative
 * roster.sprite_hue on load and converges the session + local store + live
 * sprite when it differs. Best-effort: never blocks load, never throws.
 *
 * Pure Node (cr tests are environment:'node'): source pins + extract the
 * function body and run it in a vm, matching the u3-sprite-hue-persist.test.js
 * conventions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const INDEX = resolve(__dirname, '..', 'index.html');
let html;
beforeAll(() => { html = readFileSync(INDEX, 'utf8'); });

// fnBody: extract a named function's body from source.
// (copied verbatim from u3-sprite-hue-persist.test.js -- stable util)
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

// Build a runnable reconcileSpriteHueFromServer() in a vm with stubbed globals.
function makeReconcile({
    token = 'tok-abc',
    studentId = 'stu-42',
    base = 'https://roster.example.com',
    sessionHue = 200,
    fetchImpl,
    hasUpdateSpriteHue = true,
} = {}) {
    const body = fnBody(html, 'reconcileSpriteHueFromServer');

    const calls = { fetch: [], updateSpriteHue: [], setHue: [], localStorage: [] };
    const session = { spriteHue: sessionHue };

    const rosterClient = {
        token:     () => token,
        studentId: () => studentId,
        current:   () => session,
    };
    if (hasUpdateSpriteHue) {
        rosterClient.updateSpriteHue = (h) => { calls.updateSpriteHue.push(h); session.spriteHue = h; return true; };
    }

    const defaultFetch = (url, opts) => {
        calls.fetch.push({ url, opts });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, spriteHue: 30 }) });
    };

    const win = { ROSTER_SERVICE_URL: base, rosterClient };
    const sandbox = {
        window: win,
        fetch: fetchImpl || defaultFetch,
        JSON,
        console,
        localStorage: { setItem: (k, v) => calls.localStorage.push([k, v]) },
        playerSprite: { setHue: (h) => calls.setHue.push(h) },
    };

    createContext(sandbox);
    runInContext('this.run = ' + body.replace(/^async\s+function\s+reconcileSpriteHueFromServer\s*\(\)\s*/, 'async function () ') + ';', sandbox);
    return { run: sandbox.run, calls, win, sandbox };
}

// ---------------------------------------------------------------------------
// 1. Structural pins
// ---------------------------------------------------------------------------

describe('reconcileSpriteHueFromServer (structural)', () => {
    let body;
    beforeAll(() => { body = fnBody(html, 'reconcileSpriteHueFromServer'); });

    it('GETs the sprite-hue endpoint with a Bearer token', () => {
        expect(body).toContain('/sprite-hue');
        expect(body).toMatch(/method:\s*'GET'/);
        expect(body).toContain('Bearer');
    });

    it('gates on token(), studentId(), and ROSTER_SERVICE_URL', () => {
        expect(body).toMatch(/rosterClient\.token\s*\(/);
        expect(body).toMatch(/rosterClient\.studentId\s*\(/);
        expect(body).toContain('ROSTER_SERVICE_URL');
    });

    it('only reconciles a numeric hue and skips when already in sync', () => {
        expect(body).toMatch(/typeof\s+data\.spriteHue\s*!==\s*'number'/);
        expect(body).toMatch(/current\.spriteHue\s*===\s*serverHue/);
    });

    it('converges session + localStorage + live sprite', () => {
        expect(body).toMatch(/rosterClient\.updateSpriteHue\s*\(\s*serverHue\s*\)/);
        expect(body).toMatch(/localStorage\.setItem\(\s*'spriteColorHue'/);
        expect(body).toMatch(/playerSprite\.setHue\s*\(\s*serverHue\s*\)/);
    });

    it('is wrapped so it never throws / blocks load', () => {
        expect(body).toMatch(/try\s*\{[\s\S]*\}\s*catch/);
    });

    it('is invoked from the sprite init path', () => {
        expect(html).toMatch(/reconcileSpriteHueFromServer\s*\(\s*\)\s*;/);
    });
});

// ---------------------------------------------------------------------------
// 2. Runtime behavior
// ---------------------------------------------------------------------------

describe('reconcileSpriteHueFromServer (runtime)', () => {
    it('applies a server hue that differs from the cached session', async () => {
        const ctx = makeReconcile({ sessionHue: 200 }); // server returns 30
        await ctx.run();
        expect(ctx.calls.fetch).toHaveLength(1);
        expect(ctx.calls.fetch[0].url).toBe('https://roster.example.com/roster/stu-42/sprite-hue');
        expect(ctx.calls.fetch[0].opts.headers['Authorization']).toBe('Bearer tok-abc');
        expect(ctx.calls.updateSpriteHue).toEqual([30]);
        expect(ctx.calls.setHue).toEqual([30]);
        expect(ctx.calls.localStorage).toContainEqual(['spriteColorHue', '30']);
    });

    it('no-ops when the server hue already matches the session (no writes)', async () => {
        const ctx = makeReconcile({
            sessionHue: 30,
            fetchImpl: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, spriteHue: 30 }) }),
        });
        await ctx.run();
        expect(ctx.calls.updateSpriteHue).toEqual([]);
        expect(ctx.calls.setHue).toEqual([]);
    });

    it('ignores a null server hue (does not clobber the local pick)', async () => {
        const ctx = makeReconcile({
            sessionHue: 200,
            fetchImpl: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, spriteHue: null }) }),
        });
        await ctx.run();
        expect(ctx.calls.updateSpriteHue).toEqual([]);
        expect(ctx.calls.setHue).toEqual([]);
    });

    it('no-ops (no fetch) when there is no token', async () => {
        const ctx = makeReconcile({ token: null });
        await ctx.run();
        expect(ctx.calls.fetch).toEqual([]);
    });

    it('no-ops when ROSTER_SERVICE_URL is unset', async () => {
        const ctx = makeReconcile({ base: '' });
        await ctx.run();
        expect(ctx.calls.fetch).toEqual([]);
    });

    it('swallows a non-ok response without throwing', async () => {
        const ctx = makeReconcile({
            fetchImpl: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
        });
        await expect(ctx.run()).resolves.toBeUndefined();
        expect(ctx.calls.updateSpriteHue).toEqual([]);
    });

    it('never throws when fetch rejects (offline / LAN)', async () => {
        const ctx = makeReconcile({ fetchImpl: () => Promise.reject(new Error('offline')) });
        await expect(ctx.run()).resolves.toBeUndefined();
        expect(ctx.calls.updateSpriteHue).toEqual([]);
    });

    it('still applies the hue locally even if rosterClient lacks updateSpriteHue (older shared file)', async () => {
        const ctx = makeReconcile({ sessionHue: 200, hasUpdateSpriteHue: false });
        await ctx.run();
        expect(ctx.calls.setHue).toEqual([30]);
        expect(ctx.calls.localStorage).toContainEqual(['spriteColorHue', '30']);
    });
});
