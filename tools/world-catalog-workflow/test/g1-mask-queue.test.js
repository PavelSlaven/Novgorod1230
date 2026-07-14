import test from 'node:test';
import assert from 'node:assert/strict';
import { buildG1WorkQueue, validateG1Mask } from '../src/index.js';

const revision = { map_revision_id: 'rev', region_id: 'region_novgorod_land', g1_cell_size_km: 32 };
const cell = (id, x, y, extra = {}) => ({
  id,
  region_id: revision.region_id,
  node_type: 'region_cell',
  scale_level: 'G1',
  global_grid_x: x,
  global_grid_y: y,
  grid_z: 0,
  cell_size_km: 32,
  cell_active: true,
  region_cell_status: 'active',
  control_status: 'core',
  subregion_id: 'subregion-test',
  evidence_status: 'regional_typology',
  playability_status: 'usable_with_constraints',
  land_fraction: 1,
  water_fraction: 0,
  source_ids: ['src'] ,
  ...extra
});

test('mask reports duplicate coordinates and does not repair them', () => {
  const result = validateG1Mask([cell('a', 0, 1), cell('b', 0, 1)], revision);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicate coordinate/);
});

test('mask reports missing semantic fields instead of inventing values', () => {
  const value = cell('a', 0, 0);
  delete value.control_status;
  const result = validateG1Mask([value], revision);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /control_status/);
  assert.equal(Object.hasOwn(value, 'control_status'), false);
});

test('queue order is top row left-to-right, then next row', () => {
  const cells = [cell('low-right', 2, 0), cell('top-right', 2, 3), cell('top-left', -1, 3), cell('middle', 0, 2)];
  const queue = buildG1WorkQueue(cells, revision);
  assert.deepEqual(queue.entries.map((entry) => entry.g1_id), ['top-left', 'top-right', 'middle', 'low-right']);
  assert.deepEqual(queue.entries.map((entry) => entry.sequence_number), [1, 2, 3, 4]);
});

test('queue skips inactive and external cells', () => {
  const cells = [
    cell('active', 0, 1),
    cell('inactive', 1, 1, { cell_active: false }),
    cell('external', 2, 1, { control_status: 'external' }),
    cell('outside', 3, 1, { region_cell_status: 'outside_region' })
  ];
  const queue = buildG1WorkQueue(cells, revision);
  assert.deepEqual(queue.entries.map((entry) => entry.g1_id), ['active']);
});


test('queue rejects missing coordinates even in incomplete mode', () => {
  const value = cell('bad', 0, 0);
  value.global_grid_y = null;
  assert.throws(() => buildG1WorkQueue([value], revision, { allowIncomplete: true }), /global_grid_y/);
});


test('mask and queue reject null X and grid_z rather than coercing them to zero', () => {
  const value = cell('bad-null', 0, 0);
  value.global_grid_x = null;
  value.grid_z = null;
  const report = validateG1Mask([value], revision);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /global_grid_x/);
  assert.match(report.errors.join('\n'), /grid_z/);
  assert.throws(() => buildG1WorkQueue([value], revision, { allowIncomplete: true }), /global_grid_x/);
});
