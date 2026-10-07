import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exclusionsPath = resolve(root, 'test/spatial-v3/ci-exclusions.json');
const exclusions = JSON.parse(await readFile(exclusionsPath, 'utf8'));
const validReference = /^(?:#\d+|LW-\d+)(?:\s*[/,]\s*(?:#\d+|LW-\d+))*$/;

if (exclusions.schema !== 'spatial-ci-exclusions/v1' || !Array.isArray(exclusions.exceptions)) {
  throw new Error(`${exclusionsPath}: expected spatial-ci-exclusions/v1 manifest`);
}

const spatialFiles = (await readdir(resolve(root, 'test/spatial-v3')))
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => `test/spatial-v3/${name}`);
const m2cFiles = (await readdir(resolve(root, 'scripts')))
  .filter((name) => /^m2c-.*\.test\.mjs$/.test(name))
  .map((name) => `scripts/${name}`);
const llmEvalFiles = (await readdir(resolve(root, 'tools/llm-runtime-eval/test')))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => `tools/llm-runtime-eval/test/${name}`);
const discovered = [...spatialFiles, ...m2cFiles, ...llmEvalFiles].sort();

const excluded = new Map();
for (const entry of exclusions.exceptions) {
  if (!entry || typeof entry.path !== 'string' || !entry.path ||
      typeof entry.reason !== 'string' || !entry.reason.trim() ||
      typeof entry.reference !== 'string' || !validReference.test(entry.reference)) {
    throw new Error(`${exclusionsPath}: every exception needs path, reason, and an issue/LW reference`);
  }
  if (excluded.has(entry.path)) throw new Error(`${exclusionsPath}: duplicate exception ${entry.path}`);
  excluded.set(entry.path, entry);
}

const discoveredSet = new Set(discovered);
for (const path of excluded.keys()) {
  if (!discoveredSet.has(path)) throw new Error(`${exclusionsPath}: stale or out-of-template exception ${path}`);
}

const selected = discovered.filter((path) => !excluded.has(path));
const accountedFor = new Set([...selected, ...excluded.keys()]);
if (accountedFor.size !== discovered.length || discovered.some((path) => !accountedFor.has(path))) {
  throw new Error('Spatial CI coverage error: every discovered test must be selected or explicitly excluded');
}
if (selected.length === 0) throw new Error('Spatial CI coverage error: no tests selected');

console.log(`Spatial CI: ${selected.length} tests selected; ${excluded.size} explicit exclusions.`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...selected], {
  cwd: root,
  stdio: 'inherit'
});

if (result.error) {
  console.error(`Spatial CI test runner failed to start: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
