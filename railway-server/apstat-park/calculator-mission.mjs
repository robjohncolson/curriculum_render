// Shared with the relay's calculator-mission.mjs. Keep byte-identical (tested).
// Guided route from ti84-procedures-data.json: one-var-stats.
export const DATA = [4, 6, 7, 8, 10, 12, 13, 14, 18, 20];
export const ROUTE = ['STAT', 'RIGHT', 'ENTER', 'DOWN', 'DOWN', 'ENTER', 'DOWN'];
export const HINTS = [
  'Open the statistics menu.', 'Move from EDIT to CALC.',
  'Choose 1:1-Var Stats.', 'L1 is ready. Move to FreqList.',
  'Each observation counts once. Move to Calculate.',
  'Calculate the statistics.', 'Scroll down to the five-number summary.',
];
export const SUMMARY = [4, 7, 11, 14, 20];
export const LABELS = ['Minimum', 'Q1', 'Median', 'Q3', 'Maximum'];
export const HOLD_MS = 900;
export const ROUND_MS = 10000;
export const WORLD = { width: 720, height: 750, floor: 700 };
const rows = [
  ['Y=', 'WINDOW', 'ZOOM', 'TRACE', 'GRAPH'],
  ['2ND', 'MODE', 'DEL', '', ''],
  ['ALPHA', 'X,T,θ,n', 'STAT', 'LEFT', 'RIGHT'],
  ['', '', '', '', ''],
  ['MATH', 'APPS', 'PRGM', 'VARS', 'CLEAR'],
  ['x⁻¹', 'SIN', 'COS', 'TAN', '^'],
  ['x²', ',', '(', ')', '÷'],
  ['LOG', '7', '8', '9', '×'],
  ['LN', '4', '5', '6', '−'],
  ['STO→', '1', '2', '3', '+'],
  ['ON', '0', '.', '(−)', 'ENTER'],
];
export const KEYS = rows.flatMap((row, r) => row.flatMap((key, c) => key
  ? [{ key, x: 140 + c * 90, y: 290 + r * 36, w: 76, h: 26 }] : []));
// Diamond arrow pad, with STAT to its left (matching the physical keyboard).
KEYS.push({ key: 'UP', x: 455, y: 326, w: 76, h: 26 });
KEYS.push({ key: 'DOWN', x: 455, y: 398, w: 76, h: 26 });
export const ANSWERS = [14, 4, 20, 7, 11].map((value, i) => ({
  key: String(value), x: 110 + i * 108, y: 600, w: 94, h: 30,
}));
export function tilesFor(step) { return step < ROUTE.length ? KEYS : ANSWERS; }
export function expectedAt(step) {
  return step < ROUTE.length ? ROUTE[step] : String(SUMMARY[step - ROUTE.length]);
}
export function tileAt(pose, step) {
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)) return null;
  return tilesFor(step).find(tile => pose.x + 10 >= tile.x && pose.x + 10 <= tile.x + tile.w
    && Math.abs(pose.y + 24 - tile.y) <= 5)?.key ?? null;
}
export function createMission(now) {
  return { step: 0, revision: 0, startedAt: now, holdAt: null, bonus: 0, complete: false };
}
// Relay clock only. A stale pose never counts as somebody still holding a key.
export function advanceMission(state, members, now) {
  if (state.complete) return false;
  const correct = members.length > 0 && members.every(member =>
    member.ready !== false && member.revision === state.revision && now - member.at < 1500
    && tileAt(member.pose, state.step) === expectedAt(state.step));
  if (!correct) { state.holdAt = null; return false; }
  if (state.holdAt === null) { state.holdAt = now; return false; }
  if (now - state.holdAt < HOLD_MS) return false;
  if (now - state.startedAt <= ROUND_MS) state.bonus++;
  state.step++;
  state.revision++;
  state.startedAt = now;
  state.holdAt = null;
  state.complete = state.step === ROUTE.length + SUMMARY.length;
  return true;
}
