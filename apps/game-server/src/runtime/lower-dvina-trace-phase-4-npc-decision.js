import { serverError } from '../errors.js';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { decideBoundedNpcAction } from '@rus/npc-runtime';

export async function resolveTracePhase4NpcDecision({
  state,
  contracts,
  checkResult,
  inputDigest,
  selectNpcDecision
}) {
  const success = checkResult?.outcome?.success === true;
  const admitted = contracts.check.admitted_followup_option_ids[success ? 'success' : 'failure'];
  const executions = contracts.npcExecutions ?? [];
  const options = admitted.map((optionId, canonicalOrdinal) => {
    const execution = executions.filter((entry) => entry.policy_id === contracts.ids.ratshaPolicy
      && entry.option_id === optionId);
    if (execution.length !== 1) throw rejected();
    return npcOption({ state, contracts, inputDigest, optionId, canonicalOrdinal, execution: execution[0] });
  });
  if (options.length === 0 || typeof selectNpcDecision !== 'function') {
    throw rejected();
  }
  const request = buildTracePhase4NpcRequest({ state, contracts, inputDigest, options });
  const selection = await selectNpcDecision(structuredClone(request));
  const resolved = decideBoundedNpcAction({
    request,
    selection,
    current_state_version: request.state_version,
    observed_preconditions_digest: options.find((option) => option.option_id === selection?.option_id)?.preconditions_digest ?? null,
    validated_at: state.clock
  });
  if (!resolved.ok || !admitted.includes(resolved.trace.option_id)) {
    throw serverError('TRACE_PHASE_4_NPC_OPTION_REJECTED', 'Ratsha option is outside the admitted closed set.', { status: 409, details: resolved.error ?? null });
  }
  const optionId = resolved.trace.option_id;
  return Object.freeze({ option_id: optionId, outcome: success ? 'surrender' : 'hostile',
    admitted_option_ids: structuredClone(admitted), request: structuredClone(request),
    trace: structuredClone(resolved.trace),
    execution: structuredClone(options.find((option) => option.option_id === optionId).execution),
    continuation: optionId === 'attack_and_escape'
      ? attackContinuation(executionFor(options, optionId))
      : null });
}

function attackContinuation(execution) {
  const root = execution?.time_contract?.roots?.[0];
  const activityRef = execution?.activity_profile_refs?.[0];
  if (execution?.execution_kind
        !== 'attack_attempt_then_mandatory_player_boundary'
      || !activityRef
      || root?.root_ref !== activityRef
      || root.time_profile_ref !== 'trace_ld_v1_time_2m'
      || root.clock_write !== 'single_if_completed') {
    throw rejected();
  }
  return Object.freeze({
    activity_ref: activityRef,
    time_profile_ref: root.time_profile_ref,
    duration_minutes: 2,
    status: 'player_response_required',
    automatic_harm: false,
    automatic_escape: false
  });
}

function executionFor(options, optionId) {
  return options.find((option) => option.option_id === optionId)?.execution;
}

function npcOption({ state, contracts, inputDigest, optionId, canonicalOrdinal, execution }) {
  const digest = computeSpatialV3CanonicalDigest;
  const commandRef = versionedRef('decision_command', execution.execution_binding_id);
  const consequenceRef = versionedRef('action_contract', execution.execution_kind);
  return {
    option_id: optionId,
    command_ref: commandRef,
    command_token: `npc-command:${inputDigest.slice(0, 32)}:${optionId}`,
    canonical_ordinal: canonicalOrdinal,
    preconditions_digest: digest({
      state_version: state.party_state.state_version,
      option_id: optionId,
      parent_activity: contracts.negotiation.profile_id,
      check_outcome: Boolean(optionId.startsWith('surrender_'))
    }),
    consequence_policy_ref: consequenceRef,
    execution: structuredClone(execution)
  };
}

export function buildTracePhase4NpcRequest({ state, contracts, inputDigest, options }) {
  const digest = computeSpatialV3CanonicalDigest;
  const policyRef = versionedRef('action_contract', contracts.npcPolicy.policy_id);
  const pins = [{ dependency_role: 'profile', entity_ref: policyRef.entity_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: policyRef.authoring_version } }, ...options.flatMap((option) => [{
    dependency_role: 'action_contract', entity_ref: option.command_ref.entity_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: option.command_ref.authoring_version }
  }, {
    dependency_role: 'consequence_rule', entity_ref: option.consequence_policy_ref.entity_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: option.consequence_policy_ref.authoring_version }
  }])];
  const formalOptions = options.map(({ execution, ...option }) => option);
  return {
    request_id: `npc-decision:${inputDigest.slice(0, 32)}`,
    npc_ref: { entity_kind: 'npc', entity_id: contracts.actors.ratsha_storehouse_helper.instance_id },
    requested_at: structuredClone(state.clock),
    state_version: String(state.party_state.state_version),
    decision_policy_ref: policyRef,
    options_digest: digest([...formalOptions].sort((left, right) =>
      left.canonical_ordinal - right.canonical_ordinal
      || left.option_id.localeCompare(right.option_id, 'en'))),
    dependency_pins: { pins, canonical_digest: digest({ pins }) },
    options: formalOptions
  };
}

function versionedRef(kind, id) {
  return { entity_ref: { entity_kind: kind, entity_id: id }, authoring_version: '1' };
}

function rejected() {
  return serverError('TRACE_PHASE_4_NPC_OPTION_REJECTED', 'Ratsha option is outside the admitted closed set.', { status: 409 });
}

/* Legacy direct option selection is deliberately unavailable: only npc-runtime
 * may admit Ratsha's action after the check. */
export function rejectDirectTracePhase4NpcOption({ contracts, checkResult, optionId }) {
  const success = checkResult?.outcome?.success === true;
  const admitted = contracts.check.admitted_followup_option_ids[success ? 'success' : 'failure'];
  if (!admitted.includes(optionId) || !contracts.npcPolicy.option_set.some((option) => option.option_id === optionId)) {
    throw serverError('TRACE_PHASE_4_NPC_OPTION_REJECTED', 'Ratsha option is outside the admitted closed set.', { status: 409 });
  }
  throw rejected();
}
