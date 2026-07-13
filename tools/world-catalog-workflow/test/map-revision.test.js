import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMapRevision } from '../src/index.js';

const valid = {
  schema_version: 'rus.region_map_revision.v1',
  map_revision_id: 'novgorod_1230_research_revision_001',
  region_id: 'region_novgorod_land',
  historical_horizon: { year: 1230, mode: 'permanent_baseline' },
  grid_coordinate_system: 'regional_square_32km',
  g1_cell_size_km: 32,
  active_cell_count: 70,
  grid_extent: { min_x: 0, max_x: 9, min_y: 0, max_y: 6 },
  parent_revision_id: 'novgorod_v6_legacy_baseline',
  legacy_id_policy: 'preserve_same_entity',
  source_manifest_digest: 'a'.repeat(64),
  graph_digest: null,
  status: 'staging'
};

test('valid map revision passes', () => {
  assert.deepEqual(validateMapRevision(valid), { ok: true, errors: [] });
});

test('map revision rejects missing digest and semantic fallback fields', () => {
  const value = { ...valid, source_manifest_digest: '', default_control_status: 'core' };
  const result = validateMapRevision(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /source_manifest_digest/);
  assert.match(result.errors.join('\n'), /default_control_status/);
});


test('map revision rejects null integer fields rather than coercing them to zero', () => {
  const value = structuredClone(valid);
  value.active_cell_count = null;
  value.grid_extent.min_x = null;
  const result = validateMapRevision(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /active_cell_count/);
  assert.match(result.errors.join('\n'), /grid_extent.min_x/);
});
