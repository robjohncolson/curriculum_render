// The handheld check (APSTAT_PARK_TRAINER_ABSORB_SPEC §7, protocol 16): after a solo clear, the
// student may enter the same data on their real TI-84 and type the headline result. The relay
// judges it (shared byte-identical with the relay); a pass masters the skill (§5), which pays the
// solo door's bonus point if it is the first mastery (§6). One retry, then nothing is recorded.
// ABSORB_2 §4: up to three fields; a check passes only when every field matches.
const V = new URL(import.meta.url).search;
const { challengeFor } = await import('./calculator-curriculum.mjs' + V);

export const HANDHELD_ATTEMPTS = 2;

// ABSORB_2 §4: how many fields the check asks for (decided: three keeps the form one row).
export const HANDHELD_FIELDS = 3;

// A decision answer ("Reject H0? 1=yes") is not a number the calculator shows, so the check
// never asks for it.
const isCalculatorReading = (label, expected) => typeof expected === 'number' && Number.isFinite(expected) && !label.startsWith('Reject ');

// What the round asks for: the challenge's first three numeric answers (the round's own data),
// each with its label ('Minimum', 'p-value', 'Lower bound', ...). `label` is the first field's
// label, kept for older packets. null when the challenge has no number.
export function handheldFor(level) {
  const challenge = challengeFor(level);
  const answers = challenge?.answers || [];
  const fields = [];
  answers.forEach((expected, i) => {
    const label = challenge.labels?.[i] || 'Result';
    if (fields.length < HANDHELD_FIELDS && isCalculatorReading(label, expected)) fields.push({ label, expected });
  });
  if (!fields.length) return null;
  return { fields, label: fields[0].label };
}

// Decimal places the student actually wrote, ignoring trailing zeros ("30.50" -> 1, "9.0" -> 0).
function typedDecimalPlaces(text) {
  const dot = text.indexOf('.');
  if (dot === -1) return 0;
  return text.slice(dot + 1).replace(/0+$/, '').length;
}

// Ported exactly from ti84-trainer-v2/app.js lines 1024-1066 (valuesMatch; native/stat-math.js has
// no tolerance of its own). Students write the calculator's value however they like: full
// precision, 3 / 2 / 1 decimals, rounded up, rounded down, or clipped to a whole number. Accept
// the entry if it equals ANY valid rounding or truncation of the exact value at the number of
// decimal places typed (3.6055 is satisfied by 3.6055, 3.61, 3.6, 4, or 3). The whole-number
// leniency applies only to |expected| >= 1; for proportions and p-values a bare "0" or "1" means
// nothing and falls through to the backstop: 0.5% relative or 0.0005 absolute.
export function handheldMatches(typed, expected) {
  const normalized = String(typed ?? '').trim().replace(/\(-\)/g, '-').replace(/[−‒–]/g, '-').replace(/\s+/g, '');
  const a = parseFloat(normalized);
  if (Number.isNaN(a) || typeof expected !== 'number' || Number.isNaN(expected)) return false;
  if (expected === 0) return Math.abs(a) < 0.005;
  const decimals = typedDecimalPlaces(normalized);
  if (decimals > 0 || Math.abs(expected) >= 1) {
    const factor = Math.pow(10, decimals);
    const scaled = expected * factor;
    const candidates = [Math.round(scaled), Math.floor(scaled), Math.ceil(scaled), Math.trunc(scaled)];
    if (candidates.some(c => Math.abs(a - c / factor) <= 1e-7)) return true;
  }
  const relTol = 0.005, absTol = 0.0005;
  return Math.abs(a - expected) <= Math.max(relTol * Math.abs(expected), absTol);
}
