import { compareGameTimestamp } from '@rus/time-events-history';
import {
  blocked,
  dependencyPins,
  digest,
  exactKeys,
  formal,
  freeze,
  normalizeTimestamp,
  pinned,
  refKey,
  stableId,
  success
} from './internal.js';

function canonicalOptions(options) {
  return [...options].sort((left, right) => left.canonical_ordinal - right.canonical_ordinal
    || left.option_id.localeCompare(right.option_id, 'en'));
}

function validateDecisionRequest(value) {
  if (!formal('npc_decision_request', value)
    || !dependencyPins(value.dependency_pins)
    || !pinned(value.dependency_pins, 'profile', value.decision_policy_ref)
    || !Array.isArray(value.options)
    || value.options.some((option) => !formal('npc_decision_option', option))
    || value.options.some((option) => !pinned(value.dependency_pins, 'action_contract', option.command_ref))
    || value.options.some((option) => !pinned(value.dependency_pins, 'consequence_rule', option.consequence_policy_ref))) {
    return false;
  }
  if (value.gameplay_deadline !== undefined
    && compareGameTimestamp(normalizeTimestamp(value.gameplay_deadline), normalizeTimestamp(value.requested_at)) < 0) {
    return false;
  }
  const sorted = canonicalOptions(value.options);
  return value.options_digest === digest(sorted)
    && new Set(sorted.map(({ option_id }) => option_id)).size === sorted.length
    && new Set(sorted.map(({ command_ref }) => refKey(command_ref.entity_ref))).size === sorted.length
    && new Set(sorted.map(({ command_token }) => command_token)).size === sorted.length
    && new Set(sorted.map(({ canonical_ordinal }) => canonical_ordinal)).size === sorted.length;
}

function validateSelection(value, request) {
  return exactKeys(value, ['request_id', 'state_version', 'option_id', 'command_token'])
    && value.request_id === request.request_id
    && value.state_version === request.state_version
    && stableId(value.option_id)
    && stableId(value.command_token);
}

function expectedDecisionIdempotencyKey(request) {
  return `npc-decision:${request.request_id}:${request.state_version}:${request.options_digest}`;
}

export function decideBoundedNpcAction({
  request,
  selection = null,
  current_state_version,
  observed_preconditions_digest = null,
  validated_at,
  persisted_trace = null
} = {}, { maxDecisionOptions }) {
  if (!validateDecisionRequest(request)) {
    return blocked('npc_decision_policy_gap', 'Bounded decision request, finite options or policy pins are invalid', request?.npc_ref, request?.dependency_pins);
  }
  const options = canonicalOptions(request.options);
  if (options.length === 0 || options.length > maxDecisionOptions) {
    const code = options.length > maxDecisionOptions
      ? 'temporal_execution_unbounded'
      : 'npc_decision_policy_gap';
    return blocked(code, 'Decision option set must be finite, non-empty and within its resource cap', request.npc_ref, request.dependency_pins);
  }
  if (current_state_version !== request.state_version) {
    return blocked('activity_precondition_stale', 'NPC decision state version changed before validation', request.npc_ref, request.dependency_pins);
  }
  const validatedAt = normalizeTimestamp(validated_at);
  if (!validatedAt
    || compareGameTimestamp(validatedAt, normalizeTimestamp(request.requested_at)) < 0
    || (request.gameplay_deadline !== undefined
      && compareGameTimestamp(validatedAt, normalizeTimestamp(request.gameplay_deadline)) > 0)) {
    return blocked('time_timestamp_invalid', 'validated_at must be an exact in-window gameplay timestamp', request.npc_ref, request.dependency_pins);
  }

  const idempotencyKey = expectedDecisionIdempotencyKey(request);
  if (persisted_trace !== null) {
    if (!formal('npc_decision_trace', persisted_trace)
      || persisted_trace.request_id !== request.request_id
      || persisted_trace.state_version !== request.state_version
      || persisted_trace.options_digest !== request.options_digest
      || persisted_trace.idempotency_key !== idempotencyKey) {
      return blocked('temporal_change_set_conflict', 'Persisted NPC decision trace conflicts with the request identity', request.npc_ref, request.dependency_pins);
    }
    if (!['validated', 'committed'].includes(persisted_trace.status)) {
      return blocked('npc_decision_policy_gap', 'Cancelled selection cannot be reused as a validated decision', request.npc_ref, request.dependency_pins);
    }
    const chosen = options.find((option) => option.option_id === persisted_trace.option_id
      && option.command_token === persisted_trace.command_token);
    if (!chosen) {
      return blocked('temporal_change_set_conflict', 'Persisted NPC selection is absent from the immutable option set', request.npc_ref, request.dependency_pins);
    }
    if (observed_preconditions_digest !== chosen.preconditions_digest) {
      return blocked('activity_precondition_stale', 'Selected NPC option preconditions changed before replay', request.npc_ref, request.dependency_pins);
    }
    return success({ trace: persisted_trace, replay_status: 'already_validated' });
  }

  let chosen;
  if (options.length === 1) {
    chosen = options[0];
    if (selection !== null && (!validateSelection(selection, request)
      || selection.option_id !== chosen.option_id
      || selection.command_token !== chosen.command_token)) {
      return blocked('npc_decision_policy_gap', 'Single-option selection token does not match the code-owned option', request.npc_ref, request.dependency_pins);
    }
  } else {
    if (!validateSelection(selection, request)) {
      return blocked('npc_decision_policy_gap', 'Decision service must return only request_id, state_version, option_id and command_token', request.npc_ref, request.dependency_pins);
    }
    chosen = options.find((option) => option.option_id === selection.option_id
      && option.command_token === selection.command_token);
    if (!chosen) {
      return blocked('npc_decision_policy_gap', 'Decision service selected an option or token outside the finite set', request.npc_ref, request.dependency_pins);
    }
  }
  if (observed_preconditions_digest !== chosen.preconditions_digest) {
    return blocked('activity_precondition_stale', 'Selected NPC option preconditions changed before validation', request.npc_ref, request.dependency_pins);
  }

  const tracePayload = {
    request_id: request.request_id,
    state_version: request.state_version,
    option_id: chosen.option_id,
    command_token: chosen.command_token,
    options_digest: request.options_digest,
    validated_at: validatedAt,
    status: 'validated',
    idempotency_key: idempotencyKey
  };
  const trace = freeze({ ...tracePayload, trace_digest: digest(tracePayload) });
  if (!formal('npc_decision_trace', trace)) {
    return blocked('generated_schema_mismatch', 'NPC decision owner produced a non-formal trace', request.npc_ref, request.dependency_pins);
  }
  return success({ trace, replay_status: 'new' });
}

export function orderNpcDecisionRequests(requests) {
  if (!Array.isArray(requests)
    || requests.some((request) => !validateDecisionRequest(request))
    || new Set(requests.map(({ request_id }) => request_id)).size !== requests.length) {
    throw new TypeError('NPC decision requests must be a unique formal request array');
  }
  return freeze([...requests].sort((left, right) => compareGameTimestamp(left.requested_at, right.requested_at)
    || refKey(left.npc_ref).localeCompare(refKey(right.npc_ref), 'en')
    || left.request_id.localeCompare(right.request_id, 'en')));
}
