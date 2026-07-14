import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXPECTED_COUNTS = Object.freeze({
  input: 817,
  pcRemoved: 364,
  bonusRemoved: 86,
  kept: 367,
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const curriculumPath = path.join(repositoryRoot, 'data', 'curriculum.js');
const crosswalkPath = path.join(repositoryRoot, 'data', '2026-crosswalk.json');

function oldTopicOf(id) {
  const match = id.match(/U(\d+)-L(\d+)/);
  if (!match) return null;

  return `${match[1]}.${match[2]}`;
}

function evaluateCurriculum(source) {
  assert.match(
    source,
    /^const EMBEDDED_CURRICULUM = \[/,
    'curriculum.js must keep the EMBEDDED_CURRICULUM wrapper',
  );

  const script = new vm.Script(`${source}\nEMBEDDED_CURRICULUM;`, {
    filename: curriculumPath,
  });

  return script.runInNewContext(Object.create(null), { timeout: 5_000 });
}

function serializeCurriculum(curriculum) {
  const indentedJson = JSON.stringify(curriculum, null, 2).replaceAll('\n', '\n  ');
  return `const EMBEDDED_CURRICULUM = ${indentedJson}\n`;
}

const [curriculumSource, crosswalkSource] = await Promise.all([
  readFile(curriculumPath, 'utf8'),
  readFile(crosswalkPath, 'utf8'),
]);

const curriculum = evaluateCurriculum(curriculumSource);
const crosswalk = JSON.parse(crosswalkSource);

assert.ok(Array.isArray(curriculum), 'EMBEDDED_CURRICULUM must be an array');
assert.equal(
  curriculum.length,
  EXPECTED_COUNTS.input,
  `Expected ${EXPECTED_COUNTS.input} input items`,
);

const kept = [];
const removed = {
  pc: [],
  bonus: [],
};

for (const item of curriculum) {
  if (/-PC-/.test(item.id)) {
    removed.pc.push(item);
    continue;
  }

  const oldTopic = oldTopicOf(item.id);
  const entry = oldTopic ? crosswalk.map[oldTopic] : null;
  if (entry?.status === 'bonus') {
    removed.bonus.push(item);
    continue;
  }

  kept.push(item);
}

const orphanedSurvivors = kept.filter((item) => {
  const oldTopic = oldTopicOf(item.id);
  return !oldTopic || crosswalk.map[oldTopic]?.status !== 'core';
});

assert.equal(
  removed.pc.length,
  EXPECTED_COUNTS.pcRemoved,
  `PC removal mismatch: expected ${EXPECTED_COUNTS.pcRemoved}`,
);
assert.equal(
  removed.bonus.length,
  EXPECTED_COUNTS.bonusRemoved,
  `Bonus removal mismatch: expected ${EXPECTED_COUNTS.bonusRemoved}`,
);
assert.equal(
  kept.length,
  EXPECTED_COUNTS.kept,
  `Kept-count mismatch: expected ${EXPECTED_COUNTS.kept}`,
);
assert.deepEqual(
  orphanedSurvivors.map((item) => item.id),
  [],
  'Every surviving id must resolve to a core crosswalk entry',
);

await writeFile(curriculumPath, serializeCurriculum(kept));

console.log('Removed by reason:');
console.log(`  PC: ${removed.pc.length}`);
console.log(`  bonus: ${removed.bonus.length}`);
console.log(`Kept: ${kept.length}`);
console.log(`Total removed: ${removed.pc.length + removed.bonus.length}`);
