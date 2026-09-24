import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildM2cCapacitySuccessor } from './m2c-capacity-successor.mjs';

test('open G6 capacity successor follows pinned physical slots and approved group capacity', () => {
  const candidate = buildM2cCapacitySuccessor();
  const saved = JSON.parse(readFileSync(resolve(import.meta.dirname,
    '../data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-candidate.json')));
  assert.deepEqual(saved, candidate);
  assert.equal(candidate.approved, false);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
  assert.equal(candidate.scene_position_templates.length, 51);
  assert.equal(candidate.scene_movement_edge_templates.length, 68);
  assert.equal(new Set(candidate.scene_position_templates.map((row) => row.scene_template_id)).size, 17);
  assert.ok(candidate.scene_position_templates.every((row) => row.scene_template_version === 2 && row.capacity === 7));
  assert.ok(candidate.scene_movement_edge_templates.every((row) => row.scene_template_version === 2 && row.capacity === null));
});
