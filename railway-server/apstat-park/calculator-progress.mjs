// APSTAT_PARK_TRAINER_ABSORB_2_SPEC §5: the Calculator Skills progress view (GET /park/calc/progress).
// One row per catalogue skill: the calendar gate, the hint rung's clears and the spaced-recall
// record. Read-only: it never creates a room, an attempt or a record. Nothing here is a grade.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dueSkills } from './calculator-srs.mjs';

// The vendored CED-2026 crosswalk (follow-alongs/scripts/sync-ced-crosswalk.mjs writes it;
// never hand-edit). Only the unit number is read here; labels stay on the Desk (cedLabel).
const CROSSWALK_PATHS = ['../data/2026-crosswalk.json', '../../data/2026-crosswalk.json'];
let crosswalkMap;

function crosswalk() {
  if (crosswalkMap !== undefined) return crosswalkMap;
  crosswalkMap = null;
  for (const relative of CROSSWALK_PATHS) {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    if (!existsSync(path)) continue;
    try { crosswalkMap = JSON.parse(readFileSync(path, 'utf8')).map || null; } catch (_) { crosswalkMap = null; }
    if (crosswalkMap) break;
  }
  return crosswalkMap;
}

// The CED-2026 unit (1..5) a stored topic key belongs to; a Beyond-the-Exam topic counts under its
// bonus unit. null when the crosswalk is missing or does not know the key.
export function cedUnitOf(topic) {
  const entry = crosswalk()?.[String(topic || '')];
  if (!entry) return null;
  if (entry.status === 'core') return entry.newUnit ?? null;
  return entry.bonusUnit ?? null;
}

// levels: the catalogue (CALCULATOR_LEVELS). eligibleIds: Set of skill ids the calendar has opened.
// clearsOf(skillId) -> count. records: { skillId: record } (the student's SRS records). today: 'YYYY-MM-DD'.
export function progressRows({ levels, eligibleIds, clearsOf, rungFor, records, today }) {
  const dueById = new Map(dueSkills(records, today).map(entry => [entry.skillId, entry]));
  return levels.map(level => {
    const record = records[level.skillId] || null;
    const clears = clearsOf(level.skillId);
    const due = dueById.get(level.skillId) || null;
    return {
      skillId: level.skillId,
      title: level.title,
      topic: level.topic,
      unit: cedUnitOf(level.topic),
      eligible: eligibleIds.has(level.skillId),
      clears,
      rung: rungFor(clears),
      repetitions: record ? record.repetitions : 0,
      intervalDays: record ? record.intervalDays : 0,
      nextReview: record ? record.nextReview : null,
      lastQuality: record ? record.lastQuality : null,
      mastered: record ? record.mastered === true : false,
      due: !!due,
      overdueDays: due ? due.overdueDays : 0,
    };
  });
}
