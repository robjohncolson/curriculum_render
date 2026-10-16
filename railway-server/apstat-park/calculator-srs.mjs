// Spaced recall (APSTAT_PARK_TRAINER_ABSORB_SPEC §5, protocol 15). Pure functions shared
// byte-identical with the relay, which owns every record (park_calc_srs, migration cr 0009).
// The schedule follows the student, not the device: v2's per-device state is not migrated.
//
// SM-2 numbers ported exactly from ti84-trainer-v2/app.js lines 3115-3140 (function sm2):
//   quality >= 3: interval 1 on the first repetition, 6 on the second, then
//                 Math.round(interval * ease); repetitions += 1
//   quality <  3: repetitions = 0, interval = 1
//   ease = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
//   nextReview = today + interval days
export const EASE_START = 2.5;
export const EASE_FLOOR = 1.3;
export const MASTERY_QUALITY = 4;

export function freshRecord() {
  return { repetitions: 0, intervalDays: 0, ease: EASE_START, nextReview: null, lastQuality: null, mastered: false };
}

// Quality 0..5 of one completed round (spec §5): start at 5; minus 1 per wrong key beyond the
// first; minus 1 if a time-up restart was needed; minus 1 for a wrong recognition pick; floor 0.
// round: { wrongKeys, timeoutCount, recognition } (the round's mission state).
export function qualityFor(round) {
  const wrongKeys = Math.max(0, Number(round?.wrongKeys) || 0);
  let quality = 5 - Math.max(0, wrongKeys - 1);
  if ((Number(round?.timeoutCount) || 0) > 0) quality -= 1;
  if (round?.recognition && round.recognition.correct === false) quality -= 1;
  return Math.max(0, Math.min(5, quality));
}

// mastered flips on the first SOLO clear at hint rung 2 (no hints) with quality >= 4 (spec §5);
// the handheld check (spec §7) is the other way in. Mastery pays the solo door's bonus (§6).
export function isMasteryClear({ solo, rung, quality }) {
  return solo === true && rung === 2 && quality >= MASTERY_QUALITY;
}

// The record after one round. today: 'YYYY-MM-DD' (the relay's school date). Never mutates.
export function advance(record, quality, today) {
  const previous = record || freshRecord();
  const q = Math.max(0, Math.min(5, Math.round(Number(quality) || 0)));
  let repetitions = previous.repetitions, interval = previous.intervalDays;
  if (q >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * previous.ease);
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }
  const ease = Math.max(EASE_FLOOR, previous.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return { ...previous, repetitions, intervalDays: Math.max(1, interval), ease, lastQuality: q,
    nextReview: addDays(today, Math.max(1, interval)) };
}

export function addDays(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// b - a in whole days (both 'YYYY-MM-DD').
export function daysBetween(a, b) {
  const utc = iso => { const [y, m, d] = String(iso).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(b) - utc(a)) / 86400000);
}

// The skills due today or earlier, most overdue first (ties by skill id).
// records: { skillId: record }. Returns [{ skillId, nextReview, overdueDays, mastered }].
export function dueSkills(records, today) {
  return Object.entries(records || {})
    .filter(([, record]) => record?.nextReview && daysBetween(record.nextReview, today) >= 0)
    .map(([skillId, record]) => ({ skillId, nextReview: record.nextReview, overdueDays: daysBetween(record.nextReview, today), mastered: record.mastered === true }))
    .sort((a, b) => b.overdueDays - a.overdueDays || (a.skillId < b.skillId ? -1 : 1));
}
