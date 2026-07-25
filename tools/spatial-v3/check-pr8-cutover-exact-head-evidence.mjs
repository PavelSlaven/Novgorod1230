import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const manifestPath = resolve(
  root,
  'docs/implementation/pr8-travel-system/evidence/cutover-functional-exact-head.v1.json'
);
const evidenceManifest =
  'docs/implementation/pr8-travel-system/evidence/cutover-functional-exact-head.v1.json';
const evidenceReport =
  'docs/implementation/pr8-travel-system/evidence/cutover-functional-exact-head-report.md';
const evidenceAllowlist = new Set([
  evidenceManifest,
  evidenceReport,
  'docs/implementation/pr8-travel-system/README.md'
]);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const issues = [];
const issue = (code) => issues.push(code);
const git = (...args) => execFileSync(
  'git',
  ['-C', root, ...args],
  { encoding: 'utf8' }
).trim();
const subjectFile = (path) => git('show', `${manifest.subject_commit}:${path}`);

if (manifest.schema !== 'rus.pr8.cutover-functional-exact-head-evidence.v1') {
  issue('schema_invalid');
}
if (manifest.version !== 1
  || manifest.repository !== 'PavelSlaven/Novgorod1230'
  || manifest.pull_request !== 8
  || manifest.branch !== 'codex/pr8-travel-system'
  || manifest.candidate_kind !== 'production_activation_cutover') {
  issue('identity_invalid');
}
if (!/^[0-9a-f]{40}$/u.test(manifest.subject_commit)
  || !/^[0-9a-f]{40}$/u.test(manifest.subject_tree)
  || !/^[0-9a-f]{40}$/u.test(manifest.base_commit)) {
  issue('git_identity_invalid');
}

try {
  const evidenceHead = git('rev-parse', 'HEAD');
  if (git('show', '-s', '--format=%P', evidenceHead)
    !== manifest.subject_commit) {
    issue('evidence_not_direct_subject_child');
  }
  const evidenceFiles = git(
    'diff',
    '--name-only',
    manifest.subject_commit,
    evidenceHead
  ).split(/\r?\n/u).filter(Boolean).map((path) => path.replaceAll('\\', '/'));
  if (!evidenceFiles.includes(evidenceManifest)
    || !evidenceFiles.includes(evidenceReport)
    || evidenceFiles.some((path) => !evidenceAllowlist.has(path))) {
    issue('evidence_commit_scope_invalid');
  }
  if (git('show', '-s', '--format=%T', manifest.subject_commit)
    !== manifest.subject_tree) issue('subject_tree_mismatch');
  if (git('show', '-s', '--format=%P', manifest.subject_commit)
    !== manifest.base_commit) issue('subject_parent_mismatch');
  for (const immutablePath of [
    'docs/migration/spatial-v3/release-evidence.v1.json',
    'docs/implementation/pr8-travel-system/evidence/target-functional-exact-head.v1.json'
  ]) {
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
        immutablePath
      ]
    );
  }
} catch {
  issue('historical_evidence_or_subject_unverifiable');
}

const production = manifest.production_activation ?? {};
if (production.performed !== true
  || production.release !== 'spatial-v3-production-v1'
  || production.composition !== 'builtin:production-spatial-v3'
  || production.production_owner !== 'production_v3'
  || production.authoritative_reads !== 'spatial_v3_only'
  || production.authoritative_writes !== 'spatial_v3_only'
  || production.dual_write !== false
  || production.mixed_authoritative_read !== false
  || production.runtime_fallback !== false
  || production.rollback_runtime_selectable !== false) {
  issue('production_boundary_invalid');
}
if (manifest.historical_evidence?.rewritten !== false
  || manifest.historical_evidence?.redeclared_for_subject !== false
  || manifest.target_evidence?.rewritten !== false
  || manifest.target_evidence?.redeclared_for_subject !== false) {
  issue('evidence_reuse_invalid');
}
if (!Array.isArray(manifest.validation)
  || manifest.validation.length < 9
  || manifest.validation.some(({ result }) => ![
    'passed',
    'pass_with_notes'
  ].includes(result))) {
  issue('validation_incomplete');
}
if (manifest.accepted !== true) issue('acceptance_missing');

try {
  const config = subjectFile('apps/game-server/src/config.js');
  const loader = subjectFile(
    'apps/game-server/src/runtime/load-composition.js'
  );
  const bindings = subjectFile(
    'apps/game-server/src/runtime/load-spatial-v3-bindings.js'
  );
  const composition = subjectFile(
    'apps/game-server/src/composition/production-spatial-v3.js'
  );
  const server = subjectFile('apps/game-server/src/server.js');
  const targetMigrations = subjectFile(
    'apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js'
  );
  const readiness = subjectFile(
    'apps/game-server/src/infrastructure/postgres/spatial-v3-production-readiness.js'
  );
  const boundary = JSON.parse(subjectFile(
    'docs/migration/spatial-v3/production-activation-boundary.v1.json'
  ));
  const packageJson = JSON.parse(subjectFile('apps/game-server/package.json'));
  const turnPackageJson = JSON.parse(subjectFile('packages/turn/package.json'));

  if (!config.includes("'builtin:production-spatial-v3'")
    || !config.includes("config.compositionModule !== 'builtin:production-spatial-v3'")
    || !config.includes('config.cutoverStage !== 13')
    || !config.includes('strictInteger(')
    || !config.includes('RUS_SPATIAL_V3_BINDINGS_MODULE')
    || !config.includes('RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST')
    || !config.includes('RUNTIME_CATALOG_PIN_MANIFEST_DIGEST_REQUIRED')) {
    issue('subject_config_boundary_missing');
  }
  if (!loader.includes("reference === 'builtin:production-spatial-v3'")
    || loader.includes('pathToFileURL')
    || loader.includes('builtin:production\'')
    || loader.includes('production-v2-rollback-source')) {
    issue('subject_loader_boundary_missing');
  }
  if (!composition.includes("release_id: SPATIAL_V3_PRODUCTION_RELEASE_ID")
    || !composition.includes("contract_version: '4.4.0-target.1'")
    || !composition.includes("temporal_contract_id: 'temporal-world-v1.1'")
    || !composition.includes('world_catalog_digest:')
    || !composition.includes('target_migration_chain_digest:')
    || !composition.includes('party_runtime_catalog_migration_digest:')
    || !composition.includes(
      "'a71b95540c6422ccee5b3d598cb6b0cefe108de3bf41216dea96a99068a5a370'"
    )
    || composition.includes(
      'target_migration_chain_digest:\n    SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST'
    )
    || !composition.includes("authoritative_reads: 'spatial_v3_only'")
    || !composition.includes("authoritative_writes: 'spatial_v3_only'")
    || !composition.includes('rollback_runtime_selectable: false')) {
    issue('subject_release_identity_missing');
  }
  if (!server.includes("await import('./modular-entry.js')")
    || server.includes("from './production.js'")) {
    issue('subject_server_entry_invalid');
  }
  if (!targetMigrations.includes('010_party_runtime_pr8_reaction_options.sql')
    || !targetMigrations.includes('SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST')
    || !composition.includes('beforeCommit: async (partyClient)')
    || !composition.includes('assertPartyReleaseReadiness')
    || !composition.includes('assertWorldReleaseReadiness')
    || !composition.includes('withRuntimeCatalogActivationLock')
    || !composition.includes('bindings.runtimeCatalogPin')) {
    issue('subject_migration_chain_incomplete');
  }
  for (const token of [
    'RUNTIME_CATALOG_ACTIVATION_LOCK_KEY',
    'pg_advisory_xact_lock',
    'r.compatible_world_revision_id=e.compatible_world_revision_id',
    'r.compatible_world_catalog_digest=e.compatible_world_catalog_digest',
    'r.record_registry_digest=e.record_registry_digest',
    'i.catalog_scope=e.catalog_scope',
    'i.target_revision_id=e.catalog_revision_id',
    'i.compatible_world_revision_id=e.compatible_world_revision_id',
    'i.compatible_world_catalog_digest=e.compatible_world_catalog_digest',
    'i.record_registry_digest=e.record_registry_digest'
  ]) {
    if (!readiness.includes(token)) {
      issue('subject_world_readiness_tuple_or_lock_incomplete');
      break;
    }
  }
  for (const field of [
    'party_runtime_catalog_migration_id',
    'party_runtime_catalog_migration_digest',
    'party_runtime_catalog_target_fingerprint',
    'target_migration_count',
    'target_migration_chain_digest',
    'compatible_world_pin_manifest_digest'
  ]) {
    if (!bindings.includes(`'${field}'`)) {
      issue('subject_binding_release_identity_incomplete');
      break;
    }
  }
  if (packageJson.exports?.['./production']
    || packageJson.exports?.['./legacy-entry']
    || !packageJson.exports?.['./production-v2-migration-source']
    || turnPackageJson.exports?.['./spatial-v3-request-profile']) {
    issue('subject_public_exports_invalid');
  }
  if (boundary.release?.release_id !== 'spatial-v3-production-v1'
    || boundary.release?.contract_version !== '4.4.0-target.1'
    || boundary.release?.temporal_contract_id !== 'temporal-world-v1.1'
    || boundary.current_production_owner !== 'production_v3'
    || boundary.activation_status !== 'completed') {
    issue('subject_release_boundary_invalid');
  }
  for (const removedPath of [
    'apps/game-server/src/production.js',
    'apps/game-server/src/legacy-entry.js',
    'apps/game-server/src/cli.js',
    'apps/game-server/src/composition/production.js',
    'packages/turn/src/spatial-v3-request-profile.js'
  ]) {
    try {
      subjectFile(removedPath);
      issue('subject_legacy_entry_still_present');
    } catch {
      // Expected: public v2 runtime entrypoints are absent at the subject.
    }
  }
} catch {
  issue('subject_boundary_unverifiable');
}

const output = {
  schema: 'rus.pr8.cutover-functional-exact-head-check.v1',
  subject_commit: manifest.subject_commit,
  accepted: issues.length === 0,
  issue_count: issues.length,
  issues
};
console.log(JSON.stringify(output, null, 2));
if (issues.length) process.exitCode = 1;
