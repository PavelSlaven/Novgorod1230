import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';

const directory = 'test/integration';
const windowsOnly = new Set([
  'gate1-owner-data-import-postgres.test.js'
]);
const files = (await readdir(directory))
  .filter((file) => file.endsWith('.test.js'))
  .filter((file) => process.platform === 'win32' || !windowsOnly.has(file))
  .sort()
  .map((file) => `${directory}/${file}`);
const result = spawnSync(process.execPath,
  ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
