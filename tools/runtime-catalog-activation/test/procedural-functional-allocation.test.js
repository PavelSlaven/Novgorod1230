import assert from 'node:assert/strict';
import test from 'node:test';
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
      mechanics: { carry_mass_available_grams: 6000, hands_available: 2 }
    });
    assert.deepEqual(resolved.map(({ layer }) => layer),
      ['tool', 'work_material']);
    assert.ok(resolved.every((row) => row.owner_id === 'actor:unseen-987'
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
      mechanics: { carry_mass_available_grams: 6000, hands_available: 2 } });
    assert.equal(resolve([actor('actor:z'), actor('actor:a')])[0].actor_instance_id,
      'actor:a');
    assert.equal(resolve([actor('actor:a'), actor('actor:z')])[0].actor_instance_id,
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
  const mechanics = { carry_mass_available_grams: 6000, hands_available: 2 };
  const tool = policy.allocations[0];
  const reused = resolveProceduralFunctionalAllocations({ policy, actors: actor,
    persistedPositions, mechanics, existingItems: [{ item_instance_id: 'item:net',
      actor_instance_id: 'actor:f', item_template_ref: tool.item_template_ref }] });
  assert.equal(reused[0].disposition, 'reuse');
  assert.throws(() => resolveProceduralFunctionalAllocations({ policy,
    actors: actor, persistedPositions, mechanics, existingItems: [
      { item_instance_id: 'duplicate', actor_instance_id: 'actor:f',
        item_template_ref: tool.item_template_ref },
      { item_instance_id: 'duplicate', actor_instance_id: 'actor:f',
        item_template_ref: policy.allocations[1].item_template_ref }] }),
  { code: 'FUNCTIONAL_CROSS_LAYER_REUSE_INVALID' });
  assert.throws(() => resolveProceduralFunctionalAllocations({ policy,
    actors: actor, persistedPositions,
    mechanics: { carry_mass_available_grams: 1, hands_available: 0 } }),
  { code: 'FUNCTIONAL_MECHANICS_OVERFLOW' });
});

test('missing personal property row blocks authoring generation', async () => {
  const path = 'data/knowledge-source/imports/item-container-120-v5/candidate/tables/property_profiles.json';
  const rows = JSON.parse(await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL(`../../../${path}`, import.meta.url), 'utf8')));
  await assert.rejects(() => generateProceduralFunctionalAllocations(root, {
    [path]: rows.filter(({ id }) => id !== 'property_personal_possession_v1')
  }), { code: 'FUNCTIONAL_PROPERTY_BASIS_INVALID' });
});
