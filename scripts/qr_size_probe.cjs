/* qr_size_probe.js — quantify QR scannability for the receipt/verify workflow.
 * Computes the minimal QR version (byte mode) for each real payload at ECC L vs M,
 * the module count, and px-per-module at the actual render sizes used in the Desk.
 * No deps — embeds the ISO/IEC 18004 byte-mode data-capacity table.
 */
'use strict';

// Byte-mode data capacity (bytes) per version, columns L and M. ISO/IEC 18004.
// index = version (1..40); [L, M]
const BYTE_CAP = {
  1:[17,14],2:[32,26],3:[53,42],4:[78,62],5:[106,84],6:[134,106],7:[154,122],
  8:[192,152],9:[230,180],10:[271,213],11:[321,251],12:[367,287],13:[425,331],
  14:[458,362],15:[523,412],16:[589,450],17:[647,504],18:[721,560],19:[795,624],
  20:[861,666],21:[932,711],22:[1006,779],23:[1094,857],24:[1174,911],25:[1276,997],
  26:[1370,1059],27:[1468,1125],28:[1531,1190],29:[1631,1264],30:[1735,1370],
  31:[1843,1452],32:[1955,1538],33:[2071,1628],34:[2191,1722],35:[2306,1809],
  36:[2434,1911],37:[2566,1989],38:[2702,2099],39:[2812,2213],40:[2956,2331]
};
const modules = v => 17 + 4 * v;
function minVersion(byteLen, ecc /* 'L'|'M' */) {
  const col = ecc === 'L' ? 0 : 1;
  for (let v = 1; v <= 40; v++) if (BYTE_CAP[v][col] >= byteLen) return v;
  return null; // too big for a single QR
}

const SIG = 86;            // Ed25519 sig as base64url (64 bytes)
const b64urlLen = n => Math.ceil(n / 3) * 4 - ((3 - (n % 3)) % 3); // unpadded
const H64 = 'a'.repeat(64); // a SHA-256 hex
const H16 = 'a'.repeat(16);

function canonical(obj) {
  const sorted = {};
  for (const k of Object.keys(obj).sort()) if (obj[k] !== undefined) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}
function compactLen(payload) {
  const bytes = Buffer.byteLength(canonical(payload), 'utf8');
  return b64urlLen(bytes) + 1 + SIG; // payload.sig
}

const URL_R = 'https://robjohncolson.github.io/curriculum_render/verify.html#r='.length;        // transcript
const URL_C = 'https://robjohncolson.github.io/curriculum_render/verify.html#commit='.length;    // commit

// ---- Real payload shapes (from receipts.js) ----
const transcriptFull = {
  v:1,t:'transcript',sid:'stu_a1b2c3d4',u:'Date_Tiger',asOf:1781322153904,
  asOfDateNY:'2026-06-14',cnt:43,root:H64,g:'88',gq:'B+',
  gradeHash:H64,cfgHash:H64,artHash:H64,codeHash:H64,iss:'desk',ts:1781322153904,n:'deadbeef'
};
// Slim variant: keep the load-bearing claim (root commits to items, grade, date, count),
// drop the generating-environment provenance hashes (cfg/art/code) that the QR verifier
// doesn't need to confirm "this student earned grade X, sealed by the Desk".
const transcriptSlim = {
  v:1,t:'transcript',sid:'stu_a1b2c3d4',u:'Date_Tiger',asOf:1781322153904,
  asOfDateNY:'2026-06-14',cnt:43,root:H64,g:'88',gq:'B+',
  gradeHash:H64,iss:'desk',ts:1781322153904,n:'deadbeef'
};
const commit = {
  v:1,t:'commit',sid:'stu_a1b2c3d4',u:'Date_Tiger',seq:7,prev:H64,root:H64,
  cnt:8,from:1781300000000,to:1781322153904,iss:'desk',ts:1781322153904,n:'deadbeef'
};
const ledger = {
  v:1,t:'ledger',sid:'stu_a1b2c3d4',u:'Date_Tiger',src:'curriculum_quiz',i:'U1-L3-Q01',
  a:1,e:2,ah:H16,sc:1,g:'ai',ts:1781322153904,n:'deadbeef'
};

function report(name, byteLen, renderPx) {
  const vM = minVersion(byteLen, 'M'), vL = minVersion(byteLen, 'L');
  const mM = vM && modules(vM), mL = vL && modules(vL);
  const pxM = (renderPx && mM) ? (renderPx / mM).toFixed(2) : '—';
  const pxL = (renderPx && mL) ? (renderPx / mL).toFixed(2) : '—';
  console.log(
    name.padEnd(34) +
    `len=${String(byteLen).padStart(4)}  ` +
    `ECC-M v${String(vM).padStart(2)} (${String(mM).padStart(3)}mod, ${pxM}px/mod)   ` +
    `ECC-L v${String(vL).padStart(2)} (${String(mL).padStart(3)}mod, ${pxL}px/mod)`
  );
}

console.log('Scannability rule of thumb: phone needs ~>=3px/module off a screen; ~>=4 is comfortable.\n');

const tFull = URL_R + compactLen(transcriptFull);
const tSlim = URL_R + compactLen(transcriptSlim);
const tSlimBare = compactLen(transcriptSlim);
const cUrl = URL_C + compactLen(commit);
const cBare = compactLen(commit);

console.log('--- SEALED TRANSCRIPT (printed, currently 300px on paper) ---');
report('transcript URL (current, full)', tFull, 300);
report('transcript URL (slim payload)', tSlim, 300);
report('transcript BARE compact (slim)', tSlimBare, 300);
console.log('\n--- COMMIT QR (thumbnail 168px / enlarged 460px) ---');
report('commit URL @168 thumbnail', cUrl, 168);
report('commit URL @460 enlarged', cUrl, 460);
report('commit BARE @168 thumbnail', cBare, 168);
console.log('\n--- LEDGER receipt (per item) ---');
report('ledger URL @168', URL_R + compactLen(ledger), 168);
report('ledger BARE @168', compactLen(ledger), 168);

console.log('\nURL overhead: #r= prefix = ' + URL_R + ' chars, #commit= prefix = ' + URL_C + ' chars (pure QR cost).');
