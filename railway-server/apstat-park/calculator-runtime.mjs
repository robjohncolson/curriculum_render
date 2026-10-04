import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from './calculator-native/manifest.mjs';
import { createMissionEngine } from './calculator-engine.mjs';
import { DATA, ROUTE, KEYS } from './calculator-mission.mjs';

// Vendored trainer code executes locally on the relay, with no DOM or network.
const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) {
  vm.runInContext(readFileSync(new URL('./calculator-native/' + file, import.meta.url), 'utf8'), sandbox, { filename: file });
}
export function createCalculatorRuntime() {
  return createMissionEngine(sandbox.window.TI84Native.create, DATA, ROUTE, KEYS.map(tile => tile.key));
}
