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
    const resolved = resolveProceduralFunctionalAllocations({
      policy: candidate.policies[0],
      actors: [{ actor_instance_id: 'actor:unseen-987', actor_kind: 'npc', presence_state: 'present_committed_scene',
        occupation_ref: 'nov_occ_fisher', role_ref: 'nov_role_fisher',
        activity_profile_refs: ['activity_assist_fishing_net_v1'] }],
      persistedPositions: [{ actor_instance_id: 'actor:unseen-987',
        function_layer: 'work_zone', state: 'committed',
        position_id: 'position:persisted-1' }],
      inventoryState: { mass_grams: 0, capacity_grams: 6000,
        external_hand_cost: 0, external_hand_capacity: 2 }
    });
    assert.deepEqual(resolved.allocations.map(({ layer }) => layer),
      ['tool', 'work_material']);
    assert.ok(resolved.allocations.every((row) => row.owner_id === 'actor:unseen-987'
      && row.holder_id === row.owner_id && row.controller_id === row.owner_id
      && row.work_zone_position_id === 'position:persisted-1'));
  });

test('missing matching committed actor remains a typed gap', async () => {
  const { candidate } = await generateProceduralFunctionalAllocations(root);
  assert.throws(() => resolveProceduralFunctionalAllocations({
    policy: candidate.policies[0], actors: [{ actor_instance_id: 'actor:other',
      actor_kind: 'npc', presence_state: 'present_committed_scene', occupation_ref: 'nov_occ_boatman',
      role_ref: 'nov_role_boatman', activity_profile_refs: [] }],
    persistedPositions: []
  }), { code: 'FUNCTIONAL_ACTOR_SOURCE_BASIS_MISSING' });
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
    const actor = (id) => ({ actor_instance_id: id, actor_kind: 'npc',
      presence_state: 'present_committed_scene', occupation_ref: 'nov_occ_fisher',
      role_ref: 'nov_role_fisher',
      activity_profile_refs: ['activity_assist_fishing_net_v1'] });
    const positions = ['actor:a', 'actor:z'].map((id) => ({
      actor_instance_id: id, function_layer: 'work_zone', state: 'committed',
      position_id: `position:${id}` }));
    const resolve = (actors) => resolveProceduralFunctionalAllocations({
      policy: candidate.policies[0], actors, persistedPositions: positions,
      inventoryState: { mass_grams: 0, capacity_grams: 6000,
        external_hand_cost: 0, external_hand_capacity: 2 } });
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
  const actor = [{ actor_instance_id: 'actor:f', actor_kind: 'player',
    presence_state: 'present_committed_scene', occupation_ref: 'nov_occ_fisher',
    role_ref: 'nov_role_fisher',
    activity_profile_refs: ['activity_assist_fishing_net_v1'] }];
  const persistedPositions = [{ actor_instance_id: 'actor:f',
    function_layer: 'work_zone', state: 'committed', position_id: 'position:f' }];
  const mechanics = { mass_grams: 0, capacity_grams: 6000,
    external_hand_cost: 0, external_hand_capacity: 2 };
  const tool = policy.allocations[0];
  const reused = resolveProceduralFunctionalAllocations({ policy, actors: actor,
    persistedPositions, inventoryState: mechanics, existingItems: [{
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
    actors: actor, persistedPositions, inventoryState: mechanics, existingItems: [
      { item_instance_id: 'duplicate', actor_instance_id: 'actor:f',
        item_template_ref: tool.item_template_ref },
      { item_instance_id: 'duplicate', actor_instance_id: 'actor:f',
        item_template_ref: policy.allocations[1].item_template_ref }] }),
  { code: 'FUNCTIONAL_CROSS_LAYER_REUSE_INVALID' });
  assert.throws(() => resolveProceduralFunctionalAllocations({ policy,
    actors: actor, persistedPositions,
    inventoryState: { mass_grams: 0, capacity_grams: 1,
      external_hand_cost: 0, external_hand_capacity: 0 } }),
  { code: 'FUNCTIONAL_MECHANICS_OVERFLOW' });
});
// End of functional allocation authoring probes.
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
  }), { code: 'FUNCTIONAL_PROPERTY_BASIS_INVALID' });
});

