import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.js';

await loadLocalEnv();

const repoRoot = resolve(import.meta.dirname, '..');
const mode = readArg('--mode') || 'dry-run';
const importerRoot = resolve(process.env.RUS13_WORLD_BASE_IMPORTER_ROOT || joinRepo('tools/rus13-world-base-importer/world_base_importer_v1'));
const scriptPath = resolve(importerRoot, 'scripts', 'import_world_base.py');
const inputRoot = resolve(process.env.RUS13_BASE_INPUT_ROOT || joinRepo('data/rus13-base-staging'));
const report = resolve(readArg('--report') || joinRepo(`data/world-base-import-${mode}.json`));
const outputSql = resolve(readArg('--output-sql') || joinRepo('data/world-base-import.sql'));
const databaseUrl = process.env.WORLD_DB_ADMIN_URL || getAdminUrl();

const args = [
  scriptPath,
  '--input-root', inputRoot,
  '--mode', mode,
  '--report', report
];

if (mode === 'apply') {
  args.push('--database-url', databaseUrl);
}
if (mode === 'emit-sql') {
  args.push('--output-sql', outputSql);
}

mkdirSync(dirname(report), { recursive: true });
if (mode === 'emit-sql') mkdirSync(dirname(outputSql), { recursive: true });

const result = spawnSync(process.env.PYTHON || 'python', args, {
  stdio: 'inherit',
  env: process.env
});
process.exit(result.status ?? 1);

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function joinRepo(relativePath) {
  return resolve(repoRoot, relativePath);
}

function getAdminUrl() {
  const user = process.env.POSTGRES_USER || 'world_admin';
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? '');
  const db = process.env.POSTGRES_DB || 'world_db';
  const port = process.env.POSTGRES_PORT || '5432';
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}
