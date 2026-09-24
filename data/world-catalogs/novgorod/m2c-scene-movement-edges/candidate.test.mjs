import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../../..');
const candidatePath = 'data/world-catalogs/novgorod/m2c-scene-movement-edges/candidate.json';
const sourcePath = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_movement_edge_templates.json';
const positionPath = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_position_templates.json';
const s1Path = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/datasets/spatial_v3_scene_movement_edge_templates.json';
const npcPath = 'data/world-catalogs/novgorod/m2c-npc/canonical-initial/datasets/spatial_v3_g4_npc_composition_bindings.json';
const generatedNpcPath = 'data/world-catalogs/novgorod/m2c-npc/datasets/spatial_v3_g4_npc_composition_bindings.json';
const evidencePath = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/authoring-evidence.json';
const startPath = 'data/world-catalogs/novgorod/live-world-runtime-v17/target-start-candidate.json';

function read(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
}

test('M2c scene movement candidate pins reciprocal local edges without changing slots', () => {
  const candidateBytes = readFileSync(resolve(root, candidatePath));
  assert.equal(createHash('sha256').update(candidateBytes).digest('hex'), '34d653efa8f96f9ecb9e5a05447e9c5b24fecf4e10983ab8da80973f966880a9');

  const candidate = JSON.parse(candidateBytes);
  const source = read(sourcePath);
  const positions = read(positionPath);
  const s1Edges = read(s1Path);
  const npcBindings = read(npcPath);
  const generatedNpcBindings = read(generatedNpcPath);
  const evidence = read(evidencePath);
  const start = read(startPath);
  const refs = new Map(candidate.source_refs.map((ref) => [ref.path, ref.sha256]));
  for (const [path, expected] of [[sourcePath, 'd6d987f3fe2748f48300d9bf9a285afe8f98619d77677329fbbcd12f6e69a91e'],
    [positionPath, 'd729ec63d6d7aef8921eb30019265096320de6c9f7fbab39c60b9c1793f21a04'],
    [s1Path, '87e96bb0f4f73c0f2047f93f9d1d3d313715b4ff6b335b88829a3b3510d22ce7'],
    [npcPath, '8b7c3e33932bd566335dc05867331dd73b99d5545ebd2f19ea8d794f9451d0e5'],
    [generatedNpcPath, '8fc54aa348c9132b75fe65e742c9c6129cb5254e4c27ab05ba0fc321e8801013'],
    [evidencePath, 'a29676ad909bd1e082f1a8bc97d6e08a168b7cfb6e9e231eb9240b998c1163c6'],
    [startPath, 'd6c2d53779f617e1f849e5ebe00fc86c82d5d4cfc4ed893e310aad1a9eadfe2f']]) {
    assert.equal(refs.get(path), expected);
    assert.equal(sha256(path), expected);
  }

  assert.equal(candidate.approved, false);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
  assert.equal(candidate.scene_movement_edge_templates.length, source.length);
  const byKey = (rows) => new Map(rows.map((row) =>
    [`${row.scene_template_id}@${row.scene_template_version}/${row.edge_slot_key}`, row]));
  const sourceByKey = byKey(source);
  const candidateByKey = byKey(candidate.scene_movement_edge_templates);
  assert.equal(candidateByKey.size, sourceByKey.size);
  const candidateKeys = new Set(['capacity', 'reverse_edge_slot_key']);
  for (const [key, sourceRow] of sourceByKey) {
    const row = candidateByKey.get(key);
    assert.ok(row, `missing candidate edge ${key}`);
    for (const [field, value] of Object.entries(sourceRow)) assert.deepEqual(row[field], value, `${key}: ${field}`);
    assert.deepEqual(Object.keys(row).filter((field) => !(field in sourceRow)).sort(), [...candidateKeys].sort());
    assert.equal(row.capacity, 1, key);
    const reverseKey = `${row.scene_template_id}@${row.scene_template_version}/${row.reverse_edge_slot_key}`;
    const reverse = candidateByKey.get(reverseKey);
    assert.ok(reverse, `${key} reverse row missing`);
    assert.equal(reverse.from_position_slot_key, row.to_position_slot_key, `${key} reverse source`);
    assert.equal(reverse.to_position_slot_key, row.from_position_slot_key, `${key} reverse target`);
    assert.equal(reverse.reverse_edge_slot_key, row.edge_slot_key, `${key} reverse reference`);
    assert.equal(reverse.capacity, 1, `${key} reverse capacity`);
  }

  const templateIds = new Set(source.map((row) => row.scene_template_id));
  assert.equal(templateIds.size, 17);
  assert.deepEqual(new Set(candidate.scope.scene_templates),
    new Set([...templateIds].map((id) => `${id}@1`)));
  for (const templateId of templateIds) {
    const templatePositions = positions.filter((row) => row.scene_template_id === templateId);
    for (const slot of ['arrival', 'focus', 'departure']) {
      assert.equal(templatePositions.find((row) => row.position_slot_key === slot)?.capacity, 1,
        `${templateId}/${slot} position capacity`);
    }
    const templateEdges = candidate.scene_movement_edge_templates.filter((row) => row.scene_template_id === templateId);
    assert.deepEqual(new Set(templateEdges.map(({ from_position_slot_key: from, to_position_slot_key: to }) => `${from}>${to}`)),
      new Set(['arrival>focus', 'focus>arrival', 'focus>departure', 'departure>focus']));
  }
  assert.ok(s1Edges.length >= 2);
  assert.ok(s1Edges.filter((row) => row.scene_template_id === 'trace_ld_v1_tpl_fishing_camp')
    .every((row) => row.capacity === 1 && row.reverse_edge_slot_key));

  const npc = npcBindings.find((row) => row.id === 'm2c_g4_npc_composition_canonical_initial_south_approach_v1');
  assert.equal(npc.canonical_g5_id, candidate.canonical_capacity_boundary.canonical_g5_ref.id);
  assert.equal(npc.min_count, candidate.canonical_capacity_boundary.npc_count.min);
  assert.equal(npc.max_count, candidate.canonical_capacity_boundary.npc_count.max);
  assert.deepEqual(npc.payload.placement_policy.position_slot_order,
    candidate.canonical_capacity_boundary.npc_slot_order);
  assert.deepEqual(npc.payload.placement_policy.reserved_position_slots,
    candidate.canonical_capacity_boundary.reserved_for_entering_player);
  assert.match(candidate.canonical_capacity_boundary.runtime_rule, /committed placement occupancy/);
  assert.deepEqual(candidate.canonical_capacity_boundary.g4_ref, start.initial_placement.g4_ref);
  assert.deepEqual(candidate.canonical_capacity_boundary.canonical_g5_ref,
    start.initial_placement.canonical_g5_ref);
  assert.deepEqual(candidate.canonical_capacity_boundary.scene_template_ref,
    start.initial_placement.scene_template_ref);
  assert.equal(start.initial_placement.position_slot_key, 'arrival');

  assert.equal(candidate.generated_capacity_boundaries.g4_contexts.length, 32);
  const expectedContexts = evidence.families.flatMap((family) => family.g4_ids.map((g4Id) => {
    const composition = generatedNpcBindings.find((row) => row.g4_id === g4Id
      && row.generation_template_id === family.family_id);
    assert.ok(composition, `${g4Id} composition binding`);
    const context = candidate.generated_capacity_boundaries.g4_contexts.find((row) => row.g4_ref.id === g4Id);
    assert.ok(context, `${g4Id} capacity boundary`);
    assert.equal(context.scene_template_ref.id, family.scene_template_refs[0].split('@')[0]);
    assert.equal(context.composition_binding_ref.id, composition.id);
    assert.deepEqual(context.npc_count, { min: composition.min_count, max: composition.max_count });
    assert.deepEqual(context.potential_occupied_slots, composition.payload.placement_policy.position_slot_order);
    assert.deepEqual(context.reserved_for_entering_player,
      composition.payload.placement_policy.reserved_position_slots);
    assert.equal(context.occupancy_status, 'not_fixed_by_composition; read exact committed placements');
    return g4Id;
  }));
  assert.equal(new Set(expectedContexts).size, 32);
  assert.ok(candidate.generated_capacity_boundaries.g4_contexts.every((row) =>
    row.if_committed_occupancy_is_missing === 'typed_data_gap'));
});
