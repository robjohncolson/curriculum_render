# Review 2026-10-22 (evening) — curriculum_render `758312b..HEAD`

Independent review (FABLE_SPRINT_2026_10_22D_SPEC D1), formed from the diffs, not the
sprint reports. Scope: the limiter-in-every-mode change (`railway-server/ai-grade-auth.js`),
the park read routes (`railway-server/apstat-park/calc-read-routes.mjs`), the mirrored
`offline-queue.js`, and the doorway test re-pin (`tests/classroom.test.js`).

## Confirmed and fixed

1. **Log mode relabelled an unauthenticated, invalid-shape request as `allow-auth+skip-invalid`.**
   Before 9fe4d59 an unauthenticated request in log mode returned `next()` right after the
   `would-reject-auth` header and log line. Since 9fe4d59 it falls through to the
   shape check, whose log-mode branch overwrote the header with `allow-auth+skip-invalid`
   and wrote a second log line, so a request with no identity was reported as allowed by
   auth. Fix: that branch now runs only for authenticated requests
   (`mode === 'log' && authenticated`), so the identity decision stands, one line is
   logged, and no quota is charged. Test: `tests/ai-grade-auth.test.js`
   "log mode keeps would-reject-auth on an unauthenticated request with an invalid shape".

## Confirmed working (read end to end)

- **Limiter in every mode.** `off` no longer returns before identity; the sid window is
  checked and committed only when a roster sid resolved, the IP window always; a valid
  `x-roster-grader-secret` skips both maps (`allocatedBucketCells` stays 0). `enforce`
  still rejects unauthenticated traffic with 401 before either map. The 429 is the
  existing shape (`{ error: 'AI grading rate limit exceeded' }`, `Retry-After` >= 1).
  `app.set('trust proxy', 1)` in server.js means `req.ip` is the client behind Railway's
  proxy, so the IP window (600 items/min default) is per school NAT, not per Railway edge.
- **Park read routes.** `createCalcReadHandlers` refuses a missing/oversized section or
  username and any section outside `CLASSROOM_SECTIONS` with a 400 before the park
  service sees it; the only 500 is a thrown park call. An array query value
  (`?section=a&section=b`) stringifies to `a,b` and is refused as unknown. The
  calculator-progress structural test was re-pointed at the new module without losing
  its two assertions.
- **Mirrored queue.** `offline-queue.js` is byte-identical to follow-alongs' (cmp). Same
  IndexedDB name/store (`apstats_offline_v1` / `queue`), so rows queued by the old cr
  build are still read. `gradebook-client.js` calls only `enqueue`, `drain`, `parked`,
  `keyOf`, `isOffline`, all present with the same contracts; the drain's sender result
  shape (`{ok, status, reason}`) and the "4xx/no-identity/auth never consume a parking
  attempt" rule match what `_postRecord` returns. `supersede` is unused here (cr's
  record() never sends directly then queues), which is fine.
- **Doorway re-pin.** The castDoorwayVote cases keep a non-voting student online so the
  V7.5.1 auto-close does not fire, and a new case pins the auto-close itself (tally then
  close broadcast, manual close afterwards a no-op). No assertion was dropped: the
  earlier single-voter expectations are the same tallies, and the all-voted case is now
  covered explicitly rather than by accident.

## Plausible (not fixed; judgement calls or other-repo work)

- **Students can now see a 429 in `off` mode.** The worksheets (`u*_lesson*_live.html`)
  send a roster bearer token to the grade routes, so a signed-in student is held to
  `AI_GRADE_MAX_ITEMS_PER_MIN_SID` (30 items/min; a grade-batch counts its items,
  grade-worksheet counts 1). A worksheet with many reflections graded twice in a minute
  can trip it. The worksheet client treats any non-ok response as "Grading request
  failed" with no retry hint and ignores `Retry-After`. That is a follow-alongs change
  (surface "try again in N s" on 429), not a cr one.
- **Log telemetry for an anonymous rate-limited request.** In log mode an
  unauthenticated request that exceeds the IP window is answered 429 but the header and
  log line say only `would-reject-auth` (no `rate-ip` marker), so the log cannot show how
  often anonymous traffic is being limited. Adding `+rate-ip` to that line would help the
  decision to flip to enforce.
- **`sidFromRequest` now runs in `off` mode** on every grade request (one HMAC verify).
  Cheap, but it means a malformed `Authorization` header that used to be ignored in off
  mode is now parsed; `verifyToken` returns null on anything invalid, so no new failure
  path, just noted.
- **`CLASSROOM_SECTIONS` is a hard-coded list** (`PeriodB`, `PeriodE`, `B`, `E`,
  `PeriodX`, `X`). A student whose roster section is anything else (a future section, a
  test class) gets a 400 from both read routes; the Desk hides the due count and shows
  the progress view's offline message. The park's websocket join still accepts any
  section, so the two surfaces disagree on what a valid section is. Consider deriving
  the list from the roster's class list or logging the refused value once.
- **`queryText` folds "too long" into "missing".** A 65-character username answers
  `section and username required`, which is misleading in a log. Harmless.

## Suite

`npx vitest run` from the repo root after the fix: 76 files, 1892 tests, all green
(includes `railway-server/tests/park-calc-read-routes.test.js` and the 56 ai-grade-auth cases).
