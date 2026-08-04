import { sha256 } from '@rus/kernel';
import { resolveTurnStepSemanticActivityTime } from '@rus/turn';

export function commitEnvelope({ clarification, check }) {
  const question = clarification
    ? { question: 'Что именно взять?', target_refs: ['shore'] } : null;
  const planRequest = planRequestFixture();
  const approvedPlan = approvedPlanFixture(planRequest, {
    clarification, check, question
  });
  const result = check ? [checkResult()] : [];
  const checkRequest = check ? checkRequestFor(approvedPlan) : null;
  const stepTrace = {
    step_index: 1,
    working_revision: 0,
    resolution: clarification ? 'clarification_required'
      : check ? 'generic_check' : 'direct',
    goal_result: clarification || check ? 'pending' : 'achieved',
    repaired: false,
    applied: !clarification,
    check_outcome: result[0]?.outcome.band ?? null,
    check_binding: structuredClone(checkRequest),
    approved_plan: structuredClone(approvedPlan),
    plan_request: structuredClone(planRequest),
    player_response_boundary: false,
    reason_code: clarification ? 'material_ambiguity'
      : check ? 'generic_check' : 'direct_step'
  };
  const decisionTrace = {
    decision_protocol: 'turn_step_plan_v1',
    action_set_digest: 'action-digest', state_version: 3,
    working_revision: clarification ? 0 : 1,
    step_count: 1,
    stop_reason: clarification ? 'clarification_required' : 'terminal',
    selected_option_id: null,
    step_traces: [stepTrace]
  };
  return {
    version: 1, schema: 'turn_step_commit_envelope_v1',
    party_id: 'p', root_turn_id: 'turn:p:1', base_state_version: 3,
    player_input: {
      version: 1, schema: 'player_turn_input', party_id: 'p', turn_number: 1,
      request_id: 'request-1', idempotency_key: 'idem-key',
      raw_text: 'беру песок', selected_action_option_id: null,
      input_source: 'free_text', received_at: '2030-01-01T00:00:00.000Z',
      interpretation_status: 'pending', contract: 'intent_not_fact'
    },
    mode_resolution: {
      version: 1, schema: 'turn_mode_resolution', turn_id: 'turn:p:1',
      command_id: 'turn_step_execution_draft',
      option_id: 'turn_step_execution_draft',
      selected_primary_mode: 'combined', secondary_modes: [],
      intent: { raw_text: 'беру песок',
        normalized_intent: 'turn_step_execution_draft',
        player_words_are_world_facts: false },
      resolution_plan: { subsystems: ['visible_context_projection'],
        checks_to_run: [], state_blocks_to_load: ['party_state'],
        expected_writes: [] },
      decision_trace: decisionTrace
    },
    checks: { version: 1, schema: 'turn_check_results',
      requests: check ? [checkRequest] : [], results: result },
    consequence: {
      version: 1, schema: 'turn_consequence_package',
      status: clarification ? 'partial' : 'resolved', duration_minutes: 0,
      visible_seed: { clarification: question }, hidden_update: {},
      state_changes: [], suggested_actions: []
    },
    time_update: { version: 2, schema: 'turn_time_update',
      owner: '@rus/time-events-history', clock_before: clock(),
      clock_after: clock(), exact_elapsed: { exact_minutes: {
        numerator: '0', denominator: '1' } }, nearest_boundary: null,
      semantic_activity_elapsed: { exact_minutes: {
        numerator: '0', denominator: '1' } },
      semantic_activity_resolutions: [] },
    body_update: { version: 1, schema: 'turn_body_update',
      owner: '@rus/body-state', applied: false, proposal: null,
      state_after: body() },
    hidden_update: { version: 1, schema: 'turn_hidden_update',
      approved_update: {} },
    visible_context: { version: 1, schema: 'visible_context_package',
      visible_scene: 'Берег Северной Двины.',
      visible_changes: clarification ? [question.question] : ['Песок собран.'],
      sensory_details: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [],
      do_not_imply: [], canonical_digest: 'visible-digest' },
    loop_trace: {
      version: 1, schema: 'turn_step_commit_trace_v1',
      root_turn_id: 'turn:p:1', request_id: 'request-1',
      committed_state_version: 3,
      status: clarification ? 'player_response_required' : 'resolved',
      stop_reason: clarification ? 'clarification_required' : 'terminal',
      working_revision: clarification ? 0 : 1,
      next_step_index: clarification ? 1 : 2,
      remaining_intent: null,
      completed_steps: clarification ? [] : [{ step_index: 1,
        summary: 'беру песок' }],
      step_traces: decisionTrace.step_traces,
      check_results: result,
      clarification: question
    }
  };
}

export function bindCommitEnvelopeToBatch(envelope, batch) {
  const trace = envelope.loop_trace.step_traces[0];
  const operations = batch.value.operations
    .filter(({ target }) => target !== 'party_events')
    .map(({ value }) => plannedOperation(value));
  const activities = batch.value.operations
    .filter(({ target }) => target === 'party_events')
    .map(({ value }) => value);
  const selected = trace.approved_plan.resolution === 'generic_check'
    ? trace.approved_plan.check.outcomes[trace.check_outcome] : null;
  if (selected) selected.operations = operations;
  else trace.approved_plan.operations = operations;
  if (activities[0]) {
    trace.approved_plan.activity = {
      owner: 'semantic', duration_class: activities[0].duration_class,
      effort: activities[0].effort
    };
  }
  if (selected) selected.additional_activity = activities[1] == null
    ? null : { duration_class: activities[1].duration_class,
      effort: activities[1].effort };
  bindActivityEvidence(envelope, activities, batch);
  if (operations.some(({ op }) => op === 'apply_body_event')) {
    trace.plan_request.actor.body = {
      body_parts: { left_arm: { id: 'left_arm' } }
    };
  }
  if (selected) {
    const binding = envelope.checks.requests[0];
    binding.check_plan_digest = sha256(trace.approved_plan.check);
    binding.outcome_map_digest = sha256(
      trace.approved_plan.check.outcomes);
    binding.step_plan_digest = sha256(trace.approved_plan);
    trace.check_binding = structuredClone(binding);
  }
  envelope.mode_resolution.decision_trace.step_traces =
    structuredClone(envelope.loop_trace.step_traces);
  return envelope;
}

function plannedOperation(value) {
  const payload = value.payload;
  if (value.operation_kind === 'create_entity') return {
    op: 'create_entity', temp_ref: payload.temp_ref,
    semantic_type: payload.semantic_type, name: payload.name,
    origin: structuredClone(payload.origin),
    facts: payload.facts.map(({ temp_ref, text }) => ({ temp_ref, text })),
    mechanics: structuredClone(
      payload.runtime_instance_mechanics_snapshot.mechanics),
    placement: plannedPlacement(payload.placement)
  };
  if (value.operation_kind === 'move_entity') return {
    op: 'move_entity', entity_ref: payload.entity_ref,
    placement: plannedPlacement(payload.placement)
  };
  if (value.operation_kind === 'change_entity_facts') return {
    op: 'change_entity_facts', entity_ref: payload.entity_ref,
    remove_fact_refs: structuredClone(payload.remove_fact_refs),
    add_facts: payload.add_facts.map(({ temp_ref, text }) => ({
      temp_ref, text
    }))
  };
  if (value.operation_kind === 'set_entity_mechanics') return {
    op: 'set_entity_mechanics', entity_ref: payload.entity_ref,
    reason: payload.reason,
    mechanics: structuredClone(
      payload.runtime_instance_mechanics_snapshot.mechanics)
  };
  if (value.operation_kind === 'retire_entity') return {
    op: 'retire_entity', entity_ref: payload.entity_ref, reason: payload.reason
  };
  if (value.operation_kind === 'apply_body_event') return {
    op: 'apply_body_event', actor_ref: payload.actor_ref,
    mechanism: payload.payload.selected_context.mechanism,
    severity: payload.payload.selected_context.severity,
    body_part_ref: payload.payload.selected_context.body_part_ref,
    description: 'test body event'
  };
  return { op: 'request_container_access', actor_ref: 'actor-1',
    container_ref: payload.container_ref, access_kind: payload.access_kind };
}

function plannedPlacement(value) {
  if (value.relation) return structuredClone(value);
  if (value.holder_character_id) return {
    relation: value.physical_position === 'worn' ? 'worn_by' : 'held_by',
    target_ref: value.holder_character_id
  };
  if (value.container_id) return {
    relation: 'inside', target_ref: value.container_id
  };
  if (value.attached_item_id) return {
    relation: 'attached_to', target_ref: value.attached_item_id
  };
  return { relation: 'located_at',
    target_ref: value.location_ref ?? value.anchor_id };
}

function bindActivityEvidence(envelope, activities, batch) {
  const changes = activities.map((activity) => ({
    kind: 'semantic_activity', activity_id: activity.activity_id,
    profile_ref: activity.profile_ref,
    profile_pin: { artifact_id: 'turn-step-owner-profiles', revision: 1,
      digest: '1'.repeat(64) },
    duration_class: activity.duration_class, effort: activity.effort,
    body_effect_profile_ref: `body:${activity.duration_class}:${activity.effort}`,
    body_effect_context: { kind: 'semantic_activity',
      duration_class: activity.duration_class, effort: activity.effort }
  }));
  envelope.consequence.state_changes = [
    ...envelope.consequence.state_changes.filter(
      ({ kind }) => kind !== 'semantic_activity'), ...changes
  ];
  const elapsed = activities.reduce((sum, activity) =>
    sum + activity.duration_minutes, 0);
  envelope.consequence.duration_minutes = elapsed;
  envelope.time_update.clock_after = {
    ...clock(), whole_minutes: String(10 + elapsed)
  };
  envelope.time_update.exact_elapsed = { exact_minutes: {
    numerator: String(elapsed), denominator: '1'
  } };
  Object.assign(envelope.time_update,
    resolveTurnStepSemanticActivityTime({
      batch: batch.value,
      consequence: envelope.consequence,
      clockBefore: envelope.time_update.clock_before,
      clockAfter: envelope.time_update.clock_after,
      exactElapsed: envelope.time_update.exact_elapsed,
      expectedClockBefore: envelope.time_update.clock_before
    }));
}

function planRequestFixture() {
  return {
    schema: 'turn_step_request_v1', request_id: 'request-1:step:1',
    root_turn_id: 'turn:p:1', committed_state_version: 3,
    working_revision: 0, step_index: 1, max_internal_steps: 8,
    root_player_action: 'беру песок', remaining_intent: 'беру песок',
    completed_steps: [],
    actor: { actor_ref: 'actor-1',
      attributes: { strength: { value: 10 } }, skills: {} },
    player_safe_state: { actor_ref: 'actor-1',
      visible_entities: [{ entity_ref: 'shore' }] }
  };
}

function approvedPlanFixture(request, { clarification, check, question }) {
  const outcome = {
    goal_result: 'achieved', additional_activity: null,
    operations: [], continuation: null
  };
  return {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: clarification ? 'clarification_required'
      : check ? 'generic_check' : 'direct',
    goal_result: clarification || check ? 'pending' : 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [],
    check: check ? { purpose: 'удержать равновесие',
      attribute_ref: 'strength', skill_ref: null, difficulty_id: 'risky',
      outcomes: Object.fromEntries([
        'clean_success', 'success', 'success_with_cost',
        'failure_with_consequence', 'severe_failure'
      ].map((band) => [band, structuredClone(outcome)])) } : null,
    continuation: null,
    clarification: structuredClone(question),
    reason_code: clarification ? 'material_ambiguity'
      : check ? 'generic_check' : 'direct_step',
    reason: 'test approved plan'
  };
}

function checkRequestFor(plan) {
  return {
    check_id: 'turn:p:1:step:1', difficulty: 15,
    policy_profile_ref: 'trace_ld_v1_generic_check_modifiers_v1',
    policy_profile_pin: {
      artifact_id: 'trace_ld_v1_turn_step_owner_profiles', revision: 1,
      digest: 'a'.repeat(64)
    },
    check_policy_ref: { entity_kind: 'check_policy',
      entity_id: 'trace_ld_v1_generic_check_modifiers_v1',
      authoring_version: '1' },
    consequence_policy_ref: { entity_kind: 'consequence_policy',
      entity_id: 'trace_ld_v1_generic_check_five_band_v1',
      authoring_version: '1' },
    check_plan_digest: sha256(plan.check),
    outcome_map_digest: sha256(plan.check.outcomes),
    step_plan_digest: sha256(plan)
  };
}

function checkResult() {
  return {
    check_id: 'turn:p:1:step:1', roll: 17,
    modifiers: { attribute: 2, skill: 0, state: 0,
      equipment: 0, circumstances: 0 },
    total: 19, difficulty: 15,
    outcome: { margin: 4, band: 'success', success: true,
      cost_required: false, severe_failure: false, roll_note: null },
    audit: { die: 'd20', value: 17, rng_mode: 'seeded',
      algorithm: 'mulberry32_v1', seed_ref: 'seed-1', counter: 0,
      formula: 'd20 + modifiers' }
  };
}

function clock() {
  return { whole_minutes: '10', subminute_numerator: '0',
    subminute_denominator: '1' };
}

function body() {
  return { health: 100, energy: 100, satiety: 100,
    active_conditions: [] };
}
