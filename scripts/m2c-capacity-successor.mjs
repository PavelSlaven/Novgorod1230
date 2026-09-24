import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const directory = 'data/world-catalogs/novgorod';
const sources = {
  edge_candidate: [`${directory}/m2c-scene-movement-edges/candidate.json`, 'c4742a5b9642638b7e2ca3c440ffe344e724549abfa788ed39b8627314957356'],
  positions: [`${directory}/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_position_templates.json`, 'd729ec63d6d7aef8921eb30019265096320de6c9f7fbab39c60b9c1793f21a04'],
  g6_slots: [`${directory}/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_g6_template_slots.json`, '6f63f52c3be0293e8d365f66fc0ee996b0edced2b468fc40d22d449c36f7708e'],
  group_reference: [`${directory}/spatial-v3/candidates/spatial-v3-production-v6/datasets/spatial_v3_scene_position_templates.json`, '4cc8beab358cc8bbd5c933048d6c447cd3c6fdfd586c47eaddb3bbd60d58c093'],
  spatial_contract: ['data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md', '2f4d7b3c8359061a203224620e39f6709891833c8e08c6255507630a82bfc52a'],
};

function readPinned(key) {
  const [path, sha256] = sources[key];
  const bytes = readFileSync(resolve(root, path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, `${key} source changed`);
  return key === 'spatial_contract' ? bytes.toString('utf8') : JSON.parse(bytes);
}

export function buildM2cCapacitySuccessor() {
  const approved = readPinned('edge_candidate');
  const positions = readPinned('positions');
  const slots = readPinned('g6_slots');
  const reference = readPinned('group_reference');
  const contract = readPinned('spatial_contract');
  assert.match(contract, /capacity: required positive_integer/);
  assert.match(contract, /Null capacity означает отсутствие именно механического лимита relation/);
  assert.ok(reference.some((row) => row.position_slot_key === 'open_shore' && row.capacity === 7));
  assert.equal(slots.length, 17);
  assert.equal(positions.length, 51);
  assert.equal(approved.scene_movement_edge_templates.length, 68);
  assert.ok(slots.every((row) =>
    ['spatial.g6.open', 'spatial.g6.water'].includes(row.physical_class_id)
    && row.overhead_cover_id === 'none' && row.enclosing_structure_slot_key === null));
  assert.ok(positions.every((row) => row.capacity === 1));
  assert.ok(approved.scene_movement_edge_templates.every((row) => row.capacity === 1 && !row.portal_template_ref));

  return {
    artifact_type: 'spatial_v3_m2c_open_capacity_successor_candidate',
    candidate_id: 'novgorod_m2c_open_capacity_v2',
    version: 2,
    status: 'candidate_pending_independent_data_approval',
    approved: false,
    import_authorized: false,
    activation_authorized: false,
    world_revision_id: approved.world_revision_id,
    source_refs: Object.values(sources).map(([path, sha256]) => ({ path, sha256 })),
    proposal: {
      source_scene_template_version: 1,
      successor_scene_template_version: 2,
      position_capacity: 7,
      position_capacity_basis: 'approved S1 open_shore group capacity; required positive integer under active Spatial contract',
      edge_capacity: null,
      edge_capacity_basis: 'no static relation limit for open, non-portal local passage under active Spatial contract',
      narrow_point_rule: 'A smaller capacity requires an explicit physical source for the exact position or edge.',
      dependency_repin_required_before_import: true,
    },
    scene_position_templates: positions.map((row) => ({ ...row, scene_template_version: 2, capacity: 7 })),
    scene_movement_edge_templates: approved.scene_movement_edge_templates.map((row) => ({
      ...row, scene_template_version: 2, capacity: null,
    })),
  };
}

const candidatePath = resolve(root, directory, 'm2c-scene-movement-edges/open-capacity-v2-candidate.json');
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const bytes = `${JSON.stringify(buildM2cCapacitySuccessor(), null, 2)}\n`;
  if (process.argv.includes('--check')) assert.equal(readFileSync(candidatePath, 'utf8'), bytes);
  else writeFileSync(candidatePath, bytes);
  console.log(createHash('sha256').update(bytes).digest('hex'));
}
