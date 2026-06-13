# Signed Receipt System — Spec v1

## What this is

Cryptographically signed, self-verifying receipts for student work. When the Railway
server receives an answer or issues an AI verdict, it returns a compact signed receipt
(Ed25519). The receipt is a **bearer artifact**: a static verify page checks the
signature entirely in-browser against the issuer public key — no database lookup, no
server dependency. If Supabase and Railway both vanish, a student's receipt still
proves "the class server saw this work at this time."

Explicitly NOT in scope for v1: blockchain, consensus, token economy, per-student
keypairs, on-chain anything. This is a receipt printer with cryptographic ink.

**Why (from the June 2026 audit):** AI E/P/I verdicts live only in `window.gradingResults`
page memory; the gradebook ledger trusts client-computed scores; the answers table
destructively upserts history away; "I did it but it shows 0%" disputes are chronic.
Receipts attest the **server's** view of events, durably, in the student's own hands.

## Receipt contract v1 (frozen — do not deviate)

The reference implementation is `scripts/receipt_keytool.mjs`. Server and verify page
MUST reproduce its output byte-for-byte.

**Payload** — a FLAT JSON object (no nesting, no arrays):

| Field | Type | Meaning |
|-------|------|---------|
| `v` | number | Contract version, always `1` |
| `t` | string | `"answer"` (server received+stored an answer) or `"verdict"` (server-side grade verdict) |
| `u` | string | Username exactly as written to the answers table |
| `sid` | string | Optional authenticated roster `student_id` uuid when the quiz server verified a roster token. Authoritative identity for new authenticated receipts; old no-`sid` receipts stay valid |
| `q` | string | Question ID (e.g. `U4-L3-Q01`) |
| `s` | string | Verdict receipts only: final score `"E"`/`"P"`/`"I"` **after** all enforcement caps. OMITTED on `answer` receipts |
| `g` | string | Verdict receipts only: optional grader provenance. AI-issued quiz verdict receipts use `"ai"` |
| `ah` | string | First 16 hex chars of SHA-256 of the answer value string (binds receipt to content without leaking the answer into the QR) |
| `ts` | number | **Server** timestamp ms (`Date.now()` on Railway — never the client's timestamp) |
| `n` | string | 8 hex chars of server randomness (`crypto.randomBytes(4).toString('hex')`) so identical resubmissions get distinct receipts |

**Canonical form:** `JSON.stringify` of the payload with keys sorted alphabetically,
no whitespace, only fields present (so `answer` receipts have no `s` key), UTF-8.
The optional `sid` field is additive in v1; verifiers accept any valid signature over
the fields present, so legacy no-`sid` receipts remain valid and extra signed fields do
not change the signature rule.

**receiptId:** SHA-256 hex of the canonical bytes (display convention: first 12 chars, txid-style).

**Signature:** Ed25519 over the canonical bytes. Node: `crypto.sign(null, bytes, privateKey)`.

**Compact wire format (goes in API responses and QR codes):**
```
base64url(canonicalBytes) + "." + base64url(signature)
```

**QR content:** `https://robjohncolson.github.io/curriculum_render/verify.html#r=<compact>`
(fragment never leaves the browser).

### Frozen test vector (TEST key — also embedded in verify.html self-test)

TEST public key (base64url raw 32B): `ysLRAoc-rg-N2VTE2IR9s6Z1QT--9X64Qg3Px-6rUow`
TEST private key (base64 PKCS8 — TEST ONLY, intentionally public):
`MC4CAQAwBQYDK2VwBCIEIEtFFgiPZyvBY+Udt3F77ZOHGypDcMHVJV9ck+a6kToO`

Payload `{"ah":"3a1f0c9b2d4e5f60","n":"a1b2c3d4","q":"U4-L3-Q01","s":"E","t":"verdict","ts":1781234567890,"u":"Apple_Monkey","v":1}` →
- receiptId: `ecceb8d3a527a91214b2d479f779cceb58b60e97e897508b5161e3a8b297b622`
- sig: `fxr2OUgg98CHgo8zrNkqT5DAdxa7emYOlN82z1elKBorO8HqUH0K4Z7AH-FDr7EeLPGF6Xeg2FT-dEOMlxuPCw`

A correct implementation MUST reproduce this exactly with the TEST key.

## Key management

- `RECEIPT_ISSUER_PRIVATE_KEY` env var on Railway: base64 PKCS8 DER Ed25519 private key.
  Generate with `node scripts/receipt_keytool.mjs gen`. **Never committed.**
- Public key lives in `js/receipt_config.js` (`window.RECEIPT_CONFIG.pubkey`) and
  embedded in `verify.html`. The TEST key above is the dev default until the teacher
  generates the production key.
- `GET /api/receipts/issuer` → `{ enabled: true, alg: "Ed25519", v: 1, pubkey: "<b64url raw>" }`
  or `{ enabled: false }` when the env var is unset.

## Server changes (Codex lane — `railway-server/` only)

New module `railway-server/receipts.js`:
- `initReceipts()` — load key from env at startup; log one line whether receipts are enabled.
- `issueReceipt({ type, username, questionId, score, answerValue })` → `{ receiptId, compact }`
  or `null` if disabled. Computes `ah` internally from `answerValue` (stringify non-strings).
  MUST be wrapped so it can never throw into a caller.

Issuance points in `railway-server/server.js`:
1. `POST /api/submit-answer` — after successful Supabase upsert, attach
   `receipt: { receiptId, compact }` (type `answer`) to the response.
2. `POST /api/batch-submit` — per successful item, `receipts: { [question_id]: { receiptId, compact } }`.
3. `POST /api/ai/grade` — after score normalization AND the wrong-MCQ E→P cap, attach
   `receipt` (type `verdict`, `s` = the FINAL capped score).
4. `POST /api/ai/appeal` — same rule: sign the final post-enforcement score.
5. `GET /api/receipts/issuer` as above.

Out of scope v1: `/api/ai/grade-worksheet` (multi-blank shape — phase 2), any DB
persistence of receipts, any change outside `railway-server/` and `tests/`.

**Hard constraints:**
- With `RECEIPT_ISSUER_PRIVATE_KEY` unset, every endpoint's behavior and response shape
  is byte-identical to today (no receipt fields, no errors, no latency).
- Signing failure must NEVER fail or delay the parent request (try/catch, log, omit field) —
  same philosophy as the gradebook feeder's never-throw rule.
- `ts` is server time. The client's timestamp is never signed.
- Payload built ONLY from server-known values at issuance time.

**Tests (root vitest, `tests/receipt-issuance.test.js`):**
- Canonicalization: key order, omitted `s`, no whitespace — reproduce the frozen vector
  exactly (canonical string, receiptId, sig) using the TEST key.
- Sign/verify round-trip with a freshly generated key.
- Disabled mode: `issueReceipt` returns null, no throw.
- Issuance is post-cap: a wrong-MCQ grade response's receipt carries `s:"P"` even when
  the model said E.
- Tests must execute real code paths (import the module, call functions). String-presence
  assertions on source files are explicitly forbidden (see cd2ec6d false-green incident).

## Client changes (Fable lane — NOT for Codex)

- `js/receipt_config.js` — pubkey + verify URL constants.
- `verify.html` — static, self-contained verify page (WebCrypto Ed25519, secure-context
  hosts: GitHub Pages / file://). Reads `#r=<compact>`, verifies, renders verdict.
- Phase 1b (after backend lands): IDB `receipts` store (DB_VERSION 3→4), capture receipts
  from API responses, "My Receipts" UI with QR per receipt (QRCode lib already loaded),
  download-all JSON. Outbox flush prefers Railway `/api/batch-submit` in turbo tier so
  offline work gets receipts on reconnect (falls back to direct Supabase, unreceipted).

## Acceptance criteria (sign-off checklist)

1. `npm test` green, including the new receipt tests reproducing the frozen vector.
2. Env unset → `git diff`-level certainty that response shapes are unchanged.
3. Verdict receipts sign post-enforcement scores (cap logic precedes issuance).
4. `verify.html` self-test passes against the frozen vector; a compact receipt produced
   by `scripts/receipt_keytool.mjs sign` verifies green on the page.
5. No file changes outside `railway-server/`, `tests/`.

## Contract v1.1 — `ledger` receipts (the Desk / roster-server)

Extension for the Desk gradebook (roster-server, `school/follow-alongs/roster-server/`).
Same canonicalization, receiptId, signature, and compact wire format as v1 — only a new
`t` value with its own fields. Implementation contract: `follow-alongs/RECEIPTS_BUILD.md`.

**`t: "ledger"`** — issued by roster-server when a grade row lands in `item_ledger`:

| Field | Req | Meaning |
|-------|-----|---------|
| `v` | ✓ | `1` |
| `t` | ✓ | `"ledger"` |
| `sid` | ✓ | Authenticated `student_id` uuid (from the verified roster token / import row) |
| `u` | – | Display username if cheaply resolvable server-side; `sid` is authoritative |
| `src` | ✓ | Ledger source as stored (`worksheet`, `frq`, `curriculum_quiz`, `pc`, `blooket`, `quiz_exception`, `quiz_review`, `trainer`) |
| `i` | ✓ | `item_id` as stored (incl. synthetic ids like `…#rev`, `BL-U#-L#-DESK_DONE`) |
| `sc` | – | Numeric score exactly as validated and stored (`Number(score)`); OMITTED when score is undefined/null (score-less rows like curriculum_quiz/pc) |
| `a` | ✓ | Attempt number as stored |
| `e` | ✓ | Server-derived `evidence_tier` (`practice` \| `proctored`) — receipts make the proctor tier provable |
| `ah` | ✓ | First 16 hex of SHA-256 of the stored `response` (stringify non-strings) |
| `ts` | ✓ | Server time ms |
| `n` | ✓ | 8 hex server nonce |

Issuers are now plural: the quiz Railway server and roster-server each hold their own
Ed25519 key (`RECEIPT_ISSUER_PRIVATE_KEY` env on each Railway service). `verify.html`
carries an **issuer registry** and tries each key, reporting which issuer signed.

### Frozen v1.1 test vector (Desk TEST key)

Desk TEST public key: `sj9NUx5jBO-KTI58WKjQwEr22i7f8fiv--KH4z95JCc`
Desk TEST private key (TEST ONLY, intentionally public):
`MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0`

Payload `{"a":1,"ah":"3a1f0c9b2d4e5f60","e":"practice","i":"WS-U4L3-Q2","n":"a1b2c3d4","sc":0.5,"sid":"00000000-0000-4000-8000-000000000000","src":"worksheet","t":"ledger","ts":1781234567890,"u":"Apple_Monkey","v":1}` →
- receiptId: `8ebc92c7a13899a5f7be6b6959fb77e65a379984db907e419f2422a23a6e6d96`
- sig: `h2UL76wqlGpAOtUKLrCT0_XZidjYYf_ToVEujCB4ge9WrEaXgUUs4mNhHUf6JPJxorOhVw03DDaTVYZE2k7WCw`

### Client capture & storage contract (shared origin)

`gradebook-client.js` (canonical home: follow-alongs root; re-sync to curriculum_render)
captures `receipt` from `/ledger/record` responses into localStorage key
**`desk_receipts_v1`**: a JSON array of `{id, compact, src, i, sc, ts}` (id = receiptId),
newest first, capped at 500. The Desk's "My Receipts" view and any same-origin app read
this key. Never let capture failures break the record() fire-and-forget contract.

## Known constraints / phase 2 notes

- Receipts are issued only in Turbo tier (Railway holds the key). LAN/offline submissions
  receive receipts late via outbox replay — like a confirmation clearing. Honest degradation.
- Direct browser→Supabase writes remain unreceipted in v1; receipt coverage grows when
  outbox flush is routed through Railway (phase 1b).
- Phase 2 candidates: `learning_events` INSERT-only table (first restrictive RLS),
  daily Merkle root wall QR, worksheet receipts, "Mine the Class Block" U4 lesson level.
