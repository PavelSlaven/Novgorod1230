import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  generateProceduralFunctionalAllocations,
  resolveProceduralFunctionalAllocations
} from '../../../scripts/generate-procedural-functional-allocations.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u,
  '$1');

test('allocation authoring is deterministic, bounded and non-runtime',
  async () => {
    const first = await generateProceduralFunctionalAllocations(root);
    const second = await generateProceduralFunctionalAllocations(root);
    assert.deepEqual(first, second);
    assert.equal(first.candidate.import_authorized, false);
    assert.equal(first.candidate.runtime_authorized, false);
    assert.deepEqual(first.candidate.unaffected_families,
      ['novgorod_drying_storage_workspace_v3@1',
        'novgorod_natural_shore_v3@1']);
    assert.ok(first.candidate.policies[0].allocations.every((row) =>
      row.item_template_ref && row.profile_ref && row.profile_entry_ref
        && row.quantity_profile_ref && row.inventory_profile_ref));
    assert.equal(first.candidate.policies[0].property_basis.profile.status,
      'approved');
    assert.equal(first.candidate.policies[0].allocations.find(
      ({ layer }) => layer === 'work_material').mass_grams, 200);
  });

test('unseen equivalent fisher identity resolves without identity branch',
  async () => {
    const { candidate } = await generateProceduralFunctionalAllocations(root);
    const scenePackage = scene(candidate.policies[0]);
    const resolved = resolveProceduralFunctionalAllocations({
      policy: candidate.policies[0],
      actors: [{ actor_instance_id: 'actor:unseen-987', actor_kind: 'npc', presence_state: 'present_committed_scene',
        occupation_ref: 'nov_occ_fisher', role_ref: 'nov_role_fisher',
        activity_profile_refs: ['activity_assist_fishing_net_v1'],
        scene_package_id: scenePackage.scene_package_id,
        scene_package_digest: scenePackage.scene_package_digest }],
      persistedPositions: [{ actor_instance_id: 'actor:unseen-987',
        function_layer: 'work_zone', state: 'committed',
        position_id: 'position:persisted-1', ...scenePackage }], scenePackage
    });
    assert.deepEqual(resolved.allocations.map(({ layer }) => layer),
      ['tool', 'work_material']);
    assert.equal(resolved.readiness,
      'pending_runtime_inventory_owner_validation');
    assert.ok(resolved.validation_owner.functions.includes('resolveInventoryLoad'));
    assert.ok(resolved.allocations.every((row) => row.owner_id === 'actor:unseen-987'
      && row.holder_id === row.owner_id && row.controller_id === row.owner_id
      && row.work_zone_position_id === 'position:persisted-1'));
  });

test('missing matching committed actor remains a typed gap', async () => {
  const { candidate } = await generateProceduralFunctionalAllocations(root);
  const scenePackage = scene(candidate.policies[0]);
  assert.throws(() => resolveProceduralFunctionalAllocations({
    policy: candidate.policies[0], actors: [{ actor_instance_id: 'actor:other',
      actor_kind: 'npc', presence_state: 'present_committed_scene', occupation_ref: 'nov_occ_boatman',
      role_ref: 'nov_role_boatman', activity_profile_refs: [],
      scene_package_id: scenePackage.scene_package_id,
      scene_package_digest: scenePackage.scene_package_digest }],
    persistedPositions: [], scenePackage
  }), { code: 'FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING' });
});

test('wrong scene package or actor kind is rejected', async () => {
  const { candidate } = await generateProceduralFunctionalAllocations(root);
  const policy = candidate.policies[0];
  const scenePackage = scene(policy);
  const actor = { actor_instance_id: 'actor:x', actor_kind: 'animal',
    presence_state: 'present_committed_scene', occupation_ref: 'nov_occ_fisher',
    role_ref: 'nov_role_fisher',
    activity_profile_refs: ['activity_assist_fishing_net_v1'],
    scene_package_id: scenePackage.scene_package_id,
    scene_package_digest: scenePackage.scene_package_digest };
  assert.throws(() => resolveProceduralFunctionalAllocations({ policy,
    actors: [actor], persistedPositions: [], scenePackage }),
  { code: 'FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING' });
  assert.throws(() => resolveProceduralFunctionalAllocations({ policy,
    actors: [{ ...actor, actor_kind: 'npc' }], persistedPositions: [],
    scenePackage: { ...scenePackage, scene_package_digest: 'b'.repeat(64) } }),
  { code: 'FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING' });
});
test('allocation production code has no scene or NPC identity branches', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(
    new URL('../../../scripts/generate-procedural-functional-allocations.mjs',
      import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /Vikhtuy|Вихтуй|reed|branch|specific_npc/u);
});
test('selection is input-order independent and rejects duplicate actor ids',
  async () => {
    const { candidate } = await generateProceduralFunctionalAllocations(root);
    const scenePackage = scene(candidate.policies[0]);
    const actor = (id) => ({ actor_instance_id: id, actor_kind: 'npc',
      presence_state: 'present_committed_scene', occupation_ref: 'nov_occ_fisher',
      role_ref: 'nov_role_fisher',
      activity_profile_refs: ['activity_assist_fishing_net_v1'],
      scene_package_id: scenePackage.scene_package_id,
      scene_package_digest: scenePackage.scene_package_digest });
    const positions = ['actor:a', 'actor:z'].map((id) => ({
      actor_instance_id: id, function_layer: 'work_zone', state: 'committed',
      position_id: `position:${id}`, ...scenePackage }));
    const resolve = (actors) => resolveProceduralFunctionalAllocations({
      policy: candidate.policies[0], actors, persistedPositions: positions,
      scenePackage });
    assert.equal(resolve([actor('actor:z'), actor('actor:a')]).actor_instance_id,
      'actor:a');
    assert.equal(resolve([actor('actor:a'), actor('actor:z')]).actor_instance_id,
      'actor:a');
    assert.throws(() => resolve([actor('actor:a'), actor('actor:a')]),
      { code: 'FUNCTIONAL_ACTOR_ID_AMBIGUOUS' });
  });

test('reuse, duplicate item and mechanics guards are fail-closed', async () => {
  const { candidate } = await generateProceduralFunctionalAllocations(root);
  const policy = candidate.policies[0];
  const scenePackage = scene(policy);
  const actor = [{ actor_instance_id: 'actor:f', actor_kind: 'player_character',
    presence_state: 'present_committed_scene', occupation_ref: 'nov_occ_fisher',
    role_ref: 'nov_role_fisher',
    activity_profile_refs: ['activity_assist_fishing_net_v1'],
    scene_package_id: scenePackage.scene_package_id,
    scene_package_digest: scenePackage.scene_package_digest }];
  const persistedPositions = [{ actor_instance_id: 'actor:f',
    function_layer: 'work_zone', state: 'committed', position_id: 'position:f',
    ...scenePackage }];
  const tool = policy.allocations[0];
  const reused = resolveProceduralFunctionalAllocations({ policy, actors: actor,
    persistedPositions, scenePackage, existingItems: [{
      item_instance_id: 'item:net', actor_instance_id: 'actor:f',
      item_template_ref: tool.item_template_ref, state: 'committed',
      owner_id: 'actor:f', holder_id: 'actor:f', controller_id: 'actor:f',
      physical_position: 'hands', quantity: 1,
      inventory_profile_ref: tool.inventory_profile_ref,
      quantity_profile_ref: tool.quantity_profile_ref,
      profile_entry_ref: tool.profile_entry_ref,
      source_binding_refs_digest: createHash('sha256')
        .update(JSON.stringify(tool.source_binding_refs)).digest('hex') }] });
  assert.equal(reused.allocations[0].disposition, 'reuse');
  assert.throws(() => resolveProceduralFunctionalAllocations({ policy,
    actors: actor, persistedPositions, scenePackage, existingItems: [
      { item_instance_id: 'duplicate', actor_instance_id: 'actor:f',
        item_template_ref: tool.item_template_ref },
      { item_instance_id: 'duplicate', actor_instance_id: 'actor:f',
        item_template_ref: policy.allocations[1].item_template_ref }] }),
  { code: 'FUNCTIONAL_CROSS_LAYER_REUSE_INVALID' });
  assert.throws(() => resolveProceduralFunctionalAllocations({ policy,
    actors: actor, persistedPositions, scenePackage,
    inventorySummary: { mass_grams: 0, capacity_grams: 1 } }),
  { code: 'FUNCTIONAL_CALLER_MECHANICS_SUMMARY_FORBIDDEN' });
});
// End of functional allocation authoring probes.

function scene(policy) {
  return { scene_package_id: 'scene-package:1',
    scene_package_digest: 'a'.repeat(64),
    family_candidate_ref: policy.scene_binding.family_candidate_ref,
    function_ref: policy.scene_binding.function_ref,
    work_zone_mapping_id: policy.scene_binding.work_zone_mapping_id,
    work_zone_mapping_digest: policy.scene_binding.work_zone_mapping_digest };
}
test('missing personal property row blocks authoring generation', async () => {
  const path = 'data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v1/candidate.json';
  const pack = JSON.parse(await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL(`../../../${path}`, import.meta.url), 'utf8')));
  pack.record_operations_by_table.find(({ table_name: table }) =>
    table === 'property_profiles').records = pack.record_operations_by_table
    .find(({ table_name: table }) => table === 'property_profiles').records
    .filter(({ canonical_payload: payload }) =>
      payload.canonical_fields.id !== 'property_personal_possession_v1');
  await assert.rejects(() => generateProceduralFunctionalAllocations(root, {
    [path]: pack
  }), (error) => ['FINAL_PACK_DIGEST_MISMATCH',
    'FUNCTIONAL_PROPERTY_BASIS_INVALID'].includes(error.code));
});

test('stale digest owner-kind tamper is rejected', async () => {
  const path = 'data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v1/candidate.json';
  const pack = JSON.parse(await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL(`../../../${path}`, import.meta.url), 'utf8')));
  const record = pack.record_operations_by_table.find(
    ({ table_name: table }) => table === 'property_profile_rules').records.find(
    ({ canonical_payload: payload }) => payload.canonical_fields.id ===
      'rule_property_personal_possession_v1');
  record.canonical_payload.canonical_fields.owner_kind = 'household';
  await assert.rejects(() => generateProceduralFunctionalAllocations(root, {
    [path]: pack
  }), { code: 'FINAL_PACK_DIGEST_MISMATCH' });
});

