import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildBundleReadbackSql,
  buildImportWithReadbackSql,
  buildTransactionalImportSql,
  sqlLiteral,
  validateAuthoringBundle,
} from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { validateM2cNpcWaveApproval } from '../../tools/spatial-v3/m2c-npc-wave-approval.mjs';
import { manifestIncludesWaveTables, M2C_NPC_WAVE_TABLE_SET } from '../../tools/spatial-v3/m2c-npc-wave-bundle-validation.mjs';

const gap = (code) => ({ code, subject_ref: 'novgorod:test', dependency_pins: ['catalog'], blocking: true });
const approvedTarget = async () => ({ ok: true, materialization_authorized: false, p28_activation: 'not_authorized', errors: [] });
const buildDraftWaveWithPresenceRule = async (t, index, overrides) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-wave-discovery-'));
  const waveRoot = join(process.cwd(), 'data/world-catalogs/novgorod/m2c-npc-wave/v1');
  await cp(waveRoot, dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifestFile = join(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.status = 'draft';
  const presenceDataset = manifest.datasets.find((dataset) => dataset.table === 'presence_rules');
  const presencePath = join(dir, presenceDataset.file);
  const rules = JSON.parse(await readFile(presencePath, 'utf8'));
  Object.assign(rules[index], overrides);
  const content = JSON.stringify(rules);
  await writeFile(presencePath, content);
  presenceDataset.sha256 = createHash('sha256').update(content).digest('hex');
  await writeFile(manifestFile, JSON.stringify(manifest));
  return buildTransactionalImportSql({ root: process.cwd(), manifestPath: manifestFile, rollback: true, allowTypedGaps: true });
};
test('P12 Novgorod bundle is the approved complete target compilation of the reviewed source package', async () => {
  const result = await validateAuthoringBundle({ root: process.cwd() });
  assert.equal(result.errors.length, 0); assert.equal(result.ok, true); assert.deepEqual(result.data_gaps, []);
  assert.equal(result.source_approval.ok, true);
  assert.equal(result.source_approval.activation, 'not_authorized');
  assert.equal(result.dataset_counts.spatial_v3_nodes, 276);
  assert.equal(result.dataset_counts.spatial_v3_scene_materialization_profiles, 195);
  assert.equal(result.dataset_counts.spatial_v3_scene_materialization_candidates, 195);
  assert.equal(result.dataset_counts.spatial_v3_approved_physical_source_pairs, 358);
  assert.equal(result.dataset_counts.spatial_v3_g4_directional_exits, 86);
  assert.equal(result.dataset_counts.spatial_v3_world_routes, 86);
  assert.equal(result.dataset_counts.spatial_v3_authoring_dependency_edges, 3249);
  assert.equal(result.target_approval.materialization_authorized, false);
  assert.equal(result.target_approval.p28_activation, 'not_authorized');
});
test('P12 default authoring validation fails closed when V1.1 target approval digest is invalid', async () => {
  const result = await validateAuthoringBundle({
    root: process.cwd(),
    validateTargetApproval: async () => ({ ok: false, materialization_authorized: false, p28_activation: 'not_authorized', errors: [{ code: 'P12_V11_ZIP_DIGEST_MISMATCH' }] })
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'P12_TARGET_APPROVAL_INVALID' && error.subject_ref === 'P12_V11_ZIP_DIGEST_MISMATCH'));
});
test('P12 executes the declared JSON Schema, including schema-only additionalProperties rejection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-schema-'));
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'schema', world_revision_id: 'r', status: 'draft', provenance_ref: 'catalog', delete_policy: 'forbid', datasets: [], data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP'), gap('DIRECTIONAL_EXIT_READINESS_DATA_GAP'), gap('ROUTE_BINDING_DATA_GAP'), gap('APPROVED_PROFILE_DATA_GAP')], schema_only_extra: true };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest));
  const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.ok(result.errors.some((error) => error.code === 'SCHEMA_VALIDATION_FAILED' && error.subject_ref === '$.schema_only_extra:additionalProperties'));
});
test('P12 rejects unknown table, digest drift and dangling dataset dependency', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-')); await mkdir(join(dir, 'datasets'));
  const rows = JSON.stringify([{ id: 'route-a', references: [{ table: 'spatial_v3_world_routes', id: 'missing' }] }]); await writeFile(join(dir, 'datasets/routes.json'), rows);
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'test', world_revision_id: 'r', status: 'draft', provenance_ref: 'catalog', delete_policy: 'forbid', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP'), gap('DIRECTIONAL_EXIT_READINESS_DATA_GAP'), gap('ROUTE_BINDING_DATA_GAP'), gap('APPROVED_PROFILE_DATA_GAP')], datasets: [{ table: 'spatial_v3_world_routes', file: 'datasets/routes.json', sha256: createHash('sha256').update(rows).digest('hex'), status: 'draft', provenance_ref: 'catalog', delete_policy: 'forbid', depends_on: [] }] };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest));
  manifest.datasets[0].depends_on = ['spatial_v3_nodes']; await writeFile(file, JSON.stringify(manifest));
  let result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget }); assert.ok(result.errors.some((error) => error.code === 'DANGLING_DATASET_DEPENDENCY'));
  manifest.datasets[0].table = 'party_runtime_sites'; await writeFile(file, JSON.stringify(manifest)); result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget }); assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_OR_PARTY_TABLE'));
  manifest.datasets[0].table = 'spatial_v3_world_routes'; manifest.datasets[0].depends_on = []; manifest.datasets[0].sha256 = '0'.repeat(64); await writeFile(file, JSON.stringify(manifest)); result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget }); assert.ok(result.errors.some((error) => error.code === 'DATASET_DIGEST_MISMATCH'));
});
test('P12 rejects permissive rows, omitted DDL fields and embedded relations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-strict-')); await mkdir(join(dir, 'datasets'));
  const rows = JSON.stringify([{ id: 'not-a-ddl-row', candidates: ['embedded'] }]); await writeFile(join(dir, 'datasets/revisions.json'), rows);
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'strict', world_revision_id: 'r', status: 'draft', provenance_ref: 'catalog', delete_policy: 'forbid', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP'), gap('DIRECTIONAL_EXIT_READINESS_DATA_GAP'), gap('ROUTE_BINDING_DATA_GAP'), gap('APPROVED_PROFILE_DATA_GAP')], datasets: [{ table: 'spatial_v3_world_revisions', file: 'datasets/revisions.json', sha256: createHash('sha256').update(rows).digest('hex'), status: 'draft', provenance_ref: 'catalog', delete_policy: 'forbid', depends_on: [] }] };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest)); const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  for (const code of ['UNKNOWN_ROW_FIELD', 'MISSING_REQUIRED_FIELD', 'NON_NORMALIZED_REFERENCE']) assert.ok(result.errors.some((error) => error.code === code), code);
});

test('P12 proves expansion capacity per profile using the DDL max_count field', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-expansion-')); await mkdir(join(dir, 'datasets'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const revision = 'novgorod_spatial_v3_target_contract_approval_001';
  const limits = ['a', 'b'].map((profile) => ({ profile_id: profile, profile_version: 1, template_id: 'shared', template_version: 1, max_count: 1 }));
  const slots = ['a', 'b'].map((profile) => ({ id: `slot-${profile}`, version: 1, world_revision_id: revision, profile_id: profile, profile_version: 1, g4_id: `g4-${profile}`, g4_version: 1, continuation_role: 'branch', direction_context_id: null, directional_exit_id: null, directional_exit_version: null, max_instances: 1, continuation_length_rule_id: null, continuation_length_rule_version: null, terminal_policy_id: 'boundary', terminal_policy_version: 1, status: 'approved', provenance_ref: 'source', canonical_digest: 'a'.repeat(64) }));
  const candidates = slots.map((slot) => ({ slot_id: slot.id, slot_version: 1, template_id: 'shared', template_version: 1, selection_weight: 1, compatibility_rule_id: null, compatibility_rule_version: null }));
  const datasets = [];
  for (const [table, rows] of [['spatial_v3_expansion_profile_template_limits', limits], ['spatial_v3_expansion_slots', slots], ['spatial_v3_expansion_slot_templates', candidates]]) {
    const file = `datasets/${table}.json`; const content = JSON.stringify(rows);
    await writeFile(join(dir, file), content);
    datasets.push({ table, file, sha256: createHash('sha256').update(content).digest('hex'), status: 'approved', provenance_ref: 'source', delete_policy: 'forbid', depends_on: [] });
  }
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'expansion', world_revision_id: revision, status: 'approved', provenance_ref: 'source', delete_policy: 'forbid', bundle_kind: 'dependency_closure', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP')], datasets };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest));
  const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.deepEqual(result.errors, []);
  slots[0].max_instances = 2;
  const changed = JSON.stringify(slots);
  await writeFile(join(dir, datasets[1].file), changed);
  datasets[1].sha256 = createHash('sha256').update(changed).digest('hex');
  await writeFile(file, JSON.stringify(manifest));
  const overCapacity = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.ok(overCapacity.errors.some((error) => error.code === 'CAPACITY_PROOF_FAILED'));
});

test('P12 rejects expansion profiles without executable rule closure', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-rules-')); await mkdir(join(dir, 'datasets'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const revision = 'novgorod_spatial_v3_target_contract_approval_001';
  const rows = [{ id: 'profile', version: 1, world_revision_id: revision,
    adjacency_rule_set_id: 'missing', adjacency_rule_set_version: 1,
    connectivity_rule_set_id: 'missing', connectivity_rule_set_version: 1,
    seed_policy_id: 'missing', seed_policy_version: 1 }];
  const content = JSON.stringify(rows);
  await writeFile(join(dir, 'datasets/profiles.json'), content);
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
    bundle_id: 'rules', world_revision_id: revision, status: 'draft', provenance_ref: 'source',
    delete_policy: 'forbid', bundle_kind: 'dependency_closure', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP')],
    datasets: [{ table: 'spatial_v3_g4_expansion_profiles', file: 'datasets/profiles.json',
      sha256: createHash('sha256').update(content).digest('hex'), status: 'draft',
      provenance_ref: 'source', delete_policy: 'forbid', depends_on: [] }] };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest));
  const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.equal(result.errors.filter((error) => error.code === 'EXPANSION_RULE_CLOSURE_MISSING').length, 3);
});

test('P12 rejects a scene candidate without the schema-15 applicability pin', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-scene-rule-')); await mkdir(join(dir, 'datasets'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const rows = [{ profile_id: 'profile', profile_version: 1, scene_template_id: 'scene',
    scene_template_version: 1, weight: 1, applicability_rule_id: null, applicability_rule_version: null }];
  const content = JSON.stringify(rows);
  await writeFile(join(dir, 'datasets/candidates.json'), content);
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
    bundle_id: 'scene-rule', world_revision_id: 'r', status: 'draft', provenance_ref: 'source',
    delete_policy: 'forbid', bundle_kind: 'dependency_closure', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP')],
    datasets: [{ table: 'spatial_v3_scene_materialization_candidates', file: 'datasets/candidates.json',
      sha256: createHash('sha256').update(content).digest('hex'), status: 'draft',
      provenance_ref: 'source', delete_policy: 'forbid', depends_on: [] }] };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest));
  const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.ok(result.errors.some((error) => error.code === 'SCENE_CANDIDATE_APPLICABILITY_RULE_MISSING'));
});

test('P12 rejects an external edge without its exact approved registry pin', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-external-')); await mkdir(join(dir, 'datasets'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const entries = [
    ['spatial_v3_external_dependency_versions', [{ registry_type: 'spatial_materialization',
      registry_id: 'registry', registry_version: '1', registry_digest: 'a'.repeat(64),
      dependency_id: 'wood', dependency_version: 1, dependency_digest: 'b'.repeat(64), status: 'approved' }]],
    ['spatial_v3_authoring_dependency_edges', [{ source_entity_kind: 'spatial_node',
      source_entity_id: 'g5', source_version: 1, world_revision_id: 'r', dependency_role: 'function',
      target_entity_kind: 'external_dependency', target_entity_id: 'wood', target_version: 1,
      target_registry_type: 'spatial_materialization', target_registry_id: 'registry',
      target_registry_version: '1', target_registry_digest: 'a'.repeat(64),
      target_dependency_digest: 'c'.repeat(64), canonical_ordinal: 0 }]]];
  const datasets = [];
  for (const [table, rows] of entries) {
    const file = `datasets/${table}.json`; const content = JSON.stringify(rows);
    await writeFile(join(dir, file), content);
    datasets.push({ table, file, sha256: createHash('sha256').update(content).digest('hex'),
      status: 'approved', provenance_ref: 'source', delete_policy: 'forbid', depends_on: [] });
  }
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
    bundle_id: 'external', world_revision_id: 'r', status: 'draft', provenance_ref: 'source',
    delete_policy: 'forbid', bundle_kind: 'dependency_closure', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP')], datasets };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest));
  const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.ok(result.errors.some((error) => error.code === 'EXTERNAL_DEPENDENCY_PIN_MISSING'));
});
test('P12 sqlLiteral encodes TEXT[] for postgres arrays', () => {
  assert.equal(sqlLiteral([], 'TEXT[]'), 'ARRAY[]::text[]');
  assert.equal(sqlLiteral(['all'], 'text[]'), "ARRAY['all']::text[]");
  assert.match(sqlLiteral(['a,b', 'c"d'], 'TEXT[]'), /ARRAY\['a,b', 'c"d'\]::text\[\]/u);
  assert.doesNotMatch(sqlLiteral(['x'], 'TEXT[]'), /\["/u);
});

test('P12 rejects duplicate table-level primary keys inside a dataset', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-dup-pk-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'datasets'));
  const rows = [
    { rule_id: 'pr_dup', rule_version: 1, world_revision_id: 'r', scope_kind: 'place_family', scope_ref: 'pf_x', subject_kind: 'category', subject_ref: 'cat_a', variants: [], presence_probability_ppm: 1, count_limit: 0, allowed_seasons: ['all'], allowed_times: [], guards: [], refresh_class: 'none', confidence: 'low', status: 'approved', provenance_ref: 'src', authoring_payload: {} },
    { rule_id: 'pr_dup', rule_version: 1, world_revision_id: 'r', scope_kind: 'place_family', scope_ref: 'pf_y', subject_kind: 'category', subject_ref: 'cat_b', variants: [], presence_probability_ppm: 2, count_limit: 0, allowed_seasons: ['all'], allowed_times: [], guards: [], refresh_class: 'none', confidence: 'low', status: 'approved', provenance_ref: 'src', authoring_payload: {} },
  ];
  const content = JSON.stringify(rows);
  await writeFile(join(dir, 'datasets/presence_rules.json'), content);
  const manifest = {
    schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
    bundle_id: 'dup-pk', world_revision_id: 'r', status: 'draft', provenance_ref: 'src',
    delete_policy: 'forbid', bundle_kind: 'dependency_closure', data_gaps: [],
    datasets: [{ table: 'presence_rules', file: 'datasets/presence_rules.json', sha256: createHash('sha256').update(content).digest('hex'), status: 'draft', provenance_ref: 'src', delete_policy: 'forbid', depends_on: [] }],
  };
  const file = join(dir, 'manifest.json');
  await writeFile(file, JSON.stringify(manifest));
  const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.ok(result.errors.some((error) => error.code === 'DUPLICATE_RECORD_ID' && error.subject_ref.includes('presence_rules:pr_dup|1')));
});

test('P12 import SQL is deterministic for the same manifest', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-det-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'datasets'));
  const rows = JSON.stringify([{ id: 'p12-revision', catalog_digest: 'a'.repeat(64), status: 'draft', provenance_ref: 'p12-source' }]);
  await writeFile(join(dir, 'datasets/revisions.json'), rows);
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'p12-det', world_revision_id: 'p12-revision', status: 'draft', provenance_ref: 'p12-source', delete_policy: 'forbid', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP'), gap('DIRECTIONAL_EXIT_READINESS_DATA_GAP'), gap('ROUTE_BINDING_DATA_GAP'), gap('APPROVED_PROFILE_DATA_GAP')], datasets: [{ table: 'spatial_v3_world_revisions', file: 'datasets/revisions.json', sha256: createHash('sha256').update(rows).digest('hex'), status: 'draft', provenance_ref: 'p12-source', delete_policy: 'forbid', depends_on: [] }] };
  const manifestFile = join(dir, 'manifest.json');
  await writeFile(manifestFile, JSON.stringify(manifest));
  const a = await buildTransactionalImportSql({ root: process.cwd(), manifestPath: manifestFile, wrapTransaction: false, allowTypedGaps: true });
  const b = await buildTransactionalImportSql({ root: process.cwd(), manifestPath: manifestFile, wrapTransaction: false, allowTypedGaps: true });
  assert.equal(createHash('sha256').update(a).digest('hex'), createHash('sha256').update(b).digest('hex'));
});

test('P12 v17 bootstrap bundle SQL stays byte-stable after importer changes', async () => {
  const request = JSON.parse(await readFile('data/world-catalogs/novgorod/m2c-p12-v17-walk-acoustics-v1/request.json', 'utf8'));
  for (const bundle of request.bundle_order) {
    const part = await buildTransactionalImportSql({
      root: process.cwd(),
      manifestPath: bundle.manifest_path,
      wrapTransaction: false,
      allowTypedGaps: false,
      temporaryTablePrefix: bundle.temporary_table_prefix,
    });
    const content = Buffer.from(part);
    assert.equal(createHash('sha256').update(content).digest('hex'), bundle.sql_part_sha256, bundle.name);
    assert.equal(content.length, bundle.sql_part_bytes, bundle.name);
  }
});

test('P12 readback SQL includes mismatch guard for spatial bundle tables', async () => {
  const sql = await buildBundleReadbackSql({
    root: process.cwd(),
    manifestPath: 'data/world-catalogs/novgorod/spatial-v3/manifest.json',
  });
  assert.match(sql, /P12_READBACK_MISMATCH:spatial_v3_world_revisions/u);
  assert.doesNotMatch(sql, /readback_aggregate_sha256/u);
});

test('P12 rejects equal import and readback temp table prefixes', async () => {
  await assert.rejects(
    () => buildImportWithReadbackSql({
      root: process.cwd(),
      manifestPath: 'data/world-catalogs/novgorod/spatial-v3/manifest.json',
      temporaryTablePrefix: 'p12_same',
      readbackTemporaryTablePrefix: 'p12_same',
    }),
    /P12_IMPORT_READBACK_PREFIX_COLLISION/u,
  );
});

test('P12 import and readback temp table prefixes do not collide', async () => {
  const sql = await buildImportWithReadbackSql({
    root: process.cwd(),
    manifestPath: 'data/world-catalogs/novgorod/spatial-v3/manifest.json',
    temporaryTablePrefix: 'p12_shared',
    readbackTemporaryTablePrefix: 'p12_shared_rb',
  });
  assert.match(sql, /CREATE TEMP TABLE p12_shared_spatial_v3_world_revisions/u);
  assert.match(sql, /CREATE TEMP TABLE p12_shared_rb_spatial_v3_world_revisions/u);
  const importCreates = new Set(sql.match(/CREATE TEMP TABLE p12_shared_(?!rb_)[a-z0-9_]+/gu) ?? []);
  const readbackCreates = new Set(sql.match(/CREATE TEMP TABLE p12_shared_rb_[a-z0-9_]+/gu) ?? []);
  assert.ok(importCreates.size > 0 && readbackCreates.size > 0);
  for (const name of importCreates) assert.ok(!readbackCreates.has(name));
});

test('P12 draft m2c-npc-wave import is refused without approved manifest', async () => {
  await assert.rejects(
    () => buildImportWithReadbackSql({
      root: process.cwd(),
      manifestPath: 'data/world-catalogs/novgorod/m2c-npc-wave/v1/manifest.json',
    }),
    /P12_WAVE_IMPORT_REQUIRES_APPROVED/u,
  );
});

test('P12 rejects item-producing presence rule with absent discovery modes', async (t) => {
  await assert.rejects(
    () => buildDraftWaveWithPresenceRule(t, 0, {
      entry_visible_if: null, search_only_if: null,
      entry_exposed_weight: null, search_concealed_weight: null,
    }),
    /M2C_WAVE_PRESENCE_DISCOVERY_MODE_INVALID/u,
  );
});

test('P12 accepts non-item presence rule with discovery fields absent', async (t) => {
  const sql = await buildDraftWaveWithPresenceRule(t, 6, {
    entry_visible_if: null, search_only_if: null,
    entry_exposed_weight: null, search_concealed_weight: null,
  });
  assert.match(sql, /INSERT INTO world_base\.presence_rules/u);
});

test('P12 rejects discovery fields on non-item presence rule', async (t) => {
  await assert.rejects(
    () => buildDraftWaveWithPresenceRule(t, 6, {
      entry_visible_if: 'placed_exposed', search_only_if: null,
      entry_exposed_weight: null, search_concealed_weight: null,
    }),
    /M2C_WAVE_NON_ITEM_DISCOVERY_FIELDS_FORBIDDEN/u,
  );
});

test('P12 refuses a presence rule with zero weight for both discovery modes', async (t) => {
  await assert.rejects(
    () => buildDraftWaveWithPresenceRule(t, 0, {
      entry_visible_if: 'placed_exposed', search_only_if: 'placed_concealed',
      entry_exposed_weight: 0, search_concealed_weight: 0,
    }),
    /M2C_WAVE_PRESENCE_DISCOVERY_WEIGHTS_INVALID/u,
  );
});

test('P12 approved m2c-npc-wave import without readback wrapper is refused', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-wave-guard-'));
  const waveRoot = join(process.cwd(), 'data/world-catalogs/novgorod/m2c-npc-wave/v1');
  await cp(waveRoot, dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifestFile = join(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.status = 'approved';
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(
    () => buildTransactionalImportSql({
      root: process.cwd(),
      manifestPath: manifestFile,
      wrapTransaction: false,
      allowTypedGaps: true,
      m2cWaveApprovalPath: join(dir, 'approval.json'),
    }),
    /P12_WAVE_IMPORT_REQUIRES_READBACK/u,
  );
});

test('P12 wave table bundle with foreign bundle_id still runs wave validation', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-wave-id-'));
  const waveRoot = join(process.cwd(), 'data/world-catalogs/novgorod/m2c-npc-wave/v1');
  await cp(waveRoot, dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifestFile = join(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.bundle_id = 'not_the_wave_bundle_id';
  manifest.status = 'approved';
  await writeFile(manifestFile, JSON.stringify(manifest));
  const result = await validateAuthoringBundle({
    root: process.cwd(),
    manifestPath: manifestFile,
    validateTargetApproval: approvedTarget,
    m2cWaveApprovalPath: join(dir, 'approval.json'),
  });
  assert.equal(result.ok, true);
  assert.ok(M2C_NPC_WAVE_TABLE_SET.every((table) => (result.dataset_counts[table] ?? 0) > 0));
});

test('P12 sqlLiteral rejects null TEXT[] elements fail-closed', () => {
  assert.throws(
    () => sqlLiteral([null], 'TEXT[]', 'presence_rules.allowed_seasons'),
    /P12_ARRAY_NULL_ELEMENT:presence_rules\.allowed_seasons/u,
  );
});

test('P12 emits domain readiness failures for route endpoints without canonical G5 or directional-exit compatibility', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-domain-')); await mkdir(join(dir, 'datasets'));
  const rows = JSON.stringify([{ id: 'endpoint', version: 1, world_route_id: 'route', world_route_version: 1, endpoint_role: 'from', route_point_id: 'point', route_point_version: 1, canonical_g5_id: 'missing-g5', canonical_g5_version: 1, directional_exit_id: 'missing-exit', directional_exit_version: 1, scene_endpoint_slot_key: 'departure', world_revision_id: 'r', status: 'draft', provenance_ref: 'source', canonical_digest: 'a'.repeat(64), entity_kind: 'world_route_endpoint_binding' }]); await writeFile(join(dir, 'datasets/endpoints.json'), rows);
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'domain', world_revision_id: 'r', status: 'draft', provenance_ref: 'source', delete_policy: 'forbid', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP'), gap('DIRECTIONAL_EXIT_READINESS_DATA_GAP'), gap('ROUTE_BINDING_DATA_GAP'), gap('APPROVED_PROFILE_DATA_GAP')], datasets: [{ table: 'spatial_v3_world_route_endpoint_bindings', file: 'datasets/endpoints.json', sha256: createHash('sha256').update(rows).digest('hex'), status: 'draft', provenance_ref: 'source', delete_policy: 'forbid', depends_on: [] }] };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest)); const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.ok(result.errors.some((error) => error.code === 'CANONICAL_G5_INVENTORY_INCOMPLETE')); assert.ok(result.errors.some((error) => error.code === 'DIRECTIONAL_EXIT_READINESS_GAP'));
});

// rt-lines a3.2/a3.4: the schema reference must see `ALTER COLUMN ... DROP NOT NULL` (30.sql), otherwise the strict row check asks
// a binding of the new style for the connection profile it no longer has. The rows are the real m2c-lines-v1 candidate rows.
test('P12 strict rows: a line-style binding and the line tables pass the importer row check of the DDL-derived schema (30.sql)', async (t) => {
  const source = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets';
  const tables = ['source_records', 'spatial_v3_line_kind_profiles', 'spatial_v3_line_kind_alternative_methods', 'spatial_v3_movement_method_cost_profiles',
    'spatial_v3_movement_method_cost_options', 'spatial_v3_transition_environment_profiles', 'spatial_v3_canonical_g5_connection_bindings',
    'spatial_v3_authoring_versions', 'spatial_v3_authoring_dependency_edges'];
  const dir = await mkdtemp(join(tmpdir(), 'p12-lines-')); await mkdir(join(dir, 'datasets'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const datasets = [];
  for (const table of tables) {
    const rows = await readFile(`${source}/${table}.json`, 'utf8');
    await writeFile(join(dir, `datasets/${table}.json`), rows);
    datasets.push({ table, file: `datasets/${table}.json`, sha256: createHash('sha256').update(rows).digest('hex'), status: 'draft', provenance_ref: 'catalog', delete_policy: 'forbid', depends_on: [] });
  }
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'lines', world_revision_id: 'r', status: 'draft', provenance_ref: 'catalog', delete_policy: 'forbid', data_gaps: [], datasets };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest));
  const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  const rowErrors = result.errors.filter((error) => ['UNKNOWN_ROW_FIELD', 'MISSING_REQUIRED_FIELD', 'UNPINNED_VERSIONED_REFERENCE', 'INVALID_PROVENANCE', 'INVALID_DATASET_ROW'].includes(error.code));
  assert.deepEqual(rowErrors, []);
  assert.equal(result.dataset_counts.spatial_v3_canonical_g5_connection_bindings, 454);
  assert.equal(result.errors.some((error) => error.code === 'MISSING_REQUIRED_FIELD'), false, 'no binding lacks connection_profile_* as a required field');
  // the check is live: a row without a column that is NOT NULL is still reported
  const broken = JSON.parse(await readFile(`${source}/spatial_v3_line_kind_profiles.json`, 'utf8')).map(({ route_kind_id: _omit, ...row }) => row);
  const brokenBytes = JSON.stringify(broken); await writeFile(join(dir, 'datasets/spatial_v3_line_kind_profiles.json'), brokenBytes);
  manifest.datasets[tables.indexOf('spatial_v3_line_kind_profiles')].sha256 = createHash('sha256').update(brokenBytes).digest('hex'); await writeFile(file, JSON.stringify(manifest));
  const after = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.ok(after.errors.some((error) => error.code === 'MISSING_REQUIRED_FIELD' && /route_kind_id/u.test(error.subject_ref)));
});
