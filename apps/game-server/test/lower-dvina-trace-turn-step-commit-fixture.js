import { authoredItemPlacementSourceProof,
  createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import { canonicalDigest } from '@rus/materialization';
import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import { bindCommitEnvelopeToBatch, commitEnvelope } from
  './lower-dvina-trace-turn-step-envelope-fixture.js';

export function fixture({ direct = false, clarification = false, check = false,
  bodyEvent = false, authoredMove = false, envelopeOverride = null,
  temporalResults = [], backgroundNpcSemanticPlan = null }) {
  const state = baseState();
  if (backgroundNpcSemanticPlan != null) state.npcs.push(backgroundNpc());
  if (authoredMove) state.items.push(authoredItem());
  const envelope = envelopeOverride ?? commitEnvelope({ clarification, check });
  if (backgroundNpcSemanticPlan != null) {
    for (const trace of [envelope.loop_trace.step_traces[0],
      envelope.mode_resolution.decision_trace.step_traces[0]]) {
      trace.resolution = 'domain_request';
      trace.goal_result = 'pending';
      trace.approved_plan.resolution = 'domain_request';
      trace.approved_plan.goal_result = 'pending';
      trace.approved_plan.activity = {
        owner: 'domain', duration_class: null, effort: null };
      trace.approved_plan.operations = [{ op: 'request_discovery',
        actor_ref: 'actor-1', discovery_kind: 'inspect',
        target_refs: ['npc:fisher'], query: 'присмотреться' }];
      trace.plan_request.player_safe_state.visible_entities.push({
        entity_ref: 'npc:fisher' });
    }
  }
  if (temporalResults.length > 0) {
    envelope.time_update.temporal_results = structuredClone(temporalResults);
  }
  if (authoredMove) envelope.loop_trace.step_traces[0].plan_request
    .player_safe_state.visible_entities.push({ entity_ref: 'authored-item' });
  const writeTargets = [];
  if (direct) writeTargets.push(operationBatch());
  if (bodyEvent) writeTargets.push(bodyOperationBatch(envelope));
  if (authoredMove) writeTargets.push(authoredMoveBatch(state.items[0]));
  const batch = writeTargets.find(
    ({ target }) => target === 'party_turn_step_operations');
  if (batch) bindCommitEnvelopeToBatch(envelope, batch);
  if (clarification) writeTargets.push({
    target: 'party_player_visible_message',
    value: { clarification: envelope.loop_trace.clarification } });
  const writePlan = { version: 2, schema: 'party_turn_write_plan',
    sealed_by: 'turn_code_planner_v2', party_id: 'p', turn_id: 'turn:p:1',
    base_state_version: 3, write_targets: writeTargets,
    command_trace: envelope.mode_resolution.decision_trace,
    turn_step_commit: envelope,
    ...(backgroundNpcSemanticPlan == null ? {} : {
      background_npc_semantic_atomic_write_plan: backgroundNpcSemanticPlan }) };
  const inputDigest = canonicalDigest({ party_id: 'p', request_id: 'request-1',
    idempotency_key: 'idem-key', raw_text: 'беру песок' });
  const plans = [];
  return { state, envelope, batch, plans,
    commit: ({ turnStepAmbientPortionProfileRef = null } = {}) =>
      commitLowerDvinaTracePhase2({ partyId: 'p', writePlan,
      turnStepAmbientPortionProfileRef,
      inputDigest, contracts: {}, phase3Contracts: null, phase4Contracts: null,
      phase5Contracts: null, phase6Contracts: null,
      loadState: async () => structuredClone(state),
      committer: { async commit({ plan }) {
        plans.push(plan);
        return { ok: true, replay: false, change_set_id: plan.change_set_id };
      } } }) };
}

function operationBatch() {
  return { target: 'party_turn_step_operations', value: { version: 1,
    schema: 'party_turn_step_operation_batch_v1', root_turn_id: 'turn:p:1',
    committed_state_version: 3, operations: [{ target: 'party_items', value: {
      version: 1, schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: 'op-sand', root_turn_id: 'turn:p:1', step_index: 1,
      operation_kind: 'create_entity', payload: { temp_ref: 'sand-temp',
        entity_ref: 'runtime-item:sand', semantic_type: 'material_portion',
        name: 'горсть песка',
        origin: { kind: 'ambient_ordinary', source_refs: ['shore'] }, facts: [],
        runtime_instance_mechanics_snapshot: mechanics(),
        placement: { holder_character_id: 'actor-1', physical_position: 'hands' }
      } } }, semanticActivity()] } };
}

function bodyOperationBatch(envelope) {
  const pin = { artifact_id: 'trace_ld_v1_turn_step_owner_profiles', revision: 1,
    digest: '1'.repeat(64) };
  const context = { kind: 'direct_body_event', mechanism: 'impact',
    severity: 'minor', body_part_ref: 'left_arm' };
  const exactDeltas = { health: -1, satiety: 0, energy: 0 };
  const stateAfter = { ...body(), health: 99 };
  const payload = { body_effect_ref: 'body:impact:minor',
    profile_pin: structuredClone(pin), selected_context: structuredClone(context),
    exact_deltas: structuredClone(exactDeltas),
    state_after: structuredClone(stateAfter),
    selection_policy: 'fixed_approved_effect', rng_consumption: 'forbidden' };
  envelope.consequence.body_effect_ref = 'body:composite';
  envelope.consequence.state_changes = [{ kind: 'direct_body_event',
    operation_id: 'op-body', body_effect_profile_ref: payload.body_effect_ref,
    profile_pin: structuredClone(pin),
    body_effect_context: structuredClone(context) }];
  envelope.hidden_update.approved_update = structuredClone(payload);
  envelope.body_update = { version: 1, schema: 'turn_body_update',
    owner: '@rus/body-state', applied: true, proposal: {
      schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
      profile_ref: 'body:composite', profile_pin: structuredClone(pin),
      component_proposals: [{
        schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
        profile_ref: payload.body_effect_ref, profile_pin: structuredClone(pin),
        selected_context: structuredClone(context),
        exact_deltas: structuredClone(exactDeltas), condition_transitions: [],
        selection_policy: 'fixed_approved_effect', rng_consumption: 'forbidden',
        state_after: structuredClone(stateAfter) }],
      exact_deltas: structuredClone(exactDeltas),
      selection_policy: 'ordered_committed_step_components',
      rng_consumption: 'forbidden' }, state_after: structuredClone(stateAfter) };
  return { target: 'party_turn_step_operations', value: { version: 1,
    schema: 'party_turn_step_operation_batch_v1', root_turn_id: 'turn:p:1',
    committed_state_version: 3, operations: [{ target: 'party_state', value: {
      version: 1, schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: 'op-body', root_turn_id: 'turn:p:1', step_index: 1,
      operation_kind: 'apply_body_event', payload: { actor_ref: 'actor-1',
        body_effect_ref: payload.body_effect_ref,
        payload: structuredClone(payload) } } }, semanticActivity()] } };
}

export function semanticActivity() {
  return { target: 'party_events', value: { version: 1,
    schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
    activity_id: 'activity-1', root_turn_id: 'turn:p:1', step_index: 1,
    profile_ref: 'approved:brief-none', duration_class: 'brief',
    duration_minutes: 1, effort: 'none' } };
}

function authoredMoveBatch(item) {
  return { target: 'party_turn_step_operations', value: { version: 1,
    schema: 'party_turn_step_operation_batch_v1', root_turn_id: 'turn:p:1',
    committed_state_version: 3, operations: [{ target: 'party_items', value: {
      version: 1, schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: 'op-authored-move', root_turn_id: 'turn:p:1', step_index: 1,
      operation_kind: 'move_entity', payload: { entity_ref: 'authored-item',
        placement: { holder_character_id: 'actor-1', physical_position: 'hands' },
        authored_source: authoredItemPlacementSourceProof(item) } } },
    semanticActivity()] } };
}

function mechanics() {
  return createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:p:1', step_index: 1, operation_ref: 'op-sand',
      origin_kind: 'ambient_ordinary', source_refs: ['shore'] },
    mechanics: { mass_grams: 250, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'handful' }, container: null } });
}

function baseState() {
  return { party_id: 'p', actor_id: 'actor-1',
    schema: 'rus.lower_dvina_trace_turn_snapshot.v2',
    party_state: { state_version: 3, session_state_version: 7,
      clock_state_version: 2, body_state_version: 5, turn_number: 0 },
    player_profile: { attributes: { strength: { value: 10 } } },
    position: { location_ref: 'shore', g5_anchor_id: 'anchor-shore' },
    clock: clock(), clock_weather_light: { clock: clock(), weather: {}, light: {} },
    body_state: body(), items: [], containers: [], npcs: [],
    container_placements: [], container_profiles: [], container_compatibility: [],
    knowledge: [{ fact_id: 'shore', knowledge_state: 'known' }],
    opening_identity: { opening_screen_digest: 'opening-digest' } };
}

export function backgroundNpc() {
  return { npc_id: 'npc:fisher',
    profile_set_id: 'trace_ld_v1_background_fisher_v1',
    profile_level: 'background', anchor_id: 'anchor-shore', role_ref: 'fisher',
    occupation_ref: 'fishing',
    identity_state: { appearance_profile_ref: 'appearance:fisher' },
    machine_state: { schedule_state: 'working' }, semantic_state: {
      profile_revision: 2, participant_slot_ref: 'slot:fisher',
      location_profile_ref: 'shore', zone_ref: 'water' } };
}

function authoredItem() {
  return { item_id: 'authored-item', template_id: 'template-1',
    profile_id: 'profile-1', category_id: 'container', quantity: 1,
    condition_state: 'sound', legal_status: 'party_owned', state: {},
    inventory_profile: { mass_grams: 100, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 1, packing_bundle_size: 1 },
    placement: { anchor_id: 'anchor-shore' } };
}

function clock() {
  return { whole_minutes: '10', subminute_numerator: '0',
    subminute_denominator: '1' };
}

export function body() {
  return { health: 100, energy: 100, satiety: 100, active_conditions: [] };
}
