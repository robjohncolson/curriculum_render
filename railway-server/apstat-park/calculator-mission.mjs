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
export const ROUND_MS = 30000;
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
  return { step: 0, revision: 0, startedAt: now, holdAt: null, holdStep: null,
    bonus: 0, complete: false, keys: [], timeoutCount: 0, hintKeys: [] };
}
// Relay clock only. A stale pose never counts as somebody still holding a key.
export function advanceMission(state, members, now, transitions = {}) {
  if (state.complete) return false;
  const valid = state.step < ROUTE.length ? transitions : { [expectedAt(state.step)]: state.step + 1 };
  if (members.length && now - state.startedAt >= ROUND_MS) {
    state.hintKeys = Object.keys(valid);
    state.timeoutCount++;
    state.revision++;
    state.startedAt = now;
    state.holdAt = null; state.holdStep = null;
    return true;
  }
  const key = tileAt(members[0]?.pose, state.step);
  const nextStep = valid[key];
  const correct = members.length > 0 && members.every(member =>
    member.ready !== false && member.revision === state.revision && now - member.at < 1500
    && nextStep != null && valid[tileAt(member.pose, state.step)] === nextStep);
  if (!correct) { state.holdAt = null; state.holdStep = null; return false; }
  if (state.holdAt === null || state.holdStep !== nextStep) {
    state.holdAt = now; state.holdStep = nextStep; return false;
  }
  if (now - state.holdAt < HOLD_MS) return false;
  if (!state.hintKeys.length) state.bonus += nextStep - state.step;
  if (state.step < ROUTE.length) state.keys.push(key);
  state.step = nextStep;
  state.revision++;
  state.startedAt = now;
  state.holdAt = null;
  state.holdStep = null;
  state.hintKeys = [];
  state.complete = state.step === ROUTE.length + SUMMARY.length;
  return true;
}
