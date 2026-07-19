import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
for (const script of ['spatial-v3:check-p16', 'spatial-v3:test-p16', 'spatial-v3:test-p16-postgres']) if (!packageJson.scripts[script]) throw new Error(`package.json lacks ${script}`);
for (const file of ['apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js', 'apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js', 'packages/party-store/src/spatial-v3-repository.js', 'packages/turn/src/spatial-v3-write-plan.js', 'test/spatial-v3/p16-persistence.test.js']) await readFile(file, 'utf8');
for (const file of ['test/spatial-v3/p16-persistence.test.js', 'test/spatial-v3/p16-persistence-postgres.test.js', 'test/spatial-v3/p16-committer-postgres.test.js']) { const run = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', timeout: 120000 }); if (run.status !== 0) throw new Error(run.stdout + run.stderr); }
console.log('P16 persistence boundary checks passed.');
