import { createHash } from 'node:crypto';
import { canonicalDigest } from '@rus/materialization';
import {
  exactShape,
  fail,
  plain,
  requireMechanics,
  text
} from './lower-dvina-trace-turn-step-persistence-support.js';
const BODY_METRICS = ['health', 'satiety', 'energy'];
export function requireFactualCommit({ writePlan, factual, partyId, batch }) {
  const envelope = writePlan.turn_step_commit;
  if (envelope == null) return factual;
  const fields = [
    'version', 'schema', 'party_id', 'root_turn_id', 'base_state_version',
    'player_input', 'mode_resolution', 'checks', 'consequence',
    'time_update', 'body_update', 'hidden_update', 'visible_context',
    'loop_trace'
  ];
  const traceFields = [
    'version', 'schema', 'root_turn_id', 'request_id',
    'committed_state_version', 'status', 'stop_reason', 'working_revision',
    'next_step_index', 'remaining_intent', 'completed_steps', 'step_traces',
    'check_results', 'factual_events', 'clarification'
  ];
  if (!exactShape(envelope, fields)
      || envelope.version !== 1
      || envelope.schema !== 'turn_step_commit_envelope_v1'
      || envelope.party_id !== partyId
      || envelope.root_turn_id !== batch.root_turn_id
      || envelope.base_state_version !== batch.committed_state_version
      || !exactShape(envelope.loop_trace, traceFields)
      || envelope.loop_trace.version !== 1
      || envelope.loop_trace.schema !== 'turn_step_commit_trace_v1'
      || envelope.loop_trace.root_turn_id !== batch.root_turn_id
      || envelope.loop_trace.request_id !== envelope.player_input?.request_id
      || envelope.loop_trace.committed_state_version
        !== batch.committed_state_version) {
    fail('TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP', {
      reason: 'canonical turn-step commit envelope is invalid'
    });
  }
  requireFactualEventPersistence(envelope, partyId, batch);
  return envelope;
}

function requireFactualEventPersistence(envelope, partyId, batch) {
  const events = envelope.loop_trace.factual_events;
  const factualRows = (envelope.time_update?.temporal_results ?? [])
    .flatMap((result) => result?.combined_change_set?.proposals ?? [])
    .flatMap((proposal) => proposal?.write_set?.inserts ?? [])
    .filter((write) => write?.target_schema === 'party_runtime'
      && write.target_table === 'party_temporal_events'
      && write.record?.event_kind === 'actor_factual_event');
  if (factualRows.length !== events.length) {
    fail('TRACE_TURN_STEP_FACTUAL_EVENT_RECONCILIATION_FAILED', {
      event_id: null
    });
  }
  for (const event of events) {
    const evidence = factualActivityEvidence(envelope, batch, event);
    const binding = (envelope.consequence?.state_changes ?? []).find(
      (entry) => entry?.kind === 'semantic_activity'
        && entry.activity_id === event.source_activity_ref.entity_id
        && entry.profile_ref === event.rule_ref.entity_id
        && same(entry.profile_pin, event.profile_pin));
    const matches = factualRows.filter(
      (write) => write.id === event.event_ref.entity_id);
    const row = matches[0]?.record;
    if (!binding || !evidence || !validProfilePin(event.profile_pin)
        || event.rule_ref.entity_kind !== 'activity_profile'
        || event.policy_ref.entity_kind !== 'turn_step_owner_profile_set'
        || event.policy_ref.entity_id !== event.profile_pin.artifact_id
        || event.policy_ref.authoring_version
          !== String(event.profile_pin.revision)
        || event.rule_ref.authoring_version
          !== String(event.profile_pin.revision)
        || matches.length !== 1 || !exactShape(row, [
      'event_id', 'party_id', 'event_kind', 'status',
      'scheduled_at_whole_minutes', 'scheduled_at_subminute_numerator',
      'scheduled_at_subminute_denominator', 'rule_ref', 'policy_ref',
      'preconditions_digest', 'idempotency_key', 'change_set_id',
      'terminal_change_set_id', 'state_version'
    ]) || row.event_id !== event.event_ref.entity_id
        || row.party_id !== partyId || row.event_kind !== 'actor_factual_event'
        || row.status !== 'resolved'
        || row.scheduled_at_whole_minutes !== event.occurred_at.whole_minutes
        || row.scheduled_at_subminute_numerator
          !== event.occurred_at.subminute_numerator
        || row.scheduled_at_subminute_denominator
          !== event.occurred_at.subminute_denominator
        || !same(row.rule_ref, event.rule_ref)
        || !same(row.policy_ref, event.policy_ref)
        || row.preconditions_digest !== canonicalDigest(event)
        || row.idempotency_key !== envelope.player_input.idempotency_key
          + ':event:' + event.event_ref.entity_id
        || !text(row.change_set_id)
        || row.terminal_change_set_id !== row.change_set_id
        || row.state_version !== 2) {
      fail('TRACE_TURN_STEP_FACTUAL_EVENT_RECONCILIATION_FAILED', {
        event_id: event?.event_ref?.entity_id ?? null
      });
    }
  }
}

function factualActivityEvidence(envelope, batch, event) {
  const activities = (batch?.operations ?? []).filter(
    ({ target, value }) => target === 'party_events'
      && value?.schema === 'rus.lower_dvina_trace_turn_step_semantic_activity.v1'
      && value.activity_id === event.source_activity_ref.entity_id);
  const activity = activities[0]?.value;
  const traces = (envelope.loop_trace.step_traces ?? []).filter(
    (trace) => trace?.step_index === activity?.step_index);
  const resolutions = (envelope.time_update?.semantic_activity_resolutions ?? [])
    .filter(({ activity_id: id }) => id === activity?.activity_id);
  const trace = traces[0];
  const plan = trace?.approved_plan;
  const utterance = plan?.direct_result_kind === 'player_utterance'
    ? plan.utterance : null;
  const actor = trace?.plan_request?.actor?.actor_id
    ?? trace?.plan_request?.actor?.actor_ref;
  const position = trace?.plan_request?.player_safe_state
    ?.spatial_semantic?.position_ref
    ?? trace?.plan_request?.player_safe_state?.position?.location_ref;
  const common = activities.length === 1 && traces.length === 1
    && resolutions.length === 1 && text(actor) && text(position)
    && activity.root_turn_id === envelope.root_turn_id
    && same(event.occurred_at, resolutions[0].execution?.started_at)
    && same(event.source_ref, { entity_kind: 'player_character',
      entity_id: actor })
    && same(event.source_scope_ref, { entity_kind: 'canonical_spatial_node',
      entity_id: position });
  if (!common || utterance == null) return common;
  return event.event_ref.entity_kind === 'sound_event'
    && event.event_ref.entity_id
      === `sound-event:${createHash('sha256').update(activity.activity_id)
        .digest('hex').slice(0, 32)}`
    && event.source_ref.entity_id === utterance.speaker_ref
    && same(event.perceptible_signal, { channel: 'acoustic',
      emission_strength: utterance.delivery?.loudness,
      duration_class: utterance.delivery?.duration_class });
}
export function validateBodyEventCommit(operation, factual, state) {
  const outer = operation.payload;
  const payload = outer.payload;
  if (outer.actor_ref !== bodyActorId(factual, state)
      || outer.body_effect_ref !== payload.body_effect_ref
      || !(exactShape(payload, ['body_effect_ref', 'profile_pin', 'selected_context', 'exact_deltas',
        'state_after', 'selection_policy', 'rng_consumption']) || exactShape(payload, ['body_effect_ref',
        'profile_pin', 'selected_context', 'exact_deltas', 'condition_transitions', 'state_after',
        'selection_policy', 'rng_consumption']))
      || (payload.condition_transitions !== undefined && !Array.isArray(payload.condition_transitions))
      || !text(payload.body_effect_ref)
      || !validProfilePin(payload.profile_pin)
      || !exactShape(payload.selected_context, ['kind', 'mechanism', 'severity', 'body_part_ref'])
      || payload.selected_context.kind !== 'direct_body_event'
      || !exactShape(payload.exact_deltas, ['health', 'satiety', 'energy'])
      || Object.values(payload.exact_deltas).some(
        (value) => !Number.isFinite(value))
      || !plain(payload.state_after)
      || payload.selection_policy !== 'fixed_approved_effect'
      || payload.rng_consumption !== 'forbidden') {
    fail('TRACE_TURN_STEP_BODY_EVENT_OWNER_INVALID', {
      operation_id: operation.operation_id
    });
  }
  const components = (factual.consequence?.state_changes ?? []).filter(
    ({ kind }) => ['semantic_activity', 'direct_body_event'].includes(kind));
  const componentIndex = components.findIndex((component) =>
    component?.kind === 'direct_body_event'
      && component.operation_id === operation.operation_id);
  const component = components[componentIndex];
  const proposals = factual.body_update?.proposal?.component_proposals;
  const proposal = Array.isArray(proposals)
    ? proposals[componentIndex] : null;
  const hidden = factual.hidden_update ?? factual.consequence?.hidden_update;
  const hiddenMatches = plain(hidden) && Object.values(hidden).filter(
    (value) => same(value, payload)).length;
  if (componentIndex < 0
      || !exactShape(component, [
        'kind', 'operation_id', 'body_effect_profile_ref', 'profile_pin',
        'body_effect_context'
      ])
      || component.body_effect_profile_ref !== payload.body_effect_ref
      || !same(component.profile_pin, payload.profile_pin)
      || !same(component.body_effect_context, payload.selected_context)
      || !Array.isArray(proposals)
      || proposals.length !== components.length
      || proposal?.profile_ref !== payload.body_effect_ref
      || !same(proposal.profile_pin, payload.profile_pin)
      || !same(proposal.selected_context, payload.selected_context)
      || !same(proposal.exact_deltas, payload.exact_deltas)
      || !same(proposal.state_after, payload.state_after)
      || proposal.selection_policy !== payload.selection_policy
      || proposal.rng_consumption !== payload.rng_consumption
      || hiddenMatches !== 1) {
    reconciliationFail(operation.operation_id);
  }
  if (!same(proposals.at(-1)?.state_after,
    factual.body_update?.state_after)) {
    reconciliationFail(operation.operation_id,
      'final component state_after differs from factual body_update');
  }
}
export function validateBodyComponentOrder(batch, factual, state) {
  const expected = batch.operations.flatMap((fragment) => {
    if (fragment.target === 'party_events') return [{
      kind: 'semantic_activity', ref: fragment.value.activity_id
    }];
    if (fragment.target === 'party_state'
        && fragment.value.operation_kind === 'apply_body_event') return [{
      kind: 'direct_body_event', ref: fragment.value.operation_id
    }];
    return [];
  });
  const components = (factual.consequence?.state_changes ?? []).filter(
    (component) => ['semantic_activity', 'direct_body_event'].includes(
      component?.kind));
  const actual = components.flatMap((component) => {
      if (component?.kind === 'semantic_activity') return [{
        kind: component.kind, ref: component.activity_id
      }];
      if (component?.kind === 'direct_body_event') return [{
        kind: component.kind, ref: component.operation_id
      }];
      return [];
    });
  const bodyEffectRef = factual.consequence?.body_effect_ref ?? null;
  const applied = factual.body_update?.applied === true;
  if (!same(expected, actual)) {
    reconciliationFail(null,
      'ordered batch and consequence body components differ');
  }
  if (bodyEffectRef != null && (!text(bodyEffectRef) || !applied)) {
    reconciliationFail(null,
      'consequence body effect has no applied body owner');
  }
  if (!applied) return;
  const proposals = factual.body_update?.proposal?.component_proposals;
  const composite = factual.body_update?.proposal;
  const compositeShape = exactShape(composite, [
    'schema', 'profile_ref', 'profile_pin', 'component_proposals',
    'exact_deltas', 'selection_policy', 'rng_consumption'
  ]) && composite.schema
      === 'rus.body_state.composite_fixed_effect_proposal.v1'
    && validProfilePin(composite.profile_pin)
    && validBodyDeltas(composite.exact_deltas)
    && composite.selection_policy === 'ordered_committed_step_components'
    && composite.rng_consumption === 'forbidden';
  const proposalsMatch = Array.isArray(proposals)
    && proposals.length === components.length
    && components.length > 0
    && components.every((component, index) => {
      const proposal = proposals[index];
      return exactShape(proposal, [
        'schema', 'profile_ref', 'profile_pin', 'selected_context',
        'exact_deltas', 'condition_transitions', 'selection_policy',
        'rng_consumption', 'state_after'
      ])
        && proposal.schema === 'rus.body_state.fixed_approved_effect_proposal.v1'
        && proposal.profile_ref === component.body_effect_profile_ref
        && same(proposal.profile_pin, component.profile_pin)
        && same(composite.profile_pin, component.profile_pin)
        && same(proposal.selected_context,
          component.body_effect_context)
        && validBodyDeltas(proposal.exact_deltas)
        && Array.isArray(proposal.condition_transitions)
        && proposal.selection_policy === 'fixed_approved_effect'
        && proposal.rng_consumption === 'forbidden'
        && plain(proposal.state_after);
    });
  const summedDeltas = proposalsMatch
    ? Object.fromEntries(BODY_METRICS.map((metric) => [
        metric,
        proposals.reduce((sum, proposal) =>
          sum + proposal.exact_deltas[metric], 0)
      ]))
    : null;
  if (!compositeShape || !proposalsMatch
      || !same(composite.exact_deltas, summedDeltas)
      || (bodyEffectRef != null
        && composite?.profile_ref !== bodyEffectRef)) {
    reconciliationFail(null,
      'ordered batch, consequence and body proposals differ');
  }
  let expectedState = structuredClone(bodyState(batch, state));
  for (const proposal of proposals) {
    expectedState = applyBodyProposal(expectedState, proposal);
    if (!same(proposal.state_after, expectedState)) {
      reconciliationFail(null,
        'component state_after differs from persisted body arithmetic');
    }
  }
  if (!same(factual.body_update.state_after, expectedState)) {
    reconciliationFail(null,
      'final body state differs from ordered component arithmetic');
  }
}
function bodyActorId(factual, state) { return factual?.consequence?.phase7
  ?.autonomous?.request?.npc_ref ?? state.actor_id; }
function bodyState(batch, state) {
  const actor = batch.operations.find(({ target, value }) => target === 'party_state' && value?.operation_kind === 'apply_body_event')
    ?.value?.payload?.actor_ref ?? state.actor_id;
  return actor === state.actor_id ? state.body_state
    : state.npcs?.find(({ instance_id }) => instance_id === actor)?.check_body_state;
}
function applyBodyProposal(before, proposal) {
  if (!plain(before)) reconciliationFail(null, 'persisted body state is absent');
  const activeConditions = structuredClone(before.active_conditions ?? []);
  if (!Array.isArray(activeConditions)) {
    reconciliationFail(null, 'persisted body conditions are invalid');
  }
  for (const transition of proposal.condition_transitions) {
    if (!exactShape(transition, ['from', 'to', 'outcome'])
        || !text(transition.from) || !text(transition.to)) {
      reconciliationFail(null, 'body condition transition is invalid');
    }
    const matches = activeConditions.filter(({ id }) =>
      id === transition.from);
    if (matches.length !== 1) {
      reconciliationFail(null,
        'body condition transition has no exact persisted source');
    }
    matches[0].id = transition.to;
    if (text(transition.outcome)) matches[0].effect = transition.outcome;
    matches[0].cause = proposal.profile_ref;
  }
  return {
    ...structuredClone(before),
    ...Object.fromEntries(BODY_METRICS.map((metric) => [
      metric, Math.max(0, Math.min(100,
        before[metric] + proposal.exact_deltas[metric]))
    ])),
    active_conditions: activeConditions
  };
}
function validBodyDeltas(value) {
  return exactShape(value, BODY_METRICS)
    && BODY_METRICS.every((metric) => Number.isSafeInteger(value[metric]));
}
export function requireActivityOwnerBinding(activity, factual) {
  const matches = (factual.consequence?.state_changes ?? []).filter(
    (entry) => entry?.kind === 'semantic_activity'
      && entry.activity_id === activity.activity_id
  );
  const binding = matches[0];
  if (matches.length !== 1 || !exactShape(binding, [
    'kind', 'activity_id', 'profile_ref', 'profile_pin', 'duration_class',
    'effort', 'body_effect_profile_ref', 'body_effect_context'
  ])
      || binding.profile_ref !== activity.profile_ref
      || binding.duration_class !== activity.duration_class
      || binding.effort !== activity.effort
      || !validProfilePin(binding.profile_pin)
      || !text(binding.body_effect_profile_ref)
      || !exactShape(binding.body_effect_context, [
        'kind', 'duration_class', 'effort'
      ])
      || binding.body_effect_context.kind !== 'semantic_activity'
      || binding.body_effect_context.duration_class !== activity.duration_class
      || binding.body_effect_context.effort !== activity.effort) {
    fail('TRACE_TURN_STEP_SEMANTIC_ACTIVITY_RECONCILIATION_FAILED', {
      activity_id: activity.activity_id,
      reason: 'owner-produced activity profile binding is absent or changed'
    });
  }
  return structuredClone(binding);
}
export function validateMechanicsProvenance(operation, snapshot, origin) {
  const provenance = requireMechanics(snapshot).provenance;
  if (provenance.root_turn_id !== operation.root_turn_id
      || provenance.step_index !== operation.step_index
      || provenance.operation_ref !== operation.operation_id
      || provenance.origin_kind !== origin?.kind
      || !same(provenance.source_refs, origin?.source_refs)) {
    fail('TRACE_TURN_STEP_RUNTIME_MECHANICS_PROVENANCE_MISMATCH', {
      operation_id: operation.operation_id
    });
  }
}
function validProfilePin(value) {
  return exactShape(value, ['artifact_id', 'revision', 'digest'])
    && text(value.artifact_id)
    && Number.isSafeInteger(value.revision)
    && value.revision >= 1
    && typeof value.digest === 'string'
    && /^[a-f0-9]{64}$/u.test(value.digest);
}
function reconciliationFail(operationId, reason = null) {
  fail('TRACE_TURN_STEP_BODY_EVENT_RECONCILIATION_FAILED', {
    operation_id: operationId,
    ...(reason == null ? {} : { reason })
  });
}
function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}
