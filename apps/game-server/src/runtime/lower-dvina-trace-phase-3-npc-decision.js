import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import { decideBoundedNpcAction } from '@rus/npc-runtime';
import {
  exact,
  fail
} from './lower-dvina-trace-phase-3-command-shared.js';

export function resolveTracePhase3NpcDecision({
  state,
  contracts,
  optionId,
  execution,
  inputDigest
}) {
  const digest = computeSpatialV3CanonicalDigest;
  const vr = (kind, id) => ({
    entity_ref: { entity_kind: kind, entity_id: id },
    authoring_version: '1'
  });
  const policyRef = vr('action_contract', contracts.npcPolicy.policy_id);
  const commandRef = vr('decision_command', execution.execution_binding_id);
  const consequenceRef = vr('action_contract',
    execution.statement_effect_contract_ref);
  const pins = [
    ['profile', policyRef],
    ['action_contract', commandRef],
    ['consequence_rule', consequenceRef]
  ].map(([dependency_role, ref]) => ({
    dependency_role,
    entity_ref: ref.entity_ref,
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: ref.authoring_version
    }
  }));
  const dependencyPins = {
    pins,
    canonical_digest: digest({ pins })
  };
  const option = {
    option_id: optionId,
    command_ref: commandRef,
    command_token: `npc-command:${inputDigest.slice(0, 32)}:${optionId}`,
    canonical_ordinal: 0,
    preconditions_digest: digest({
      state_version: state.party_state.state_version,
      option_id: optionId,
      activity_boundary: execution.time_contract.parent_execution_refs
    }),
    consequence_policy_ref: consequenceRef
  };
  const request = {
    request_id: `npc-decision:${inputDigest.slice(0, 32)}`,
    npc_ref: {
      entity_kind: 'npc',
      entity_id: contracts.actors[0].instance_id
    },
    requested_at: structuredClone(state.clock),
    state_version: String(state.party_state.state_version),
    decision_policy_ref: policyRef,
    options_digest: digest([option]),
    dependency_pins: dependencyPins,
    options: [option]
  };
  const resolved = decideBoundedNpcAction({
    request,
    current_state_version: request.state_version,
    observed_preconditions_digest: option.preconditions_digest,
    validated_at: state.clock
  });
  if (!resolved.ok || resolved.trace.option_id !== optionId) {
    fail('TRACE_PHASE_3_NPC_DECISION_REJECTED');
  }
  return {
    request: structuredClone(request),
    trace: structuredClone(resolved.trace)
  };
}

export function assertTracePhase3ConversationExecution({
  activity,
  execution,
  mapping,
  contracts,
  optionId
}) {
  const policyOption = exact(
    contracts.npcPolicy.option_set,
    'option_id',
    optionId
  );
  const statementEffect = exact(
    contracts.statementEffects,
    'statement_effect_contract_id',
    execution.statement_effect_contract_ref
  );
  if (!execution.time_contract.parent_execution_refs.includes(
    activity.profile_id
  )
      || execution.time_contract.clock_write !== 'forbidden'
      || execution.interaction_persistence_mapping_ref
        !== mapping.mapping_id
      || mapping.activity_refs.includes(activity.profile_id) !== true
      || mapping.decision_policy_ref !== contracts.npcPolicy.policy_id
      || mapping.decision_option_ref !== optionId
      || policyOption.option_id !== optionId
      || statementEffect.statement_template_ref
        !== mapping.statement_template_ref
      || statementEffect.audience_rule
        !== 'materialized_present_audience_only'
      || statementEffect.forbidden_write_targets.includes('objective_truth')
        !== true
      || execution.forbidden_write_targets.includes('objective_truth')
        !== true
      || mapping.statement_projection.objective_truth_projection
        !== 'forbidden') {
    fail('TRACE_PHASE_3_CONVERSATION_BINDING_INVALID');
  }
}
