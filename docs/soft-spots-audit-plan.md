# Soft Spots Audit Plan (Fundamentals → Advanced)

## Goal
Find and prioritize the riskiest weak points (“soft spots”) in the app by moving from foundational reliability checks to higher-order UX, scale, and operational risks.

## What counts as a soft spot
A soft spot is any place where the app is likely to fail silently, lose user work, produce inconsistent state, or become hard to operate/maintain under classroom conditions.

## Audit principles
1. **Start with invariants first** (data integrity, deterministic behavior).
2. **Bias toward reproducible evidence** (automated checks + scripts).
3. **Rate by student impact** (work loss > temporary UI glitch).
4. **Close loop with owners** (issue, mitigation, regression test).

## Phased plan

### Phase 0 — Baseline and scope lock
- Freeze current behavior baseline with:
  - `npm test`
  - `npm run test:coverage`
- Capture app topology map:
  - Entry points (`index.html`, `js/`, `railway-server/`)
  - Data stores and adapters (`js/storage/`)
  - Network modes and transitions (`js/network_manager.js`)
- Produce a risk register template:
  - `id`, `area`, `failure_mode`, `trigger`, `user_impact`, `detectability`, `severity`, `likelihood`, `owner`, `fix_type`, `regression_test`

**Deliverable:** `docs/analysis/risk-register-initial.csv` with seeded known risks.

---

### Phase 1 — Core correctness & data durability (highest priority)
Focus: “Can student work disappear or corrupt?”

#### 1. Storage invariants (IndexedDB + localStorage dual-write)
- Verify all write paths are idempotent and await storage readiness.
- Validate behavior when one backend fails mid-write.
- Check migration/rebuild flows for `classData` consistency.
- Test cold start, refresh, tab-close during save, and resume.

#### 2. State machine conformance
- Derive expected transitions from state-machine docs.
- Add tests for illegal transitions and stuck states:
  - save status
  - load status
  - sync status
- Ensure every transition emits expected UI event and diagnostic log.

#### 3. Recovery semantics
- Force failures in save/sync/load and verify:
  - retries bounded
  - no duplicate writes
  - clear user-visible feedback
  - eventual consistency after reconnect

**Deliverable:** failing tests first, then green tests proving fixes.

---

### Phase 2 — Network resilience and multi-tier behavior
Focus: “Does mode switching break grading/sync?”

#### 1. Tier transition fuzzing
- Systematically exercise Turbo ↔ LAN ↔ Offline transitions.
- Inject flaky network timing (timeouts, partial responses, DNS failures).
- Verify queue semantics and user feedback during prolonged degradation.

#### 2. Endpoint contract hardening
- Define contract tests for Railway + LAN endpoints:
  - shape, status codes, retries, stale cache behavior
- Validate graceful handling of malformed/partial server payloads.

#### 3. Offline-first guarantees
- Confirm app remains fully usable offline for core student workflow.
- Validate sync reconciliation when reconnecting after long offline periods.

**Deliverable:** integration test matrix by network tier.

---

### Phase 3 — Security and trust boundaries
Focus: “Where can bad input or config break trust?”

#### 1. Input and rendering safety
- Audit all user-derived content rendered in DOM.
- Ensure sanitization/escaping for free-text fields and AI responses.
- Validate no unsafe HTML injection paths in feedback, charts, or history views.

#### 2. Client/server boundary checks
- Validate server-side input validation for grading/sync endpoints.
- Add negative tests for oversized payloads, invalid IDs, and replay-like patterns.

#### 3. Secrets/config hygiene
- Confirm no hardcoded sensitive values in repo.
- Validate environment-based config loading and fallback behavior.

**Deliverable:** security findings list with severity and exploitability notes.

---

### Phase 4 — Observability and diagnosability
Focus: “When something fails in class, can we explain it quickly?”

#### 1. Diagnostic completeness
- Map critical workflows to required diagnostic events.
- Find blind spots where failures are user-visible but unlogged.

#### 2. Event quality
- Ensure logs include correlation IDs, timestamps, and context needed for root cause.
- Add redaction checks for potentially sensitive content.

#### 3. Support drills
- Run tabletop incident drills (“student lost answers”, “LAN grading backlog”).
- Validate that logs + UI state are sufficient for triage within 5 minutes.

**Deliverable:** runbook updates and telemetry gap fixes.

---

### Phase 5 — Performance and scale in classroom conditions
Focus: “Does app stay responsive at class load?”

#### 1. Front-end responsiveness
- Measure save latency, render latency, and input blocking under realistic dataset sizes.
- Identify long tasks and repeated heavy recomputation.

#### 2. Queue and throughput (LAN grading)
- Stress queue with class-sized concurrency.
- Validate ETA quality, timeout handling, and cancellation behavior.

#### 3. Memory/storage pressure
- Test long-lived sessions and repeated navigation.
- Validate behavior near browser storage quota limits.

**Deliverable:** performance budget + bottleneck backlog.

---

### Phase 6 — Maintainability and change risk
Focus: “How likely are regressions when we ship?”

#### 1. Test coverage by risk area
- Build a risk-to-test matrix (not just line coverage).
- Require regression tests for every high-severity finding.

#### 2. Architecture seams
- Identify modules with high coupling and implicit contracts.
- Propose seam refactors for storage/network/UI boundaries.

#### 3. Release readiness gates
- Define minimum pre-release gate:
  - critical path tests
  - tier transition smoke test
  - rollback plan documented

**Deliverable:** lightweight quality gate checklist for each release.

## Scoring model for prioritization
Use a simple score for ordering work:

`priority = (impact × likelihood × detectability_penalty)`

- Impact: 1–5 (5 = student work loss or grading integrity risk)
- Likelihood: 1–5 (5 = likely in normal classroom use)
- Detectability penalty: 1–3 (3 = hard to detect quickly)

Triage buckets:
- **P0:** score ≥ 45 (address immediately)
- **P1:** 25–44 (next sprint)
- **P2:** < 25 (planned backlog)

## Execution cadence
- Week 1: Phases 0–1 (data durability/state correctness)
- Week 2: Phases 2–3 (network/security)
- Week 3: Phases 4–5 (observability/performance)
- Week 4: Phase 6 + regression closure

## Immediate first 10 tasks
1. Generate risk register scaffold and seed known failure modes.
2. Add storage invariants test suite for save/load/sync critical paths.
3. Add transition tests for UI state machine illegal transitions.
4. Add failure-injection tests for partial writes and reconnect merges.
5. Build network-tier transition integration harness.
6. Add API contract tests for Railway server endpoints.
7. Run DOM rendering audit for unsanitized content paths.
8. Add diagnostic coverage map (workflow → required events).
9. Run class-size load test for LAN grading queue.
10. Convert top 5 findings into P0/P1 issues with regression tests attached.

## Definition of done
A soft spot is considered closed only when:
- Root cause is documented.
- Mitigation is merged.
- Regression test exists and fails without mitigation.
- Operational note/runbook update is included where relevant.
