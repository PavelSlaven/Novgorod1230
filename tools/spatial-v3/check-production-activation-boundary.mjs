import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (relativePath) => readFile(resolve(root, relativePath), 'utf8');
const boundaryPath = 'docs/migration/spatial-v3/production-activation-boundary.v1.json';
const schemaPath = 'data/contracts/spatial-v3/production-activation-boundary.schema.json';
const evidencePath = 'docs/migration/spatial-v3/release-evidence.v1.json';
const historicalFreezePath = 'docs/migration/spatial-v3/normative-freeze.json';
const worldCatalogManifestPath =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v3/manifest.json';
const expectedCutover = 'versioned production activation cutover';
const errors = [];

const boundary = JSON.parse(await read(boundaryPath));
const schema = JSON.parse(await read(schemaPath));
const evidenceBytes = await readFile(resolve(root, evidencePath));
const evidence = JSON.parse(evidenceBytes);
const historicalFreezeBytes = await readFile(resolve(root, historicalFreezePath));
const worldCatalogManifestBytes = await readFile(
  resolve(root, worldCatalogManifestPath)
);
const serverConfig = await read('apps/game-server/src/config.js');
const compositionLoader = await read(
  'apps/game-server/src/runtime/load-composition.js'
);
const serverEntrypoint = await read('apps/game-server/src/server.js');
const serverPackage = JSON.parse(await read('apps/game-server/package.json'));
const turnPackage = JSON.parse(await read('packages/turn/package.json'));
const serverPublicApi = await read('apps/game-server/src/index.js');
const productionRoot = await read(
  'apps/game-server/src/composition/production-spatial-v3.js'
);
const targetMigrations = await read(
  'apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js'
);

check(boundary.schema === 'rus.spatial-v3.production-activation-boundary.v1', 'boundary schema mismatch');
check(boundary.version === 1, 'boundary version mismatch');
check(boundary.current_production_owner === 'production_v3', 'production v3 must be the sole current owner');
check(
  boundary.target_status === 'production_activated_sole_owner',
  'target status mismatch'
);
check(boundary.activation_operation === expectedCutover, 'cutover term mismatch');
check(boundary.activation_status === 'completed', 'cutover completion status mismatch');
check(boundary.release?.release_id === 'spatial-v3-production-v3', 'release id mismatch');
check(boundary.release?.composition_id === 'builtin:production-spatial-v3', 'composition id mismatch');
check(boundary.release?.contract_version === '4.5.0-first-playable.1', 'contract version mismatch');
check(boundary.release?.temporal_contract_id === 'temporal-world-v1.1', 'temporal contract id mismatch');
check(boundary.release?.party_schema_version === 'party_runtime_v3_first_playable', 'party schema version mismatch');
check(
  boundary.release?.world_revision_id
    === 'novgorod_spatial_v3_production_v3_candidate_001',
  'world revision pin mismatch'
);
check(
  boundary.release?.world_catalog_digest
    === '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
  'world catalog digest pin mismatch'
);
check(
  boundary.release?.world_catalog_manifest_sha256
    === sha256(worldCatalogManifestBytes),
  'world catalog manifest pin mismatch'
);
check(boundary.release?.dependency_pin_mode === 'exact_only', 'dependency pin mode mismatch');
check(
  boundary.release?.runtime_catalog_pin_schema
    === 'rus.runtime_catalog_pin.v2',
  'runtime catalog pin schema mismatch'
);
check(
  boundary.release?.runtime_catalog_scope
    === 'item_container_materialization_v2',
  'runtime catalog scope mismatch'
);
check(
  boundary.release?.runtime_catalog_resolution
    === 'active_for_new_party_persisted_for_existing_party',
  'runtime catalog resolution mismatch'
);
check(
  boundary.release?.party_runtime_catalog_migration_id
    === 'party_runtime_catalog_pins_v2',
  'party runtime-catalog migration id mismatch'
);
check(
  boundary.release?.party_runtime_catalog_migration_digest
    === '9f574d2782cdbaeeba190d8237fe38c26bddd65775f060749079d3d0163ef32d',
  'party runtime-catalog migration digest mismatch'
);
check(
  boundary.release?.party_runtime_catalog_target_fingerprint
    === '47cb21b39db8be7336d10533ed319fe314f5bda65d850f1297c8321de6c9d165',
  'party runtime-catalog target fingerprint mismatch'
);
check(boundary.release?.target_migration_count === 11, 'target migration count mismatch');
check(
  boundary.release?.target_migration_chain_digest
    === 'b7a9eb899b5d302dc27bff6797f1bb6abf31b245ace3e7c285f94543e3039d45',
  'target migration chain digest mismatch'
);
check(boundary.release?.rollback_source_release_id === 'spatial-v3-production-v2', 'rollback source identity mismatch');
check(boundary.release?.rollback_runtime_selectable === false, 'rollback source must not be runtime selectable');
check(
  serverConfig.includes(
    "text(env.RUS_COMPOSITION_MODULE) || 'builtin:production-spatial-v3'"
  ),
  'server config does not default to the activated v3 composition'
);
check(
  serverConfig.includes("config.compositionModule !== 'builtin:production-spatial-v3'"),
  'server config does not fail closed for non-v3 composition'
);
check(
  serverConfig.includes('config.cutoverStage !== 13'),
  'server config permits an incomplete or partial cutover stage'
);
check(
  compositionLoader.includes("reference === 'builtin:production-spatial-v3'"),
  'composition loader does not select the activated v3 composition'
);
check(
  !compositionLoader.includes("import('../composition/production.js')"),
  'composition loader still imports production v2'
);
check(
  !compositionLoader.includes('production-v2-rollback-source'),
  'composition loader imports the explicit production-v2 rollback source'
);
check(
  serverEntrypoint.trim() === "await import('./modular-entry.js');",
  'server entrypoint is not v3 modular-only'
);
check(
  serverPackage.exports?.['./production'] == null,
  'production v2 remains a public runtime export'
);
check(
  serverPackage.exports?.['./production-spatial-v3']
    === './src/composition/production-spatial-v3.js',
  'production v3 public export mismatch'
);
check(
  serverPackage.exports?.['./production-v2-migration-source']
    === './src/production-v2-migration-source.js',
  'explicit production-v2 migration/rollback source export mismatch'
);
check(
  !serverPublicApi.includes("from './production.js'"),
  'game-server root API still exports production v2 runtime'
);
check(
  turnPackage.exports?.['./spatial-v3-request-profile'] == null,
  'turn package still exports the pre-cutover production-v2 request router'
);
for (const removedRuntimePath of [
  'apps/game-server/src/composition/production.js',
  'packages/turn/src/spatial-v3-request-profile.js'
]) {
  try {
    await read(removedRuntimePath);
    errors.push(`inactive runtime surface remains callable: ${removedRuntimePath}`);
  } catch {
    // Expected after the atomic cutover.
  }
}
check(
  productionRoot.includes('createSpatialV3ProductionComposition'),
  'production root does not use the production v3 turn factory'
);
check(
  !productionRoot.includes('createSpatialV3TargetShadowCompositionRoot'),
  'production root still imports a shadow composition root'
);
check(
  targetMigrations.includes(
    "'011_party_runtime_first_playable.sql'"
  ),
  'production v3 migration chain does not reach migration 011'
);
check(
  productionRoot.includes('assertSpatialV3ProductionReadiness'),
  'production root lacks migrated-party readiness gate'
);
for (const fragment of [
  'novgorod_spatial_v3_production_v3_candidate_001',
  sha256(worldCatalogManifestBytes),
  boundary.release.world_catalog_digest,
  'temporal-world-v1.1',
  'exact_only',
  'rus.runtime_catalog_pin.v2',
  'active_for_new_party_persisted_for_existing_party'
]) {
  check(
    productionRoot.includes(fragment),
    `production release pin is missing: ${fragment}`
  );
}
check(boundary.historical_p05_freeze?.path === historicalFreezePath, 'historical P05 freeze path mismatch');
check(boundary.historical_p05_freeze?.sha256 === sha256(historicalFreezeBytes), 'historical P05 freeze digest mismatch');
check(boundary.historical_p05_freeze?.current_status_authority === false, 'historical P05 freeze must not claim current authority');
check(boundary.historical_p28_evidence?.activation_candidate_commit === evidence.activation_candidate_commit, 'historical P28 commit mismatch');
check(boundary.historical_p28_evidence?.manifest_path === evidencePath, 'historical P28 manifest path mismatch');
check(boundary.historical_p28_evidence?.manifest_sha256 === sha256(evidenceBytes), 'historical P28 manifest digest mismatch');
check(boundary.historical_p28_evidence?.composition_changed === false, 'historical P28 must not claim composition activation');
check(boundary.historical_p28_evidence?.production_writes === 0, 'historical P28 must not claim production writes');
check(schema.properties?.activation_operation?.const === expectedCutover, 'schema cutover term mismatch');
check(schema.properties?.current_production_owner?.const === 'production_v3', 'schema production owner mismatch');
check(
  JSON.stringify(boundary.forbidden) === JSON.stringify([
    'partial_activation',
    'dual_write',
    'authoritative_mixed_read',
    'semantic_fallback_v3_to_v2'
  ]),
  'forbidden activation modes mismatch'
);

const explicitCurrentStatusPaths = [
  '.github/AGENTS.md',
  'AGENTS.md',
  'README.md',
  'apps/game-server/MODULE.md',
  'data/knowledge-source/corpus/DOCUMENTS/README.md',
  'data/knowledge-source/corpus/DOCUMENTS/base_turn_orchestration.txt',
  'data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt',
  'data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/formulas.md',
  'data/knowledge-source/corpus/DOCUMENTS/interface_ux.md',
  'data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md',
  'data/knowledge-source/corpus/DOCUMENTS/map_g0_g4_workflow.txt',
  'data/knowledge-source/corpus/DOCUMENTS/movement_locations_regions.txt',
  'data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_code_driven_world_materialization_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_map_g0_g4_workflow.txt',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_read_only_database_and_graph_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md',
  'data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md',
  'data/knowledge-source/corpus/DOCUMENTS/time_system.txt',
  'data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md',
  'data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt',
  'docs/adr/ADR-001-materialization-v3-spatial-g0-g6.md',
  'docs/adr/ADR-002-temporal-world-v4.md',
  'docs/adr/ADR-004-temporal-place-access-owner.md',
  'docs/architecture/MODULE_RULES.md',
  'docs/domain/OWNERSHIP_MAP.md',
  'docs/migration/spatial-v3/normative-conflicts.md',
  'docs/migration/spatial-v3/target-registries.md',
  'docs/pipelines/temporal-advance.md',
  'docs/pipelines/turn.md',
  'data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md',
  'infra/world-base/SCHEMA_REFERENCE.md',
  'infra/world-base/field-descriptions.js',
  'packages/contracts/MODULE.md',
  'packages/movement-routes/MODULE.md',
  'packages/party-store/MODULE.md',
  'packages/time-events-history/MODULE.md',
  'packages/turn/MODULE.md',
  'packages/visibility-knowledge-memory/MODULE.md'
];
const discoveredCurrentStatusPaths = await collectCurrentStatusFiles();
const currentStatusPaths = [...new Set([...explicitCurrentStatusPaths, ...discoveredCurrentStatusPaths])].sort();
const exactTermRequiredPaths = new Set(explicitCurrentStatusPaths);
const stalePatterns = [
  /\bbefore (?:the )?(?:atomic )?P28\b/gi,
  /\buntil (?:the )?(?:atomic )?P28\b/gi,
  /\bafter (?:successful )?P28\b/gi,
  /\bafter (?:the )?P28 gate\b/gi,
  /\bP28 activation\b/gi,
  /\bP28 atomic activation\b/gi,
  /\bactivation gate P28\b/gi,
  /\bP28 (?:performs|выполняет)\b/giu,
  /(?:^|\s)до (?:атомарного )?P28(?:\s|[.,;:])/giu,
  /(?:^|\s)после P28(?:\s|[.,;:])/giu,
  /(?:^|\s)атомарн\w* P28(?:\s|[.,;:])/giu,
  /\bproduction_v?2\b.{0,100}\b(?:remains|оста[её]тся)\b.{0,80}\b(?:sole|единственн\w*)/giu,
  /\b(?:active|current)\b.{0,80}\bproduction v2\b/giu
];
for (const path of currentStatusPaths) {
  const content = await read(path);
  const normalizedContent = content.replace(/\s+/g, ' ');
  if (exactTermRequiredPaths.has(path)) {
    check(normalizedContent.includes(expectedCutover), `${path}: exact cutover term is missing`);
  }
  for (const pattern of stalePatterns) {
    if (pattern.test(normalizedContent)) errors.push(`${path}: stale future-P28 activation claim matches ${pattern}`);
    pattern.lastIndex = 0;
  }
}

const turn = await read('data/knowledge-source/corpus/DOCUMENTS/base_turn_orchestration.txt');
for (const fragment of [
  'candidate post-change state',
  'hidden-leak validation',
  'presentation-pending metadata',
  'persisted package',
  'final screen projection'
]) {
  check(turn.includes(fragment), `visible-package lifecycle fragment missing: ${fragment}`);
}
const lifecycleFragments = [
  'candidate post-change projection',
  'project the candidate into a factual player-safe package',
  'validate the candidate package against the hidden-information boundary',
  'build one combined write plan from validated facts and visible package',
  'atomically commit facts, visible package and presentation-pending metadata',
  'after commit, invoke narrator from that persisted package only',
  'build the final screen projection from persisted package and narration'
];
let previousIndex = -1;
for (const fragment of lifecycleFragments) {
  const index = turn.indexOf(fragment);
  check(index > previousIndex, `visible-package lifecycle order mismatch at: ${fragment}`);
  previousIndex = index;
}

const migrationLog = await read('docs/migration/spatial-v3/README.md');
const migrationPreamble = migrationLog.slice(0, migrationLog.indexOf('## P00'));
check(migrationPreamble.includes('Historical work log'), 'migration log historical status is missing');
check(migrationPreamble.includes(expectedCutover), 'migration log current cutover pointer is missing');

const historicalGenerator = await read('tools/spatial-v3/generate-normative-freeze.mjs');
check(historicalGenerator.includes('Historical P05 evidence generator'), 'P05 freeze generator historical status is missing');
check(historicalGenerator.includes('production-activation-boundary.v1.json'), 'P05 freeze generator current authority pointer is missing');

if (errors.length > 0) {
  console.error(JSON.stringify({
    schema: 'rus.spatial-v3.production-activation-boundary-check.v1',
    finding_count: errors.length,
    findings: errors
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    schema: 'rus.spatial-v3.production-activation-boundary-check.v1',
    finding_count: 0,
    current_production_owner: boundary.current_production_owner,
    activation_operation: boundary.activation_operation,
    historical_p28_commit: boundary.historical_p28_evidence.activation_candidate_commit
  }, null, 2));
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function collectCurrentStatusFiles() {
  const files = [];
  for (const directory of ['apps', 'packages']) {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const modulePath = `${directory}/${entry.name}/MODULE.md`;
      try {
        await read(modulePath);
        files.push(modulePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  for (const directory of ['docs/adr', 'docs/architecture', 'docs/domain', 'docs/pipelines']) {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(`${directory}/${entry.name}`);
    }
  }
  return files;
}
