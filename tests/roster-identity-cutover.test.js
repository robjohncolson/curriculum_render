// roster-identity-cutover.test.js -- pins the hard cutover to a single,
// roster-only identity in curriculum_render. The roster account (shared
// apstats_roster.v1, same origin as the Roadmap) is the only way in; the
// legacy manual / random / dropdown consensusUsername onboarding is retired.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = readFileSync(resolve(repo, 'js/auth.js'), 'utf8');
const INDEX = readFileSync(resolve(repo, 'index.html'), 'utf8');

// promptUsername's body, sliced precisely (ends at the LEGACY comment block).
const promptIdx = AUTH.indexOf('async function promptUsername');
const promptBody = AUTH.slice(promptIdx, AUTH.indexOf('LEGACY:', promptIdx));

describe('roster-only identity cutover', () => {
  it('promptUsername is roster-first: reads the shared roster session and adopts it', () => {
    expect(promptIdx).toBeGreaterThan(-1);
    expect(promptBody).toMatch(/rosterClient\.current\s*\(/);
    expect(promptBody).toMatch(/acceptUsername\s*\(\s*roster\.username\s*\)/);
    expect(promptBody).toMatch(/showRosterSignIn\s*\(/);
  });

  it('promptUsername no longer falls back to the manual welcome/picker', () => {
    expect(promptBody).not.toMatch(/showWelcomeScreen\s*\(/);
    expect(promptBody).not.toMatch(/showUsernamePrompt\s*\(/);
    // The legacy consensusUsername-from-localStorage adoption is gone from the entry.
    expect(promptBody).not.toMatch(/getItem\(\s*['"]consensusUsername['"]\s*\)/);
  });

  it('showRosterSignIn signs in via the roster and adopts the roster username', () => {
    expect(AUTH).toMatch(/showRosterSignIn\s*=\s*function/);
    const fn = AUTH.slice(AUTH.indexOf('showRosterSignIn = function'));
    expect(fn).toMatch(/rosterClient\.signIn\s*\(/);
    expect(fn).toMatch(/acceptUsername\s*\(\s*result\.username\b/);
  });

  it('showWelcomeScreen is neutered: any legacy caller is routed to roster sign-in', () => {
    // Defense-in-depth: the manual welcome is the gateway to every manual
    // sub-flow (new-student / returning / dropdown / random username). It now
    // redirects to showRosterSignIn at the top, so none of them are reachable.
    const idx = AUTH.indexOf('async function showWelcomeScreen');
    const head = AUTH.slice(idx, idx + 700);
    expect(head).toMatch(/return showRosterSignIn\s*\(\s*\)/);
  });

  it('"Switch user" routes to the roster sign-in, not the manual welcome', () => {
    const start = INDEX.indexOf('function showUserSelectScreen');
    const fn = INDEX.slice(start, start + 1200);
    expect(fn).toMatch(/showRosterSignIn\s*\(/);
  });
});
