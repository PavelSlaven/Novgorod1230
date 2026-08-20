import assert from 'node:assert/strict';
import test from 'node:test';
import { deepFreeze } from '@rus/kernel';
import { createActionProducedTransitionPlanner } from
  '@rus/items-property/action-produced-transition';

test('written transition preserves carrier and only adds physical inscription',
  () => {
    const ownership = ownershipFor('item:bark');
    const pin = pinFor('item:bark');
    const toolPin = pinFor('item:charcoal');
    const handoff = deepFreeze({
      schema: 'rus.items.action_produced_pending_handoff.v1',
      status: 'pending_code_owned_mechanics', request_id: 'request:a1',
      root_turn_id: 'turn:a1', action_ref: 'action:a1', step_index: 1,
      profile_ref: 'profile:a1', profile_version: '1',
      context_ref: 'context:a1', context_state_version: '7',
      actor_ref: 'actor:mikula', identity_mode: 'preserve_source',
      origin: null, result_class: 'written_carrier', source_pins: [pin],
      tool_pins: [toolPin], qualitative_result: {
        intended_transformation: 'write on carrier', material_extent: null,
        result_descriptor: {
          display_name: 'written carrier',
          physical_description: 'carrier has physical writing',
          qualitative_facts: ['physically inscribed'],
          inscription_text: 'Я князь.', physical_form: null,
          source_fact_delta: null },
        output_class: 'written_carrier' }
    });
    const planner = createActionProducedTransitionPlanner({
      resolveMechanics: () => ({
        schema: 'rus.items.action_produced_owner_resolution.v1',
        identity_mode: 'preserve_source', source_effects: [{
          source_ref: 'item:bark', requested_decrement: null,
          mechanics_snapshot_after: mechanicsSnapshot()
        }], outputs: [], known_waste: []
      })
    });
    const proposal = planner({ handoff,
      source_snapshots: [snapshotFor('item:bark', 'source', ownership)],
      tool_snapshots: [snapshotFor('item:charcoal', 'tool',
        ownershipFor('item:charcoal'))],
      committed_entity_refs: ['item:bark', 'item:charcoal'],
      technical_policy: {
        schema: 'rus.items.action_produced_technical_policy.v1', version: 1,
        status: 'committed', policy_ref: 'policy:a1',
        profile_ref: 'profile:a1', profile_version: '1', max_new_entities: 4
      }, output_destination: null
    });

    assert.equal(proposal.results[0].entity_ref, 'item:bark');
    assert.equal(proposal.results[0].inscription_text, 'Я князь.');
    assert.deepEqual(proposal.results[0].output_authority, {
      schema: 'rus.items.action_produced_output_authority.v1',
      mode: 'preserve_existing'
    });
    assert.equal('objective_truth' in proposal.results[0], false);
    assert.equal('knowledge' in proposal.results[0], false);
  });

function pinFor(entityRef) {
  return { entity_ref: entityRef, state_version: '7',
    access_state: 'immediate', holder_ref: 'actor:mikula',
    controller_ref: 'actor:mikula' };
}
function snapshotFor(entityRef, role, ownership) {
  return { schema: 'rus.items.action_produced_committed_entity_snapshot.v1',
    commit_state: 'committed', role, entity_ref: entityRef,
    state_version: '7', lifecycle_state: 'active', access_state: 'immediate',
    holder_ref: 'actor:mikula', controller_ref: 'actor:mikula',
    ownership_snapshot: ownership,
    finite_resource: null };
}
function ownershipFor(entityRef) {
  return { ownership_id: `ownership:${entityRef}`, owner_npc_id: null,
    owner_character_id: 'actor:mikula', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor:mikula',
    claim_state: 'owned' };
}
function mechanicsSnapshot() {
  return { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: {
      source_kind: 'ordinary_direct_action_result', root_turn_id: 'turn:a1',
      step_index: 1, operation_ref: 'action:a1', origin_kind: 'crafted',
      source_refs: ['item:bark'] }, mechanics: { mass_grams: 20,
      external_hand_cost: 1, carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'item' }, container: null } };
}
