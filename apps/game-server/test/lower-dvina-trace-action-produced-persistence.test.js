import assert from 'node:assert/strict';
import test from 'node:test';
import { applyActionProductionProjection } from
  '../src/infrastructure/postgres/lower-dvina-trace-action-production-projection.js';
import { prepareLowerDvinaTraceTurnStepPersistence } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-persistence.js';
import { bindCommitEnvelopeToBatch, commitEnvelope } from
  './lower-dvina-trace-turn-step-envelope-fixture.js';

test('A1 output and changed source accept later operations in one batch', () => {
  const state = baseState();
  const snapshot = structuredClone(state);
  snapshot.party_state.turn_number = 1;
  applyActionProductionProjection({ next: snapshot, plan: actionPlan() });
  const batch = operationBatch();
  const envelope = commitEnvelope({ clarification: false, check: false });
  envelope.loop_trace.step_traces[0].plan_request.player_safe_state
    .visible_entities.push({ entity_ref: 'board' }, { entity_ref: 'wedge' });
  bindCommitEnvelopeToBatch(envelope, batch);
  const result = prepareLowerDvinaTraceTurnStepPersistence({
    partyId: 'p', state, snapshot, factual: null,
    changeSetId: 'change:p:turn-step:1', idemId: 'idem-1',
    writePlan: { turn_id: 'turn:p:1', base_state_version: 3,
      command_trace: envelope.mode_resolution.decision_trace,
      write_targets: [batch], turn_step_commit: envelope }
  });

  assert.deepEqual(result.writes.updates.filter(({ target_table: table }) =>
    table === 'party_items').map(({ id }) => id).sort(), ['board', 'wedge']);
  assert.deepEqual(result.writes.updates.filter(({ target_table: table }) =>
    table === 'party_item_placements').map(({ id }) => id).sort(),
  ['board', 'wedge']);
  for (const itemId of ['board', 'wedge']) {
    const item = result.snapshot.items.find(({ item_id: id }) => id === itemId);
    assert.equal(item.placement.holder_character_id, 'actor-1');
    assert.equal(item.state.ordinary_metadata.operation_history.at(-1).result,
      'moved');
  }
});

test('A1 untouched source snapshot stays identical to its atomic row', () => {
  const state = baseState();
  const snapshot = structuredClone(state);
  snapshot.party_state.turn_number = 1;
  const plan = actionPlan();
  plan.source_updates[0].after_item.state.ordinary_metadata = {
    semantic_facts: [], physical_inscriptions: []
  };
  applyActionProductionProjection({ next: snapshot, plan });
  const batch = operationBatch();
  batch.value.operations = batch.value.operations.filter(({ value }) =>
    value.operation_kind !== 'move_entity'
      || value.payload.entity_ref !== 'board');
  const envelope = commitEnvelope({ clarification: false, check: false });
  envelope.loop_trace.step_traces[0].plan_request.player_safe_state
    .visible_entities.push({ entity_ref: 'wedge' });
  bindCommitEnvelopeToBatch(envelope, batch);

  const result = prepareLowerDvinaTraceTurnStepPersistence({
    partyId: 'p', state, snapshot, factual: null,
    changeSetId: 'change:p:turn-step:1', idemId: 'idem-1',
    writePlan: { turn_id: 'turn:p:1', base_state_version: 3,
      command_trace: envelope.mode_resolution.decision_trace,
      write_targets: [batch], turn_step_commit: envelope }
  });

  assert.deepEqual(result.snapshot.items.find(({ item_id: id }) =>
    id === 'board').state, plan.source_updates[0].after_item.state);
});

function operationBatch() {
  const operations = ['board', 'wedge'].map((entityRef) => ({
    target: 'party_items', value: { version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: `op-move-${entityRef}`, root_turn_id: 'turn:p:1',
      step_index: 1, operation_kind: 'move_entity', payload: {
        entity_ref: entityRef, placement: {
          holder_character_id: 'actor-1', physical_position: 'hands'
        } } }
  }));
  operations.push({ target: 'party_events', value: { version: 1,
    schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
    activity_id: 'activity-1', root_turn_id: 'turn:p:1', step_index: 1,
    profile_ref: 'approved:brief-none', duration_class: 'brief',
    duration_minutes: 1, effort: 'none' } });
  return { target: 'party_turn_step_operations', value: { version: 1,
    schema: 'party_turn_step_operation_batch_v1', root_turn_id: 'turn:p:1',
    committed_state_version: 3, operations } };
}

function actionPlan() {
  const boardState = itemState('board', 700);
  return { source_updates: [{ item_id: 'board', after_item: {
    item_id: 'board', run_id: null, template_id: null, profile_id: null,
    category_id: null, quantity: 1, condition_state: 'serviceable',
    legal_status: 'owned', state: boardState, state_version: 2
  } }], result_items: [{ item_id: 'wedge', item_row: {
    run_id: null, template_id: null, profile_id: null, category_id: null,
    quantity: 1, condition_state: 'serviceable',
    legal_status: 'action_produced_non_authoritative',
    state: itemState('wedge', 100), state_version: 1
  }, placement_row: { anchor_id: 'anchor-shore', container_id: null,
    holder_npc_id: null, holder_character_id: null, physical_position: null,
    equipment_slot_category_id: null, attached_item_id: null },
  ownership_row: { ownership_id: 'ownership:wedge', owner_npc_id: null,
    owner_character_id: 'actor-1', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor-1',
    claim_state: 'owned' }, mechanics_snapshot: mechanics('wedge', 100) }] };
}

function baseState() {
  const clock = { whole_minutes: '10', subminute_numerator: '0',
    subminute_denominator: '1' };
  return { party_id: 'p', actor_id: 'actor-1', party_state: {
    state_version: 3, session_state_version: 7, clock_state_version: 2,
    body_state_version: 5, turn_number: 0 }, player_profile: { attributes: {
    strength: { value: 10 } } }, position: { location_ref: 'shore',
    g5_anchor_id: 'anchor-shore' }, clock,
  clock_weather_light: { clock, weather: {}, light: {} }, body_state: {
    health: 100, energy: 100, satiety: 100, active_conditions: [] },
  items: [{ item_id: 'board', instance_id: 'board', template_id: null,
    profile_id: null, category_id: null, name: 'доска', quantity: 1,
    condition_state: 'serviceable', legal_status: 'owned',
    placement: { anchor_id: 'anchor-shore' }, state: itemState('board', 800),
    runtime_instance_mechanics_snapshot: mechanics('board', 800),
    state_version: 1 }], containers: [], npcs: [], container_placements: [],
  container_profiles: [], container_compatibility: [], knowledge: [{
    fact_id: 'shore', knowledge_state: 'known' }],
  opening_identity: { opening_screen_digest: 'opening-digest' } };
}

function itemState(itemId, mass) {
  return { lifecycle_status: 'active',
    runtime_instance_mechanics_snapshot: mechanics(itemId, mass),
    ordinary_metadata: { semantic_type: 'ordinary_mundane',
      name: itemId === 'board' ? 'доска' : 'деревянный клин',
      origin: { kind: 'crafted', source_refs: ['board'] },
      semantic_facts: [], operation_history: [] } };
}

function mechanics(operationRef, mass) {
  return { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:p:1', step_index: 1, operation_ref: operationRef,
      origin_kind: 'crafted', source_refs: ['board'] }, mechanics: {
      mass_grams: mass, external_hand_cost: 0, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 1, unit: 'item' },
      container: null } };
}
