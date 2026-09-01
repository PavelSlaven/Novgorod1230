import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTracePhase1BPublication } from
  '../src/internal/lower-dvina-trace-phase-1b-publication.js';
import { resolveTracePhase6Contracts } from
  '../src/runtime/lower-dvina-trace-phase-6-contracts.js';
import { buildLowerDvinaTracePhase5InitialBandage } from
  '../../../packages/materialization/src/lower-dvina-trace-phase-5-initial-item.js';
import { materializeLowerDvinaTracePreparedDryingShed } from
  '../../../packages/materialization/src/lower-dvina-trace-phase-3.js';

test('revision 29 carries exact Phase 6 effects forward without altering revisions 27/28', async () => {
  const [revision27, revision28, revision29] = await Promise.all([27, 28, 29]
    .map((scenarioDefinitionRevision) => loadLowerDvinaTraceMaterializationBundle({
      scenarioDefinitionRevision
    })));
  for (const bundle of [revision27, revision28]) {
    assert.equal(bundle.body_environment_profiles.revision, 7);
    assert.throws(() => resolveTracePhase6Contracts({ bundle }),
      { code: 'TRACE_PHASE_6_RECORD_GAP' });
  }
  const contracts = resolveTracePhase6Contracts({ bundle: revision29 });
  assert.equal(revision29.body_environment_profiles.revision, 8);
  assert.deepEqual(contracts.bodyEffects.map(({ effect_profile_id }) => effect_profile_id), [
    'trace_ld_v1_body_carry_carrier_20m',
    'trace_ld_v1_body_carry_carrier_10m',
    'trace_ld_v1_body_carry_carried_actor_stabilized_20m',
    'trace_ld_v1_body_carry_carried_actor_unstabilized_20m'
  ]);
});

test('revision 29 is selected only for a new active party', async () => {
  const [historical27, historical28, active29] = await Promise.all([27, 28, 29]
    .map((scenarioDefinitionRevision) => loadLowerDvinaTracePhase1BPublication({
      scenarioDefinitionRevision
    })));
  assert.equal(historical27.definition.revision, 27);
  assert.equal(historical28.definition.revision, 28);
  assert.equal(active29.binding.revision, 24);
  assert.equal(active29.definition.revision, 29);
});

test('revision 29 materializes its inherited exact Phase 5 bandage', async () => {
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 29
  });
  const bandage = buildLowerDvinaTracePhase5InitialBandage({
    input: { party_id: 'revision-29-bandage', scenario_definition_revision: 29 },
    bundle,
    runId: 'run-29',
    phase3Prepared: { npcs: [{ participant_slot_ref: 'eremey_fisher',
      instance_id: 'eremey-29' }] },
    requiredById: (records, key, value) => records.find((record) =>
      record[key] === value),
    fail: (code) => { throw Object.assign(new Error(code), { code }); }
  });
  assert.equal(bandage.template_id, 'trace_ld_v1_item_bandage_cloth');
  assert.equal(bandage.holder_npc_id, 'eremey-29');
});

test('revision 29 carries the inherited exact rope proof into the drying shed', async () => {
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 29
  });
  const location = bundle.location_topology_set.location_profiles.find((profile) =>
    profile.location_profile_id === 'trace_ld_v1_loc_old_drying_shed');
  const participantSelections = [
    ['onisim_boatman', 'trace_ld_v1_onisim_hired_boatman_v1'],
    ['ratsha_storehouse_helper', 'trace_ld_v1_ratsha_storehouse_helper_v1']
  ].map(([slot_key, profile_id]) => ({
    slot_key,
    materialization_rule: 'key',
    selected_profile: { profile_id, revision: 2 }
  }));
  const prepared = materializeLowerDvinaTracePreparedDryingShed({
    input: { party_id: 'revision-29-rope', scenario_definition_revision: 29 },
    bundle,
    runId: 'run-29',
    participantSelections,
    locationSelections: [{
      slot_key: location.location_profile_id,
      location,
      selected: location.spatial_candidate_set.candidates[0]
    }]
  });
  const rope = prepared.onisim.machine_state.binding_item;
  assert.equal(rope.template_id, 'trace_ld_v1_item_ratsha_binding_rope');
  assert.equal(rope.profile_id,
    'trace_ld_v1_inventory_profile_ratsha_binding_rope');
  assert.equal(rope.inventory_profile_snapshot.inventory_profile_id, rope.profile_id);
  assert.ok(rope.reserved_instance_id);
});
