import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { availableParallelism } from 'node:os';

const directory = 'test/integration';
const windowsOnly = new Set([
  'gate1-owner-data-import-postgres.test.js'
]);
const clusterRoleSerial = new Set([
  'actor-base-attributes-activation-postgres.test.js',
  'actor-base-attributes-import-postgres.test.js',
  'gate1-runtime-activation-postgres.test.js',
  'gate1-seed-closure-postgres.test.js',
  'procedural-authoring-import-postgres.test.js'
]);
const heavySerial = new Set([
  'first-playable-v2-activation-postgres.test.js',
  'lower-dvina-trace-phase-1b-postgres.test.js'
]);
const files = (await readdir(directory))
  .filter((file) => file.endsWith('.test.js'))
  .filter((file) => process.platform === 'win32' || !windowsOnly.has(file))
  .sort();
const serialFiles = files.filter((file) => clusterRoleSerial.has(file));
const heavyFiles = files.filter((file) => heavySerial.has(file));
const parallelFiles = files.filter(
  (file) => !clusterRoleSerial.has(file) && !heavySerial.has(file)
);
const parallelism = Math.max(1, Math.min(4, availableParallelism()));

const serial = run(serialFiles, 1);
const heavy = run(heavyFiles, 1);
const parallel = run(parallelFiles, parallelism);
process.exit(serial === 0 && heavy === 0 && parallel === 0 ? 0 : 1);

function run(selected, concurrency) {
  if (selected.length === 0) return 0;
  const result = spawnSync(process.execPath, [
    '--test',
    `--test-concurrency=${concurrency}`,
    ...selected.map((file) => `${directory}/${file}`)
  ], { stdio: 'inherit' });
  return result.status ?? 1;
}
