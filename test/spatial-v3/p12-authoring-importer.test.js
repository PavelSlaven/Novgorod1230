import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateAuthoringBundle } from '../../tools/spatial-v3/p12-authoring-importer.mjs';

const gap = (code) => ({ code, subject_ref: 'novgorod:test', dependency_pins: ['catalog'], blocking: true });
const approvedTarget = async () => ({ ok: true, materialization_authorized: false, p28_activation: 'not_authorized', errors: [] });
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
test('P12 emits domain readiness failures for route endpoints without canonical G5 or directional-exit compatibility', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'p12-domain-')); await mkdir(join(dir, 'datasets'));
  const rows = JSON.stringify([{ id: 'endpoint', version: 1, world_route_id: 'route', world_route_version: 1, endpoint_role: 'from', route_point_id: 'point', route_point_version: 1, canonical_g5_id: 'missing-g5', canonical_g5_version: 1, directional_exit_id: 'missing-exit', directional_exit_version: 1, scene_endpoint_slot_key: 'departure', world_revision_id: 'r', status: 'draft', provenance_ref: 'source', canonical_digest: 'a'.repeat(64), entity_kind: 'world_route_endpoint_binding' }]); await writeFile(join(dir, 'datasets/endpoints.json'), rows);
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'domain', world_revision_id: 'r', status: 'draft', provenance_ref: 'source', delete_policy: 'forbid', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP'), gap('DIRECTIONAL_EXIT_READINESS_DATA_GAP'), gap('ROUTE_BINDING_DATA_GAP'), gap('APPROVED_PROFILE_DATA_GAP')], datasets: [{ table: 'spatial_v3_world_route_endpoint_bindings', file: 'datasets/endpoints.json', sha256: createHash('sha256').update(rows).digest('hex'), status: 'draft', provenance_ref: 'source', delete_policy: 'forbid', depends_on: [] }] };
  const file = join(dir, 'manifest.json'); await writeFile(file, JSON.stringify(manifest)); const result = await validateAuthoringBundle({ root: process.cwd(), manifestPath: file, validateTargetApproval: approvedTarget });
  assert.ok(result.errors.some((error) => error.code === 'CANONICAL_G5_INVENTORY_INCOMPLETE')); assert.ok(result.errors.some((error) => error.code === 'DIRECTIONAL_EXIT_READINESS_GAP'));
});
