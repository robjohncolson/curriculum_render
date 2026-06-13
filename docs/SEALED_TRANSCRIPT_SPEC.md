# Sealed Transcript — Design Spec

A student exports their **entire receipted work history** as one self-contained,
signed, tamper-evident file; emails it; a teacher imports it into an offline
verifier that proves it is **complete, untampered, and identity-bound**, and shows
(or re-derives) the grade — with **no database**. Builds on the Signed Receipt
System (`receipt-system-spec.md`) and the keys in `KEY_MANAGEMENT_RUNBOOK.md`.

This spec was designed and then adversarially stress-tested by a "cheating
student" critic and a "systems-determinism" critic. Their must-fix findings are
folded in below as **frozen requirements** and **must-resolve decisions**.

---

## 0. The one true insight, and the one honest limit

**Insight.** Today a "transcript" is just a *bag* of individually-valid receipts —
and a bag can be cherry-picked (drop the I-scores, the rest still verify green).
The fix is a single **server-signed manifest** that commits to the *whole set*
plus the grade. Then dropping, adding, swapping, or editing any receipt breaks
either a signature or the set-commitment, and the student can't re-sign (only the
Desk holds the private key).

**Honest limit (frozen).** The seal proves **completeness of the receipted ledger
record** and **authenticity of each event** — it does **not** prove the *scores*
were honestly earned unless the receipts underneath are authenticated and
server-scored. That is why **the auth foundation (Layer 1) ships before the
transcript (Layer 2)**. A green seal must never read "complete record" over a
partial set; it reads **"sealed receipted work — N items."**

---

## Layer 1 — Authentication Foundation (P0, prerequisite)

A grade-determining transcript is only as solid as the receipts under it. Two
confirmed holes must close first.

### 1A. Authenticate the quiz-server submitter; sign the *verified* sid

Today `curriculum_render/railway-server/server.js` has open CORS and signs a
**body-supplied** username on `/api/submit-answer`, `/api/ai/grade`,
`/api/ai/appeal` (`receiptUsernameFromBody`, server.js:65-68) — so anyone can mint
a *verified* receipt naming any classmate.

The fix is clean because **the roster token already travels to the quiz app**
(same web origin; `window.rosterClient.token()`, roster-client.js:205-209; already
sent cross-origin in `gradebook-client.js:156-159`):

1. **Copy `follow-alongs/roster-server/token.js` → `curriculum_render/railway-server/token.js`** (63 lines, `node:crypto` only). Set the **same `ROSTER_TOKEN_SECRET`** env var on the quiz Railway service.
2. Add `sidFromRequest(req)` → reads `Authorization: Bearer` (or `body.rosterToken`) → `verifyToken(token)` → `sid | null` (pure shared-secret HMAC, no network).
3. At each issuance point, **replace the body username with the verified sid.** Issue a receipt **only when `sid` is verified**; when absent, behave exactly as today minus the receipt field (honest degradation for anonymous quiz users — must not 500).
4. Quiz receipt payload gains `sid` (authoritative) and treats `u` as display-only — mirroring the ledger receipt. Client adds `Authorization: Bearer rosterClient.token()` at the three quiz-server fetches (index.html:9340, 9624, appeal path).

Result: a student can no longer mint a verified receipt for a sid they can't
produce a token for.

**Hard requirement:** the two Railway services MUST share an identical
`ROSTER_TOKEN_SECRET`. Add `rosterAuth: !!process.env.ROSTER_TOKEN_SECRET` to both
`/health` blocks — secret drift silently kills all quiz receipts otherwise.

### 1B. Server-compute every scorable score before signing

A receipt's score must be a value the **server** derived, never a client relay.

- **AI verdicts** (`/api/ai/grade`, `/api/ai/appeal`): already server-computed and post-`applyWrongMcqCap` before signing — correct. Only fix: bind to the verified sid (1A). Tag provenance `g:'ai'`.
- **curriculum_quiz / pc**: already re-scored server-side from the bundled `answer-key.json` at read time (`scoreAgainstKey`); the ledger stores the raw `response`, and correctness is recomputed deterministically. No change — the transcript verifier ships the same key and recomputes. Provenance `g:'key'`.
- **worksheet-with-key (P1)**: blanks are scored *client-side* against `data-answer` in the DOM and POSTed as `score`; there are **zero `WS-*` keys** server-side, so the server signs the client number verbatim. **Fix (P1):** bundle `worksheet-key.json` (harvested from worksheet `data-answer` attrs), recompute server-side in `mountLedger` for `source==='worksheet'` using the **exact** shipped semantics (`normalizeWorksheetGrades`/`_numericValueMismatch`, server.js:766-809), keep the AI pass as upgrade-only. Provenance `g:'key'`.
- **frq reflections / self-attest**: legitimately self-graded. Tag **`g:'self'`** so the transcript *honestly labels* "self-attested" vs "server-verified" — the teacher sees exactly which items rest on the student's word.

### 1C. Close the `quiz_review` credit-upgrade exploit (P0)

Today the **client** computes `_credit` from the AI verdict and POSTs it as
`score` under `source:'quiz_review'`, item `<base>#rev`; the server signs it and
the grade engine does `correct = credit >= 1`. So
`POST /ledger/record {source:'quiz_review', itemId:'U4-L3-Q01#rev', score:1}` with
a *valid token* upgrades any wrong answer to full credit. The token authenticates
*who*, not *the number*.

**Fix:** the **quiz server** computes the credit from its own server-owned post-cap
verdict (`credit = exceptionGranted ? 1 : score==='P' ? 2/3 : score==='I' ? 1/3 : 0`)
and writes the `#rev` row server-side (it holds the roster token), OR issues a
short-lived signed "credit grant" the client relays and the roster-server verifies.
`mountLedger` then **rejects any client-supplied `score` for `source==='quiz_review'`.**
Must preserve `#rev` idempotency (`latestPerItem` dedupe).

**The review-grant contract (cross-repo).** The quiz server signs a short-lived
*credit capability* with its **Ed25519 issuer key** (same key as quiz receipts);
the client relays it; the roster server verifies it with the hardcoded quiz pubkey
and uses the granted credit. Asymmetric, no shared secret, no server-to-server call.

```
grant payload (flat, signed exactly like a receipt — same canonicalize/sign):
  { v:1, t:'review-grant', sid, item:'<qid>#rev', credit:<number 0..1>, exp:<ms>, ts, n }
grant compact = base64url(canonicalBytes) + "." + base64url(sig)
```

- **Quiz server** `/api/ai/appeal`: after the post-cap verdict, compute
  `credit = exceptionGranted ? 1 : score==='P' ? 2/3 : score==='I' ? 1/3 : 0`,
  issue the grant (`exp = ts + 5min`, only when `sid` is verified), return it as
  `reviewGrant` in the response. `issueReviewGrant()` in `receipts.js`, never-throw.
- **Client** (`index.html`): delete the client-side `_credit` computation;
  `recordQuizReview` sends `{ source:'quiz_review', itemId, response, grant:<compact> }`
  with **no `score`**. `gradebook-client.js` `record()` passes an optional `grant` through.
- **Roster server** `/ledger/record`, for `source ∈ {quiz_review, quiz_exception}`:
  **require** `grant`; verify Ed25519 against the hardcoded quiz pubkey
  `yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4`; assert `t==='review-grant'`,
  `grant.sid === verifyToken(token)`, `grant.item === itemId`, `grant.exp > now`.
  Use `grant.credit` as the row score; **ignore any client `score`**. Missing/invalid/
  expired/mismatched → `400 {ok:false,error:'review grant required'}`.
- **Back-compat:** cached old clients (no grant) are rejected → client surfaces
  "reload to appeal". **Deploy:** push the client and redeploy BOTH services together.
  Rotating the quiz key requires updating the hardcoded pubkey in the roster verifier.

### Layer-1 phasing

- **P0 (ship together, prerequisite for any transcript):** 1A sid-binding + 1C quiz_review fix.
- **P1:** 1B worksheet recompute + `g` provenance on all receipts.
- **P2 (defense-in-depth):** `crypto.timingSafeEqual` in `token.js` (both services), lock down quiz-server CORS, server-persist receipts for both issuers.

---

## Layer 2 — The Sealed Transcript

### 2A. The manifest (`t:'transcript'`) — flat signed payload

Reuses the frozen v1 wire format exactly (sorted-key JSON, SHA-256 id, Ed25519,
`base64url(bytes).base64url(sig)` compact), signed by the **Desk** issuer key.
**Structured data is committed via hashes**, keeping the signed payload flat so the
frozen `canonicalize()` and `verify.html` signer are untouched:

```json
{
  "v": 1, "t": "transcript",
  "sid": "<authenticated uuid>", "u": "<display, untrusted>",
  "asOf": 1781234567890,            // server ms snapshot; doubles as supersede key
  "asOfDateNY": "2026-06-13",       // FROZEN: the YYYY-MM-DD-in-schoolTz that actually gates due-dates
  "cnt": 142,                       // exact member receipt count
  "root": "<64hex>",                // completeness commitment (2B)
  "g": 78.4,                        // FROZEN type: 1-dp float (see Decision D1)
  "gq": "Q4",
  "gradeHash": "<64hex>",           // hash of the ROUNDED grade-breakdown projection (2C)
  "cfgHash": "<64hex>",             // hash of resolved PHASE3_CONFIG (incl. env-resolved useV3)
  "artHash": "<64hex>",             // hash of bundled answer-key + schedule + blooket-lessons
  "codeHash": "<64hex>",            // FROZEN: build stamp of the grade engine (2C, critic fix #4)
  "iss": "desk", "ts": 1781234567890, "n": "<8hex>"
}
```

Tier A = the manifest alone (instant grade trust, QR-able). Tier B = manifest +
all member receipt compacts in one JSON envelope (`format:"ap-stats-sealed-transcript"`).

### 2B. Completeness root — sorted-hash, not Merkle

```
ids  = members.map(receiptId)        // SHA-256 of each receipt's canonical bytes, lowercase 64hex
ids.sort()                           // lexicographic — order-independent (a bag, not a list)
root = sha256_hex( ids.join("\n") )  // newline-delimited, no trailing newline, UTF-8
```

Order-independent so re-export yields the same root. **Dup guard (required):** reject
if `new Set(ids).size !== cnt`. Merkle is rejected: inclusion proofs are dead weight
when the whole set is always exported; a flat hash fully defeats cherry-pick for
**every** id shape including synthetic `#rev`, `#exc`, `BL-…-DESK_DONE` (the root is
over receiptIds, independent of item-id shape — critic-confirmed DEFENDED).

### 2C. Determinism — the 5 frozen fixes (systems-critic must-fix)

The load-bearing claim is "reproduce the grade later." It does **not** hold in the
current code. All five must land before build:

1. **`asOf` threading is incomplete — patch BOTH call sites.** `grade.js:184` *and*
   `grade.js:461` (inside `buildGradebook`, the source of the headline `g`) both call
   bare `todayInTz()` reading live `new Date()`. Thread `asOf` into `computeGrade`
   **and** give `todayInTz(tz, now?)` an optional instant, and pass it at *both* sites.
   Freeze **both** `asOf` (instant) and the derived `asOfDateNY` (YYYY-MM-DD in
   schoolTz) into the payload — the date string is what gates due-dates; DST/offset of
   the instant matters.
2. **`latestPerItem` needs a stable tiebreaker.** scoring.js:71 uses `>=` on equal
   `recorded_at` over an *unstably-ordered* DB read (no secondary sort) — same-ms
   double-submits pick different winners across reads → non-deterministic grade even
   intra-day. Add a lexicographic `ledger_id`/`receipt_id` final tiebreaker **and** a
   stable pre-sort of `getLedgerByStudent` rows before `computeGrade`. Document the
   tiebreaker in the frozen spec.
3. **`g` type must be unified (Decision D1).** Components disagreed (float `78.4`
   vs integer `86`). The code emits a **1-dp float** `quarterGrade`. Freeze `g` =
   that 1-dp float, and pick **which** number (live v3 `quarterGrade` vs the Schoology
   report-card estimate — both live in the gradebook field). **Decision required.**
4. **Add `codeHash`.** `cfgHash`+`artHash` pin config+data but **not** the 52KB+ grade
   engine (`lesson-grade.js`, `gradebook-grid.js`, …). A code edit silently changes the
   grade with zero fingerprint. Add a build stamp (git commit SHA at deploy, or a hash
   of the engine files) so a verifier can report "computed by a different engine
   version" instead of silently false-passing/failing.
5. **Freeze the recursive canonicalizer with its own test vector.** `gradeHash`/
   `cfgHash` hash *nested* objects, so a **second** canonicalizer (sort keys at every
   level) is introduced — a new byte-contract. It MUST be frozen with a Desk-TEST-key
   test vector, pinning: array element order (sort by a stable key — `lessons` arrays
   come from a `Set`), `undefined`-drop vs `null`-keep at depth, `NaN`/`Infinity`→reject
   (not silent `null`), and **hash a ROUNDED projection** of `{units,quarters,
   completion,lessons}` (only rounded display fields), never the raw object (raw
   intermediates risk last-ULP divergence across engines).

### 2D. Completeness scope — honesty (Decision D2)

Receipts exist only for the **receipted** ledger subset; pre-0018 / failed-persist
rows have `null receipt_compact`, and direct-Supabase/LAN/offline writes are
unreceipted in v1. Two options — **decision required:**

- **(Recommended) Back-fill at issuance:** when building `/transcript`, for any
  ledger row lacking a `receipt_compact`, issue+persist a receipt right then, so the
  seal is literally complete **over all ledger rows**. Verdict wording stays scoped:
  *"sealed receipted work — N items."* Unreceipted non-ledger writes remain a separate
  ingestion gap, stated explicitly.
- **(Cheaper) Seal-the-subset + relabel:** seal only currently-receipted rows; the
  verifier shows *"sealed items: N (receipted work only)"* and the classifier marks
  rows covered|unreceipted, never failing red on legacy rows.

Either way: **never show a green "complete record" seal over a partial set.**

### 2E. Server endpoint

`GET /transcript` on roster-server (auth = roster Bearer token, mirror `/grade`):
verify token → `sid`; `rows = getLedgerByStudent(sid)` (stable pre-sorted, 2C-2);
members = rows with receipts (back-fill per D2); `grade = computeGrade(rows, key,
config, {asOf, lessonSchedule, section})`; compute `root`, `cnt`, `gradeHash`,
`cfgHash`, `artHash`, `codeHash`; `manifest = issueTranscriptReceipt(...)`
(never-throw, modeled on `issueLedgerReceipt`); respond
`{ ok, transcript:{ manifest:<compact>, receipts:[<compact>...], breakdown, config } }`.
Read-only, stateless — **no server-side transcript persistence** (retention note, §FERPA).

### 2F. Export UX (Desk wallet)

"Export sealed transcript" in the wallet balance card → `GET /transcript` → download
one pretty-printed JSON (`transcript_<user>_<Q>_<YYYY-MM-DD>.json`, ≈20–80 KB for
50–200 receipts) via Blob+anchor. Offline → local-only, `manifest:null`, visible
**"UNSEALED (offline) — re-export online for the verifiable seal."** Optional "Print
summary": one page + a QR of the manifest (`verify.html#t=<manifestCompact>`). Warn
on export: *"This file contains your grades. Only send it to your teacher."*

### 2G. Import / verifier UX (verify.html transcript mode)

Add a `[Verify receipt] | [Verify transcript]` toggle; transcript mode takes a file
(drop/paste). `verifyTranscript(doc)`, fully offline:

1. Shape-check; verify the **manifest** (must be `t:'transcript'`, a **non-test**
   production issuer — TEST keys gated behind `?test=1`). Edit → sig fails → **INVALID**.
2. Verify **every** member; any sig fail → flag + overall FAIL.
3. **Completeness:** recompute `root'` over member receiptIds; assert `root'===root`
   **and** `members.length===cnt`. Mismatch → **"INCOMPLETE / TAMPERED."** (This is the
   cherry-pick wall.)
4. **Identity:** every member `sid===manifest.sid`; foreign sid → FAIL (defeats mixing
   two students' receipts).
5. **Grade cross-check (optional, powerful):** if the verifier's bundled `kh/sh/codeHash`
   match the manifest, run a ported `computeGrade` over the members and assert it equals
   `g`. On mismatch (key/engine drift since issuance), show the **server-sealed `g`**
   (authoritative) and *flag the drift* — defended-by-disclosure, never silent.

Verdict reuses the seal stamp: **"SEALED TRANSCRIPT · THE DESK — N items, complete,
untampered, grade X% (Q4)"** + per-component breakdown + explicit red flags. Partial
(manifest ok but completeness fails) is **FAIL** — never green on an incomplete set.

---

## 3. Threat model (critic-verified)

| Attack | Status | Why |
|--------|--------|-----|
| Cherry-pick / omit receipts | **Defended** | drops change `cnt` + `root`; can't re-sign |
| Edit a member's score | **Defended** | breaks member sig *and* its receiptId → root |
| Edit the manifest (`g`/`root`/`cnt`) | **Defended** | breaks Desk signature |
| Inject/forge a receipt | **Defended** | unsigned by a registry issuer; not in root |
| Replay an old/better transcript | **Defended (policy)** | crypto proves an authentic *old* seal; teacher reads `asOf`+`gq`. Anti-replay nonce = phase 2 |
| Mix two students' receipts | **Defended** | member `sid` must equal manifest `sid` |
| Grade-artifact / engine drift | **Defended-by-disclosure** | `artHash`/`cfgHash`/`codeHash` flag it; sealed `g` is source of truth |
| Self-sign a fake manifest | **Defended** | needs the Railway-only private key |
| Offline teacher, no network | **Defended** | trust root = embedded issuer pubkeys; pure WebCrypto |
| **Forged/self-graded scores** | **OPEN → Layer 1** | a valid token + client score (quiz_review, worksheet) launders a forged number. *Closed by 1B/1C.* |
| **Token theft** | **OPEN → Layer 1** | stolen credential mints a genuine transcript; HMAC exp + P2 CORS reduce blast radius |
| **Unreceipted historical work** | **OPEN → D2** | only receipted ledger rows are sealable |

## 4. FERPA / privacy

Student exporting their **own** record to themselves is squarely within FERPA's
access right (34 CFR §99.10); emailing it to their teacher is voluntary
self-disclosure. **Data minimization by construction:** the file carries `sid` (a
UUID), a pseudonymous Fruit_Animal `u` (labeled "not identity-verified"), item ids,
scores, timestamps, and `ah` (answer **hashes**, never raw answers) — **no legal
name, no raw work**. It is a **bearer artifact** (anyone holding it reads grades) →
the export warning is mandatory; never auto-email. Keep real names **out** of the
transcript; the teacher re-identifies via their own roster. `GET /transcript` creates
**no server copy** — do not add server-side transcript persistence without a retention
review.

---

## 5. Build order

1. **Layer 1 P0** — quiz-server `token.js` + shared secret + sid-binding (1A); `quiz_review` server-side credit (1C). *Foundation; nothing trustworthy ships before this.*
2. **Determinism hardening (2C)** — `asOf` threading (both sites) + `asOfDateNY`; `latestPerItem` tiebreaker + stable pre-sort; freeze the recursive canonicalizer + test vector; add `codeHash`. *Decoupled, testable, no UX.*
3. **Layer 2 manifest + endpoint (2A/2B/2D/2E)** — `issueTranscriptReceipt`, `GET /transcript`, back-fill (per D2), frozen `t:'transcript'` contract + test vector in `receipt-system-spec.md`.
4. **Export + verifier UX (2F/2G).**
5. **Layer 1 P1** — worksheet `worksheet-key.json` recompute + `g` provenance (can land parallel to 3/4; tightens honesty of `sc`).
6. **Layer 1 P2 + anti-replay nonce** — `timingSafeEqual`, CORS lockdown, server-persist; optional freshness challenge.

## 7. Backlog — upcoming tasks (not yet built)

Tracked here so they aren't lost. Build order is a suggestion, not a dependency chain.

- **§1B — worksheet server-side recompute.** The last client-supplied-score path:
  bundle a `worksheet-key.json`, recompute `WS-*` blank scores in `mountLedger` using
  the shipped `normalizeWorksheetGrades` semantics, keep AI as upgrade-only. Tightens
  honesty of `sc` for worksheets (currently labeled `g:'self'`).
- **Backfill A1 — sign the original work time on backfilled receipts.** The transcript
  back-fill (D2) and any bulk backfill currently sign `ts = Date.now()`. Add an optional
  `ts` to `issueLedgerReceipt` and pass the row's `recorded_at`, so a backfilled receipt
  attests *when the work was actually done*, not when it was sealed.
- **Backfill A2 — proactive bulk backfill of receiptless ledger rows.** A one-time
  `scripts/backfill-receipts.mjs` (or a teacher-gated admin endpoint) that walks every
  roster student, finds `item_ledger` rows with `receipt_compact IS NULL`, and signs +
  persists a receipt for each (using A1's original-time fix). Effect: every student's
  *already-done* work shows up in the wallet immediately, not only when a transcript is
  exported. ~1 day; depends on A1 for correct timestamps.
- **Backfill B — ingest non-ledger historical work.** Work that never reached
  `item_ledger` (direct browser→Supabase `answers` writes, LAN/offline submissions,
  pre-feeder work) has nothing to backfill from. Needs an ingestion job that reads the
  `answers` table (and any other sources), maps each to a ledger item, and inserts the
  ledger rows so they become receiptable. **Gated on identity reconciliation:** `answers`
  is keyed by the legacy Fruit_Animal username, not `student_id`, so this must run after
  / alongside the orphan/identity-claim mapping. Bigger; data-quality sensitive.
- **Anti-replay freshness.** Optional server "as-of challenge" nonce so a teacher can
  demand a transcript minted within a window, beyond the signed `asOf` (phase 2).
- **Print/QR summary.** Optional one-page printable summary + a QR of the manifest
  (Tier-A report-card receipt) from the wallet export.
- **Independent grade recompute in the verifier.** Bundle the answer-key + grade engine
  into `verify.html` so it re-derives the grade and checks it against the signed `g`
  (currently the verifier trusts the signed `g`; `artHash`/`cfgHash`/`codeHash` already
  let it *detect* drift).

## 6. Decisions — RESOLVED 2026-06-13

- **D1 — `g` = live v3 `quarterGrade`** (1-dp float; the number the wallet shows). Freeze type = 1-dp float; source = `computeGrade` quarterGrade for the current quarter (`gq`).
- **D2 — back-fill at issuance.** `GET /transcript` issues+persists a receipt for any ledger row lacking `receipt_compact` so the seal is literally complete over **all ledger rows**. Verdict wording stays "sealed receipted work — N items"; unreceipted non-ledger writes (direct-Supabase/LAN) remain an explicit out-of-scope ingestion gap.
- **D3 — additive-optional `sid`.** No `v` bump. Quiz `answer`/`verdict` payloads gain an optional `sid`; `verify.html` verifies any valid signature regardless, and old receipts (no `sid`) stay valid. `u` is retained as display-only.
