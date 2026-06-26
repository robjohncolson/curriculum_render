// no-guest-mode.test.js (curriculum_render) — GUESTS ARE RETIRED (2026-06-25).
// The quiz app requires a real roster sign-in; the presence server refuses any
// Guest_ identity. Mirrors the follow-alongs no-guest-mode contract test.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = readFileSync(resolve(repo, 'js/auth.js'), 'utf8');
const SERVER = readFileSync(resolve(repo, 'railway-server/server.js'), 'utf8');

describe('quiz app — no guest off-ramp, no guest minting', () => {
  it('the sign-in screen has no "Continue as guest" link', () => {
    expect(AUTH).not.toContain('Continue as guest');
    expect(AUTH).not.toContain('rs-guest');
  });
  it('acceptUsername never re-sets the cross-app guest flag', () => {
    expect(AUTH).not.toContain("setItem('apstats_guest_active'");
  });
});

describe('cr presence server — rejects Guest_ identities', () => {
  it('WS identify + classroom_join both reject /^Guest_/i before registering', () => {
    const rejects = (SERVER.match(/\/\^Guest_\/i\.test\(username\)\)\s*break;/g) || []).length;
    expect(rejects).toBeGreaterThanOrEqual(2);
  });
});
