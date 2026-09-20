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
      actors: [{ actor_id: 'actor:unseen-987', presence_state: 'committed',
        occupation_ref: 'nov_occ_fisher', role_ref: 'nov_role_fisher',
        activity_profile_refs: ['activity_assist_fishing_net_v1'] }],
      persistedPositions: [{ actor_id: 'actor:unseen-987',
        function_layer: 'work_zone', state: 'committed',
        position_id: 'position:persisted-1' }]
    });
    assert.deepEqual(resolved.map(({ layer }) => layer),
      ['tool', 'work_material']);
    assert.ok(resolved.every((row) => row.owner_id === 'actor:unseen-987'
      && row.holder_id === row.owner_id && row.controller_id === row.owner_id
      && row.position_id === 'position:persisted-1'));
  });

test('missing matching committed actor remains a typed gap', async () => {
  const { candidate } = await generateProceduralFunctionalAllocations(root);
  assert.throws(() => resolveProceduralFunctionalAllocations({
    policy: candidate.policies[0], actors: [{ actor_id: 'actor:other',
      presence_state: 'committed', occupation_ref: 'nov_occ_boatman',
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
