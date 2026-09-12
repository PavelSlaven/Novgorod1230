import { createHash } from 'node:crypto';
import { canonicalDigest } from '@rus/materialization';
import {
  exactShape,
  fail,
  plain,
  requireMechanics,
  text
} from './lower-dvina-trace-turn-step-persistence-support.js';
export { validateBodyComponentOrder, validateBodyEventCommit } from
  './lower-dvina-trace-turn-step-body-commit-validation.js';
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
    ?.position?.position_id
    ?? trace?.plan_request?.player_safe_state?.position?.g5_anchor_id
    ?? trace?.plan_request?.player_safe_state?.spatial_semantic?.position_ref
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
