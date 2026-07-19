import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = ['packages/movement-routes/src/spatial-v3.js', 'test/spatial-v3/p18-movement-planning.test.js'];
for (const file of files) await readFile(file, 'utf8');
const run = spawnSync(process.execPath, ['--test', 'test/spatial-v3/p18-movement-planning.test.js'], { encoding: 'utf8', timeout: 120000 });
if (run.status !== 0) throw new Error(run.stdout + run.stderr);
console.log('P18 movement planner: OK');
