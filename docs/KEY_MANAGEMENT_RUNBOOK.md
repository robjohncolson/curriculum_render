# Receipt Issuer Key Management Runbook

Covers the Ed25519 signing keys behind the Signed Receipt System (see
`docs/receipt-system-spec.md`). Addresses audit findings P1 (no key
backup/rotation runbook), and the migration/config-pin gaps.

## The keys (production)

Two independent issuers, one keypair each. The PRIVATE key lives ONLY in that
service's Railway env var `RECEIPT_ISSUER_PRIVATE_KEY` (base64 PKCS8). The PUBLIC
key is pinned below and embedded in `verify.html`'s issuer registry.

| Issuer | Service / repo | Railway app | Public key (base64url raw 32B) |
|--------|----------------|-------------|--------------------------------|
| **Quiz Server** | `curriculum_render/railway-server` | `curriculumrender-production` | `yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4` |
| **The Desk** | `follow-alongs/roster-server` | `roster-production-12c1` | `DRfEbaWByfatxMq26iHrw4wxt4MIpypZlbB3GeBFSO4` |

Verify a service's live key any time: `GET /api/receipts/issuer` (quiz) or
`GET /receipts/issuer` (Desk) → `{enabled, alg, v, pubkey}`.

TEST keypair (intentionally public, dev/self-test only — never signs real work):
- Quiz test pub `ysLRAoc-rg-N2VTE2IR9s6Z1QT--9X64Qg3Px-6rUow`
- Desk test pub `sj9NUx5jBO-KTI58WKjQwEr22i7f8fiv--KH4z95JCc`

## ⚠️ Why this matters (the catastrophic-loss risk)

The private keys exist in exactly one place each: a Railway env var. **If a key
is lost or regenerated, every receipt ever signed with it becomes permanently
unverifiable** — the public key in `verify.html` no longer matches, so every
past "Verify" turns red. There is no recovery without the original private key.
Receipts are bearer artifacts; the signing key IS the trust anchor.

## DO THIS NOW — back up both private keys

1. Railway → `curriculumrender-production` → Variables → reveal
   `RECEIPT_ISSUER_PRIVATE_KEY`. Copy the value.
2. Store it in a password manager / secret vault under "Receipt issuer — Quiz
   Server (curriculum_render)". Record the pubkey above alongside it.
3. Repeat for `roster-production-12c1` → "Receipt issuer — The Desk (roster)".
4. Confirm each stored private key reproduces its pubkey:
   `node curriculum_render/scripts/receipt_keytool.mjs sign "<PRIVKEY>" '{"v":1,"t":"answer","u":"x","q":"x","ah":"x","ts":1,"n":"x"}'`
   then verify with the matching pubkey — it must say `ok:true`.

## Generating a new keypair

```
node curriculum_render/scripts/receipt_keytool.mjs gen
```
Prints the PKCS8 private key (→ Railway env var, back it up immediately) and the
raw pubkey (→ `verify.html` registry + the table above).

## Rotating a key (e.g. suspected compromise)

Rotation is ADDITIVE — never delete an old public key, or receipts signed with it
stop verifying.

1. `gen` a new keypair; back up the new private key.
2. Add the new public key to `verify.html`'s `ISSUERS` array **above** the old
   one (production keys first). Keep the old entry, relabel it e.g.
   `The Desk (rotated 2026-06)`. Update the table above.
3. Set the new `RECEIPT_ISSUER_PRIVATE_KEY` on the service and redeploy.
4. New receipts sign with the new key; old receipts still verify against the
   retained old public key. The registry only ever grows.

## Deploy ordering (so receipts never silently break)

1. **Migration first.** `roster-server/migrations/0018_item_ledger_receipt.sql`
   is USER-RUN in the Supabase SQL editor and must be applied before (or with)
   the deploy that writes `receipt_id`/`receipt_compact`. Code degrades safely if
   it lags (persistence no-ops, in-band receipt still returned) but durable
   replay won't work until it's run. **Status: applied 2026-06-12.**
2. **Server redeploy.** roster-server / railway-server are manual Railway
   redeploys. Until redeployed, the live service runs the old code (no issuance).
3. **Client push.** GitHub Pages auto-deploys `verify.html` + the Desk on push.
   Push pubkey changes to `verify.html` BEFORE students hit new receipts.

## Deploy coordination — auth foundation + sealed transcripts

The sid-binding and the sealed-transcript system add cross-service coupling.
Deploy in this order:

1. **Shared `ROSTER_TOKEN_SECRET` on BOTH Railway services.** The quiz server now
   verifies the roster session token (to sign the verified `sid`) using the SAME
   HMAC secret the roster server issues tokens with. Set the identical
   `ROSTER_TOKEN_SECRET` on `curriculumrender-production` AND `roster-production-12c1`.
   If they differ, every quiz receipt silently stops issuing — watch
   `GET /health.rosterAuth` (must be `true` on both).
2. **The `quiz_review` fix is a coordinated deploy.** The quiz server now signs a
   review-grant and the roster server *requires* it for `quiz_review`/`quiz_exception`
   writes. Push the client (GitHub Pages) AND redeploy BOTH Railway services
   **together**. Until a student's browser loads the new client, their appeals send no
   grant and the roster server returns `400 review grant required` — they just reload.
   The roster verifier pins the quiz public key `yFByWH5a…`; if you rotate the quiz
   issuer key, also set `REVIEW_GRANT_PUBKEY` on the roster service to the new pubkey.
3. **Migration 0018** (receipt persistence) must be applied before the transcript
   back-fill persists receipts — already applied 2026-06-12.
4. **Verifier:** `verify.html` carries the production issuer keys and the transcript
   mode; pushing it to GitHub Pages is all that's needed (no server dependency).

## Health check

After any redeploy, confirm issuance is live (an unset env var silently disables
it): `GET /api/receipts/issuer` and `GET /receipts/issuer` must both return
`enabled:true` with the expected pubkey. The `/health` endpoints also carry a
`receipts` block (added in the P2 hardening pass) — watch that it stays `enabled`.
