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
  const schema = JSON.parse(readFileSync(resolve(import.meta.dirname,
    '../packages/contracts/src/spatial-v3/specifications.json')));
  const allowedTypes = schema.specifications.flatMap((spec) => spec.fields ?? [])
    .find((field) => field.name === 'position_type_id')?.type.match(/scene_position\.[a-z_]+/g);
  assert.ok(allowedTypes);
  assert.ok(candidate.scene_position_templates.every((row) => allowedTypes.includes(row.position_type_id)));
  const focusTypes = Object.fromEntries(candidate.scene_position_templates
    .filter((row) => row.position_slot_key === 'focus')
    .map((row) => [row.scene_template_id.replace(/^stfv3__g5_|_v1$/g, ''), row.position_type_id]));
  assert.deepEqual(focusTypes, {
    boundary_access: 'scene_position.passage',
    burial_ritual_buffer: 'scene_position.boundary_edge',
    dry_route: 'scene_position.passage',
    exploration_concealment: 'scene_position.passage',
    general_hazard: 'scene_position.passage',
    habitation: 'scene_position.central',
    landing_transition: 'scene_position.boundary_edge',
    observation_orientation: 'scene_position.passage',
    resource_hazard: 'scene_position.hazard_boundary',
    resource: 'scene_position.central',
    route_approach: 'scene_position.passage',
    seasonal_route_hazard: 'scene_position.passage',
    shelter_rest: 'scene_position.central',
    water_hazard: 'scene_position.water_reach',
    water_navigation: 'scene_position.water_reach',
    wetland_flood: 'scene_position.passage',
    work_storage_social: 'scene_position.central',
  });
});
