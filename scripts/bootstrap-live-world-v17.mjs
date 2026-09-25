import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { localV17ApprovalsPath } from '../tools/local-play/local-postgres.js';
import { runSpatialV3TargetMigrations } from '../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { buildTransactionalImportSql } from '../tools/spatial-v3/p12-authoring-importer.mjs';
import { buildTargetAppearanceTransferV3ImportSql } from '../tools/spatial-v3/character-appearance-v1-importer.mjs';
import { prepareSpatialV3TargetItemCatalog, buildSpatialV3TargetItemImport } from
  '../tools/runtime-catalog-activation/src/first-playable-v2-activation.js';
import { registerCatalogBaseline, importApprovedCatalog } from
  '../tools/runtime-catalog-activation/src/operator-executors.js';
import { activateApprovedCatalog } from
  '../tools/runtime-catalog-activation/src/operator-executors.js';
import { buildActorBaseAttributesSuccessorImportRequest } from
  '../tools/runtime-catalog-activation/src/actor-base-attributes-successor.js';
import { buildActorBaseAttributesSuccessorActivationRequest } from
  '../tools/runtime-catalog-activation/src/actor-base-attributes-successor.js';
import { importApprovedActorBaseAttributes, readActorBaseAttributesImport } from
  '../tools/runtime-catalog-activation/src/actor-base-attributes-import.js';
import { activateActorBaseAttributes, validateActorBaseAttributesActivationResult } from
  '../tools/runtime-catalog-activation/src/actor-base-attributes-activation.js';
import { buildActivationPartyPreflight, buildActivationRequest, digestEnvelope } from
  '../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { runForwardMigration } from
  '../tools/runtime-catalog-activation/src/forward-migration.js';
import { WORLD_RUNTIME_CATALOG_MIGRATION_V17_BOOTSTRAP,
  ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP,
  PARTY_RUNTIME_CATALOG_MIGRATION_V17_BOOTSTRAP,
  ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION_V17_BOOTSTRAP } from
  '../tools/runtime-catalog-activation/src/forward-migrations.js';
import { buildAdditionalStartOwnerRows } from
  '../data/world-catalogs/novgorod/live-world-runtime-v17/additional-start-artifacts/owner-import.mjs';

const root = resolve(import.meta.dirname, '..');
const v17 = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const gate1 = 'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1';
const p12 = 'data/world-catalogs/novgorod/m2c-p12-v17-after-gate1-v1';
const nature = 'data/world-catalogs/novgorod/m2c-natural';
const capacityManifest = 'data/world-catalogs/novgorod/m2c-open-capacity-v2-import-manifest.json';
const capacityManifestSha256 = '55b9893171bb8368293857fc2c87e1ca04210c472430d6d5572d2f9ac81e9057';
const generatedNpcIndexMigration = 'scripts/live-world-v17-generated-npc-versioned-index.sql';
const generatedNpcIndexMigrationSha256 = '27d527784f11a512cea2863b719dc416bcccbc3a483bcfac3145e05e1761538f';
const naturePins = {
  script: '2da6132c6bf46fe482a0a675ded4ca672c176b094a3312de1f8c3d0ada936952',
  natural: '58e0d2be66df86a79faf76d4ef57d3d020ba778711736a61b4478c255d8cbef7',
  presentation: '174a299d881dea38d5d0656f73877236f6aaf5aadaecf5ab1a7856ca7dd387f4',
  approval: '310bf952bbd219f3935fdb4f26f5f8cb71c0edf5837eacc445ca838061db605d',
  naturalRecords: '451490374c0e3a74deeb3579569f67e82b0785868e4a5aca82a9c6dca6f5eb22',
  presentationRecords: 'f817d2c6f22645466174037f6d902f033fd6b70d8e0f7e7573fd7d6d37376f79'
};
const catalogDdl = {
  world: [
    ['tools/runtime-catalog-activation/migrations/world/001_runtime_catalog_activation.sql',
      '07c225e7bc746003aa38607d30763053328acb2bf204d246ea244ffdde649d06'],
    ['tools/runtime-catalog-activation/migrations/world/002_actor_base_attributes_owner.sql',
      'e0062c00471f231167487a3d414b443666b2d6f8f83f2b5b15b26b3e85d8e178']
  ],
  party: [
    ['tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql',
      'bb5cf1f0b56412a54e219f201b78f744cf4b3699eada88258914d3c3544e6938'],
    ['tools/runtime-catalog-activation/migrations/party/002_actor_base_attributes_pins.sql',
      '1b2c10675e1d2bcf9ac4d420b670c30fcef7c7a9f20ff951a7c8aa65187138fa']
  ]
};

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function exact(path, sha256, bytes) {
  const content = await readFile(resolve(root, path));
  if (digest(content) !== sha256 || (bytes !== undefined && content.length !== bytes))
    throw new Error(`V17_PIN_MISMATCH:${path}`);
  return content;
}

async function json(path) { return JSON.parse(await readFile(resolve(root, path), 'utf8')); }

export async function checkV17BootstrapInputs() {
  const schema = await json(`${v17}/fresh-schema-request.json`);
  for (const source of [schema.world_schema.entrypoint,
    ...schema.world_schema.ordered_parts,
    ...schema.party_schema.ordered_migrations]) {
    await exact(source.path, source.sha256, source.bytes);
  }
  for (const [path, sha256] of [...catalogDdl.world, ...catalogDdl.party])
    await exact(path, sha256);

  const gate = await json(`${gate1}/v17-bootstrap-import-request.json`);
  for (const source of gate.approved_sources) await exact(source.path, source.sha256);
  const dryRun = JSON.parse(execFileSync(process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'dry-run'],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  if (!dryRun.pass || dryRun.applied || Object.entries(gate.expected_plan)
    .filter(([key]) => key in dryRun)
    .some(([key, value]) => dryRun[key] !== value))
    throw new Error('V17_GATE1_PLAN_MISMATCH');

  const request = await json(`${p12}/request.json`);
  const sqlHash = createHash('sha256').update(request.sql_builder.concatenation.prefix);
  let sqlBytes = Buffer.byteLength(request.sql_builder.concatenation.prefix);
  for (const bundle of request.bundle_order) {
    await exact(bundle.manifest_path, bundle.manifest_sha256);
    await exact(bundle.approval_path, bundle.approval_sha256);
    const part = await buildTransactionalImportSql({ root,
      manifestPath: bundle.manifest_path, wrapTransaction: false,
      allowTypedGaps: false, temporaryTablePrefix: bundle.temporary_table_prefix });
    const content = Buffer.from(part);
    if (digest(content) !== bundle.sql_part_sha256 || content.length !== bundle.sql_part_bytes)
      throw new Error(`V17_P12_SQL_MISMATCH:${bundle.name}`);
    sqlHash.update(content);
    sqlBytes += content.length;
  }
  sqlHash.update(request.sql_builder.concatenation.suffix);
  sqlBytes += Buffer.byteLength(request.sql_builder.concatenation.suffix);
  if (sqlHash.digest('hex') !== request.sql_builder.combined_sql_sha256
      || sqlBytes !== request.sql_builder.combined_sql_bytes)
    throw new Error('V17_P12_COMBINED_SQL_MISMATCH');
  await exact(capacityManifest, capacityManifestSha256);
  await exact(generatedNpcIndexMigration, generatedNpcIndexMigrationSha256);
  execFileSync(process.execPath,
    [`${v17}/additional-start-artifacts/owner-coverage.mjs`, '--check'],
    { cwd: root, encoding: 'utf8' });
  await buildAdditionalStartOwnerRows();

  const appearance = await json(`${v17}/appearance-transfer-v3-v17-import-request.json`);
  const approved = appearance.approved_data;
  for (const [path, sha256] of [
    [approved.candidate_path, approved.candidate_sha256],
    [approved.data_approval_path, approved.data_approval_sha256],
    [approved.manifest_path, approved.manifest_sha256]
  ]) await exact(path, sha256);
  for (const dataset of approved.dataset_order) await exact(
    `${v17}/appearance-transfer-v3-datasets/${dataset.table}.json`, dataset.sha256);
  for (const rollback of [true, false]) {
    const sql = Buffer.from(await buildTargetAppearanceTransferV3ImportSql({ root, rollback }));
    const kind = rollback ? 'rollback' : 'commit';
    if (digest(sql) !== appearance.sql[`${kind}_sha256`]
        || sql.length !== appearance.sql[`${kind}_bytes`])
      throw new Error(`V17_APPEARANCE_SQL_MISMATCH:${kind}`);
  }
  await exact('scripts/generate-m2c-nature-successors.mjs', naturePins.script);
  await exact(`${nature}/nature-successor-candidate-v2.json`, naturePins.natural);
  await exact('data/world-catalogs/novgorod/m2c-natural-presentation/nature-successor-candidate-v2.json', naturePins.presentation);
  await exact(`${nature}/nature-successor-data-approval.json`, naturePins.approval);
  execFileSync(process.execPath, ['scripts/generate-m2c-nature-successors.mjs', '--check'],
    { cwd: root, encoding: 'utf8' });
  execFileSync(process.execPath, ['scripts/generate-m2c-natural-placement-v2-successor.mjs', '--check'],
    { cwd: root, encoding: 'utf8' });
  const natureApproval = await json(`${nature}/nature-successor-data-approval.json`);
  for (const source of Object.values(natureApproval.candidates)) {
    const approvedBytes = execFileSync('git', ['show', `ae212e78:${source.path}`],
      { cwd: root, maxBuffer: 8 * 1024 * 1024 });
    if (digest(approvedBytes) !== source.sha256) throw new Error(`V17_NATURE_APPROVAL_PIN_MISMATCH:${source.path}`);
  }
  return { schema: 'exact', catalog_ddl: 'exact', gate1: 'exact', p12: 'exact', appearance_v3: 'exact',
    additional_start_owners: 'exact',
    nature_successor: 'exact', database_mutated: false };
}

function databaseUrl(adminUrl, name) {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.href;
}

async function countTables(pool, schema) {
  return Number((await pool.query(`SELECT count(*)::int AS count FROM pg_catalog.pg_tables
    WHERE schemaname = $1`, [schema])).rows[0].count);
}

async function tableCounts(pool, names) {
  const counts = {};
  for (const name of names) {
    if (!/^[a-z][a-z0-9_]*$/u.test(name)) throw new Error(`V17_INVALID_TABLE:${name}`);
    counts[name] = Number((await pool.query(`SELECT count(*)::int AS count
      FROM world_base.${name}`)).rows[0].count);
  }
  return counts;
}

function assertAdded(before, after, expected, stage) {
  for (const [table, count] of Object.entries(expected)) {
    if (after[table] - before[table] !== count)
      throw new Error(`V17_${stage}_READBACK_MISMATCH:${table}`);
  }
}

async function applyCatalogDdl(pool, schema, migrations, tables) {
  for (const migration of migrations)
    await runForwardMigration({ pool, migration });
  const found = (await pool.query(`SELECT count(*)::int AS count
    FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])`,
  [schema, tables])).rows[0].count;
  if (found !== tables.length)
    throw new Error(`V17_CATALOG_DDL_READBACK_MISMATCH:${schema}`);
}

export async function bootstrapV17Imports({ adminUrl, attest = null, onRequest = null,
  activationApprovalsPath = localV17ApprovalsPath() }) {
  if (!adminUrl) throw new Error('V17_ADMIN_URL_REQUIRED');
  if (typeof attest !== 'function') throw new Error('V17_INDEPENDENT_ATTESTATIONS_REQUIRED');
  await checkV17BootstrapInputs();
  const schema = await json(`${v17}/fresh-schema-request.json`);
  const p12Request = await json(`${p12}/request.json`);
  const appearanceRequest = await json(`${v17}/appearance-transfer-v3-v17-import-request.json`);
  const worldName = schema.target.world_database;
  const partyName = schema.target.party_database;
  if (worldName !== 'novgorod_world_v17' || partyName !== 'novgorod_party_v17')
    throw new Error('V17_DATABASE_NAME_MISMATCH');
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  let world;
  let party;
  let importer;
  let activator;
  const work = await mkdtemp(join(tmpdir(), 'novgorod-v17-bootstrap-'));
  try {
    const identity = (await admin.query(`SELECT current_database() AS database,
      current_user AS role, current_setting('server_version') AS version`)).rows[0];
    if (identity.database !== 'postgres' || !identity.version.startsWith('16.14'))
      throw new Error('V17_CLUSTER_IDENTITY_MISMATCH');
    const existing = (await admin.query(`SELECT datname FROM pg_database
      WHERE datname = ANY($1::text[])`, [[worldName, partyName]])).rows;
    if (existing.length) throw new Error(`V17_DATABASE_ALREADY_EXISTS:${existing.map((row) => row.datname).join(',')}`);
    const roles = (await admin.query(`SELECT rolname FROM pg_roles
      WHERE rolname = ANY($1::text[])`, [[schema.target.world_owner,
        schema.target.party_owner]])).rows.map((row) => row.rolname);
    if (!roles.includes(schema.target.world_owner)
        || !roles.includes(schema.target.party_owner)) throw new Error('V17_OWNER_ROLE_MISSING');
    await admin.query(`CREATE DATABASE ${worldName} OWNER ${schema.target.world_owner}`);
    await admin.query(`CREATE DATABASE ${partyName} OWNER ${schema.target.party_owner}`);
    world = new pg.Pool({ connectionString: databaseUrl(adminUrl, worldName), max: 1 });
    party = new pg.Pool({ connectionString: databaseUrl(adminUrl, partyName), max: 1 });
    importer = new pg.Pool({ connectionString: databaseUrl(adminUrl, worldName),
      options: '-c role=runtime_catalog_importer', max: 1 });
    activator = new pg.Pool({ connectionString: databaseUrl(adminUrl, worldName),
      options: '-c role=runtime_catalog_activator', max: 1 });
    if (await countTables(world, 'world_base') || await countTables(party, 'party_runtime'))
      throw new Error('V17_NEW_DATABASE_NOT_EMPTY');

    const client = await world.connect();
    try {
      for (const commit of [false, true]) {
        await client.query('BEGIN');
        for (const source of schema.world_schema.ordered_parts)
          await client.query((await exact(source.path, source.sha256, source.bytes)).toString());
        await client.query('REVOKE CREATE ON SCHEMA world_base FROM PUBLIC');
        await client.query(commit ? 'COMMIT' : 'ROLLBACK');
        if (!commit && await countTables(client, 'world_base'))
          throw new Error('V17_SCHEMA_ROLLBACK_MISMATCH');
      }
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
    await assert.rejects(() => runSpatialV3TargetMigrations(party, {
      beforeCommit: () => { throw new Error('V17_PARTY_ROLLBACK_PROBE'); }
    }), /V17_PARTY_ROLLBACK_PROBE/u);
    if (await countTables(party, 'party_runtime'))
      throw new Error('V17_PARTY_ROLLBACK_MISMATCH');
    const partyMigration = await runSpatialV3TargetMigrations(party);
    if (await countTables(world, 'world_base') !== schema.world_schema.expected_world_base_tables
        || partyMigration.applied !== schema.party_schema.ordered_migrations.length
        || await countTables(party, 'party_runtime') !== 132)
      throw new Error('V17_SCHEMA_READBACK_MISMATCH');

    const gatePath = join(work, 'gate1.json');
    const gate = JSON.parse(execFileSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'local-play',
        '--expected-database', worldName, '--write-result', gatePath],
      { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
        timeout: 600_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: databaseUrl(adminUrl, worldName) } }));
    const gateReadback = JSON.parse(await readFile(gatePath, 'utf8'));
    if (!gate.pass || gate.rollback !== 'pass'
        || gate.repeat_readback_status !== 'exact_match'
        || gateReadback.activation_performed !== false
        || Number((await world.query('SELECT count(*) FROM world_base.source_records')).rows[0].count) !== 200)
      throw new Error('V17_GATE1_READBACK_MISMATCH');

    const beforeP12 = await tableCounts(world, Object.keys(p12Request.expected_readback.by_table));
    if (beforeP12.source_records !== 200) throw new Error('V17_P12_BASELINE_MISMATCH');
    const parts = [];
    for (const bundle of p12Request.bundle_order)
      parts.push(await buildTransactionalImportSql({ root,
        manifestPath: bundle.manifest_path, wrapTransaction: false,
        allowTypedGaps: false, temporaryTablePrefix: bundle.temporary_table_prefix }));
    const p12Sql = `${p12Request.sql_builder.concatenation.prefix}${parts.join('')}${p12Request.sql_builder.concatenation.suffix}`;
    if (digest(Buffer.from(p12Sql)) !== p12Request.sql_builder.combined_sql_sha256)
      throw new Error('V17_P12_COMBINED_SQL_MISMATCH');
    await world.query(`${p12Request.sql_builder.concatenation.prefix}${parts.join('')}ROLLBACK;\n`);

    const afterP12Rollback = await tableCounts(world, Object.keys(beforeP12));
    assertAdded(beforeP12, afterP12Rollback,
      Object.fromEntries(Object.keys(beforeP12).map((name) => [name, 0])), 'P12_ROLLBACK');
    await world.query(p12Sql);
    const afterP12 = await tableCounts(world, Object.keys(p12Request.expected_readback.by_table));
    assertAdded(beforeP12, afterP12, p12Request.expected_readback.by_table, 'P12');
    if (afterP12.source_records !== p12Request.expected_readback.p12_source_records_after)
      throw new Error('V17_P12_SOURCE_READBACK_MISMATCH');
    // The importer compares every pinned primary-key row, including existing rows.
    await world.query(`${p12Request.sql_builder.concatenation.prefix}${parts.join('')}ROLLBACK;\n`);
    await world.query((await exact(generatedNpcIndexMigration, generatedNpcIndexMigrationSha256)).toString());
    const capacity = await json(capacityManifest);
    const pinnedTables = ['spatial_v3_scene_templates', 'spatial_v3_scene_materialization_profiles'];
    const previous = {};
    for (const table of pinnedTables) {
      previous[table] = (await world.query(`SELECT to_jsonb(r) AS row FROM world_base.${table} r
        WHERE version=1 ORDER BY id`)).rows.map(({ row }) => row);
    }
    await world.query(await buildTransactionalImportSql({ root,
      manifestPath: capacityManifest, temporaryTablePrefix: 'm2c_capacity_v2' }));
    const capacityDigests = {};
    for (const table of pinnedTables) {
      const dataset = capacity.datasets.find((entry) => entry.table === table);
      const rows = await json(`data/world-catalogs/novgorod/${dataset.file}`);
      const actual = (await world.query(`SELECT to_jsonb(r) AS row FROM world_base.${table} r
        WHERE version=2 ORDER BY id`)).rows.map(({ row }) => row);
      assert.deepEqual(actual, rows.toSorted((a, b) => a.id.localeCompare(b.id)));
      const unchanged = (await world.query(`SELECT to_jsonb(r) AS row FROM world_base.${table} r
        WHERE version=1 ORDER BY id`)).rows.map(({ row }) => row);
      assert.deepEqual(unchanged, previous[table]);
      capacityDigests[table] = digestEnvelope(rows.map((row) =>
        [row.id, row.version, row.canonical_digest]).sort((a, b) => a[0].localeCompare(b[0])));
    }
    const ownerImport = await importAdditionalStartOwnerRows(world);

    const appearanceCounts = appearanceRequest.expected_import_readback.by_table;
    const beforeAppearance = await tableCounts(world, Object.keys(appearanceCounts));
    const rollback = await buildTargetAppearanceTransferV3ImportSql({ root, rollback: true });
    await world.query(rollback);
    const afterRollback = await tableCounts(world, Object.keys(appearanceCounts));
    assertAdded(beforeAppearance, afterRollback,
      Object.fromEntries(Object.keys(appearanceCounts).map((name) => [name, 0])), 'APPEARANCE_ROLLBACK');
    await world.query(await buildTargetAppearanceTransferV3ImportSql({ root }));
    const afterAppearance = await tableCounts(world, Object.keys(appearanceCounts));
    assertAdded(beforeAppearance, afterAppearance, appearanceCounts, 'APPEARANCE');
    const manifest = await json(`${v17}/appearance-transfer-v3-import-manifest.json`);
    for (const dataset of manifest.datasets) {
      const rows = await json(`${v17}/${dataset.file}`);
      for (const row of rows) {
        const actual = (await world.query(`SELECT to_jsonb(actual) @> $2::jsonb AS exact
          FROM world_base.${dataset.table} actual WHERE id=$1`,
        [row.id, JSON.stringify(row)])).rows;
        if (actual.length !== 1 || actual[0].exact !== true)
          throw new Error(`V17_APPEARANCE_ROW_MISMATCH:${dataset.table}:${row.id}`);
      }
    }
    const graphCheck = (await world.query(`SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'world_base' AND t.relname = 'graph_nodes'
        AND c.conname = 'graph_nodes_scale_level_check'`)).rows;
    if (graphCheck.length !== 1) throw new Error('V17_GRAPH_NODES_CHECK_MISSING');
    if (!graphCheck[0].definition.includes("ARRAY['G0'::text, 'G1'::text, 'G2'::text, 'G3'::text, 'G4'::text]")) {
      const finalize = 'tools/runtime-catalog-activation/migrations/world/000_legacy_world_bridge_finalize.sql';
      await world.query((await exact(finalize,
        'd23d16cba41b66b3071febe8058d4ced1d606995b97faaaa94674ef670017a60')).toString());
    }
    await applyCatalogDdl(world, 'world_base', [
      WORLD_RUNTIME_CATALOG_MIGRATION_V17_BOOTSTRAP,
      ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP
    ],
      ['schema_migrations', 'catalog_baseline_registrations', 'domain_catalog_revisions',
        'catalog_import_records', 'catalog_import_dependency_assertions',
        'runtime_catalog_activation_events', 'actor_base_attribute_profiles']);
    await applyCatalogDdl(party, 'party_runtime', [
      PARTY_RUNTIME_CATALOG_MIGRATION_V17_BOOTSTRAP,
      ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION_V17_BOOTSTRAP
    ],
      ['schema_migrations', 'party_catalog_pins', 'party_materialization_run_catalog_pins']);
    const subjectCommit = execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: root, encoding: 'utf8' }).trim();
    const preparation = await prepareSpatialV3TargetItemCatalog({
      worldPool: world, repositoryRoot: root, gitCommitSha: subjectCommit,
      contentIdentity: true
    });
    const baselineAttestation = await requireAttestation('item_baseline',
      preparation.baseline_request, attest, onRequest);
    const overlayAttestation = await requireAttestation('item_import',
      preparation.approval_request, attest, onRequest);
    const baselineArgs = { request: preparation.baseline_request,
      attestation: baselineAttestation, baselineManifest: preparation.baseline_manifest,
      compatibilityManifest: preparation.compatibility_manifest,
      runtimeConfigurationTuple: preparation.runtime_configuration_tuple };
    const item = buildSpatialV3TargetItemImport({ preparation,
      baselineAttestation, overlayAttestation });
    const itemArgs = { ledger: item.ledger, domainRevision: item.domain_revision,
      approvalAttestation: item.approval_attestation };
    await rollbackProbe(world, (client) => registerCatalogBaseline({
      ...baselineArgs, pool: world, client
    }), 'catalog_baseline_registrations', 'ITEM_BASELINE');
    await registerCatalogBaseline({ ...baselineArgs, pool: world });
    await rollbackProbe(world, (client) => importApprovedCatalog({
      ...itemArgs, pool: world, client
    }), 'catalog_imports', 'ITEM_IMPORT');
    const itemImport = await importApprovedCatalog({ ...itemArgs, pool: world });
    if (itemImport.status !== 'applied'
      || (await importApprovedCatalog({ ...itemArgs, pool: world })).status !== 'already_applied')
      throw new Error('V17_ITEM_IMPORT_READBACK_MISMATCH');
    const natureRecords = preparation.compiled.record_operations_by_table
      .find((table) => table.table_name === 'procedural_scene_compiled_records')?.records
      .map((row) => row.canonical_payload.canonical_fields)
      .filter((row) => Number(row.version) === 2 && [
        'rus.g4_natural_baseline_profile.v1', 'rus.g4_natural_presentation_profile.v1'
      ].includes(row.payload?.schema)) ?? [];
    const natureDigests = {};
    for (const [schema, pin] of [
      ['rus.g4_natural_baseline_profile.v1', naturePins.naturalRecords],
      ['rus.g4_natural_presentation_profile.v1', naturePins.presentationRecords]
    ]) {
      const records = natureRecords.filter((row) => row.payload.schema === schema)
        .sort((left, right) => left.record_id.localeCompare(right.record_id));
      if (records.length !== 32 || digestEnvelope(records.map((row) =>
        [row.record_id, Number(row.version), row.payload_digest])) !== pin)
        throw new Error(`V17_NATURE_RUNTIME_DIGEST_MISMATCH:${schema}`);
      for (const row of records) {
        const actual = (await world.query(`SELECT payload_digest, payload FROM world_base.procedural_scene_compiled_records
          WHERE record_id=$1 AND version=$2`, [row.record_id, row.version])).rows;
        if (actual.length !== 1 || actual[0].payload_digest !== row.payload_digest
          || digestEnvelope(actual[0].payload) !== row.payload_digest)
          throw new Error(`V17_NATURE_ROW_MISMATCH:${row.record_id}`);
      }
      natureDigests[schema] = pin;
    }
    const itemReadback = { verified: true, import_id: item.ledger.root.import_id,
      import_audit_digest: item.ledger.root.import_audit_digest,
      catalog_revision_id: item.ledger.root.target_revision_id,
      catalog_digest: item.ledger.root.target_catalog_digest };
    const partyCounts = (await party.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.parties) AS party_count,
      (SELECT count(*)::int FROM party_runtime.party_catalog_pins) AS pinned_party_count,
      (SELECT count(*)::int FROM party_runtime.commit_idempotency
        WHERE status IN ('reserved','transaction_committed')) AS inflight_count`)).rows[0];
    const runtimeReleaseId = digestEnvelope('spatial-v3-production-v17');
    const preflight = buildActivationPartyPreflight({
      activationScope: 'new_production_parties_only',
      partyCount: partyCounts.party_count,
      pinnedPartyCount: partyCounts.pinned_party_count,
      missingDomainPinCount: 0, inflightStage24Stage25Count: partyCounts.inflight_count,
      runtimeReleaseId, runtimeContractDigest: item.domain_revision.runtime_contract_digest
    });
    const { schema: ignoredSchema, catalog_scope: ignoredScope, ...activationFields } =
      item.ledger.root;
    const itemActivationRequest = buildActivationRequest({ partyPreflight: preflight,
      fields: { ...activationFields,
        runtime_contract_digest: item.domain_revision.runtime_contract_digest,
        runtime_release_id: runtimeReleaseId,
        activation_scope: 'new_production_parties_only',
        expected_previous_event_id: null } });
    const itemActivationAttestation = await requireAttestation('item_activation',
      itemActivationRequest, attest, onRequest);
    const itemActivationArgs = { worldPool: world, partyPool: party,
      request: itemActivationRequest, attestation: itemActivationAttestation };
    await rollbackProbe(world, (client) => activateApprovedCatalog({
      ...itemActivationArgs, client
    }), 'runtime_catalog_activation_events', 'ITEM_ACTIVATION');
    const itemActivation = await activateApprovedCatalog(itemActivationArgs);
    if (itemActivation.status !== 'activated'
      || (await activateApprovedCatalog(itemActivationArgs)).status !== 'already_active')
      throw new Error('V17_ITEM_ACTIVATION_READBACK_MISMATCH');
    const actorRequest = buildActorBaseAttributesSuccessorImportRequest({
      subjectCommit,
      compatibilityManifest: preparation.compatibility_manifest,
      schemaMigration: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION_V17_BOOTSTRAP,
      parentCatalog: {
        catalog_scope: item.ledger.root.catalog_scope,
        catalog_revision_id: item.ledger.root.target_revision_id,
        catalog_digest: item.ledger.root.target_catalog_digest,
        import_readback_ref: 'v17-bootstrap:item-import',
        import_readback_digest: digestEnvelope(itemReadback),
        compatible_world_pin_manifest_digest:
          item.ledger.root.compatible_world_pin_manifest_digest
      }
    });
    const actorAttestation = await requireAttestation('actor_import',
      actorRequest, attest, onRequest);
    const actorImport = await importApprovedActorBaseAttributes({
      pool: importer, request: actorRequest, attestation: actorAttestation
    });
    const actorReadback = await readActorBaseAttributesImport(importer, {
      request: actorRequest, attestation: actorAttestation
    });
    assert.deepEqual(actorReadback, actorImport);
    const actorPartyCounts = (await party.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.parties) AS party_count,
      (SELECT count(DISTINCT party_id)::int FROM party_runtime.party_catalog_pins
        WHERE catalog_scope='actor_base_attributes_v1') AS pinned_party_count,
      (SELECT count(*)::int FROM party_runtime.parties p
        WHERE NOT EXISTS (SELECT 1 FROM party_runtime.party_catalog_pins c
          WHERE c.party_id=p.party_id AND c.catalog_scope='actor_base_attributes_v1'))
        AS missing_domain_pin_count,
      (SELECT count(*)::int FROM party_runtime.commit_idempotency
        WHERE status IN ('reserved','transaction_committed')) AS inflight_count`)).rows[0];
    if (actorPartyCounts.party_count !== 0) throw new Error('V17_ACTOR_PARTIES_NOT_EMPTY');
    const activeItem = (await world.query(`SELECT catalog_revision_id,catalog_digest
      FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope='item_container_materialization_v2'
      ORDER BY event_sequence DESC LIMIT 1`)).rows[0];
    if (activeItem?.catalog_revision_id !== actorRequest.parent_catalog.catalog_revision_id
        || activeItem?.catalog_digest !== actorRequest.parent_catalog.catalog_digest)
      throw new Error('V17_ACTOR_ITEM_PARENT_MISMATCH');
    const actorActivationRequest = buildActorBaseAttributesSuccessorActivationRequest({
      importRequest: actorRequest, importResult: actorReadback,
      previousEvent: null, partyPreflight: actorPartyCounts
    });
    const actorActivationAttestation = await requireAttestation('actor_activation',
      actorActivationRequest, attest, onRequest);
    const actorActivationArgs = { readPool: importer, activationPool: activator,
      request: actorActivationRequest, attestation: actorActivationAttestation,
      importApproval: { request: actorRequest, attestation: actorAttestation },
      importResult: actorReadback, partyPool: party };
    const beforeActorEvents = Number((await world.query(`SELECT count(*) FROM
      world_base.runtime_catalog_activation_events
      WHERE catalog_scope='actor_base_attributes_v1'`)).rows[0].count);
    const rollbackPool = { connect: async () => {
      const client = await activator.connect();
      return { query: (sql, values) => client.query(sql === 'COMMIT' ? 'ROLLBACK' : sql, values),
        release: () => client.release() };
    } };
    const dryRun = await activateActorBaseAttributes({ ...actorActivationArgs,
      activationPool: rollbackPool });
    if (Number((await world.query(`SELECT count(*) FROM
      world_base.runtime_catalog_activation_events
      WHERE catalog_scope='actor_base_attributes_v1'`)).rows[0].count) !== beforeActorEvents)
      throw new Error('V17_ACTOR_ACTIVATION_ROLLBACK_MISMATCH');
    const actorActivation = await activateActorBaseAttributes(actorActivationArgs);
    assert.deepEqual(actorActivation, dryRun);
    assert.equal(validateActorBaseAttributesActivationResult({ result: actorActivation,
      request: actorActivationRequest, attestation: actorActivationAttestation }), true);
    assert.deepEqual(await activateActorBaseAttributes(actorActivationArgs), actorActivation);
    const actorEvents = (await world.query(`SELECT event_id,event_sequence,event_digest,
      request_digest,attestation_digest,catalog_revision_id,catalog_digest,
      expected_previous_event_id FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope='actor_base_attributes_v1'`)).rows;
    assert.equal(actorEvents.length, 1);
    assert.deepEqual({ ...actorEvents[0], event_sequence: Number(actorEvents[0].event_sequence) }, {
      event_id: actorActivation.event_id,
      event_sequence: actorActivation.event_sequence,
      event_digest: actorActivation.event_digest,
      request_digest: actorActivationRequest.request_digest,
      attestation_digest: actorActivationAttestation.attestation_digest,
      catalog_revision_id: actorActivation.catalog_revision_id,
      catalog_digest: actorActivation.catalog_digest,
      expected_previous_event_id: null
    });
    const approvals = {
      itemBaselineApproval: { request: preparation.baseline_request, attestation: baselineAttestation },
      itemImportApproval: { request: preparation.approval_request, attestation: overlayAttestation },
      itemApproval: { request: itemActivationRequest, attestation: itemActivationAttestation },
      actorImportApproval: { request: actorRequest, attestation: actorAttestation },
      actorApproval: { request: actorActivationRequest, attestation: actorActivationAttestation }
    };
    await mkdir(dirname(activationApprovalsPath), { recursive: true });
    const pendingPath = `${activationApprovalsPath}.${process.pid}.pending`;
    try {
      await writeFile(pendingPath, `${JSON.stringify(approvals, null, 2)}\n`, { mode: 0o600 });
      await rename(pendingPath, activationApprovalsPath);
    } finally { await rm(pendingPath, { force: true }); }
    return { database: worldName, party_database: partyName,
      schema: { world_tables: 208, party_migrations: partyMigration.applied },
      gate1: { status: gateReadback.status, digest: gate.first_state_digest },
      p12: { inserted_rows: p12Request.expected_readback.distinct_pinned_rows,
        source_records: afterP12.source_records },
      additional_start_owners: ownerImport,
      appearance_v3: { inserted_rows: appearanceRequest.expected_import_readback.inserted_rows,
        rollback: 'pass' }, capacity_v2: { manifest_sha256: capacityManifestSha256,
        runtime_record_digests: capacityDigests }, nature_successor: { inserted_rows: natureRecords.length,
        runtime_record_digests: natureDigests }, item_import: itemReadback,
      item_activation: itemActivation, actor_import: actorReadback,
      actor_activation: actorActivation, activation_performed: true };
  } finally {
    await Promise.all([world?.end(), party?.end(), importer?.end(), activator?.end(), admin.end()]);
    await rm(work, { recursive: true, force: true });
  }
}

async function requireAttestation(stage, request, attest, onRequest) {
  await onRequest?.({ stage, request });
  const attestation = await attest?.({ stage, request });
  if (!attestation) throw new Error(`V17_INDEPENDENT_ATTESTATION_REQUIRED:${stage}`);
  return attestation;
}

async function rollbackProbe(pool, apply, table, stage) {
  const before = Number((await pool.query(`SELECT count(*) FROM world_base.${table}`)).rows[0].count);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await apply(client);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  const after = Number((await pool.query(`SELECT count(*) FROM world_base.${table}`)).rows[0].count);
  if (after !== before) throw new Error(`V17_${stage}_ROLLBACK_MISMATCH`);
}

export async function importAdditionalStartOwnerRows(pool) {
  const ownerRows = await buildAdditionalStartOwnerRows();
  for (const rollback of [true, false]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET CONSTRAINTS ALL DEFERRED');
      for (const [table, rows] of [
        ['source_records', ownerRows.sourceRecords],
        ['spatial_v3_authoring_versions', ownerRows.authoring],
        ['spatial_v3_g4_npc_composition_bindings', ownerRows.npc],
        ['spatial_v3_g6_acoustic_baselines', ownerRows.acoustic]
      ]) for (const row of rows) {
        const id = row.entity_id ?? row.id;
        const key = table === 'spatial_v3_authoring_versions' ? 'entity_id' : 'id';
        const predicate = table === 'source_records' ? 'id=$1'
          : `entity_kind=$1 AND ${key}=$2 AND version=$3`;
        const keyValues = table === 'source_records' ? [id] : [row.entity_kind, id, row.version];
        const existing = await client.query(`SELECT 1 FROM world_base.${table}
          WHERE ${predicate}`, keyValues);
        if (existing.rowCount && table !== 'source_records')
          throw new Error(`V17_OWNER_ROW_ALREADY_EXISTS:${table}:${id}`);
        if (!existing.rowCount) {
          const columns = Object.keys(row);
          if (!columns.every((name) => /^[a-z][a-z0-9_]*$/u.test(name)))
            throw new Error(`V17_OWNER_COLUMN_INVALID:${table}`);
          await client.query(`INSERT INTO world_base.${table} (${columns.join(', ')})
            SELECT ${columns.join(', ')} FROM jsonb_populate_record(NULL::world_base.${table}, $1::jsonb)`,
          [JSON.stringify(row)]);
        }
        const actual = await client.query(`SELECT (to_jsonb(actual) - 'created_at' - 'updated_at') =
          (to_jsonb(jsonb_populate_record(NULL::world_base.${table},
            $${keyValues.length + 1}::jsonb)) - 'created_at' - 'updated_at') AS exact
          FROM world_base.${table} actual WHERE ${predicate}`,
        [...keyValues, JSON.stringify(row)]);
        if (actual.rowCount !== 1 || actual.rows[0].exact !== true)
          throw new Error(`V17_OWNER_ROW_MISMATCH:${table}:${id}`);
      }
      await client.query(rollback ? 'ROLLBACK' : 'COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  for (const [table, rows] of [
    ['source_records', ownerRows.sourceRecords],
    ['spatial_v3_authoring_versions', ownerRows.authoring],
    ['spatial_v3_g4_npc_composition_bindings', ownerRows.npc],
    ['spatial_v3_g6_acoustic_baselines', ownerRows.acoustic]
  ]) for (const row of rows) {
    const id = row.entity_id ?? row.id;
    const key = table === 'spatial_v3_authoring_versions' ? 'entity_id' : 'id';
    const predicate = table === 'source_records' ? 'id=$1'
      : `entity_kind=$1 AND ${key}=$2 AND version=$3`;
    const keyValues = table === 'source_records' ? [id] : [row.entity_kind, id, row.version];
    const actual = await pool.query(`SELECT (to_jsonb(actual) - 'created_at' - 'updated_at') =
      (to_jsonb(jsonb_populate_record(NULL::world_base.${table},
        $${keyValues.length + 1}::jsonb)) - 'created_at' - 'updated_at') AS exact
      FROM world_base.${table} actual WHERE ${predicate}`,
    [...keyValues, JSON.stringify(row)]);
    if (actual.rowCount !== 1 || actual.rows[0].exact !== true)
      throw new Error(`V17_OWNER_COMMITTED_ROW_MISMATCH:${table}:${id}`);
  }
  return { npc: ownerRows.npc.length, acoustic: ownerRows.acoustic.length,
    authoring: ownerRows.authoring.length, rollback: 'pass', readback: 'exact' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  if (process.argv.includes('--run')) {
    const directory = process.env.V17_BOOTSTRAP_ATTESTATION_DIR;
    if (!directory) throw new Error('V17_INDEPENDENT_ATTESTATIONS_REQUIRED');
    const stages = ['item_baseline', 'item_import', 'item_activation', 'actor_import',
      'actor_activation'];
    const attestations = Object.fromEntries(await Promise.all(stages.map(async (stage) =>
      [stage, JSON.parse(await readFile(join(directory, `${stage}.json`), 'utf8'))])));
    result = await bootstrapV17Imports({ adminUrl: process.env.V17_BOOTSTRAP_ADMIN_URL,
      activationApprovalsPath: process.env.V17_BOOTSTRAP_ACTIVATION_APPROVALS_PATH
        || localV17ApprovalsPath(),
      attest: ({ stage }) => attestations[stage],
      onRequest: async ({ stage, request }) => {
        const output = process.env.V17_BOOTSTRAP_REQUEST_DIR;
        if (output) {
          await mkdir(output, { recursive: true });
          await writeFile(join(output, `${stage}.json`),
            `${JSON.stringify(request, null, 2)}\n`);
        }
      } });
  } else result = await checkV17BootstrapInputs();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
