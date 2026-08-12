import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTraceCombatPositionTransition } from
  '../src/runtime/lower-dvina-trace-combat-position-owner.js';
import { executeTraceCombatTraversal } from
  '../src/runtime/lower-dvina-trace-combat-traversal-adapter.js';
import { appendCombatTraversalWrites } from
  '../src/infrastructure/postgres/lower-dvina-trace-combat-writes.js';
import { buildTracePhase4CombatMovementBindings } from
  '../src/runtime/lower-dvina-trace-combat-movement-contracts.js';

const actorRef = { entity_kind: 'npc', entity_id: 'ratsha-1' };
const destinationRef = { entity_kind: 'location_anchor',
  entity_id: 'camp-anchor' };
const at = { whole_minutes: '100', subminute_numerator: '0',
  subminute_denominator: '1' };

test('route combat movement consumes a completed traversal-owner result', () => {
  const working = state();
  const bindings = movementBindings();
  const input = { step: { proposal_id: 'step-break-contact' }, intent: {
    actor_ref: actorRef, intent_kind: 'break_contact',
    destination_ref: destinationRef }, check_result: null,
  working_state: working, temporal_slice: { exact_duration: {
    exact_minutes: { numerator: '12', denominator: '1' } },
  step_duration: { exact_minutes: { numerator: '12', denominator: '1' } },
  completion_due: true, clock_commit_mode: 'shared_root_transport_clock',
  synchronized_time_slice_result_id: 'combat-slice:step-break-contact' } };
  const result = applyTraceCombatPositionTransition(input, {
    session: { combat_id: 'combat-1' }, movementBindings: bindings,
    executeTraversal: (request) => executeTraceCombatTraversal(request, {
      state: working, session: { combat_id: 'combat-1' },
      movementBindings: bindings,
      playerInput: { request_id: 'request-1', idempotency_key: 'idem-1' },
      inputDigest: 'a'.repeat(64) })
  });
  assert.equal(result.movement_result.execution_mode,
    'requires_traversal_runtime_completion');
  assert.equal(result.movement_result.traversal.interval_result.result_kind,
    'segment_completed');
  assert.deepEqual(result.movement_result.traversal.inventory_load, {
    total_mass_grams: 350, hands_used: 1, load_category: null });
  assert.equal(result.working_state.npcs[0].location_profile_ref, 'camp');
  assert.equal(result.participant_status_updates[0].combat_status, 'left');
  assert.equal(result.signal_descriptors[0].source_event_ref.entity_id,
    result.outcome_events[0].event_id);
  assert.equal(result.outcome_events[0].traversal_execution_ref.entity_id,
    result.movement_result.traversal.ids.execution_id);
  assert.equal(result.outcome_events[0].traversal_interval_ref.entity_id,
    result.movement_result.traversal.ids.interval_id);
  const inserts = [], updates = [], appends = [];
  appendCombatTraversalWrites({ inserts, updates, appends,
    partyId: 'party-1', state: working, turnNumber: 2,
    changeSetId: 'change:party-1:combat:2', idemId: 'idem:party-1:1',
    factual: { player_input: { request_id: 'request-1' }, consequence: {
      combat: { position_transitions: [result] } } } });
  assert.deepEqual(inserts.map(({ target_table: table }) => table), [
    'party_route_plans', 'party_route_plan_steps',
    'party_route_plan_executions', 'traveller_travel_states'
  ]);
  assert.equal(appends.some(({ target_table: table }) =>
    table === 'party_traversal_interval_results'), true);
  assert.deepEqual(appends.find(({ target_table: table }) =>
    table === 'party_traversal_interval_results').record
    .dynamic_snapshot.inventory_load,
  { total_mass_grams: 350, hands_used: 1, load_category: null });
});

test('route combat movement pauses at the parent temporal boundary and resumes',
  () => {
    const bindings = movementBindings();
    const intent = { actor_ref: actorRef, intent_id: 'intent-escape',
      intent_kind: 'break_contact', destination_ref: destinationRef };
    const apply = (working, minutes, completionDue, stepId,
      continuationAllowed = true) =>
      applyTraceCombatPositionTransition({ step: { proposal_id: stepId },
        intent, check_result: null, working_state: working,
        temporal_slice: { exact_duration: { exact_minutes: {
          numerator: String(minutes), denominator: '1' } },
        step_duration: { exact_minutes: { numerator: String(minutes),
          denominator: '1' } }, completion_due: completionDue,
        continuation_allowed: continuationAllowed,
        clock_commit_mode: 'shared_root_transport_clock',
        synchronized_time_slice_result_id: `combat-slice:${stepId}` } }, {
        session: { combat_id: 'combat-1' }, movementBindings: bindings,
        executeTraversal: (request) => executeTraceCombatTraversal(request, {
          state: working, session: { combat_id: 'combat-1' },
          movementBindings: bindings,
          playerInput: { request_id: `request-${stepId}`,
            idempotency_key: `idem-${stepId}` },
          inputDigest: stepId.padEnd(64, 'a').slice(0, 64) })
      });
    const initial = state();
    const first = apply(initial, 2, false, 'step-route-0');
    assert.equal(first.movement_result.traversal.interval_result.result_kind,
      'paused_in_transit');
    assert.equal(first.movement_result.traversal.interval_result
      .clock_commit_mode, 'shared_root_transport_clock');
    assert.equal(first.movement_result.traversal.clock_update, null);
    assert.equal(first.working_state.npcs[0].location_profile_ref, 'shed');
    assert.equal(first.working_state.active_combat_traversals.length, 1);
    assert.deepEqual(first.participant_status_updates, []);
    assert.deepEqual(first.signal_descriptors, []);
    const firstWrites = { inserts: [], updates: [], appends: [] };
    appendCombatTraversalWrites({ ...firstWrites, partyId: 'party-1',
      state: initial, turnNumber: 2, changeSetId: 'change:partial:1',
      idemId: 'idem:partial:1', factual: {
        player_input: { request_id: 'request-partial-1' }, consequence: {
          combat: { position_transitions: [first] } } } });
    assert.equal(firstWrites.inserts.find(({ target_table: table }) =>
      table === 'party_route_plan_executions').record.status, 'active');
    assert.equal(firstWrites.appends.find(({ target_table: table }) =>
      table === 'party_traversal_interval_results').record.clock_commit_mode,
    'shared_root_transport_clock');
    const second = apply(first.working_state, 10, true, 'step-route-1');
    assert.equal(second.movement_result.traversal.interval_result.result_kind,
      'segment_completed');
    assert.equal(second.movement_result.traversal.interval_result
      .interval_ordinal, 1);
    assert.equal(second.working_state.npcs[0].location_profile_ref, 'camp');
    assert.deepEqual(second.working_state.active_combat_traversals, []);
    assert.equal(second.participant_status_updates[0].combat_status, 'left');
    const secondWrites = { inserts: [], updates: [], appends: [] };
    appendCombatTraversalWrites({ ...secondWrites, partyId: 'party-1',
      state: first.working_state, turnNumber: 3,
      changeSetId: 'change:partial:2', idemId: 'idem:partial:2', factual: {
        player_input: { request_id: 'request-partial-2' }, consequence: {
          combat: { position_transitions: [second] } } } });
    assert.equal(secondWrites.inserts.some(({ target_table: table }) =>
      table === 'party_route_plans'), false);
    assert.equal(secondWrites.updates.find(({ target_table: table }) =>
      table === 'party_route_plan_executions').record.status, 'completed');
    assert.equal(secondWrites.appends.find(({ target_table: table }) =>
      table === 'party_traversal_interval_results').record.interval_ordinal, 1);

    const interrupted = apply(initial, 2, false, 'step-route-stranded', false);
    assert.equal(interrupted.movement_result.traversal.interval_result
      .result_kind, 'stranded');
    assert.equal(interrupted.working_state.active_combat_traversals.length, 0);
    assert.equal(interrupted.working_state.npcs[0].location_profile_ref,
      'shed');
    assert.equal(interrupted.outcome_events[0].event_kind,
      'combat_position_transition_interrupted');
    const interruptedWrites = { inserts: [], updates: [], appends: [] };
    appendCombatTraversalWrites({ ...interruptedWrites, partyId: 'party-1',
      state: initial, turnNumber: 2, changeSetId: 'change:stranded:1',
      idemId: 'idem:stranded:1', factual: {
        player_input: { request_id: 'request-stranded' }, consequence: {
          combat: { position_transitions: [interrupted] } } } });
    assert.equal(interruptedWrites.inserts.find(({ target_table: table }) =>
      table === 'party_route_plan_executions').record.status,
    'stranded_in_transit');
    assert.equal(interruptedWrites.inserts.find(({ target_table: table }) =>
      table === 'traveller_travel_states').record.status,
    'stranded_in_transit');
  });

test('route combat movement cannot fall back to a direct position write', () => {
  assert.throws(() => applyTraceCombatPositionTransition({
    step: { proposal_id: 'step-break-contact' }, intent: {
      actor_ref: actorRef, intent_kind: 'break_contact',
      destination_ref: destinationRef }, check_result: null,
    working_state: state() }, { session: { combat_id: 'combat-1' },
    movementBindings: movementBindings() }), {
    code: 'TRACE_COMBAT_TRAVERSAL_OWNER_REQUIRED'
  });
});

test('Phase 4 route binding requires the exact approved NPC escape execution',
  () => {
    const common = { route: movementBindings().route_bindings[0],
      reverseRoute: movementBindings().route_bindings[1],
      executionVersion: 4, sourceEndpoint: {}, destinationEndpoint: {},
      access: {}, capacity: {}, campLocationRef: 'camp',
      campAnchorId: 'camp-anchor', ratshaActorId: 'ratsha-1' };
    const exactExecution = { execution_binding_id:
      'trace_ld_v1_decision_execution_ratsha_continue_escape',
    execution_kind: 'post_player_boundary_route_attempt',
    movement_refs: ['shed-to-camp'], time_contract: { roots: [{
      root_ref: 'shed-to-camp' }] } };
    const result = buildTracePhase4CombatMovementBindings({ ...common,
      escapeExecution: exactExecution });
    assert.deepEqual(result.route_execution_bindings[0].execution_profile, {
      entity_kind: 'npc_decision_execution_binding',
      entity_id: exactExecution.execution_binding_id, version: 4 });
    assert.throws(() => buildTracePhase4CombatMovementBindings({ ...common,
      escapeExecution: { ...exactExecution,
        movement_refs: ['camp-to-shed'] } }), {
      code: 'TRACE_PHASE_4_ESCAPE_EXECUTION_GAP'
    });
  });

function state() {
  return { party_id: 'party-1', clock: structuredClone(at),
    party_state: { state_version: 2, turn_number: 1 },
    world_identity: { world_revision_id: 'world-1',
      world_catalog_digest: 'a'.repeat(64) },
    position: { location_ref: 'shed', g5_anchor_id: 'shed-anchor' },
    npcs: [{ instance_id: 'ratsha-1',
      participant_slot_ref: 'ratsha_storehouse_helper',
      anchor_id: 'shed-anchor', location_profile_ref: 'shed',
      zone_ref: 'shed-approach', machine_state: { location_ref: 'shed',
        spatial_zone_ref: 'shed-approach' } }],
    items: [{ item_id: 'ratsha-knife', template_id: 'ratsha-knife-template',
      quantity: 1, inventory_profile: { mass_grams: 350,
        external_hand_cost: 1, carry_form: 'compact', packing_slot_cost: 1,
        packing_bundle_size: 1 },
      placement: { holder_npc_id: 'ratsha-1',
        physical_position: 'hands' } }], containers: [],
    container_placements: [], container_profiles: [] };
}

function movementBindings() {
  return { local_transition_bindings: [], local_access_bindings: [],
    actor_destination_bindings: [{ actor_ref: actorRef,
      intent_kind: 'break_contact', destination_ref: destinationRef,
      movement_ref: 'shed-to-camp', destination: {
        entity_ref: destinationRef, location_ref: 'camp',
        zone_ref: 'fire-side', anchor_id: 'camp-anchor' } }],
    route_bindings: [{ schema: 'rus.trace_movement_binding.v1',
      route_id: 'camp-to-shed', reverse_route_ref: 'shed-to-camp',
      duration_minutes: 12, movement_method: 'walk', version: 1,
      knowledge_state: 'known', terminal_position_outcome: 'shed' }, {
      schema: 'rus.trace_movement_binding.v1', route_id: 'shed-to-camp',
      reverse_route_ref: 'camp-to-shed', duration_minutes: 12,
      movement_method: 'walk', version: 1,
      knowledge_state: 'known_after_forward_traversal',
      terminal_position_outcome: 'camp' }],
    route_execution_bindings: [{ movement_ref: 'shed-to-camp',
      route: { schema: 'rus.trace_movement_binding.v1',
        route_id: 'shed-to-camp', reverse_route_ref: 'camp-to-shed',
        duration_minutes: 12, movement_method: 'walk', version: 1,
        knowledge_state: 'known_after_forward_traversal',
        terminal_position_outcome: 'camp' }, execution_profile: {
        entity_kind: 'npc_decision_execution_binding',
        entity_id: 'ratsha-escape', version: 4 },
      source_endpoint: { endpoint_id: 'shed-endpoint' },
      destination_endpoint: { endpoint_id: 'camp-endpoint' },
      destination_location_ref: 'camp', destination_anchor_id: 'camp-anchor',
      access_policy: { policy_id: 'shed-access' },
      capacity_contract: { contract_id: 'shed-capacity' } }] };
}
