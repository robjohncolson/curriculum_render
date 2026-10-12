import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from './calculator-native/manifest.mjs';
import { createMissionEngine } from './calculator-engine.mjs';
import { varyProblem, solveProblem } from './calculator-variation.mjs';
import { KEYS } from './calculator-mission.mjs';

import { DEFAULT_LEVEL, challengeFor } from './calculator-curriculum.mjs';

// Vendored trainer code executes locally on the relay, with no DOM or network.
const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) {
  vm.runInContext(readFileSync(new URL('./calculator-native/' + file, import.meta.url), 'utf8'), sandbox, { filename: file });
}
export function createCalculatorRuntime(level = DEFAULT_LEVEL) {
  return createMissionEngine(sandbox.window.TI84Native.create, level.setup, level.route, KEYS.map(tile => tile.key));
}
// Protocol 10 (§2): the level with random data for this round, its computed/finalView read off the
// real calculator. A level that does not vary, or whose replay fails, plays as the catalogue wrote it.
// Protocol 11: a randIntNoRep level gets a new seed/population/size and its own route; a varied route
// whose length differs from the catalogue's (the goal spans are keyed by step) throws and falls back.
export function varyLevel(level, random = Math.random) {
  if (!level) return level;
  try {
    const varied = varyProblem(level, random);
    if (!varied) return level;
    const solved = solveProblem(varied, sandbox.window.TI84Native.create);
    // Every answer tile must be a real number, or the round cannot be won.
    if (challengeFor(solved).answers.every(Number.isFinite)) return solved;
    console.warn('calculator variation produced no answer for', level.id);
    return level;
  } catch (error) {
    console.warn('calculator variation failed for', level.id, error?.message || error);
    return level;
  }
}
