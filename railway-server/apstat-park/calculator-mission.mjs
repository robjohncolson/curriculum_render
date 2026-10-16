const { DEFAULT_LEVEL, levelById, challengeFor, answerTiles, answerValue, answerMatches, feedbackFor } = await import('./calculator-curriculum.mjs' + new URL(import.meta.url).search);
const { discriminatorFor, skillTitle } = await import('./calculator-recognition.mjs' + new URL(import.meta.url).search);
// A round with random data (protocol 10) carries its own values/setup/computed/finalView/stem in
// state.problem; they replace the catalogue's for that round (APSTAT_PARK_CALCULATOR_FLUENCY_SPEC §2).
export function missionFor(state) {
  const level = levelById(state?.missionId) || DEFAULT_LEVEL;
  if (!state?.problem) return level;
  return { ...level, ...state.problem, varied: true };
}
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
// Protocol 10 (§5): a wrong key costs the current step 2 s, at most once per 2 s.
export const WRONG_KEY_MS = 2000;
// Never wrong, whatever the screen does: moving the cursor and arming a modifier. Routes were
// shortened to the engine's shortcuts (ZOOM straight from the plot editor, ALPHA MATH instead of
// scrolling DISTR), so the old long way (DOWN DOWN, scrolling a menu) is still a fair way to walk and
// must never be charged (teacher: never a cost for a different route to the same place). Only keys
// that DO something (open a menu, type a digit, run a function) can be wrong. CLEAR only ever backs
// out (the advertised recovery: WRONG KEY · CLEAR BACKS OUT), so it is never charged either.
export const NEVER_WRONG = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT', '2ND', 'ALPHA', 'CLEAR']);
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
// Protocol 14 (ABSORB_SPEC §4): the recognition step before the route. state.recognition is
// null (no step) or { skill, stem, options: [4 skillIds], picked, correct, message }; while
// `picked` is null the round shows the word problem and four procedure tiles, no keypad, no clock.
export const recognitionPending = state => !!state?.recognition && !state.recognition.picked;
// Two rows of two wide tiles where the answer choices go (climbable like them).
export function recognitionTiles(recognition) {
  return (recognition?.options || []).map((key, i) => ({ key, label: skillTitle(key),
    x: 60 + (i % 2) * 320, y: 570 + Math.floor(i / 2) * 34, w: 300, h: 30 }));
}
// The relay judges the pick: right or wrong, the route then starts on the round's own skill, and
// the clock starts now (a wrong pick is remembered on the state for the SRS quality and the
// one-sentence discriminator it is told). false: nothing pending, or not one of the tiles.
export function pickRecognition(state, skillId, now) {
  if (!recognitionPending(state) || !state.recognition.options.includes(skillId)) return false;
  const recognition = state.recognition;
  recognition.picked = skillId;
  recognition.correct = skillId === recognition.skill;
  recognition.message = recognition.correct ? null : discriminatorFor(recognition.skill, skillId);
  state.revision++;
  state.startedAt = now;
  state.holdAt = null; state.holdStep = null;
  return true;
}
export function tilesFor(step, level = DEFAULT_LEVEL, recognition = null) {
  if (recognition && !recognition.picked) return recognitionTiles(recognition);
  if (step < level.route.length) return KEYS;
  if (level.id === 'one-var-stats' && !level.varied) return ANSWERS;
  return answerTiles(level, Math.min(step - level.route.length, challengeFor(level).answers.length - 1));
}
export function expectedAt(step, level = DEFAULT_LEVEL) {
  return step < level.route.length ? level.route[step] : String(challengeFor(level).answers[step - level.route.length]);
}
export function tileAt(pose, step, level = DEFAULT_LEVEL, recognition = null) {
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)) return null;
  return tilesFor(step, level, recognition).find(tile => pose.x + 10 >= tile.x && pose.x + 10 <= tile.x + tile.w
    && Math.abs(pose.y + 24 - tile.y) <= 5)?.key ?? null;
}
// problem: the round's random data (a varied level from calculator-variation.mjs), else null.
// Protocol 11: it also carries the round's route and hints (a templated randIntNoRep round types
// different digits), and goals when the variation rewrote the goal phrases.
// recognition: the round's recognition step (calculator-recognition.mjs recognitionFor), or null.
export function createMission(now, level = DEFAULT_LEVEL, recognition = null) {
  const problem = level.varied ? { values: level.values, setup: level.setup, computed: level.computed,
    finalView: level.finalView, stem: level.stem, route: level.route, hints: level.hints,
    ...(level.goals ? { goals: level.goals } : {}) } : null;
  return { missionId: level.id, step: 0, revision: 0, startedAt: now, holdAt: null, holdStep: null,
    bonus: 0, complete: false, keys: [], checkpointKeys: [], lastPress: null,
    timeoutCount: 0, hintKeys: [], boxValues: [], boxAttempts: 0, lastPlot: null,
    problem, lastPenaltyAt: null, recognition: recognition ? { ...recognition } : null,
    // Protocol 15 (ABSORB_SPEC §5): wrong keys this round, for the recall quality (the relay
    // carries it and timeoutCount across a time-up restart).
    wrongKeys: 0,
    // Protocol 16 (§7): the handheld check after a solo clear, set by the relay at completion:
    // { label, attempts, status: null | 'passed' | 'failed' }. null = not offered.
    handheld: null };
}
// Relay clock only. A stale pose never counts as somebody still holding a key.
// isWrong(key): the relay engine's wrong-key judgment (engine.isWrongKey), see pressMissionKey.
export function advanceMission(state, members, now, transitions = {}, isWrong = () => false) {
  const level = missionFor(state), ROUTE = level.route, SUMMARY = challengeFor(level).answers;
  // The room owns timeout deaths and team resets. Input never renews an expired timer.
  if (recognitionPending(state) || state.complete || now - state.startedAt >= timeLimitFor(state)) return false;
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
  return pressMissionKey(state, key, now, transitions, isWrong);
}
// §5: shortens the current step's clock (the relay owns startedAt). Returns the time taken.
// At most once per WRONG_KEY_MS, so a panic burst cannot drain the round.
function chargeWrongKey(state, now) {
  if (state.lastPenaltyAt != null && now - state.lastPenaltyAt < WRONG_KEY_MS) return 0;
  state.lastPenaltyAt = now;
  state.startedAt -= WRONG_KEY_MS;
  return WRONG_KEY_MS;
}
// Clicks and optional standing holds use the same engine-validated input path.
// isWrong(key) is asked before the key is recorded: true when the key changes the screen, reaches
// no checkpoint ahead and returns to no checkpoint already reached (engine.isWrongKey). Keys in
// NEVER_WRONG are never asked. Without it
// (older callers, the client) no press is ever wrong.
export function pressMissionKey(state, key, now, transitions = {}, isWrong = () => false) {
  const level = missionFor(state), ROUTE = level.route, SUMMARY = challengeFor(level).answers;
  if (recognitionPending(state) || state.complete || now - state.startedAt >= timeLimitFor(state)
    || !tilesFor(state.step, level).some(tile => tile.key === key)) return false;
  if (state.step >= ROUTE.length) {
    // Numeric questions keep numbers; category questions keep the chosen key.
    state.boxValues.push(answerValue(level, state.step - ROUTE.length, key));
    state.step++;
    state.revision++;
    state.holdAt = null; state.holdStep = null;
    state.lastPress = { key, advanced: true };
    if (state.boxValues.length < SUMMARY.length) return true;
    const correct = state.boxValues.every((value, i) => answerMatches(value, SUMMARY[i]));
    state.lastPlot = { values: state.boxValues.slice(), correct, at: now };
    // The whole answer is judged once; the first wrong pick gets its specific explanation.
    if (!correct) state.lastPlot.feedback = feedbackFor(level, state.boxValues);
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
  const wrong = nextStep == null && !NEVER_WRONG.has(key) && isWrong(key);
  if (state.step < ROUTE.length) state.keys.push(key);
  state.lastPress = { key, advanced: nextStep != null };
  if (wrong) { Object.assign(state.lastPress, { wrong: true, penaltyMs: chargeWrongKey(state, now) }); state.wrongKeys = (state.wrongKeys || 0) + 1; }
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
