# TIGHTEN_PLAN (curriculum_render) — receipt/wallet hardening P1–P3

Implements verified audit findings. Two independent agents, disjoint files.
Additive / never-throw. Contract: `docs/receipt-system-spec.md`. Keys:
`docs/KEY_MANAGEMENT_RUNBOOK.md`.

## Agent CR1 — verify.html: honest labeling, registry metadata, gate TEST keys
Owned paths: `verify.html` ONLY.

**1. Issuer registry metadata + rotation-friendly shape (audit #5, #13).**
Restructure the `ISSUERS` array entries into richer objects:
`{ name, pubkey, kind: 'quiz'|'desk', test?: true }`. Keep the production Quiz
and Desk keys as the trusted set. Add a comment documenting rotation (append new
keys, never remove old ones — see KEY_MANAGEMENT_RUNBOOK.md).

**2. Gate the committed TEST keys out of the live trust path (audit #21).** The
two TEST pubkeys must NOT be tried during normal verification (a real receipt
should only verify against production keys). Include TEST keys only when the page
is in test mode — `location.hash`/query contains `test=1`, OR the user clicks the
existing **Self-test** button (which should enable test keys for that run). The
Self-test frozen vectors must still verify green. Normal `#r=<compact>`
verification tries production keys only.

**3. Honest labeling — claim only what a receipt proves (audit #5; mitigates the
P0 oversell without adding auth).** Today every valid receipt stamps
"VERIFIED · Student: X". But quiz `answer`/`verdict` receipts carry an
UNAUTHENTICATED `u` (the quiz server signs a body-supplied username), whereas
`ledger` (Desk) receipts carry a token-verified `sid`. Differentiate in the
rendered facts:
- `ledger` receipt → render the student normally (sid is verified server-side).
- `answer`/`verdict` (quiz) receipt → render the name as
  "claimed: <u> (name not identity-verified)", not "Student".
- Add a one-line, plain-English explainer of what THIS receipt proves, by type:
  - `answer`: "Proves the class server received and recorded this submission at
    the time shown."
  - `verdict`: "Proves the server recorded this E/P/I result. The score may be
    AI- or self-reported — see your gradebook for the official grade."
  - `ledger`: "Proves the gradebook recorded this item for this student at the
    time shown" + if the receipt's score is from a self-graded source, note
    "score is self-reported".
- Show the receipt TYPE and which issuer signed prominently, so a low-authority
  answer receipt is visibly distinct from a gradebook record.
Keep the green/red seal + the existing animation; this is about the facts panel
copy and the name framing, not the crypto.

Verify the Self-test still passes for both frozen vectors after the change.

## Agent CR2 — quiz server /health + capture dropped quiz receipts
Owned paths: `railway-server/**`, `index.html`, `gradebook-client.js` ONLY.

**1. `/health` receipt signal + de-swallow issuance failures (audit #14, #8).**
In `railway-server/server.js` `/health`, add a `receipts` block from
`getReceiptIssuer()` → `{ enabled, pubkey }` so an unset `RECEIPT_ISSUER_PRIVATE_KEY`
after a redeploy is visible. Ensure any receipt issuance failure is logged
distinctly (not silently swallowed) — a warn with context — without changing
endpoint responses or blocking grading.

**2. Capture the dropped quiz AI-verdict receipts into the wallet (audit #1).**
The quiz app issues signed `verdict` receipts from `/api/ai/grade` and
`/api/ai/appeal` (returned as `result.receipt = { receiptId, compact }`) but
nothing captures them — they evaporate. Capture them into the SAME shared
`localStorage` key the Desk wallet reads, `desk_receipts_v1` (same GitHub Pages
origin), so signed AI verdicts show up in the student's wallet.
- Add a small reusable capture in `gradebook-client.js` (or reuse the existing
  private `_captureReceipt` by exposing a thin `captureQuizReceipt(receipt,
  questionId, scoreLetter)` ) that normalizes a v1 quiz receipt into the
  `desk_receipts_v1` row schema `{ id, compact, src, i, sc, ts }`:
  - `id` = receiptId, `compact` = compact, `i` = questionId,
  - `src` = `'quiz_verdict'` (these are EVIDENCE of already-counted work; the
    Desk wallet's points logic assigns them 0 points by this src — do not invent
    a different src),
  - `sc` = OMITTED (the letter grade E/P/I is not a 0–1 score; leave it out so
    the feed shows the item + Verify without a misleading %),
  - `ts` = Date.now(). Cap/dedup behavior identical to the existing capture
    (newest-first, dedup by id, 500-cap).
- Call it in `index.html` at the points where an AI grade/appeal response with a
  `result.receipt` is handled (the MCQ/FRQ grade + appeal result paths). Best-
  effort, never throw into grading.
- Mirror the `gradebook-client.js` change to the follow-alongs canonical copy is
  NOT in your scope (note it for the orchestrator).

No tests are required for CR2 beyond not breaking existing ones; run
`npx vitest run` if quick, else note skipped. Do NOT touch `verify.html`,
`data/**`, or `js/grading/**` beyond what's needed for capture.
