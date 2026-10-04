const { DEFAULT_LEVEL, levelById, challengeFor, answerTiles } = await import('./calculator-curriculum.mjs' + new URL(import.meta.url).search);
export const missionFor = state => levelById(state?.missionId) || DEFAULT_LEVEL;
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
export const ROUND_MS = 15000;
export const BOXPLOT_MS = 30000;
export const timeLimitFor = state => state.step < missionFor(state).route.length ? ROUND_MS : BOXPLOT_MS;
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
export function tilesFor(step, level = DEFAULT_LEVEL) {
  if (step < level.route.length) return KEYS;
  if (level.id === 'one-var-stats') return ANSWERS;
  return answerTiles(level, Math.min(step - level.route.length, challengeFor(level).answers.length - 1));
}
export function expectedAt(step, level = DEFAULT_LEVEL) {
  return step < level.route.length ? level.route[step] : String(challengeFor(level).answers[step - level.route.length]);
}
export function tileAt(pose, step, level = DEFAULT_LEVEL) {
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)) return null;
  return tilesFor(step, level).find(tile => pose.x + 10 >= tile.x && pose.x + 10 <= tile.x + tile.w
    && Math.abs(pose.y + 24 - tile.y) <= 5)?.key ?? null;
}
export function createMission(now, level = DEFAULT_LEVEL) {
  return { missionId: level.id, step: 0, revision: 0, startedAt: now, holdAt: null, holdStep: null,
    bonus: 0, complete: false, keys: [], checkpointKeys: [], lastPress: null,
    timeoutCount: 0, hintKeys: [], boxValues: [], boxAttempts: 0, lastPlot: null };
}
// Relay clock only. A stale pose never counts as somebody still holding a key.
export function advanceMission(state, members, now, transitions = {}) {
  const level = missionFor(state), ROUTE = level.route, SUMMARY = challengeFor(level).answers;
  // The room owns timeout deaths and team resets. Input never renews an expired timer.
  if (state.complete || now - state.startedAt >= timeLimitFor(state)) return false;
  const valid = state.step < ROUTE.length ? transitions : { [expectedAt(state.step, level)]: state.step + 1 };
  const key = tileAt(members[0]?.pose, state.step, level);
  const nextStep = valid[key];
  // Every physical key can be pressed. Different keys can also form consensus
  // when the engine confirms they reach the same next learning checkpoint.
  const choice = nextStep == null ? 'key:' + key : 'goal:' + nextStep;
  const agreed = key != null && members.length > 0 && members.every(member =>
    member.ready !== false && member.revision === state.revision && now - member.at < 1500
    && (tileAt(member.pose, state.step, level) === key
      || (nextStep != null && valid[tileAt(member.pose, state.step, level)] === nextStep)));
  if (!agreed) { state.holdAt = null; state.holdStep = null; return false; }
  if (state.holdAt === null || state.holdStep !== choice) {
    state.holdAt = now; state.holdStep = choice; return false;
  }
  if (now - state.holdAt < HOLD_MS) return false;
  return pressMissionKey(state, key, now, transitions);
}
// Clicks and optional standing holds use the same engine-validated input path.
export function pressMissionKey(state, key, now, transitions = {}) {
  const level = missionFor(state), ROUTE = level.route, SUMMARY = challengeFor(level).answers;
  if (state.complete || now - state.startedAt >= timeLimitFor(state)
    || !tilesFor(state.step, level).some(tile => tile.key === key)) return false;
  if (state.step >= ROUTE.length) {
    state.boxValues.push(Number(key));
    state.step++;
    state.revision++;
    state.holdAt = null; state.holdStep = null;
    state.lastPress = { key, advanced: true };
    if (state.boxValues.length < SUMMARY.length) return true;
    const correct = state.boxValues.every((value, i) => value === SUMMARY[i]);
    state.lastPlot = { values: state.boxValues.slice(), correct, at: now };
    if (correct) {
      state.complete = true;
      state.bonus += SUMMARY.length;
    } else {
      state.boxAttempts++;
      state.boxValues = [];
      state.step = ROUTE.length;
    }
    // One deadline for the entire boxplot, including every failed five-value attempt.
    return true;
  }
  const valid = state.step < ROUTE.length ? transitions : { [expectedAt(state.step, level)]: state.step + 1 };
  const nextStep = valid[key];
  if (state.step < ROUTE.length) state.keys.push(key);
  state.lastPress = { key, advanced: nextStep != null };
  state.revision++;
  state.holdAt = null;
  state.holdStep = null;
  // Incorrect/no-op presses still reach the engine and require a fresh hold.
  // They do not renew the 15-second deadline or award progress.
  if (nextStep == null) return true;
  if (!state.hintKeys.length) state.bonus += nextStep - state.step;
  state.step = nextStep;
  state.checkpointKeys = state.keys.slice();
  state.startedAt = now;
  state.hintKeys = [];
  state.complete = state.step === ROUTE.length + SUMMARY.length;
  return true;
}
