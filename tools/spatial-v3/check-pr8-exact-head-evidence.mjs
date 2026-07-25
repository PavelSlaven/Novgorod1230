import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const manifestPath = resolve(
  root,
  'docs/implementation/pr8-travel-system/evidence/target-functional-exact-head.v1.json'
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const issues = [];
const issue = (code) => issues.push(code);
const git = (...args) => execFileSync(
  'git',
  ['-C', root, ...args],
  { encoding: 'utf8' }
).trim();

if (manifest.schema !== 'rus.pr8.target-functional-exact-head-evidence.v1') {
  issue('schema_invalid');
}
if (manifest.version !== 1
  || manifest.repository !== 'PavelSlaven/Novgorod1230'
  || manifest.pull_request !== 8
  || manifest.branch !== 'codex/pr8-travel-system') {
  issue('identity_invalid');
}
if (!/^[0-9a-f]{40}$/u.test(manifest.subject_commit)
  || !/^[0-9a-f]{40}$/u.test(manifest.subject_tree)
  || !/^[0-9a-f]{40}$/u.test(manifest.base_commit)) {
  issue('git_identity_invalid');
}

try {
  if (git('show', '-s', '--format=%T', manifest.subject_commit)
    !== manifest.subject_tree) issue('subject_tree_mismatch');
  if (git('show', '-s', '--format=%P', manifest.subject_commit)
    !== manifest.base_commit) issue('subject_parent_mismatch');
  execFileSync(
    'git',
    [
      '-C',
      root,
      'diff',
      '--quiet',
      manifest.base_commit,
      manifest.subject_commit,
      '--',
      'docs/migration/spatial-v3/release-evidence.v1.json'
    ]
  );
} catch {
  issue('historical_evidence_or_subject_unverifiable');
}

const production = manifest.production_activation ?? {};
if (production.performed !== false
  || production.production_owner !== 'production_v2'
  || production.target_writes !== false
  || production.dual_write !== false
  || production.mixed_authoritative_read !== false
  || production.runtime_fallback !== false) {
  issue('production_boundary_invalid');
}
if (manifest.historical_evidence?.rewritten !== false
  || manifest.historical_evidence?.redeclared_for_subject !== false) {
  issue('historical_evidence_reuse_invalid');
}
if (!Array.isArray(manifest.validation)
  || manifest.validation.length !== 7
  || manifest.validation.some(({ result }) => ![
    'passed',
    'pass_with_notes'
  ].includes(result))) {
  issue('validation_incomplete');
}
if (manifest.accepted !== true) issue('acceptance_missing');

try {
  const config = git(
    'show',
    `${manifest.subject_commit}:apps/game-server/src/config.js`
  );
  const loader = git(
    'show',
    `${manifest.subject_commit}:apps/game-server/src/runtime/load-composition.js`
  );
  const productionMigrations = git(
    'show',
    `${manifest.subject_commit}:apps/game-server/src/infrastructure/postgres/migrations.js`
  );
  if (!config.includes("config.compositionModule !== 'builtin:production'")
    || config.includes('spatialV3BindingsModule')) {
    issue('subject_config_boundary_missing');
  }
  if (loader.includes('production-spatial-v3')
    || loader.includes('pathToFileURL')
    || !loader.includes('COMPOSITION_MODULE_INACTIVE')) {
    issue('subject_loader_boundary_missing');
  }
  if (!productionMigrations.includes(
    'Object.freeze([PARTY_RUNTIME_V2_DDL])'
  ) || /00(?:[2-9]|10)_party_runtime/u.test(productionMigrations)) {
    issue('subject_production_migration_boundary_missing');
  }
} catch {
  issue('subject_boundary_unverifiable');
}

const output = {
  schema: 'rus.pr8.target-functional-exact-head-check.v1',
  subject_commit: manifest.subject_commit,
  accepted: issues.length === 0,
  issue_count: issues.length,
  issues
};
console.log(JSON.stringify(output, null, 2));
if (issues.length) process.exitCode = 1;
