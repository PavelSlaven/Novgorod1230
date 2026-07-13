import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.js';

await loadLocalEnv();

const repoRoot = resolve(import.meta.dirname, '..');
const mode = readArg('--mode') || 'staged';
const auditRoot = resolve(process.env.RUS13_WORLD_BASE_FK_AUDIT_ROOT || joinRepo('tools/rus13-world-base-fk-audit/world_base_fk_audit_v1'));
const importerRoot = resolve(process.env.RUS13_WORLD_BASE_IMPORTER_ROOT || joinRepo('tools/rus13-world-base-importer/world_base_importer_v1'));
const scriptPath = resolve(auditRoot, 'scripts', 'audit_world_base_fk.py');
const inputRoot = resolve(process.env.RUS13_BASE_INPUT_ROOT || joinRepo('data/rus13-base-staging'));
const outDir = resolve(readArg('--out-dir') || joinRepo(`data/world-base-fk-audit-${mode}`));
const databaseUrl = process.env.WORLD_DB_ADMIN_URL || process.env.DATABASE_URL || '';

mkdirSync(outDir, { recursive: true });

const args = [
  scriptPath,
  '--mode', mode,
  '--input-root', inputRoot,
  '--importer-root', importerRoot,
  '--out-json', resolve(outDir, 'world_base_fk_audit_report_v1.json'),
  '--out-md', resolve(outDir, 'world_base_fk_audit_report_v1.md'),
  '--out-violations-csv', resolve(outDir, 'world_base_fk_violations_v1.csv'),
  '--out-rule-summary-csv', resolve(outDir, 'world_base_fk_rule_summary_v1.csv')
];

if (mode === 'database') {
  args.push('--database-url', databaseUrl);
}

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
