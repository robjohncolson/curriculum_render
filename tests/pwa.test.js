/**
 * cr PWA tests (OFFLINE_MODE_SPEC §4.G mirror): manifest, the SW cache strategy
 * (extracted + executed), SW contracts, register guards, and the build lockstep.
 * Node env — plain vm sandboxes (no jsdom).
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const ROOT = resolve(__dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');
const SW = read('sw.js');
const REG = read('pwa-register.js');
const INDEX = read('index.html');

function extractFn(src, name) {
  const s = src.indexOf('function ' + name);
  const o = src.indexOf('{', s);
  let d = 0;
  for (let i = o; i < src.length; i += 1) { if (src[i] === '{') d += 1; else if (src[i] === '}') { d -= 1; if (d === 0) return src.slice(s, i + 1); } }
  throw new Error('no ' + name);
}

describe('cr manifest.webmanifest', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  it('is valid + installable, start_url=index.html', () => {
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe('index.html');
    expect(m.scope).toBe('./');
    expect(m.display).toBe('standalone');
    expect(m.icons[0]).toMatchObject({ src: 'icon.svg', type: 'image/svg+xml' });
  });
});

describe('cr sw.js cacheStrategyFor', () => {
  const cacheStrategyFor = new Function(extractFn(SW, 'cacheStrategyFor') + '\nreturn cacheStrategyFor;')();
  const ORIGIN = 'https://robjohncolson.github.io';
  const req = (over = {}) => ({ method: 'GET', url: ORIGIN + '/curriculum_render/js/x.js', mode: 'cors', headers: { get: () => '' }, ...over });

  it('same-origin asset → asset; navigation → navigate', () => {
    expect(cacheStrategyFor(req(), ORIGIN)).toBe('asset');
    expect(cacheStrategyFor(req({ mode: 'navigate' }), ORIGIN)).toBe('navigate');
  });
  it('non-GET, cross-origin API, and version.json → passthrough', () => {
    expect(cacheStrategyFor(req({ method: 'POST' }), ORIGIN)).toBe('passthrough');
    expect(cacheStrategyFor(req({ url: 'https://roster-production-12c1.up.railway.app/ledger/record' }), ORIGIN)).toBe('passthrough');
    expect(cacheStrategyFor(req({ url: ORIGIN + '/curriculum_render/version.json' }), ORIGIN)).toBe('passthrough');
  });
});

describe('cr sw.js contracts', () => {
  it('uses a DISTINCT cache prefix (shared github.io origin with the Desk SW)', () => {
    expect(SW).toContain("'apstats-quiz-pwa-'");
    expect(SW).not.toContain("'apstats-pwa-'"); // must not collide with / purge the Desk cache
    expect(SW).toContain('self.skipWaiting()');
    expect(SW).toContain('self.clients.claim()');
  });
  it('navigations network-first + background-sync drain + kill switch', () => {
    expect(SW).toMatch(/strat === 'navigate'/);
    expect(SW).toContain("type: 'drain-offline-queue'");
    expect(SW).toMatch(/KILL SWITCH/i);
  });
});

describe('cr pwa-register.js', () => {
  function boot(protocol = 'https:') {
    const winL = {}; const swL = {};
    const reg = { sync: { register: vi.fn().mockResolvedValue(undefined) } };
    const sw = { register: vi.fn().mockResolvedValue(reg), ready: Promise.resolve(reg), addEventListener: (t, fn) => { swL[t] = fn; } };
    const win = {
      location: { protocol },
      navigator: { serviceWorker: sw },
      addEventListener: (t, fn) => { winL[t] = fn; },
      gradebookClient: { syncOfflineQueue: vi.fn() },
    };
    win.window = win; win.globalThis = win;
    runInContext(REG, createContext(win));
    return { win, sw, winL, swL };
  }

  it('registers sw.js on load (secure origin)', async () => {
    const { sw, winL } = boot();
    expect(typeof winL.load).toBe('function');
    winL.load();
    await Promise.resolve();
    expect(sw.register).toHaveBeenCalledWith('sw.js');
  });

  it('does NOT register on file://', () => {
    const { sw, winL } = boot('file:');
    expect(winL.load).toBeUndefined();
    expect(sw.register).not.toHaveBeenCalled();
  });

  it('drains the queue when the SW posts drain-offline-queue', () => {
    const { win, swL } = boot();
    swL.message({ data: { type: 'drain-offline-queue' } });
    expect(win.gradebookClient.syncOfflineQueue).toHaveBeenCalled();
  });
});

describe('cr index.html wiring + build lockstep', () => {
  it('links manifest/icon/theme + loads pwa-register.js', () => {
    expect(INDEX).toContain('rel="manifest" href="manifest.webmanifest"');
    expect(INDEX).toContain('name="theme-color"');
    expect(INDEX).toContain('src="pwa-register.js"');
  });
  it('sw BUILD === version.json build === version-check APP_BUILD', () => {
    const swB = (SW.match(/const BUILD = '([^']+)'/) || [])[1];
    const verB = JSON.parse(read('version.json')).build;
    const appB = (read('version-check.js').match(/var APP_BUILD = '([^']+)'/) || [])[1];
    expect(swB).toBe(verB);
    expect(appB).toBe(verB);
  });
});
