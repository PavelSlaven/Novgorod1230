import assert from 'node:assert/strict';
import test from 'node:test';
import { planApprovedActorDestinationTransition } from '../src/index.js';

const actor = { actor_ref: ref('npc', 'ratsha'),
  location_ref: 'storehouse', zone_ref: 'yard', anchor_id: 'storehouse-anchor' };

test('plans one approved local actor transition to a factual resource', () => {
  const result = planApprovedActorDestinationTransition({
    state_version: 4, expected_state_version: 4, actor,
    destination: { entity_ref: ref('container', 'road-bag'),
      location_ref: 'storehouse', zone_ref: 'river', anchor_id: null },
    local_transition_bindings: [localBinding()], route_bindings: []
  });
  assert.equal(result.pass, true);
  assert.equal(result.proposal.owner, '@rus/movement-routes');
  assert.equal(result.proposal.movement_kind, 'local_zone_transition');
  assert.equal(result.proposal.execution_mode,
    'immediate_position_transition');
  assert.equal(result.proposal.destination.entity_ref.entity_id, 'road-bag');
  assert.equal(result.proposal.exact_elapsed.exact_minutes.numerator, '5');
});

test('plans a pinned local access transition to a canonical resource zone',
  () => {
    const result = planApprovedActorDestinationTransition({
      state_version: 4, expected_state_version: 4,
      actor: { ...actor, participant_slot_ref: 'ratsha_helper' },
      destination: { entity_ref: ref('container', 'road-bag'),
        location_ref: 'storehouse', zone_ref: 'interior', anchor_id: null },
      local_access_bindings: [{
        schema: 'rus.trace_local_access_transition.v1',
        transition_id: 'storehouse-interior-entry',
        location_ref: 'storehouse', source_zone_candidates: ['yard'],
        destination_zone_candidates: ['threshold', 'interior'],
        admitted_actor_slot_refs: ['ratsha_helper'],
        access_policy_ref: 'storehouse-access',
        capacity_contract_ref: 'storehouse-capacity', duration_minutes: 2,
        terminal_outcome: 'same_materialized_location_new_zone'
      }]
    });
    assert.equal(result.pass, true);
    assert.equal(result.proposal.movement_kind, 'local_access_transition');
    assert.equal(result.proposal.destination.zone_ref, 'interior');
  });

test('plans one approved reverse route and fails closed without a route', () => {
  const destination = { entity_ref: ref('location', 'camp'),
    location_ref: 'camp', zone_ref: 'working-camp', anchor_id: 'camp-anchor' };
  const result = planApprovedActorDestinationTransition({
    state_version: 4, expected_state_version: 4, actor, destination,
    local_transition_bindings: [], route_bindings: routePair(),
    known_route_refs: ['camp-to-storehouse']
  });
  assert.equal(result.pass, true);
  assert.equal(result.proposal.movement_kind, 'route_traversal');
  assert.equal(result.proposal.movement_ref, 'storehouse-to-camp');
  assert.equal(result.proposal.execution_mode,
    'requires_traversal_runtime_completion');
  assert.equal(result.proposal.exact_elapsed.exact_minutes.numerator, '12');
  assert.equal(planApprovedActorDestinationTransition({
    state_version: 4, expected_state_version: 4, actor, destination,
    local_transition_bindings: [], route_bindings: []
  }).errors[0].code, 'APPROVED_DESTINATION_TRANSITION_NOT_APPLICABLE');
});

test('fails closed for absent versions and non-admitted movement refs', () => {
  const destination = { entity_ref: ref('container', 'road-bag'),
    location_ref: 'storehouse', zone_ref: 'river', anchor_id: null };
  assert.equal(planApprovedActorDestinationTransition({ actor, destination,
    local_transition_bindings: [localBinding()] }).errors[0].code,
  'STATE_VERSION_MISMATCH');
  assert.equal(planApprovedActorDestinationTransition({ state_version: 4,
    expected_state_version: 4, actor, destination,
    allowed_movement_refs: ['different-transition'],
    local_transition_bindings: [localBinding()] }).errors[0].code,
  'APPROVED_DESTINATION_TRANSITION_NOT_APPLICABLE');
});

function localBinding() { return {
  schema: 'rus.trace_local_zone_transition.v1', transition_id: 'yard-to-river',
  location_ref: 'storehouse', source_zone_candidates: ['yard'],
  destination_zone_ref: 'river', admitted_subject_classes: ['actor'],
  duration_minutes: 5,
  terminal_outcome: 'same_materialized_location_new_zone'
}; }
function routePair() { return [{
  schema: 'rus.trace_movement_binding.v1', route_id: 'camp-to-storehouse',
  reverse_route_ref: 'storehouse-to-camp', duration_minutes: 12,
  knowledge_state: 'closed_until_disclosed',
  terminal_position_outcome: 'storehouse'
}, {
  schema: 'rus.trace_movement_binding.v1', route_id: 'storehouse-to-camp',
  reverse_route_ref: 'camp-to-storehouse', duration_minutes: 12,
  knowledge_state: 'known_after_forward_traversal',
  terminal_position_outcome: 'camp'
}]; }
function ref(entity_kind, entity_id) { return { entity_kind, entity_id }; }
