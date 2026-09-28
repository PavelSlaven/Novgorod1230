import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkRegionIds } from './check-region-ids.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'game-base-region-ids-'));
  const registry = path.join(root, 'spatial-v3-nodes.json');
  const binding = path.join(root, 'places-binding.json');
  fs.mkdirSync(path.join(root, 'group'), { recursive: true });
  fs.writeFileSync(registry, JSON.stringify([
    { id: 'region_novgorod_land', spatial_level: 'G0', status: 'approved' },
    { id: 'not_a_region', spatial_level: 'G1', status: 'approved' },
  ]));
  fs.writeFileSync(binding, JSON.stringify({ region_id: 'region_novgorod_land' }));
  fs.writeFileSync(path.join(root, 'group', 'rows.csv'), [
    'id,region_id,presence_region_id,region_scope,region_permission',
    'one,region_novgorod_land,region_novgorod_land,region_novgorod_land,region_novgorod_land',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'group', 'nested.json'), JSON.stringify({
    regions_affected: [{ region_id: 'region_novgorod_land' }],
  }));
  return { root, registry, binding };
}

test('accepts region references backed by an approved G0 node', () => {
  const f = fixture();
  try {
    const result = checkRegionIds({ gameBase: f.root, registryPath: f.registry, placesBindingPath: f.binding });
    assert.deepEqual(result.allowed_ids, ['region_novgorod_land']);
    assert.equal(result.errors.length, 0);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('rejects an unknown region id', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'group', 'unknown.csv'), 'id,region_id\nbad,region_unknown\n');
    const result = checkRegionIds({ gameBase: f.root, registryPath: f.registry, placesBindingPath: f.binding });
    assert.ok(result.errors.some((error) =>
      error.code === 'REGION_ID_UNKNOWN' && error.region_id === 'region_unknown'));
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
