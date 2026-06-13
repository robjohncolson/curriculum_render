// Receipt issuer configuration (Signed Receipt System v1)
// See docs/receipt-system-spec.md
//
// PUBKEY is the Ed25519 issuer public key (base64url, raw 32 bytes — JWK 'x' form).
// The matching private key lives ONLY in the Railway env var RECEIPT_ISSUER_PRIVATE_KEY.
// Current value is the TEST key from the spec. Before classroom use, run:
//   node scripts/receipt_keytool.mjs gen
// then set the private key in Railway and paste the new pubkey here AND in verify.html.

window.RECEIPT_CONFIG = {
    v: 1,
    alg: 'Ed25519',
    pubkey: 'yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4', // production quiz-server issuer
    verifyUrl: 'https://robjohncolson.github.io/curriculum_render/verify.html'
};
