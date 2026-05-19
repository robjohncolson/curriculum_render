# DN2d Build — curriculum_render quiz answer-submit gradebook feeder + roster sign-in

**Frozen contract** (planner, 2026-05-18, session 100). Status: IMPLEMENTED + Codex-reviewed (1 MAJOR + 1 MINOR fixed — see §Codex review).
Sprint **DN2d** of follow-alongs `DESK_DONOW_SPEC.md` §4.1 / decision D2 — the
**curriculum_render quiz** half of "wire `gradebookClient.record` so the ledger
is actually populated". Worksheet half = DN2a/DN2b (shipped, follow-alongs).
Desk identity = DN2c (shipped, follow-alongs `820c79f`).

**This work lives in the SEPARATE `curriculum_render` repo**
(`github.com/robjohncolson/curriculum_render`, branch `main`). Its commits do
NOT republish the follow-alongs GH Pages site. **`data/curriculum.js` is
SACRED — never read-for-edit, never write** (AP Classroom bank). DN2d does not
even need to read it: the runtime `questionId` already carries the id.

## Why the full scope (user-chosen 2026-05-18)

cr is a **different origin** → it cannot inherit the Desk's roster session
(`localStorage['apstats_roster.v1']` is per-origin). A feeder alone would be
inert. User chose "Feeder + cr roster sign-in": add an additive roster identity
surface in cr so the feeder actually fires.

## Decisive recon facts

- Hook point: `index.html:10751 saveAnswerWithTracking(questionId, answer, options)`
  — app-level submit, guarded by `currentUsername`, has id + answer.
- **Integration risk RESOLVED by construction:** all 817 cr `curriculum.js`
  question ids exist verbatim as skill-map/manifest keys (0 missing). Feeder
  passes `questionId` straight through as `itemId` — zero mapping.
- cr identity = its own 985-line `js/auth.js` onboarding keyed on
  `currentUsername` / `localStorage.consensusUsername` (drives peer/sync/sprite/
  progress). **DN2d must be ADDITIVE — never rework that flow.**
- cr `fab-menu` (index.html:134) is cr's idiomatic app-action menu — the
  additive home for the roster entry.
- cr index.html = LF. cr tests = vitest, `tests/**/*.test.{js,ts}`.

## Scope — `curriculum_render` only

### A. Shared clients (copied in, mirroring cr's self-hosted railway_client.js)
Copy byte-identical from follow-alongs root → cr root: `roster_config.js`,
`roster-client.js`, `gradebook-client.js`. Add 3 `<script src>` in index.html
right after `railway_client.js` (~line 74), order:
`roster_config.js` → `roster-client.js` → `gradebook-client.js`
(gradebook-client requires the other two loaded first).

### B. Roster sign-in surface (additive, mirrors DN2c hardening)
- New `.fab-item` in `fab-menu`: 🎓 **Gradebook** → `onclick="showRosterSignInModal()"`.
- Self-contained modal `#roster-signin-overlay`: username + password
  (`type=password`), error line, Sign In / Sign Out / Cancel; styled to cr
  conventions.
- `showRosterSignInModal()` / `closeRosterSignInModal()` /
  `submitRosterSignIn()` (async; **in-flight guard** `_pending` + disable OK;
  **password NOT trimmed** — security-correct, carried from DN2c) /
  `rosterSignOut()`. Modal shows current roster state.
- On `signIn` ok → **mirror identity through cr's REAL auth path**:
  call `await window.acceptUsername(rosterName)` (cr's canonical identity
  entry point — sets the script-scoped `let currentUsername` at
  index.html:3671 + IDB `setMeta('username')` + `localStorage.consensusUsername`
  + session init). A bare `window.currentUsername=`/localStorage poke is
  INSUFFICIENT (Codex #1): `currentUsername` is a lexical, not a window prop,
  so the poke neither satisfies `saveAnswerWithTracking`'s
  `if(!currentUsername)return` guard NOR survives reload (cr restores from IDB
  first). Fallback to the poke ONLY if `acceptUsername` is absent. For the
  clean-start cohort the roster identity IS the cr identity, so routing through
  `acceptUsername` is the intended semantics (heavier than DN2c's thin-email
  mirror, but cr's lexical+IDB architecture requires it).
- `rosterSignOut()` clears ONLY the roster session (`rosterClient.signOut()`).
  **It does NOT clear cr's own `consensusUsername`/IDB identity** — cr's
  identity drives peer/sync/progress; co-clearing = unacceptable blast radius.
  Differs deliberately from DN2c (the Desk had a thin email identity; cr does
  not). The feeder simply goes inert again.

### C. The feeder (in `saveAnswerWithTracking`, after existing body)
Guarded, fire-and-forget, wrapped in try/catch (this is a critical cr path —
belt-and-suspenders on top of decision L-D's no-throw client):
```js
try {
  if (window.gradebookClient && window.gradebookClient.record && questionId) {
    var gbSrc = /^U\d+-PC-/.test(questionId) ? 'pc' : 'curriculum_quiz';
    var gbU = /^U(\d+)-/.exec(questionId);
    window.gradebookClient.record({
      source: gbSrc, itemId: questionId,
      unit: gbU ? ('U' + gbU[1]) : undefined,
      response: answer, attempt: 1
    });
  }
} catch (_) { /* never block cr's submit */ }
```
- `itemId` = `questionId` verbatim (proven == manifest vocab).
- `source` by id shape — matches the manifest classifier exactly
  (`U#-PC-*`→`pc`, else `curriculum_quiz`).
- `score` OMITTED — D3 "done = attempted, not score-gated"; correctness →
  Phase-3 rollup from `response` vs the curriculum.js key (mirrors the
  worksheet-blank precedent which also omits score). Deliberate deferral.
- `attempt: 1` — consistent with worksheets; ledger upserts on
  (student,source,itemId,attempt) so resubmits update the same row = correct
  "attempted" semantics.

## Non-goals (explicit)

Never read-for-edit/write `data/curriculum.js`. No rework of cr onboarding /
welcome / peer / sync / IDB / sprite. No score/correctness computation (Phase
3). Roster sign-out does NOT clear cr's own identity. No DN3 (calendar/donow/
coloring — that's the follow-alongs Desk).

## Test — `tests/dn2d-gradebook-feeder.test.js` (cr repo; jsdom + source-slice + runtime)

- 3 roster scripts present in index.html, correct order, after railway_client.js.
- `fab-menu` has the 🎓 Gradebook entry → `showRosterSignInModal()`.
- Modal has `#roster-signin-*` username + `password[type=password]`.
- `saveAnswerWithTracking` source-slice: guarded `gradebookClient.record`,
  `itemId: questionId` passthrough, id-shape `source`, try/catch wrap.
- Runtime (vm, fake rosterClient + gradebookClient + localStorage):
  PC id → `source:'pc'`; lesson id → `source:'curriculum_quiz'`; itemId
  passthrough; absent client → no throw; `submitRosterSignIn` ok → mirrors
  `currentUsername` + `consensusUsername`; sign-out clears only roster.

## Method

Planner implements directly (cohesive single-repo change that must not break a
live app — fan-out = clobber risk) → Codex FOCUSED review
(`Agent/runner/cross-agent.py`, read-only, tight ≤540s) → planner re-verify on
disk (cr `npm test` + the new test; **`git diff --stat data/curriculum.js`
MUST be empty**) → tight single-purpose commit in the **cr repo** + push to
`main`. cr index.html is LF — keep edits EOL-clean.

## Codex review (focused, read-only, 2026-05-18) — 2 findings fixed

1. **MAJOR — identity mirror missed cr's real auth source of truth.** The
   original mirror wrote `window.currentUsername` + `localStorage.consensusUsername`,
   but cr runs on a script-scoped `let currentUsername` (index.html:3671) + IDB
   `username` meta. The window poke updated neither → (a) the feeder's host
   `saveAnswerWithTracking` early-returns on `if(!currentUsername)return` so the
   feeder would NOT fire for a roster-only student, and (b) a reload restores
   the old IDB identity (split-brain). **FIXED:** sign-in now calls
   `await window.acceptUsername(rosterName)` — cr's own canonical identity entry
   point (lexical + `setMeta('username')` + localStorage + session init), with
   the window/localStorage poke kept only as a fallback when cr auth isn't
   loaded. Contract amended (see §B) — heavier than DN2c's thin mirror, but
   cr's architecture requires it and clean-start semantics make it correct.
2. **MINOR — mirror test was not runtime-faithful.** The sandbox only had
   `window`+localStorage so it couldn't catch #1. **FIXED:** the test now
   injects a fake `window.acceptUsername` recorder and asserts the real path is
   used (`acceptCalls === ['coconut_shark']`), plus a dedicated fallback test
   for the auth-absent branch and a "failed signIn → no acceptUsername" test.

Codex explicitly confirmed CLEAN: SACRED `data/curriculum.js` untouched/unreferenced
for writes; feeder contract (`itemId:questionId`, `/^U\d+-PC-/?'pc':'curriculum_quiz'`,
`attempt:1`, no `score`, try/catch no-block); script load order; async/UX
(`_pending`/`finally`/no-trim); sign-out clears only the roster session; security
(no secrets, 3 clients byte-identical to follow-alongs).

## Acceptance

cr loads the shared roster+gradebook clients; a student can roster-sign-in via
the fab-menu; every cr quiz/PC answer fires `gradebookClient.record` with the
exact manifest item_id (`source` correct by id shape); `curriculum.js`
untouched (git diff proof); cr's own onboarding/peer/sync unaffected; DN2d
ledger writes verifiable once a roster session exists. Closes the D2 "ledger
actually populated" loop for the curriculum_render quiz feeder.
