import assert from 'node:assert/strict';
import test from 'node:test';
import { buildP12TargetImportPlan } from '../../tools/spatial-v3/p12-target-import.mjs';

test('P12 target entrypoint gates V1.1, source approval and complete compiled bundle in one transaction', async () => {
  const result = await buildP12TargetImportPlan({ rollback: true });
  assert.equal(result.ok, true);
  assert.equal(result.target_import_authorized, true);
  assert.equal(result.materialization_authorized, false);
  assert.equal(result.p28_activation, 'not_authorized');
  assert.equal((result.sql.match(/BEGIN;/g) ?? []).length, 1);
  assert.equal((result.sql.match(/ROLLBACK;/g) ?? []).length, 1);
  assert.match(result.sql, /spatial_v3_scene_templates/);
  assert.match(result.sql, /spatial_v3_world_route_endpoint_bindings/);
  assert.equal(result.projection_dataset_counts.spatial_v3_nodes, 227);
  assert.equal(result.projection_dataset_counts.spatial_v3_world_route_endpoint_bindings, 172);
  assert.equal(result.projection_dataset_counts.spatial_v3_authoring_dependency_edges, 3249);
});

test('P12 target entrypoint rejects invalid V1.1 before it can produce any import SQL', async () => {
  await assert.rejects(
    () => buildP12TargetImportPlan({
      validateApproval: async () => ({ ok: false, materialization_authorized: false, p28_activation: 'not_authorized', errors: [{ code: 'P12_V11_ZIP_DIGEST_MISMATCH' }] }),
      validateSource: async () => { throw new Error('source must not run'); },
      validateBundle: async () => { throw new Error('bundle must not run'); },
      assessProjection: async () => { throw new Error('projection must not run'); }
    }),
    /P12 target import refuses V1.1 approval gate: P12_V11_ZIP_DIGEST_MISMATCH/
  );
});
